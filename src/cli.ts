#! /usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { Command, OptionValues } from 'commander';
import { snakeCase, camelCase, pascalCase } from 'change-case';
import { formatSchema } from '@prisma/internals';
import { migrateCaseConventions, CaseChange, MigrateCaseConventionsOptions } from './migrateCaseConventions';

const DEFAULT_FILE_LOCATION = 'schema.prisma';
const program = new Command(`prisma-case-format`);

const VERSION = require('../package.json').version;
program
  .description(`Give your schema.prisma sane naming conventions`)
  .requiredOption('--file <file>', 'schema.prisma file location', DEFAULT_FILE_LOCATION)
  .option('--table-case <tableCase>', 'case convention for table names. allowable values: "pascal", "camel", "snake"', 'pascal')
  .option('--field-case <fieldCase>', 'case convention for field names. allowable values: "pascal", "camel", "snake"', 'camel')
  .option('-p, --pluralize', 'optionally pluralizes array type fields', false)
  .option('-D, --dry-run', 'print changes to console, rather than back to file', false)
  .version(VERSION)
  ;
program.parse(process.argv);

run();

async function run() {
  const options = program.opts();

  if (options.dryRun) {
    console.log('***Dry run mode***');
  }

  const [file_contents, error_file] = tryGetFileContents(options);
  if (error_file) {
    console.error("Encountered an error while trying to read provided schema.prisma file at path " + options.file);
    console.error(error_file.message);
    process.exit(1);
  }

  let pluralize = !!options.pluralize;

  let [tableCaseConvention, error_table_case] = tryGetTableCaseConvention(options.tableCase);
  if (error_table_case) {
    console.warn(`Warning: encountered unsupported case convention: "${options.fieldCase}". Defaulting to "pascal" case.`);
    [tableCaseConvention,] = tryGetTableCaseConvention('pascal');
  }

  let [fieldCaseConvention, error_field_case] = tryGetTableCaseConvention(options.fieldCase);
  if (error_field_case) {
    console.warn(`Warning: encountered unsupported case convention: "${options.fieldCase}". Defaulting to "camel" case.`);
    [fieldCaseConvention,] = tryGetTableCaseConvention('camel');
  }

  const convention_options: MigrateCaseConventionsOptions = {
    tableCaseConvention: tableCaseConvention!,
    fieldCaseConvention: fieldCaseConvention!,
    pluralize,
  };
  const [schema, schema_error] = migrateCaseConventions(file_contents!, convention_options);
  if (schema_error) {
    console.error('Encountered error while migrating case conventions');
    console.error(schema_error);
    process.exit(1);
  }

  const new_schema = await formatSchema({ schema: schema! });

  if (options.dryRun) {
    console.log('Prettify yielded the following schema:');
    console.log(new_schema);
    process.exit(0);
  }
  writeFileSync(options.file, Buffer.from(new_schema), { encoding: 'utf8' });
  console.log('✨ Done.');
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

export function tryGetTableCaseConvention(type: string): [CaseChange?, Error?] {
  switch (type) {
    case 'pascal': return [pascalCase,];
    case 'camel': return [camelCase,];
    case 'snake': return [snakeCase,];
    default: return [, new Error('unsupported case convention: ' + type)];
  }
}
