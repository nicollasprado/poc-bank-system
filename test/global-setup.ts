import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { typeOrmOptions } from '../src/database/typeorm.options.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const databaseUrl = container.getConnectionUri();

  const dataSource = new DataSource(typeOrmOptions(databaseUrl));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await container.stop();
  };
}
