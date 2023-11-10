#! /usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { Command, OptionValues } from 'commander';
import chalk from 'chalk';
import { snakeCase, camelCase, pascalCase } from 'change-case';
import { formatSchema } from '@prisma/internals';
import { ConventionTransformer, CaseChange, MigrateCaseConventionsOptions, getMigrateConventionDefaults } from './convention-transformer';
import { asPluralized, asSingularized } from './caseConventions';

const DEFAULT_FILE_LOCATION = 'schema.prisma';
const program = new Command(`prisma-case-format`);

const VERSION = require('../package.json').version;
const SUPPORTED_CASE_CONVENTIONS_MESSAGE = `Supported case conventions: ["pascal", "camel", "snake"].
Additionally, append ',plural' after any case-convention selection to mark case convention as pluralized.
For instance:
  --map-table-case=snake,plural

will append \`@@map("users")\` to \`model User\`.
Append ',singular' after any case-convention selection to mark case convention as singularized.
For instance, 
  --map-table-case=snake,singular

will append \`@@map("user")\` to \`model Users\``;
program
  .description(`Give your schema.prisma sane naming conventions`)
  .addHelpText('after', SUPPORTED_CASE_CONVENTIONS_MESSAGE)
  .requiredOption('--file <file>', 'cwd-relative path to schema.prisma file', DEFAULT_FILE_LOCATION)
  .option('-D, --dry-run', 'print changes to console, rather than back to file', false)
  .option('--table-case <tableCase>', 'case convention for table names (SEE BOTTOM)', 'pascal')
  .option('--field-case <fieldCase>', 'case convention for field names', 'camel')
  .option('--enum-case <enumCase>', 'case convention for enum names. In case of not declared, uses value of “--table-case”.', 'pascal')
  .option('--map-table-case <mapTableCase>', 'case convention for @@map() annotations (SEE BOTTOM)')
  .option('--map-field-case <mapFieldCase>', 'case convention for @map() annotations')
  .option('--map-enum-case <mapEnumCase>', 'case convention for @map() annotations of enums.  In case of not declared, uses value of “--map-table-case”.')
  .option('-p, --pluralize', 'optionally pluralize array type fields', false)
  .version(VERSION, '', `hint: you have v${VERSION}`)
;
program.parse(process.argv);

run();

async function run() {
  const options = program.opts();

  if (options.dryRun) {
    console.log('***Dry run mode***');
  }

  const [file_contents, err] = tryGetFileContents(options);
  if (err) {
    console.error(chalk.red("Encountered an error while trying to read provided schema.prisma file at path " + options.file));
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  const convention_options: MigrateCaseConventionsOptions = getMigrateConventionDefaults();
  if (options.tableCase) {
    let [tableCaseConvention, err] = tryGetTableCaseConvention(options.tableCase);
    if (err) {
      console.warn(chalk.yellow(`Warning: encountered unsupported case convention: "${options.fieldCase}". Defaulting to "pascal" case.`));
      [tableCaseConvention,] = tryGetTableCaseConvention('pascal');
    }

    convention_options.tableCaseConvention = tableCaseConvention!;
  }

  if (options.fieldCase) {
    let [fieldCaseConvention, err] = tryGetTableCaseConvention(options.fieldCase);
    if (err) {
      console.warn(chalk.yellow(`Warning: encountered unsupported case convention: "${options.fieldCase}". Defaulting to "camel" case.`));
      [fieldCaseConvention,] = tryGetTableCaseConvention('camel');
    }

    convention_options.fieldCaseConvention = fieldCaseConvention!;
  }

  if (options.enumCase) {
    let [caseConvention, err] = tryGetTableCaseConvention(options.enumCase);
    if (err) {
      console.warn(chalk.yellow(`Warning: encountered unsupported case convention: "${options.enumCase}". Defaulting to "pascal" case.`));
      [caseConvention,] = tryGetTableCaseConvention('pascal');
    }

    convention_options.enumCaseConvention = caseConvention!;
  }

  if (options.mapTableCase) {
    const opt_case: string = options.mapTableCase;
    let [convention, err] = tryGetTableCaseConvention(opt_case);
    if (err) {
      console.error(chalk.red(`Error: encountered unsupported case convention for --map-table-case: "${opt_case}".`));
      console.error(chalk.red(`Suggestion: ${SUPPORTED_CASE_CONVENTIONS_MESSAGE}`));
      program.outputHelp();
      process.exit(1);
    } else {
      convention_options.mapTableCaseConvention = convention!;
    }
  }

  if (options.mapFieldCase) {
    const opt_case: string = options.mapFieldCase;
    let [convention, err] = tryGetTableCaseConvention(opt_case);
    if (err) {
      console.error(chalk.red(`Error: encountered unsupported case convention for --map-field-case: "${opt_case}".`));
      console.error(chalk.red(`Suggestion: ${SUPPORTED_CASE_CONVENTIONS_MESSAGE}`));
      program.outputHelp();
      process.exit(1);
    } else {
      convention_options.mapFieldCaseConvention = convention!;
    }
  }

  if (options.mapEnumCase) {
    const opt_case: string = options.mapEnumCase;
    let [convention, err] = tryGetTableCaseConvention(opt_case);
    if (err) {
      console.error(chalk.red(`Error: encountered unsupported case convention for --map-enum-case: "${opt_case}".`));
      console.error(chalk.red(`Suggestion: ${SUPPORTED_CASE_CONVENTIONS_MESSAGE}`));
      program.outputHelp();
      process.exit(1);
    } else {
      convention_options.mapEnumCaseConvention = convention!;
    }
  }

  convention_options.pluralize = !!options.pluralize;

  const [schema, schema_error] = ConventionTransformer.migrateCaseConventions(file_contents!, convention_options);
  if (schema_error) {
    console.error(chalk.red('Encountered error while migrating case conventions'));
    console.error(chalk.red(schema_error));
    process.exit(1);
  }

  const new_schema = await formatSchema({ schema: schema! });

  if (options.dryRun) {
    console.log(new_schema);
    process.exit(0);
  }
  writeFileSync(options.file, Buffer.from(new_schema), { encoding: 'utf8' });
  console.log(chalk.blue('✨ Done.'));
}

export function tryGetFileContents(options: OptionValues): [string?, Error?] {
  const file_path = options.file;
  try {
    const contents = String(readFileSync(file_path));
    return [contents,];
  } catch (error) {
    return [, error as Error];
  }
}

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
