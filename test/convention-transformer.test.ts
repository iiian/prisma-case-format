import { readFileSync } from 'fs';

import { join } from 'path';

import { camelCase, pascalCase, snakeCase } from 'change-case';
import { CaseChange, ConventionTransformer } from '../src/convention-transformer';
import { formatSchema } from '@prisma/internals';

const PRISMA_SUFFIX = '.schema.prisma';
const FIXTURES_DIR = join(process.cwd(), 'test', '__fixtures__');
function getFixture(relative_path: string) {
  return readFileSync(join(FIXTURES_DIR, relative_path + PRISMA_SUFFIX), 'utf-8');
}

test('it can map model columns with under_scores to camelCase', () => {
  const file_contents = getFixture('model-columns-with-underscores');

  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  };
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result?.includes('articleId Int @map("article_id")')).toBeTruthy();
});

test('it can map relations with cascading deletion rules & foreign_key names', () => {
  const file_contents = getFixture('cascading-deletion-and-fk')
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  };
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result?.includes('@relation(fields: [projectId], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "jira_issues_projects_fkey")')).toBeTruthy();
  expect(result?.includes('@relation(references: [id], fields: [formId], onDelete: Cascade)')).toBeTruthy();
});

test('it can map enum column to enum definition', () => {
  const file_contents = getFixture('enum');
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: snakeCase,
    pluralize: false
  };
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result?.includes(`post_type PostType @map("postType")`)).toBeTruthy();
  expect(result?.includes(`enum PostType {`)).toBeTruthy();
});

test('it can optionally pluralize fields', () => {
  const file_contents = getFixture('pluralize-fields');
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: true
  };
  let [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result?.includes(`ingredientCategories IngredientCategory[]`)).toBeTruthy();
  expect(result).toMatch(/languages\s+String\[\].+(@map\("language"\))/);

  // prove is optional
  opts.pluralize = false;
  [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result).toMatch(/ingredientCategory\s+IngredientCategory\[\]/);
  expect(result).toMatch(/language\s+String\[\]/);
});

test('it can account for comments on model lines', () => {
  const file_contents = getFixture('comments-on-model-lines');

  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false,
  };
  const [result, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
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
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapFieldCaseConvention: caseConvention,
    pluralize: false
  };

  let file_contents = getFixture('idempotency');
  let [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  let new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('cascading-deletion-and-fk');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('pluralize-fields');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
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
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    mapTableCaseConvention: caseConvention,
    pluralize: false
  };

  let file_contents = getFixture('idempotency');
  let [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  let new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('cascading-deletion-and-fk');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);

  file_contents = getFixture('pluralize-fields');
  [schema, err] = ConventionTransformer.migrateCaseConventions(file_contents, opts);
  new_schema = await formatSchema({ schema: schema! });
  expect(err).toBeFalsy();
  expect(new_schema).toMatchSnapshot(caseConvention.name);
});
