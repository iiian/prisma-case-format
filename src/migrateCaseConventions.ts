const MODEL_TOKEN = 'model';
const ENUM_TOKEN = 'enum';

export function migrateCaseConventions(file_contents: string, tableCaseConvention: CaseChange, fieldCaseConvention: CaseChange): [string?, Error?] {
  const lines = file_contents.split('\n');
  const [model_bounds, model_bounds_error] = getDefinitionBounds(MODEL_TOKEN, lines);
  if (model_bounds_error) {
    return [, model_bounds_error];
  }

  const [reshaped_model_lines, reshape_models_error] = reshapeModels(model_bounds!, lines);
  if (reshape_models_error) {
    return [, reshape_models_error];
  }

  const [enum_bounds, enum_bounds_error] = getDefinitionBounds(ENUM_TOKEN, reshaped_model_lines!);
  if (enum_bounds_error) {
    return [, enum_bounds_error];
  }

  const [reshaped_enum_lines, reshape_enum_error] = reshapeEnums(enum_bounds!, lines);
  if (reshape_enum_error) {
    return [, reshape_enum_error];
  }

  return [reshaped_enum_lines!.join('\n'),];

  function getDefinitionBounds(token: string, lines: string[]): [[number, number][]?, Error?] {
    const END_DEFINITION_TOKEN = '}';

    const definition_bounds: [number, number][] = [];
    let within_definition = false;
    let boundary_cursor: [number, number] = [] as any;
    for (const [index, line] of lines.entries()) {
      if (!within_definition && line.trim().startsWith(token)) {
        boundary_cursor.push(index);
        within_definition = true;
      } else if (within_definition && line.trim().endsWith(END_DEFINITION_TOKEN)) {
        boundary_cursor.push(index);
        definition_bounds.push(boundary_cursor);
        boundary_cursor = [] as any;
        within_definition = false;
      }
    }
    if (within_definition) {
      return [, new Error(`${token} starting on line ${boundary_cursor[0]} did not end`)];
    }
    return [definition_bounds,];
  }

  function reshapeModels(model_bounds: [number, number][], lines: string[]): [string[]?, Error?] {
    const MODEL_DECLARATION_REGEX = /^\s*model\s+(?<model>\w+)\s*\{\s*/;
    const FIELD_DECLARATION_REGEX = /^(\s*)(?<field>\w+)(\s+)(?<type>[\w+]+)(?<complications>[\[\]\?]*)(\s+.*\s*)?/;
    const RELATION_ANNOTATION_REGEX = /(@relation\("?\w*"?,?\s*fields: \[)(?<fields>.*)(\],\s*references: \[)(?<references>.*)(\].*\))/;
    const TABLE_INDEX_REGEX = /\@\@index\((?<fields>\[[\w\s,]+\])/;
    const TABLE_UNIQUE_REGEX = /\@\@unique\((?<fields>\[[\w\s,]+\])/;
    const TABLE_ID_REGEX = /\@\@id\((?<fields>\[[\w\s,]+\])/;
    
    let offset = 0;
    for (let [start, end] of model_bounds!) {
      // Replace model case convention
      start = start + offset;
      try {
        const model_declaration_line = MODEL_DECLARATION_REGEX.exec(lines[start]);
        const model_name = model_declaration_line!.groups!['model'];
        if (tableCaseConvention(model_name) !== model_name) {
          const map_model_line = `  @@map("${model_name}")`;
          lines[start] = transformDeclarationName(lines[start], model_name, tableCaseConvention);
          lines.splice(start + 1, 0, map_model_line);
          offset += 1;
        }
      } catch (error) {
        return [, error as Error];
      }

      // Replace model's fields case convention
      end = end + offset;
      for (let i = start; i < end; i++) {
        const field_declaration_line = FIELD_DECLARATION_REGEX.exec(lines[i]);
        if (field_declaration_line) {
          let [search_term, chunk0, field_name, chunk2, field_type, chunk4, chunk5] = field_declaration_line;
          const original_field_name = field_name;
          field_name = fieldCaseConvention(field_name);
          let map_field_fragment = '';
          if (field_name !== original_field_name && !lines[i].includes('@relation') && isPrimitive(field_type)) {
            map_field_fragment = ` @map("${original_field_name}")`;
          }
          if (!isPrimitive(field_type)) {
            // this may have bugs...
            // + It affects the model as well as the enum case convention
            field_type = tableCaseConvention(field_type);
          }
          lines[i] = lines[i].replace(search_term, [chunk0, field_name, chunk2, field_type, chunk4, chunk5,].join(''));
          lines[i] += map_field_fragment;
        }

        const relation_annotation_line = RELATION_ANNOTATION_REGEX.exec(lines[i]);
        if (relation_annotation_line) {
          const [search_term, chunk0, fields, chunk2, references, chunk4] = relation_annotation_line!;
          const updated_fields = fields
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ');
          const updated_references = references
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ');
          lines[i] = lines[i].replace(search_term, [chunk0, updated_fields, chunk2, updated_references, chunk4].join(''));
        }

        const table_unique_declaration_line = TABLE_UNIQUE_REGEX.exec(lines[i]);
        if (table_unique_declaration_line) {
          const field_names = table_unique_declaration_line!.groups!['fields'];
          const updated_field_names = '[' + field_names
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ') + ']';
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }

        const table_index_declaration_line = TABLE_INDEX_REGEX.exec(lines[i]);
        if (table_index_declaration_line) {
          const field_names = table_index_declaration_line!.groups!['fields'];
          const updated_field_names = '[' + field_names
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ') + ']';
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }

        const table_id_declaration_line = TABLE_ID_REGEX.exec(lines[i]);
        if (table_id_declaration_line) {
          const field_names = table_id_declaration_line!.groups!['fields'];
          const updated_field_names = '[' + field_names
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ') + ']';
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }
      }
    }
    return [lines,];
  }

  function reshapeEnums(enum_bounds: [number, number][], lines: string[]): [string[]?, Error?] {
    const ENUM_DECLARATION_REGEX = /^\s*enum\s+(?<enum>\w+)\s*\{\s*/;
    for(const [start, _end] of enum_bounds) {
      try {
        const enum_declaration_line = ENUM_DECLARATION_REGEX.exec(lines[start]);
        const enum_name = enum_declaration_line!.groups!['enum'];
        if (tableCaseConvention(enum_name) !== enum_name) {
          lines[start] = transformDeclarationName(lines[start], enum_name, tableCaseConvention);
        }
      } catch (error) {
        return [, error as Error];
      }
    }

    return [lines, ];
  }

  function transformDeclarationName(declaration_line: string, declaration_name: string, tableCaseConvention: CaseChange): string {
    return declaration_line.replace(declaration_name, tableCaseConvention(declaration_name));
  }
}

export type CaseChange = (input: string) => string;

export function isPrimitive(field_type: string) {
  field_type = field_type.replace('[]', '').replace('?', '').replace(/("\w+")/, '');
  return (
    field_type === 'String'
    || field_type === 'Boolean'
    || field_type === 'Int'
    || field_type === 'BigInt'
    || field_type === 'Float'
    || field_type === 'Decimal'
    || field_type === 'DateTime'
    || field_type === 'Json'
    || field_type === 'Bytes'
    || field_type === 'Unsupported'
  );
}
