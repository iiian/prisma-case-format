import { camelCase, pascalCase, snakeCase } from 'change-case';
import { CaseChange, asPluralized, asSingularized } from './caseConventions';
import { existsSync, readFileSync } from 'fs';
import * as jsyaml from 'js-yaml';
import { resolve } from 'path';

export function tryGetTableCaseConvention(raw_type: string): [CaseChange?, Error?] {
  const [type, case_flavor] = raw_type.split(',');
  let kase: CaseChange;
  switch (type) {
    case 'pascal':
    kase = pascalCase;
    break;
    case 'camel':
    kase = camelCase;
    break;
    case 'snake':
    kase = snakeCase;
    break;
    default: return [, new Error('unsupported case convention: ' + type)];
  }

  switch (case_flavor) {
    case 'plural':
    kase = asPluralized(kase);
    break;
    case 'singular':
    kase = asSingularized(kase);
    break;
  }

  return [kase,];
}

export const SUPPORTED_CASE_CONVENTIONS_MESSAGE = `-------------------------
Supported case conventions: ["pascal", "camel", "snake"].
Additionally, append ',plural' after any case-convention selection to mark case convention as pluralized.
For instance:
  --map-table-case=snake,plural

will append \`@@map("users")\` to \`model User\`.
Append ',singular' after any case-convention selection to mark case convention as singularized.
For instance, 
  --map-table-case=snake,singular

will append \`@@map("user")\` to \`model Users\``;

export type ObjectConvention = {
  table?: string;
  field?: string;
  enum?: string;
  mapTable?: string;
  mapField?: string;
  mapEnum?: string;
};

export type Convention = 
  | Record<string, string>
  | string;

export type ObjectModelConvention = {
  default?: Convention;
  field?: Convention;
};

export type ModelConvention = 
  | ObjectModelConvention
  | string;

export type ConventionFile = {
  default?: string;
  uses_next_auth?: boolean;
  override?: Record<string, ModelConvention>;
};

export const DEFAULT_PRISMA_CASE_FORMAT_FILE_LOCATION = '.prisma-case-format';

export class ConventionStore {
  public static fromFile(path: string, usesNextAuth?: boolean): [ConventionStore?, Error?] {
    if (!existsSync(path)) {
      if (path === resolve(DEFAULT_PRISMA_CASE_FORMAT_FILE_LOCATION)) { 
        return ConventionStore.fromConf({ uses_next_auth: true });
      }
      return [, new Error('file does not exist:  ' + path)]
    }
    return ConventionStore.fromConfStr(readFileSync(path).toString());
  }

  public static fromConfStr(conf: string): [ConventionStore?, Error?] {
    let content = <ConventionFile>jsyaml.load(conf);
    return ConventionStore.fromConf(content);
  }
  
  public static fromConf(conf: ConventionFile): [ConventionStore?, Error?] {
    if (conf.uses_next_auth) {
      conf = imbueWithNextAuth(conf);
    }
    const children: Record<string, ConventionStore> = {};
    for (const entity_name in conf.override) {
      const entity = conf.override[entity_name];
      let conv: ConventionStore;
      if (!entity) {
        return [,Error(`${entity_name} was ${entity}, but should be of type string`)];
      }
      switch (typeof entity) {
        case 'string': {
          let [c, err] = ConventionStore.fromString(entity);
          if (err) {
            return [, err];
          }
          conv = c!;
          break;
        }
        case 'object': {
          let [c, err] = ConventionStore.fromObjectModel(entity); 
          if  (err) {
            return [, err];
          }
          conv = c!;
          break;
        }
      }
      children[entity_name] = conv;
    }
    let [conv, err] = conf.default ? ConventionStore.fromString(conf.default) : [new ConventionStore(),]; 
    if (err) {
      return [,err];
    }
    conv!.children = children;
    return [conv];
  }

