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

test('it can map relations with cascading deletion rules & foreign_key names', () => {
  const file_contents = `datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  
  generator client {
    provider = "prisma-client-js"
  }
  
  model projects {
    id          Int           @id @default(autoincrement())
    name        String?       @db.VarChar
    jira_issues jira_issues[]
  }
  
  model jira_issues {
    id                  Int       @id @default(autoincrement())
    jira_integration_id Int?
    project_id          Int
    projects            projects? @relation(fields: [project_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "jira_issues_projects_fkey")
  }
  `;
  const [result, err] = migrateCaseConventions(file_contents, pascalCase, camelCase);
  expect(err).toBeFalsy();
  expect(result.includes('@relation(fields: [projectId], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "jira_issues_projects_fkey")')).toBeTruthy();
});

test('it can map enum column to enum definition', () => {
  const file_contents = `datasource db {
    provider = "mysql"
    url      = env("DATABASE_URL")
  }
  
  generator client {
    provider = "prisma-client-js"
  }
  
  model posts {
    id          Int           @id @default(autoincrement())
    content     String?       @db.VarChar
    type        post_type
  }

  enum post_type {
    Note
    Question
  }
  `;
  const [result, err] = migrateCaseConventions(file_contents, pascalCase, camelCase);
  expect(err).toBeFalsy();
  expect(result.includes('enum PostType {')).toBeTruthy();
});