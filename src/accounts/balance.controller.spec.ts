import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account } from './account.entity.js';
import { BalanceController } from './balance.controller.js';

function setup() {
  const accounts = { findOneBy: vi.fn() };
  const controller = new BalanceController(
    accounts as unknown as Repository<Account>,
  );
  return { controller, accounts };
}

describe('BalanceController', () => {
  it('returns the balance of the current account', async () => {
    const { controller, accounts } = setup();
    accounts.findOneBy.mockResolvedValue({
      id: 'account-id',
      name: 'Alice',
      email: 'alice@example.com',
      balance: 10_000,
    });

    await expect(controller.get('account-id')).resolves.toEqual({
      accountId: 'account-id',
      balance: 10_000,
    });
    expect(accounts.findOneBy).toHaveBeenCalledWith({ id: 'account-id' });
  });

  it('throws not found when the account does not exist', async () => {
    const { controller, accounts } = setup();
    accounts.findOneBy.mockResolvedValue(null);

    await expect(controller.get('account-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
