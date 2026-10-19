import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline/promises';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './config/env.validation.js';
import { resetDatabase } from './seed.js';

async function confirm(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const db = new URL(config.get('DATABASE_URL', { infer: true }));

  const confirmed = await confirm(
    `This will DELETE ALL DATA in database "${db.pathname.slice(1)}" at ${db.host} and create the demo accounts. Continue? (y/N) `,
  );
  if (confirmed) {
    await resetDatabase(app.get(DataSource));
    console.log('Done: database cleaned, Alice and Bob created.');
  } else {
    console.log('Aborted, nothing was changed.');
  }

  await app.close();
}
await seed();
