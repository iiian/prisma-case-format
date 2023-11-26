import { camelCase, pascalCase } from 'change-case';
import { plural } from 'pluralize';

const MODEL_TOKEN = 'model';
const VIEW_TOKEN = 'view';
const ENUM_TOKEN = 'enum';

type ReshapeModelFieldsOptions = {
  reshaped_enum_map: Map<string, string>;
  pluralize: boolean;
  fieldCaseConvention: CaseChange,
  tableCaseConvention: CaseChange,
  mapFieldCaseConvention?: CaseChange,
};

export type MigrateCaseConventionsOptions = {
  tableCaseConvention: CaseChange,
  fieldCaseConvention: CaseChange,
  enumCaseConvention?: CaseChange,
  mapTableCaseConvention?: CaseChange,
  mapFieldCaseConvention?: CaseChange,
  mapEnumCaseConvention?: CaseChange,
  pluralize?: boolean;
};

export const DEFAULTS: MigrateCaseConventionsOptions = {
  tableCaseConvention: pascalCase,
  fieldCaseConvention: camelCase,
  enumCaseConvention: pascalCase,
  pluralize: false,
};

export function getMigrateConventionDefaults() {
  return { ...DEFAULTS };
}

export type CaseChange = (input: string) => string;

export function isPrimitive(field_type: string) {
  field_type = field_type.replace('[]', '').replace('?', '').replace(/("\w+")/, '');
  field_type = field_type.split('(')[0];
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

const MODEL_DECLARATION_REGEX = /^\s*(model|view)\s+(?<model>\w+)\s*\{\s*/;
const ENTITY_MAP_ANNOTATION_REGEX = /@@map\("(?<map>.+)"\)/;
const ENUM_DECLARATION_REGEX = /^\s*enum\s+(?<enum>\w+)\s*\{\s*/;
const FIELD_DECLARATION_REGEX = /^(\s*)(?<field>\w+)(\s+)(?<type>[\w+]+(\((?:[\w\s"'.]+(?:,\s*)?)*\))?)(?<is_array_or_nullable>[\[\]\?]*)(\s+.*\s*)?(?<comments>\/\/.*)?/;
const MAP_ANNOTATION_REGEX = /@map\("(?<map>.+)"\)/;
const RELATION_ANNOTATION_REGEX = /(?<preamble>@relation\("?\w*"?,?\s*)((?<cue1>(fields|references):\s*\[)(?<ids1>\w+(,\s*\w+\s*)*))((?<cue2>\]\,\s*(fields|references):\s*\[)(?<ids2>\w+(,\s*\w+\s*)*))(?<trailer>\].*)/;
const EZ_TABLE_INDEX_REGEX = /\@\@index\((?<fields>\[[\w\s,]+\])/;
const CPLX_TABLE_INDEX_REGEX = /\@\@index.*/;
const TABLE_UNIQUE_REGEX = /\@\@unique\((?<fields>\[[\w\s,]+\])/;
const TABLE_ID_REGEX = /\@\@id\((?<fields>\[[\w\s,]+\])/;

export class ConventionTransformer {
  public static migrateCaseConventions(file_contents: string, options: MigrateCaseConventionsOptions): [string?, Error?] {
    const {
      tableCaseConvention,
      fieldCaseConvention,
      mapTableCaseConvention,
      mapFieldCaseConvention,
      pluralize,
    } = options;

    const enumCaseConvention = options.enumCaseConvention ?? options.tableCaseConvention
    const mapEnumCaseConvention = options.mapEnumCaseConvention ?? options.mapTableCaseConvention

    const lines = file_contents.split('\n');

    const [reshape_model_error] = ConventionTransformer.reshapeModelDefinitions(lines, tableCaseConvention, mapTableCaseConvention);
    if (reshape_model_error) {
      return [, reshape_model_error];
    }

    const [reshaped_enum_map, reshape_enum_error] = ConventionTransformer.getEnumNameMap(lines, enumCaseConvention);
    if (reshape_enum_error) {
      return [, reshape_enum_error];
    }

    const reshape_model_options: ReshapeModelFieldsOptions = {
      reshaped_enum_map: reshaped_enum_map!,
      pluralize: pluralize!,
      fieldCaseConvention,
      tableCaseConvention,
      mapFieldCaseConvention,
    };
    const [reshape_model_field_error] = ConventionTransformer.reshapeModelFields(lines, reshape_model_options);
    if (reshape_model_field_error) {
      return [, reshape_model_field_error];
    }

    const [enum_reshape_error] = ConventionTransformer.reshapeEnumDefinitions(lines, enumCaseConvention, mapEnumCaseConvention);
    if (enum_reshape_error) {
      return [, enum_reshape_error];
    }

    return [lines!.join('\n'),];
  }

  private static findExistingMapAnnotation(lines: string[]): [string | undefined, number] {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const matches = line.match(ENTITY_MAP_ANNOTATION_REGEX);
      if (!!matches) {
        return [matches.groups!['map'], i];
      }
    }
    return [, -1];
  }

  private static reshapeModelDefinitions(lines: string[], tableCaseConvention: CaseChange, mapTableCaseConvention?: CaseChange): [Error?] {
    const [model_bounds, model_bounds_error] = ConventionTransformer.getDefinitionBounds([MODEL_TOKEN, VIEW_TOKEN], lines);
    if (model_bounds_error) {
      return [model_bounds_error];
    }
    /*
     * Applies the following invariant across all model names:
     *  - tableCaseConvention(curr_model_name) is used for the declaration of the model
     *  - mapTableCase(curr_model_name) or current value is used for the @@map annotation, 
     *     unless that would equal tableCaseConvention(curr_model_name)
     */
    let offset = 0;
    for (let [base_start, base_end] of model_bounds!) {
      const start = base_start + offset;
      const end = base_end + offset;
      try {
        const model_declaration_line = MODEL_DECLARATION_REGEX.exec(lines[start]);
        const [existing_db_model_name, map_anno_index] = ConventionTransformer.findExistingMapAnnotation(lines.slice(start, end));
        const curr_model_name = model_declaration_line!.groups!['model'];
        const conv_model_name = tableCaseConvention(curr_model_name);
        const db_model_name = mapTableCaseConvention?.(curr_model_name) ?? existing_db_model_name ?? curr_model_name;
        const map_anno_line_no = start + map_anno_index;
        if (conv_model_name == db_model_name && 0 <= map_anno_index) {
          lines.splice(map_anno_line_no, 1);
          offset -= 1;
        }
        if (conv_model_name !== curr_model_name) {
          lines[start] = lines[start].replace(curr_model_name, conv_model_name);
        }
        if (conv_model_name !== db_model_name) {
          const map_model_line = `  @@map("${db_model_name}")`;
          if (0 <= map_anno_index) {
            lines.splice(map_anno_line_no, 1, map_model_line);
          } else {
            lines.splice(start + 1, 0, map_model_line);
            offset += 1;
          }
        }
      } catch (error) {
        return [error as Error];
      }
    }

    return [];
  }

  private static getEnumNameMap(lines: string[], tableCaseConvention: CaseChange): [Map<string, string>?, Error?] {
    const reshaped_enum_map = new Map<string, string>(); // Map<origin_enum_name, reshaped_enum_name>

    const [enum_bounds, enum_bounds_error] = ConventionTransformer.getDefinitionBounds([ENUM_TOKEN], lines);
    if (enum_bounds_error) {
      return [, enum_bounds_error];
    }

    let offset = 0;
    for (const [base_start] of enum_bounds!) {
      const start = base_start + offset;
      try {
        const enum_declaration_line = ENUM_DECLARATION_REGEX.exec(lines[start]);
        const raw_enum_name = enum_declaration_line!.groups!['enum'];
        const reshaped_enum_name = tableCaseConvention(raw_enum_name);
        reshaped_enum_map.set(raw_enum_name, reshaped_enum_name);
      } catch (error) {
        return [, error as Error];
      }
    }

    return [reshaped_enum_map];
  }

  private static reshapeEnumDefinitions(lines: string[], enumCaseConvention: CaseChange, mapEnumCaseConvention?: CaseChange): [Error?] {
    const [enum_bounds, err] = ConventionTransformer.getDefinitionBounds([ENUM_TOKEN], lines);
    if (err) {
      return [err];
    }
    /*
     * Applies the following invariant across all enum names:
     *  - enumCaseConvention(curr_enum_name) is used for the declaration of the enum
     *  - mapEnumCase(curr_enum_name) or current value is used for the @@map annotation, 
     *     unless that would equal tableCaseConvention(curr_enum_name)
     */
    let offset = 0;
    for (let [base_start, base_end] of enum_bounds!) {
      const start = base_start + offset;
      const end = base_end + offset;
      try {
        const enum_declaration_line = ENUM_DECLARATION_REGEX.exec(lines[start]);
        const [existing_db_enum_name, map_anno_idx] = ConventionTransformer.findExistingMapAnnotation(lines.slice(start, end));
        const curr_enum_name = enum_declaration_line!.groups!['enum'];
        const conv_enum_name = enumCaseConvention(curr_enum_name);
        const db_enum_name = mapEnumCaseConvention?.(curr_enum_name) ?? existing_db_enum_name ?? curr_enum_name;
        const map_anno_line_no = start + map_anno_idx;
        if (conv_enum_name == db_enum_name && 0 <= map_anno_idx) {
          lines.splice(map_anno_line_no, 1);
          offset -= 1;
        }
        if (conv_enum_name !== curr_enum_name) {
          lines[start] = lines[start].replace(curr_enum_name, conv_enum_name);
        }
        if (conv_enum_name !== db_enum_name) {
          const map_enum_line = `  @@map("${db_enum_name}")`;
          if (0 <= map_anno_idx) {
            lines.splice(map_anno_line_no, 1, map_enum_line);
          } else {
            lines.splice(start + 1, 0, map_enum_line);
            offset += 1;
          }
        }
      } catch (error) {
        return [error as Error];
      }
    }

    return [];
  }

  private static reshapeModelFields(lines: string[], options: ReshapeModelFieldsOptions): [Error?] {
    const { reshaped_enum_map, pluralize, fieldCaseConvention, tableCaseConvention, mapFieldCaseConvention } = options;

    const [model_bounds, model_bounds_error] = ConventionTransformer.getDefinitionBounds([MODEL_TOKEN, VIEW_TOKEN], lines);
    if (model_bounds_error) {
      return [model_bounds_error];
    }
    
    /*
     * Applies the following invariant across all model/view field names:
     *  - fieldCaseConvention(curr_field_name) is used for the declaration of the model
     *  - mapFieldCase(curr_field_name) or current value is used for the @map annotation, 
     *     unless that would equal fieldCaseConvention(curr_field_name)
     */
    for (const [start, end] of model_bounds!) {
      for (let i = start+1; i < end; i++) {
        const field_declaration_line = FIELD_DECLARATION_REGEX.exec(lines[i]);
        if (field_declaration_line) {
          let [search_term, chunk0, field, chunk2, type, _unused, is_array_or_nullable, chunk5] = field_declaration_line;
          const og_db_field_name: string | undefined = MAP_ANNOTATION_REGEX.exec(chunk5)?.groups?.['map'];
          const enum_name = reshaped_enum_map.get(type);
          if (og_db_field_name) {
            // delete it, we'll tee it up again in a moment
            chunk5 = chunk5.replace(`@map("${og_db_field_name}")`, '');
          }
          let conv_field_name = fieldCaseConvention(field);
          const db_field_name = mapFieldCaseConvention?.(conv_field_name) ?? og_db_field_name ?? field;
          if (pluralize && is_array_or_nullable.startsWith('[]')) {
            conv_field_name = plural(conv_field_name);
          }
          let map_anno_fragment = '';

          // Primitive type
          if (
            conv_field_name !== db_field_name &&
            !lines[i].includes('@relation') &&
            isPrimitive(type)
          ) {
            map_anno_fragment = ` @map("${db_field_name}")`;
          } 
          // Enum type
          else if (enum_name) {
            type = enum_name;
            map_anno_fragment = ` @map("${db_field_name}")`;
          } 
          // User type
          else if (!isPrimitive(type)) {
            type = tableCaseConvention(type);
          }

          if (conv_field_name === db_field_name) {
            map_anno_fragment = '';
          }

          lines[i] = lines[i].replace(search_term, [chunk0, conv_field_name, chunk2, type, is_array_or_nullable, map_anno_fragment, chunk5,].join(''));
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

        let table_index_declaration_line = EZ_TABLE_INDEX_REGEX.exec(lines[i]);
        if (table_index_declaration_line) {
          const field_names = table_index_declaration_line!.groups!['fields'];
          const updated_field_names = `[${field_names.split(/,\s*/).map(fieldCaseConvention).join(', ')}]`;
          lines[i] = lines[i].replace(field_names, updated_field_names);
        }
        table_index_declaration_line =
          table_index_declaration_line ? null : CPLX_TABLE_INDEX_REGEX.exec(lines[i]);
        if (table_index_declaration_line) {
          const field_names = [...new Set([
            ...ConventionTransformer.getFieldNames(lines[i], ConventionTransformer.DEFAULT_START_POS),
            ...ConventionTransformer.getFieldNames(lines[i], ConventionTransformer.FIELDS_START_POS),
            ...ConventionTransformer.getFieldNames(lines[i], ConventionTransformer.REF_START_POS),
          ])];
          lines[i] = field_names.reduce(
            (line, next) => line.replace(next, fieldCaseConvention(next)),
            lines[i]
          );
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

  private static DEFAULT_START_POS = 'DEFAULT';
  private static FIELDS_START_POS = 'fields';
  private static REF_START_POS = 'references';

  private static getFieldNames(haystack: string, start_position: string): string[] {
    if (start_position === ConventionTransformer.DEFAULT_START_POS) {
      let i = 0;
      while (haystack[i++] !== '[');
      let substr = '';
      while (haystack[i] !== ']') {
        substr += haystack[i++];
      }
      return ConventionTransformer.stripProperties(substr).split(/\s*,\s*/);
    }
    const regex = new RegExp(`${start_position}\\s*:\\s*\\[([^\\]]+)\\]`, 'g');
    const matches = regex.exec(haystack);

    return matches ? (ConventionTransformer.stripProperties(matches[1]).split(/\s*[,]\s*/)) : [];
  }

  private static stripProperties(haystack: string): string {
    let out_str = '';
    let balance = 0;
    for (let i = 0; i < haystack.length; i++) {
      if (haystack[i] === '(') {
        balance += 1;
      }
      if (balance === 0) {
        out_str += haystack[i];
      }
      if (haystack[i] === ')') {
        balance -= 1;
      }
    }
    return out_str;
  }

  private static getDefinitionBounds(tokens: string[], lines: string[]): [[number, number][]?, Error?] {
    const END_DEFINITION_TOKEN = '}';

    const definition_bounds: [number, number][] = [];
    let within_definition = false;
    let boundary_cursor: [number, number] = [] as any;
    for (const token of tokens) {
      for (const [index, line] of lines.entries()) {
        if (!within_definition && line.startsWith(token)) {
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
    }
    return [definition_bounds.sort(([start_a], [start_b]) => start_a - start_b),];
  }
}
