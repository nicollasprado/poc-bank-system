import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { typeOrmOptions } from '../src/database/typeorm.options.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18-alpine').start(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();

  const dataSource = new DataSource(typeOrmOptions(databaseUrl));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redis.getConnectionUrl());

  return async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  };
}
