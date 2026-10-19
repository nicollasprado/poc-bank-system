import { DataSource } from 'typeorm';
import { Account } from './accounts/account.entity.js';

export async function resetDatabase(dataSource: DataSource) {
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
  });
}