  static fromObjectModel(entity: ObjectModelConvention): [ConventionStore?, Error?] {
    const conv = new ConventionStore();
    const children: Record<string, ConventionStore> = {};
    switch (typeof entity.field) {
      case 'string': {
        const [conv, err] = ConventionStore.fromString(entity.field); 
        if (err) {
          return [, err];
        }
        children['.*'] = conv!;
        break;
      }
      case 'object': {
        for (const field in entity.field) {
          const [conv, err] = ConventionStore.fromString(entity.field[field]);
          if (err) {
            return [, err];
          }
          children[field] = conv!;
        }
        break;
      }
      case 'undefined': break;
      default: return [,new Error(`unexpected type ${typeof entity.field} for value ${JSON.stringify(entity.field)}. Expected object with properties: (default, field).`)];
    }
    conv.children = children;
    return [conv,];
  }

  static fromString(entity: string): [ConventionStore?, Error?] {
    if (entity === 'disable') {
      const conv = new ConventionStore();
      conv.disable = true;
      return [conv,];
    }
    const conventions = entity.split(';').filter(Boolean).map(choice => choice.split('=').map(e => e.trim()) as [string, string]);
    const conv = new ConventionStore();
    for (const [option, choice] of conventions) {
      const [sel, err] = tryGetTableCaseConvention(choice);
      if (err) {
        return [, err];
      }
      switch(option) {
        case 'table':    conv.tableCaseConvention    = sel; break;
        case 'enum':     conv.enumCaseConvention     = sel; break;
        case 'field':    conv.fieldCaseConvention    = sel; break;
        case 'mapTable': conv.mapTableCaseConvention = sel; break;
        case 'mapEnum':  conv.mapEnumCaseConvention  = sel; break;
        case 'mapField': conv.mapFieldCaseConvention = sel; break;
        default: return [, new Error(`unrecognized mapping option specified: ${option}, valid options are: ["table", "enum", "field", "mapTable", "mapEnum", "mapField"]`)];
      }
    }
    return [conv,];
  }

  static fromConventions(case_conv: CaseConventions) {
    const conv = new ConventionStore();
    conv.tableCaseConvention = case_conv.tableCaseConvention;
    conv.mapTableCaseConvention = case_conv.mapTableCaseConvention;
    conv.enumCaseConvention = case_conv.enumCaseConvention;
    conv.mapEnumCaseConvention = case_conv.mapEnumCaseConvention;
    conv.fieldCaseConvention = case_conv.fieldCaseConvention;
    conv.mapFieldCaseConvention = case_conv.mapFieldCaseConvention;
    conv.pluralize = case_conv.pluralize;
    conv.disable = case_conv.disable;

    return conv;
  }

  public disable?: boolean = false;
  protected constructor(
    public pluralize?: boolean,
    public tableCaseConvention?: CaseChange,
    public fieldCaseConvention?: CaseChange,
    public enumCaseConvention?: CaseChange,
    public mapTableCaseConvention?: CaseChange,
    public mapFieldCaseConvention?: CaseChange,
    public mapEnumCaseConvention?: CaseChange,
    protected children?: Record<string, ConventionStore>,
  ) {}

