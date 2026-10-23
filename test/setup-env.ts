import { inject } from 'vitest';

process.env.PORT = '3000';
process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_URL = inject('redisUrl');
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.MAIL_FROM = 'POC Bank <no-reply@test>';
