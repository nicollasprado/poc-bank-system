import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account } from './accounts/account.entity.js';
import { LOAD_ACCOUNT_BALANCE, resetDatabase } from './seed.js';

function setup(loadAccounts?: number) {
  const manager = { query: vi.fn(), save: vi.fn() };
  const dataSource = {
    entityMetadatas: [{ tableName: 'accounts' }, { tableName: 'transfers' }],
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  return {
    manager,
    dataSource,
    reset: () =>
      resetDatabase(dataSource as unknown as DataSource, loadAccounts),
  };
}

describe('resetDatabase', () => {
  it('truncates every table and creates Alice and Bob in one transaction', async () => {
    const { reset, manager, dataSource } = setup();

    await reset();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      'TRUNCATE "accounts", "transfers" CASCADE',
    );
    expect(manager.save).toHaveBeenCalledWith(Account, [
      expect.objectContaining({ name: 'Alice', balance: 100_000 }),
      expect.objectContaining({ name: 'Bob', balance: 50_000 }),
    ]);
  });

  it('cleans the tables before creating the accounts', async () => {
    const { reset, manager } = setup();

    await reset();

    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.save.mock.invocationCallOrder[0],
    );
  });

  it('does not create load accounts by default', async () => {
    const { reset, manager } = setup();

    await reset();

    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('creates the requested number of load accounts', async () => {
    const { reset, manager } = setup(10_000);

    await reset();

    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('generate_series(1, $1)'),
      [10_000, LOAD_ACCOUNT_BALANCE],
    );
  });
});
