import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../accounts/account.entity.js';
import { MailService } from '../mail/mail.service.js';
import { Transfer } from './transfer.entity.js';
import { TransferService } from './transfer.service.js';

const alice: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Alice',
  email: 'alice@example.com',
  balance: 10_000,
};
const bob: Account = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bob',
  email: 'bob@example.com',
  balance: 5_000,
};
const unknownId = '33333333-3333-4333-8333-333333333333';

function setup() {
  const manager = {
    decrement: vi.fn().mockResolvedValue({ affected: 1 }),
    increment: vi.fn().mockResolvedValue({ affected: 1 }),
    create: vi.fn((_entity: unknown, data: Partial<Transfer>) => data),
    save: vi.fn((data: Partial<Transfer>) =>
      Promise.resolve({ id: 'transfer-id', createdAt: new Date(), ...data }),
    ),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const accounts = {
    findOneBy: vi.fn(({ id }: { id: string }) =>
      Promise.resolve([alice, bob].find((a) => a.id === id) ?? null),
    ),
  };
  const transfers = { findOne: vi.fn() };
  const mail = { notifyTransfer: vi.fn() };

  const service = new TransferService(
    dataSource as unknown as DataSource,
    accounts as unknown as Repository<Account>,
    transfers as unknown as Repository<Transfer>,
    mail as unknown as MailService,
  );

  return { service, manager, dataSource, accounts, transfers, mail };
}

describe('TransferService', () => {
  describe('create', () => {
    it('debits the sender, credits the recipient and saves the transfer', async () => {
      const { service, manager } = setup();

      const transfer = await service.create(alice.id, {
        toAccountId: bob.id,
        amount: 3_000,
      });

      expect(manager.decrement).toHaveBeenCalledWith(
        Account,
        { id: alice.id, balance: MoreThanOrEqual(3_000) },
        'balance',
        3_000,
      );
      expect(manager.increment).toHaveBeenCalledWith(
        Account,
        { id: bob.id },
        'balance',
        3_000,
      );
      expect(manager.save).toHaveBeenCalledWith({
        fromAccountId: alice.id,
        toAccountId: bob.id,
        amount: 3_000,
      });
      expect(transfer).toMatchObject({
        id: 'transfer-id',
        fromAccountId: alice.id,
        toAccountId: bob.id,
        amount: 3_000,
      });
    });

    it('notifies both accounts about the saved transfer', async () => {
      const { service, mail } = setup();

      const transfer = await service.create(alice.id, {
        toAccountId: bob.id,
        amount: 3_000,
      });

      expect(mail.notifyTransfer).toHaveBeenCalledWith(transfer, alice, bob);
    });

    it('debits before crediting when the sender has the lower id', async () => {
      const { service, manager } = setup();

      await service.create(alice.id, { toAccountId: bob.id, amount: 1_000 });

      expect(manager.decrement.mock.invocationCallOrder[0]).toBeLessThan(
        manager.increment.mock.invocationCallOrder[0],
      );
    });

    it('credits before debiting when the sender has the higher id', async () => {
      const { service, manager } = setup();

      await service.create(bob.id, { toAccountId: alice.id, amount: 1_000 });

      expect(manager.increment.mock.invocationCallOrder[0]).toBeLessThan(
        manager.decrement.mock.invocationCallOrder[0],
      );
    });

    it('rejects a transfer to the same account', async () => {
      const { service, accounts } = setup();

      await expect(
        service.create(alice.id, { toAccountId: alice.id, amount: 1_000 }),
      ).rejects.toThrow(BadRequestException);
      expect(accounts.findOneBy).not.toHaveBeenCalled();
    });

    it('rejects when the sender does not exist', async () => {
      const { service, dataSource } = setup();

      await expect(
        service.create(unknownId, { toAccountId: bob.id, amount: 1_000 }),
      ).rejects.toThrow('Account not found');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects when the recipient does not exist', async () => {
      const { service, dataSource } = setup();

      await expect(
        service.create(alice.id, { toAccountId: unknownId, amount: 1_000 }),
      ).rejects.toThrow('Recipient account not found');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects without opening a transaction when the balance is too low', async () => {
      const { service, dataSource } = setup();

      await expect(
        service.create(alice.id, { toAccountId: bob.id, amount: 10_001 }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects when a concurrent transfer spent the balance after the check', async () => {
      const { service, manager, mail } = setup();
      manager.decrement.mockResolvedValue({ affected: 0 });

      await expect(
        service.create(alice.id, { toAccountId: bob.id, amount: 3_000 }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(mail.notifyTransfer).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('only looks for transfers where the account is the sender or the recipient', async () => {
      const { service, transfers } = setup();
      const transfer = { id: 'transfer-id', fromAccountId: alice.id };
      transfers.findOne.mockResolvedValue(transfer);

      await expect(service.findOne('transfer-id', alice.id)).resolves.toBe(
        transfer,
      );
      expect(transfers.findOne).toHaveBeenCalledWith({
        where: [
          { id: 'transfer-id', fromAccountId: alice.id },
          { id: 'transfer-id', toAccountId: alice.id },
        ],
      });
    });

    it('throws not found when no transfer matches', async () => {
      const { service, transfers } = setup();
      transfers.findOne.mockResolvedValue(null);

      await expect(service.findOne('transfer-id', alice.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
