import { DataSource } from 'typeorm';
import { Account } from './accounts/account.entity.js';

export const LOAD_ACCOUNT_BALANCE = 1_000_000;

export async function resetDatabase(dataSource: DataSource, loadAccounts = 0) {
  const tables = dataSource.entityMetadatas
    .map((metadata) => `"${metadata.tableName}"`)
    .join(', ');

  await dataSource.transaction(async (manager) => {
    await manager.query(`TRUNCATE ${tables} CASCADE`);
    await manager.save(Account, [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Alice',
        email: 'alice@example.com',
        balance: 100_000,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Bob',
        email: 'bob@example.com',
        balance: 50_000,
      },
    ]);
    if (loadAccounts > 0) {
      await manager.query(
        `INSERT INTO "accounts" ("id", "name", "email", "balance")
         SELECT ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
                'Load ' || i, 'load' || i || '@example.com', $2
         FROM generate_series(1, $1) AS i`,
        [loadAccounts, LOAD_ACCOUNT_BALANCE],
      );
    }
  });
}
