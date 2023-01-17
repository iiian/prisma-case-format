const { camelCase, pascalCase, snakeCase } = require('change-case');
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

  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  };
  const [result, err] = migrateCaseConventions(file_contents, opts);
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

  model field_key {
    key         String
    type        String // str, num, bool
    form_id     String @db.Uuid
    form        Form   @relation(references: [id], fields: [form_id], onDelete: Cascade)
  
    @@id([key, form_id])
  }
  `;
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false
  };
  const [result, err] = migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result.includes('@relation(fields: [projectId], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "jira_issues_projects_fkey")')).toBeTruthy();
  expect(result.includes('@relation(references: [id], fields: [formId], onDelete: Cascade)')).toBeTruthy();
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
    id        Int           @id @default(autoincrement())
    content   String?       @db.VarChar
    postType  post_type
  }

  enum post_type {
    Note
    Question
  }
  `;
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: snakeCase,
    pluralize: false
  };
  const [result, err] = migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result.includes(`post_type  PostType @map("postType")`)).toBeTruthy();
  expect(result.includes(`enum PostType {`)).toBeTruthy();
});

test('it can optionally pluralize fields', () => {
  const file_contents = `datasource db {
    provider = "sqlite"
    url = env("DATABASE_URL")
  }
  
  generator client {
    provider = "prisma-client-js"
  }

  model Business {
    id                 String               @id(map: "BusinessId") @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    languageCode       String               @db.Char(2)
    currencyCode       String               @db.Char(3)
    createdAt          DateTime             @default(now()) @db.Timestamptz(0)
    name               String               @db.VarChar(64)
    language           String[]             @default([]) @db.Char(2)
    phone              String               @db.VarChar(15)
    address            String?              @db.VarChar(250)
    billingName        String?              @db.VarChar(64)
    billingAddress     String?              @db.VarChar(250)
    taxOffice          String?              @db.VarChar(64)
    taxId              String?              @db.VarChar(64)
    defaultTaxRate     Decimal?             @db.Decimal(8, 6)
    isActive           Boolean              @default(true)
    batchOperation     BatchOperation[]
    currency           Currency             @relation(fields: [currencyCode], references: [code], onUpdate: Restrict, map: "BusinessCurrency")
    language           Language             @relation(fields: [languageCode], references: [code], onUpdate: Restrict, map: "BusinessLanguage")
    ingredientCategory IngredientCategory[]
    itemCategory       ItemCategory[]
    optionCategory     OptionCategory[]
    profile            Profile[]
    recipe             Recipe[]
    tab                Tab[]
    targetGroup        TargetGroup[]
  
    @@schema("public")
  }
  `;
  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: true
  };
  let [result, err] = migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result.includes(`ingredientCategories IngredientCategory[]`)).toBeTruthy();
  expect(result).toMatch(/languages\s+String\[\].+(@map\("language"\))/);

  // prove is optional
  opts.pluralize = false;
  [result, err] = migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result).toMatch(/ingredientCategory\s+IngredientCategory\[\]/);
  expect(result).toMatch(/language\s+String\[\]/);
});

test('it can account for comments on model lines', () => {
  const file_contents = `
  
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  
  generator js_cli {
    provider = "prisma-client-js"
  }

  model a_model {
    id             String     @id @default(uuid()) @db.Uuid
    name           String     @unique
    field_with_comments   String? // This should not break our ability to insert map annotations
  }
  
  `;

  const opts = {
    tableCaseConvention: pascalCase,
    fieldCaseConvention: camelCase,
    pluralize: false,
  };
  const [result, err] = migrateCaseConventions(file_contents, opts);
  expect(err).toBeFalsy();
  expect(result).toMatch(/fieldWithComments\s+String\?\s+@map\("field_with_comments"\)\s+\/\/ This should not break our ability to insert map annotations/);
});