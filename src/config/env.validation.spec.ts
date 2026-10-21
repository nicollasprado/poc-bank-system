import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const validEnv = {
  PORT: '3000',
  DATABASE_URL: 'postgres://bank:bank@localhost:5433/bank',
  REDIS_URL: 'redis://localhost:6380',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'POC Bank <no-reply@pocbank.dev>',
};

describe('validateEnv', () => {
  it('accepts a valid env and converts ports to numbers', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('accepts a database url with ssl params', () => {
    const env = validateEnv({
      ...validEnv,
      DATABASE_URL:
        'postgres://bank:s3cret@bank.cluster-abc123.sa-east-1.rds.amazonaws.com:5432/bank?sslmode=verify-full&sslrootcert=./global-bundle.pem',
    });

    expect(env.DATABASE_URL).toContain('rds.amazonaws.com');
  });

  it.each([
    ['DATABASE_URL is missing', { DATABASE_URL: undefined }],
    ['DATABASE_URL is not a postgres url', { DATABASE_URL: 'mysql://db/bank' }],
    ['REDIS_URL is missing', { REDIS_URL: undefined }],
    ['REDIS_URL is not a redis url', { REDIS_URL: 'http://localhost:6380' }],
    ['PORT is not a number', { PORT: 'abc' }],
    ['SMTP_PORT is out of range', { SMTP_PORT: '70000' }],
    ['SMTP_HOST is empty', { SMTP_HOST: '' }],
    ['MAIL_FROM is missing', { MAIL_FROM: undefined }],
  ])('rejects the env when %s', (_, override) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(
      'Invalid environment variables',
    );
  });
});