  public isDisabled(...scope: string[]) {
    return this._recurse('disable', scope) ?? this.disable;
  }
  public isPlural(...scope: string[]) {
    return this._recurse('pluralize', scope) ?? this.pluralize;
  }
  public table(...scope: string[]) {
    return this._recurse('tableCaseConvention', scope) ?? this.tableCaseConvention ?? DEFAULTS.tableCaseConvention;
  }
  public mapTable(...scope: string[]) {
    return this._recurse('mapTableCaseConvention', scope) ?? this.mapTableCaseConvention;
  }
  public enum(...scope: string[]) {
    return this._recurse('enumCaseConvention', scope) ?? this.enumCaseConvention ?? this._recurse('tableCaseConvention', scope) ?? DEFAULTS.enumCaseConvention;
  }
  public mapEnum(...scope: string[]) {
    return this._recurse('mapEnumCaseConvention', scope) ?? this.mapEnumCaseConvention ?? this._recurse('mapTableCaseConvention', scope) ?? this.mapTableCaseConvention;
  }
  public field(...scope: string[]) {
    return this._recurse('fieldCaseConvention', scope) ?? this.fieldCaseConvention ?? DEFAULTS.fieldCaseConvention!;
  }
  public mapField(...scope: string[]) {
    return this._recurse('mapFieldCaseConvention', scope) ?? this.mapFieldCaseConvention;
  }
  private _recurse<K extends keyof CaseConventions>(k: K, [next, ...rest]: string[]): CaseConventions[K] | undefined {
    if (!next) {
      return (this as any)[k];
    }
    if (this.children?.hasOwnProperty(next)) {
      return this.children[next]._recurse(k, rest);        
    }
    if (this.children?.hasOwnProperty(pascalCase(next))) {
      return this.children[pascalCase(next)]._recurse(k, rest);        
    }
    if (this.children?.hasOwnProperty(snakeCase(next))) {
      return this.children[snakeCase(next)]._recurse(k, rest);        
    }
    if (this.children?.hasOwnProperty(camelCase(next))) {
      return this.children[camelCase(next)]._recurse(k, rest);        
    }

    const haystack = this.children ?? {};
    for (const key in haystack) {
      const regex = new RegExp('$' + key + '^');
      if (regex.test(next)) {
        return this.children![key]._recurse(k, rest);
      }
      if (regex.test(pascalCase(next))) {
        return this.children![pascalCase(next)]._recurse(k, rest);
      }
      if (regex.test(snakeCase(next))) {
        return this.children![snakeCase(next)]._recurse(k, rest);
      }
      if (regex.test(camelCase(next))) {
        return this.children![camelCase(next)]._recurse(k, rest);
      }
    }
    return undefined;
  }
}

export type CaseConventions = {
  tableCaseConvention: CaseChange;
  fieldCaseConvention: CaseChange;
  enumCaseConvention?: CaseChange;
  mapTableCaseConvention?: CaseChange;
  mapFieldCaseConvention?: CaseChange;
  mapEnumCaseConvention?: CaseChange;
  pluralize?: boolean;
  disable?: boolean;
};

export type UnmanagedConventions = 'disabled';

export type ScopeConventions = 
  | CaseConventions
  | UnmanagedConventions
;

export const DEFAULTS = {
  tableCaseConvention: pascalCase,
  fieldCaseConvention: camelCase,
  enumCaseConvention: pascalCase,
};

export function defaultConventions() {
  return { ...DEFAULTS };
}

function imbueWithNextAuth(content: ConventionFile): ConventionFile {
  content.override = content.override ?? {};

  content.override.Account = {
    default: 'table=pascal; mapTable=pascal;',
    field: {
      id:                'field=camel; mapField=camel',
      userId:            'field=camel; mapField=camel',
      type:              'field=camel; mapField=camel',
      provider:          'field=camel; mapField=camel',
      providerAccountId: 'field=camel; mapField=camel',
      refresh_token:     'field=snake; mapField=snake',
      access_token:      'field=snake; mapField=snake',
      expires_at:        'field=snake; mapField=snake',
      token_type:        'field=snake; mapField=snake',
      scope:             'field=snake; mapField=snake',
      id_token:          'field=snake; mapField=snake',
      session_state:     'field=snake; mapField=snake',
      user:              'field=snake; mapField=snake',
    }
  };
  content.override.Session = {
    default: 'table=pascal; mapTable=pascal; field=camel; mapField=camel'
  };
  content.override.User = {
    default: 'table=pascal; mapTable=pascal; field=camel; mapField=camel'
  };
  content.override.VerificationToken = {
    default: 'table=pascal; mapTable=pascal; field=camel; mapField=camel'
  };

  return content;
}
