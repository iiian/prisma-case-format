import { readFileSync } from 'fs';

import { join } from 'path';

import { camelCase, pascalCase, snakeCase } from 'change-case';
import { CaseChange, ConventionTransformer } from '../src/convention-transformer';
import { formatSchema } from '@prisma/internals';

import { asPluralized, asSingularized } from '../src/caseConventions';
import { ConventionStore, defaultConventions } from '../src/convention-store';

const PRISMA_SUFFIX = '.schema.prisma';
const FIXTURES_DIR = join(process.cwd(), 'test', '__fixtures__');
function getFixture(relative_path: string) {
  return readFileSync(join(FIXTURES_DIR, relative_path + PRISMA_SUFFIX), 'utf-8');
}

function getTestFile(relative_path: string) {
  return readFileSync(join(FIXTURES_DIR, relative_path), 'utf-8');
}

test('the readme demo should work', () => {
  const file_contents  = getFixture('readme-demo');
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    fieldCaseConvention: pascalCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result).toMatchSnapshot();
});

test('it can map model columns with under_scores to camelCase', () => {
  const file_contents = getFixture('model-columns-with-underscores');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('articleId Int @map("article_id")')).toBeTruthy();
});

test('it can map relations with cascading deletion rules & foreign_key names', () => {
  const file_contents = getFixture('cascading-deletion-and-fk')
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('@relation(fields: [projectId], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "jira_issues_projects_fkey")')).toBeTruthy();
  expect(result?.includes('@relation(references: [id], fields: [formId], onDelete: Cascade)')).toBeTruthy();
});

test('it can map enum column to enum definition', async () => {
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: snakeCase,
    enumCaseConvention: pascalCase,
    pluralize: false,
  });
  const file_contents = getFixture('enum');
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  const new_schema = await formatSchema({ schema: schema! });
  expect(new_schema).toMatchSnapshot();
});

test('it can optionally pluralize fields', () => {
  const file_contents = getFixture('pluralize-fields');
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: true
  });
  let [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes(`ingredientCategories IngredientCategory[]`)).toBeTruthy();
  expect(result).toMatch(/languages\s+String\[\].+(@map\("language"\))/);

  // prove is optional
  store.pluralize = false;
  [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result).toMatch(/ingredientCategory\s+IngredientCategory\[\]/);
  expect(result).toMatch(/language\s+String\[\]/);
});

test('it can account for comments on model lines', () => {
  const file_contents = getFixture('comments-on-model-lines');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result).toMatch(/fieldWithComments\s+String\?\s+@map\("field_with_comments"\)\s+\/\/ This should not break our ability to insert map annotations/);
});

const supported_case_conventions: { caseConvention: CaseChange }[] = [
  { caseConvention: snakeCase }, { caseConvention: camelCase }, { caseConvention: pascalCase }];
/**
 * !!Warning!! Jest snapshots are _almost_ an anti-pattern. This is because if
 * you rename the test case, and introduce a bug, the bug is now valid to Jest.
 * This means you _must_ participate in orthodox red-green-refactor.
 *
 * If you rename this test, don't do it while the build is broken.
 */
test.each(supported_case_conventions)('it can enforce a specified case convention on all fields of all tables ($caseConvention.name)', async ({ caseConvention }) => {
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapFieldCaseConvention: caseConvention,
    pluralize: false
  });

  let file_contents = getFixture('idempotency');
  let [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  let new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('cascading-deletion-and-fk');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('pluralize-fields');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);
});

/**
 * !!Warning!! Jest snapshots are _almost_ an anti-pattern. This is because if
 * you rename the test case, and introduce a bug, the bug is now valid to Jest.
 * This means you _must_ participate in orthodox red-green-refactor.
 *
 * If you rename this test, don't do it while the build is broken.
 */
test.each(supported_case_conventions)('it can enforce a specified case convention on all table names ($caseConvention.name)', async ({ caseConvention }) => {
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: caseConvention,
    pluralize: false
  });

  let file_contents = getFixture('idempotency');
  let [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  let new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('cascading-deletion-and-fk');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('pluralize-fields');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);
});

test('it can enforce a specified case convention on views', async () => {
  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: true,
  });
  const file_contents = getFixture('views');
  let [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  let new_schema = await formatSchema({ schema: schema! });
  expect(new_schema).toMatchSnapshot();
});

test('it can map columns with `view` in the name', () => {
  const file_contents = getFixture('columns-with-view-in-name');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('viewCount Int @map("view_count")')).toBeTruthy();
});

test('it can map tables while separating pluralization', () => {
  const file_contents = getFixture('tables-with-pluralized-db-targets');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: asPluralized(snakeCase),
    pluralize: false,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('@@map("users")')).toBeTruthy();
  expect(result?.includes('@@map("groups")')).toBeTruthy();
});

