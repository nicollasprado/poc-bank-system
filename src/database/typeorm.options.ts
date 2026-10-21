import { DataSourceOptions } from 'typeorm';
import { Account } from '../accounts/account.entity.js';
import { Email } from '../mail/email.entity.js';
import { Transfer } from '../transfers/transfer.entity.js';
import { CreateAccountsAndTransfers1792449030088 } from './migrations/1792449030088-CreateAccountsAndTransfers.js';
import { CreateEmails1792623705232 } from './migrations/1792623705232-CreateEmails.js';

export function typeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Account, Transfer, Email],
    migrations: [
      CreateAccountsAndTransfers1792449030088,
      CreateEmails1792623705232,
    ],
    uuidExtension: 'pgcrypto',
    parseInt8: true,
    extra: { max: 33 },
  };
}
