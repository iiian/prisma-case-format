import { camelCase, pascalCase } from 'change-case';
import { plural } from 'pluralize';

const MODEL_TOKEN = 'model';
const ENUM_TOKEN = 'enum';

export type MigrateCaseConventionsOptions = {
  tableCaseConvention: CaseChange,
  fieldCaseConvention: CaseChange,
  pluralize?: boolean;
};

const DEFAULTS: MigrateCaseConventionsOptions = {
  tableCaseConvention: pascalCase,
  fieldCaseConvention: camelCase,
  pluralize: false,
};

export function migrateCaseConventions(file_contents: string, options: MigrateCaseConventionsOptions = DEFAULTS): [string?, Error?] {
  const { tableCaseConvention, fieldCaseConvention, pluralize } = options;

  const lines = file_contents.split('\n');

  const [reshape_model_error] = reshapeModelDefinitions(lines);
  if (reshape_model_error) {
    return [, reshape_model_error];
  }

  const [reshaped_enum_map, reshape_enum_error] = reshapeEnumDefinitions(lines);
  if (reshape_enum_error) {
    return [, reshape_enum_error];
  }

  const reshape_model_options = {
    reshaped_enum_map: reshaped_enum_map!,
    pluralize: pluralize!
  };
  const [reshape_model_field_error] = reshapeModelFields(lines, reshape_model_options);
  if (reshape_model_field_error) {
    return [, reshape_model_field_error];
  }

  return [lines!.join('\n'),];

  function reshapeModelDefinitions(lines: string[]): [Error?] {
    const MODEL_DECLARATION_REGEX = /^\s*model\s+(?<model>\w+)\s*\{\s*/;

    const [model_bounds, model_bounds_error] = getDefinitionBounds(MODEL_TOKEN, lines);
    if (model_bounds_error) {
      return [model_bounds_error];
    }

    let offset = 0;
    for (let [start, _end] of model_bounds!) {
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
        return [error as Error];
      }
    }

    return [];
  }

  function reshapeEnumDefinitions(lines: string[]): [Map<string, string>?, Error?] {
    const ENUM_DECLARATION_REGEX = /^\s*enum\s+(?<enum>\w+)\s*\{\s*/;
    const reshaped_enum_map = new Map<string, string>(); // Map<origin_enum_name, reshaped_enum_name>

    const [enum_bounds, enum_bounds_error] = getDefinitionBounds(ENUM_TOKEN, lines);
    if (enum_bounds_error) {
      return [, enum_bounds_error];
    }

    for (const [start, _end] of enum_bounds!) {
      try {
        const enum_declaration_line = ENUM_DECLARATION_REGEX.exec(lines[start]);
        const enum_name = enum_declaration_line!.groups!['enum'];
        const reshaped_enum_name = tableCaseConvention(enum_name);
        if (reshaped_enum_name !== enum_name) {
          lines[start] = transformDeclarationName(lines[start], enum_name, tableCaseConvention);
        }

        reshaped_enum_map.set(enum_name, reshaped_enum_name);
      } catch (error) {
        return [, error as Error];
      }
    }

    return [reshaped_enum_map];
  }

  type ReshapeModelFieldsOptions = {
    reshaped_enum_map: Map<string, string>;
    pluralize: boolean;
  };

  function reshapeModelFields(lines: string[], options: ReshapeModelFieldsOptions): [Error?] {
    const { reshaped_enum_map, pluralize } = options;
    const FIELD_DECLARATION_REGEX = /^(\s*)(?<field>\w+)(\s+)(?<type>[\w+]+)(?<complications>[\[\]\?]*)(\s+.*\s*)?(?<comments>\/\/.*)?/;
    const RELATION_ANNOTATION_REGEX = /(?<preamble>@relation\("?\w*"?,?\s*)((?<cue1>(fields|references):\s*\[)(?<ids1>\w+(,\s*\w+\s*)*))((?<cue2>\]\,\s*(fields|references):\s*\[)(?<ids2>\w+(,\s*\w+\s*)*))(?<trailer>\].*)/;
    const TABLE_INDEX_REGEX = /\@\@index\((?<fields>\[[\w\s,]+\])/;
    const TABLE_UNIQUE_REGEX = /\@\@unique\((?<fields>\[[\w\s,]+\])/;
    const TABLE_ID_REGEX = /\@\@id\((?<fields>\[[\w\s,]+\])/;

    const [model_bounds, model_bounds_error] = getDefinitionBounds(MODEL_TOKEN, lines);
    if (model_bounds_error) {
      return [model_bounds_error];
    }

    for (const [start, end] of model_bounds!) {
      for (let i = start; i < end; i++) {
        const field_declaration_line = FIELD_DECLARATION_REGEX.exec(lines[i]);
        if (field_declaration_line) {
          let [search_term, chunk0, original_field_name, chunk2, field_type, is_array_or_nullable, chunk5] = field_declaration_line;
          let renamed_field_name = fieldCaseConvention(original_field_name);
          if (pluralize && is_array_or_nullable.startsWith('[]')) {
            renamed_field_name = plural(renamed_field_name);
          }
          let map_field_fragment = '';

          // Primitive field
          if (
            renamed_field_name !== original_field_name &&
            !lines[i].includes('@relation') &&
            isPrimitive(field_type)
          ) {
            map_field_fragment = ` @map("${original_field_name}")`;
          }

          // Exception field
          const enum_name = reshaped_enum_map.get(field_type);
          if (enum_name) {
            // Enum field
            field_type = enum_name;
            map_field_fragment = ` @map("${original_field_name}")`;
          } else if (!isPrimitive(field_type)) {
            // Unhandled field type
            field_type = tableCaseConvention(field_type);
          }

          lines[i] = lines[i].replace(search_term, [chunk0, renamed_field_name, chunk2, field_type, is_array_or_nullable, map_field_fragment, chunk5,].join(''));
        }

        const relation_annotation_line = RELATION_ANNOTATION_REGEX.exec(lines[i]);
        if (relation_annotation_line) {
          // , chunk0, fields, chunk2, references, chunk4
          const [search_term] = relation_annotation_line!;
          const { preamble, cue1, ids1, cue2, ids2, trailer } = relation_annotation_line!.groups!;
          const updated_ids1 = ids1
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ');
          const updated_ids2 = ids2
            .split(/,\s*/)
            .map(fieldCaseConvention)
            .join(', ');
          lines[i] = lines[i].replace(search_term, [preamble, cue1, updated_ids1, cue2, updated_ids2, trailer].join(''));
        }

        const table_unique_declaration_line = TABLE_UNIQUE_REGEX.exec(lines[i]);
        if (table_unique_declaration_line) {
          const field_names = table_unique_declaration_line!.groups!['fields'];
          const updated_field_names = `[${field_names.split(/,\s*/).map(fieldCaseConvention).join(', ')}]`;
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }

        const table_index_declaration_line = TABLE_INDEX_REGEX.exec(lines[i]);
        if (table_index_declaration_line) {
          const field_names = table_index_declaration_line!.groups!['fields'];
          const updated_field_names = `[${field_names.split(/,\s*/).map(fieldCaseConvention).join(', ')}]`;
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }

        const table_id_declaration_line = TABLE_ID_REGEX.exec(lines[i]);
        if (table_id_declaration_line) {
          const field_names = table_id_declaration_line!.groups!['fields'];
          const updated_field_names = `[${field_names.split(/,\s*/).map(fieldCaseConvention).join(', ')}]`;
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }
      }
    }

    return [];
  }

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

  function transformDeclarationName(declaration_line: string, declaration_name: string, tableCaseConvention: CaseChange): string {
    return declaration_line.replace(declaration_name, tableCaseConvention(declaration_name));
  }
}

export type CaseChange = (input: string) => string;

export function isPrimitive(field_type: string) {
  field_type = field_type.replace('[]', '').replace('?', '').replace(/("\w+")/, '');
  return [
    'String',
    'Boolean',
    'Int',
    'BigInt',
    'Float',
    'Decimal',
    'DateTime',
    'Json',
    'Bytes',
    'Unsupported',
  ].includes(field_type);
}