test('it can map tables while separating pluralization', () => {
  const file_contents = getFixture('tables-with-pluralized-db-targets');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: asSingularized(snakeCase),
    pluralize: false,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('model Sisters')).toBeTruthy();
  expect(result?.includes('@@map("sister")')).toBeTruthy();
  expect(result?.includes('model Brothers')).toBeTruthy();
  expect(result?.includes('@@map("brother")')).toBeTruthy();
});

test('it can map ...horrendous indexes that make your head hurt for these people', () => {
  const file_contents = getFixture('complex-index');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: asSingularized(snakeCase),
    pluralize: false,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result).toMatchSnapshot();
});

test('it can rename enum in the database', async () => {
  const file_contents = getFixture('enum-tables-map');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: snakeCase,
    pluralize: false,
  });
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  const result = await formatSchema({ schema: schema! });
  expect(result).toMatchSnapshot();
});

describe('must properly bring enum name to', () => {
  test('camelCase', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      enumCaseConvention: camelCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    expect(result?.includes('enum postType')).toBeTruthy();
  })

  test('PascalCase', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      enumCaseConvention: pascalCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    expect(result?.includes('enum PostType')).toBeTruthy();
  })

  test('snake_case', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      enumCaseConvention: snakeCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    expect(result?.includes('enum post_type')).toBeTruthy();
  });
});

describe('must properly map enum name to ', () => {
  test('camelCase', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      mapEnumCaseConvention: camelCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    expect(result?.includes('@@map("postType")')).toBeTruthy();
  });

  test('PascalCase', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      mapEnumCaseConvention: pascalCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    expect(result?.includes('@@map("PostType")')).toBeFalsy();
  });

  test('snake_case', () => {
    const file_contents = getFixture('enum');

    const store = ConventionStore.fromConventions({
      ...defaultConventions(),
      tableCaseConvention: pascalCase,
      fieldCaseConvention: camelCase,
      mapEnumCaseConvention: snakeCase,
    });
    const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
    expect(err).toBeFalsy();
    // We can't test “post_type” here because we just skip mappings if mapped name is equal to enum name.
    expect(result?.includes('@@map("apple_colors")')).toBeTruthy();
  });
});

test('use table naming convention when enum naming convention is not specified', () => {
  const file_contents = getFixture('enum');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('enum PostType')).toBeTruthy();
});

test('override table naming convention when enum naming convention is specified', () => {
  const file_contents = getFixture('enum');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    enumCaseConvention: camelCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('enum postType')).toBeTruthy();
});

test('use table mapping convention when enum mapping convention is not specified', () => {
  const file_contents = getFixture('enum');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: camelCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('@@map("postType")')).toBeTruthy();
});

test('override table mapping convention when enum mapping convention is specified', () => {
  const file_contents = getFixture('enum');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: camelCase,
    mapEnumCaseConvention: pascalCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('@@map("PostType")')).toBeFalsy();
});

test('skip enum name mapping when enum name is equal to map', () => {
  const file_contents = getFixture('enum');

  const store = ConventionStore.fromConventions({
    ...defaultConventions(),
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapEnumCaseConvention: pascalCase,
  });
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, store);
  expect(err).toBeFalsy();
  expect(result?.includes('@@map("post_type")')).toBeFalsy();
});

test('if the entity is marked disabled, formatting is not applied', async () => {
  const file_contents = getFixture('disable');
  const cfg_file = getTestFile('disable.prisma-case-format');
  const [store, store_err] = ConventionStore.fromConfStr(cfg_file);
  expect(store_err).toBeFalsy();
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store!);
  expect(err).toBeFalsy();
  const result = await  formatSchema({ schema: schema! });
  expect(result).toMatchSnapshot();
});

test('if next-auth is marked as in use, those models should be managed separately/consistently', async () => {
  const file_contents = getFixture('next-auth');
  const [store, store_err] = ConventionStore.fromConf({ uses_next_auth: true });
  expect(store_err).toBeFalsy();
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store!);
  const result = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(result).toMatchSnapshot();
});

test('issue', async () => {
  const file_contents = getFixture('issue');
  const [store, store_err] = ConventionStore.fromConf({
    uses_next_auth: true
  });
  expect(store_err).toBeFalsy();
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store!);
  expect(err).toBeFalsy();
  const result = await formatSchema({ schema: schema! });
  expect(result).toMatchSnapshot();
});

test('issue2', async () => {
  const file_contents = getFixture('issue2');
  const [store, store_err] = ConventionStore.fromConf({
    uses_next_auth: true
  });
  expect(store_err).toBeFalsy();
  const [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, store!);
  expect(err).toBeFalsy();
  const result = await formatSchema({ schema: schema! });
  expect(result).toMatchSnapshot();
});