import { DataSourceOptions } from 'typeorm';
import { Account } from '../accounts/account.entity.js';
import { Transfer } from '../transfers/transfer.entity.js';
import { CreateAccountsAndTransfers1792449030088 } from './migrations/1792449030088-CreateAccountsAndTransfers.js';

export function typeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Account, Transfer],
    migrations: [CreateAccountsAndTransfers1792449030088],
    uuidExtension: 'pgcrypto',
    parseInt8: true,
    extra: { max: 33 },
  };
}
