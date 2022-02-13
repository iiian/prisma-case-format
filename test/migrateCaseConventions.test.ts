const { camelCase, pascalCase } = require('change-case');
const { migrateCaseConventions } = require('../src/migrateCaseConventions');

test('it can map model columns with under_scores to camelCase', () => {
  const file_contents = `datasource db {
  provider = "sqlite"
  url      = "file:database.db"
}

// generator
generator client {
  provider = "prisma-client-js"
}

model Demo {
  article_id Int
}`;
  const [result, err] = migrateCaseConventions(file_contents, pascalCase, camelCase);
  expect(err).toBeFalsy();
  expect(result.includes('articleId Int @map("article_id")')).toBeTruthy();
});
