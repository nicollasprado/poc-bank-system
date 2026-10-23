import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../accounts/account.entity.js';
import { MailService } from '../mail/mail.service.js';
import { Transfer } from './transfer.entity.js';
import { TransferService } from './transfer.service.js';

const alice = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Alice',
  email: 'alice@example.com',
};
const bob = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bob',
  email: 'bob@example.com',
};
const unknownId = '33333333-3333-4333-8333-333333333333';

function setup(balances: Record<string, number> = { [alice.id]: 10_000 }) {
  const accounts = [alice, bob];
  const manager = {
    query: vi.fn((sql: string, [amount, id]: [number, string]) => {
      const account = accounts.find((a) => a.id === id);
      const isDebit = sql.includes('"balance" - $1');
      const ok = account && (!isDebit || (balances[id] ?? 0) >= amount);
      const rows = ok ? [{ name: account.name, email: account.email }] : [];
      return Promise.resolve([rows, rows.length]);
    }),
    existsBy: vi.fn((_entity: unknown, { id }: { id: string }) =>
      Promise.resolve(accounts.some((a) => a.id === id)),
    ),
    create: vi.fn((_entity: unknown, data: Partial<Transfer>) => data),
    save: vi.fn((data: Partial<Transfer>) =>
      Promise.resolve({ id: 'transfer-id', createdAt: new Date(), ...data }),
    ),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const transfers = { findOne: vi.fn() };
  const mail = {
    notifyTransfer: vi.fn().mockResolvedValue(['email-1', 'email-2']),
    enqueue: vi.fn().mockResolvedValue(undefined),
  };

  const service = new TransferService(
    dataSource as unknown as DataSource,
    transfers as unknown as Repository<Transfer>,
    mail as unknown as MailService,
  );

  return { service, manager, dataSource, transfers, mail };
}

function debitCall(manager: ReturnType<typeof setup>['manager']) {
  return manager.query.mock.calls.findIndex(([sql]) =>
    sql.includes('"balance" - $1'),
  );
}

function creditCall(manager: ReturnType<typeof setup>['manager']) {
  return manager.query.mock.calls.findIndex(([sql]) =>
    sql.includes('"balance" + $1'),
  );
}

describe('TransferService', () => {
  describe('create', () => {
    it('debits the sender only if it has the balance, credits the recipient and saves the transfer', async () => {
      const { service, manager } = setup();

      const transfer = await service.create(alice.id, {
        toAccountId: bob.id,
        amount: 3_000,
      });

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringMatching(
          /"balance" - \$1\s+WHERE "id" = \$2 AND "balance" >= \$1/,
        ),
        [3_000, alice.id],
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringMatching(/"balance" \+ \$1\s+WHERE "id" = \$2/),
        [3_000, bob.id],
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

    it('does not read the accounts before the transaction', async () => {
      const { service, manager } = setup();

      await service.create(alice.id, { toAccountId: bob.id, amount: 3_000 });

      expect(manager.query).toHaveBeenCalledTimes(2);
      expect(manager.existsBy).not.toHaveBeenCalled();
    });

    it('saves the emails with the names returned by the updates and queues them after the transaction', async () => {
      const { service, manager, dataSource, mail } = setup();

      const transfer = await service.create(alice.id, {
        toAccountId: bob.id,
        amount: 3_000,
      });

      expect(mail.notifyTransfer).toHaveBeenCalledWith(
        manager,
        transfer,
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      );
      expect(mail.enqueue).toHaveBeenCalledWith(['email-1', 'email-2']);
      expect(mail.enqueue.mock.invocationCallOrder[0]).toBeGreaterThan(
        dataSource.transaction.mock.invocationCallOrder[0],
      );
    });

    it('debits before crediting when the sender has the lower id', async () => {
      const { service, manager } = setup();

      await service.create(alice.id, { toAccountId: bob.id, amount: 1_000 });

      expect(debitCall(manager)).toBeLessThan(creditCall(manager));
    });

    it('credits before debiting when the sender has the higher id', async () => {
      const { service, manager } = setup({ [bob.id]: 5_000 });

      await service.create(bob.id, { toAccountId: alice.id, amount: 1_000 });

      expect(creditCall(manager)).toBeLessThan(debitCall(manager));
    });

    it('rejects a transfer to the same account', async () => {
      const { service, dataSource } = setup();

      await expect(
        service.create(alice.id, { toAccountId: alice.id, amount: 1_000 }),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects when the sender does not exist', async () => {
      const { service, mail } = setup();

      await expect(
        service.create(unknownId, { toAccountId: bob.id, amount: 1_000 }),
      ).rejects.toThrow('Account not found');
      expect(mail.notifyTransfer).not.toHaveBeenCalled();
    });

    it('rejects when the recipient does not exist', async () => {
      const { service, manager, mail } = setup();

      await expect(
        service.create(alice.id, { toAccountId: unknownId, amount: 1_000 }),
      ).rejects.toThrow('Recipient account not found');
      expect(manager.save).not.toHaveBeenCalled();
      expect(mail.notifyTransfer).not.toHaveBeenCalled();
    });

    it('rejects when the balance is not enough', async () => {
      const { service, manager, mail } = setup();

      await expect(
        service.create(alice.id, { toAccountId: bob.id, amount: 10_001 }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(manager.existsBy).toHaveBeenCalledWith(Account, { id: alice.id });
      expect(manager.save).not.toHaveBeenCalled();
      expect(mail.notifyTransfer).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('throws not found, not insufficient funds, for a missing sender', async () => {
      const { service } = setup();

      await expect(
        service.create(unknownId, { toAccountId: bob.id, amount: 1_000 }),
      ).rejects.toThrow(NotFoundException);
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
