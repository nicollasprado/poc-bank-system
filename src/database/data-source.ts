import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { typeOrmOptions } from './typeorm.options.js';

export default new DataSource(
  typeOrmOptions(validateEnv(process.env).DATABASE_URL),
);
