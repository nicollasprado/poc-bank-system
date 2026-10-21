import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../accounts/account.entity.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { Transfer } from '../transfers/transfer.entity.js';
import { Email } from './email.entity.js';
import { MailService } from './mail.service.js';

const alice: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Alice',
  email: 'alice@example.com',
  balance: 0,
};
const bob: Account = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bob',
  email: 'bob@example.com',
  balance: 0,
};
const transfer: Transfer = {
  id: 'transfer-id',
  fromAccountId: alice.id,
  toAccountId: bob.id,
  amount: 15_000,
  createdAt: new Date(),
};

function setup() {
  const transporter = { sendMail: vi.fn().mockResolvedValue({}) };
  const config = { get: vi.fn().mockReturnValue('POC Bank <no-reply@test>') };
  const queue = { addBulk: vi.fn().mockResolvedValue([]) };
  const manager = {
    insert: vi.fn().mockResolvedValue({
      identifiers: [{ id: 'email-1' }, { id: 'email-2' }],
    }),
  };
  const mail = new MailService(
    transporter as unknown as Transporter,
    config as unknown as ConfigService<EnvironmentVariables, true>,
    queue as unknown as Queue,
  );
  return { mail, transporter, config, queue, manager };
}

describe('MailService', () => {
  describe('notifyTransfer', () => {
    it('saves an email for the sender and the recipient with the amount in reais', async () => {
      const { mail, manager } = setup();

      const ids = await mail.notifyTransfer(
        manager as unknown as EntityManager,
        transfer,
        alice,
        bob,
      );

      expect(ids).toEqual(['email-1', 'email-2']);
      expect(manager.insert).toHaveBeenCalledWith(Email, [
        {
          recipient: 'alice@example.com',
          subject: 'Transferência enviada',
          text: expect.stringMatching(/Você enviou R\$\s150,00 para Bob/),
        },
        {
          recipient: 'bob@example.com',
          subject: 'Transferência recebida',
          text: expect.stringMatching(/Você recebeu R\$\s150,00 de Alice/),
        },
      ]);
    });
  });

  describe('enqueue', () => {
    it('queues one job per email, using the email id as the job id', async () => {
      const { mail, queue } = setup();

      await mail.enqueue(['email-1', 'email-2']);

      expect(queue.addBulk).toHaveBeenCalledWith([
        {
          name: 'send',
          data: { emailId: 'email-1' },
          opts: { jobId: 'email-1' },
        },
        {
          name: 'send',
          data: { emailId: 'email-2' },
          opts: { jobId: 'email-2' },
        },
      ]);
    });

    it('logs instead of throwing when the queue is down', async () => {
      const { mail, queue } = setup();
      queue.addBulk.mockRejectedValue(new Error('Redis down'));
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await expect(mail.enqueue(['email-1'])).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('email-1'));
    });
  });

  describe('send', () => {
    it('sends the email from the configured address', async () => {
      const { mail, transporter, config } = setup();

      await mail.send({
        recipient: 'alice@example.com',
        subject: 'Assunto',
        text: 'Texto',
      } as Email);

      expect(config.get).toHaveBeenCalledWith('MAIL_FROM', { infer: true });
      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: 'POC Bank <no-reply@test>',
        to: 'alice@example.com',
        subject: 'Assunto',
        text: 'Texto',
      });
    });

    it('throws when the SMTP server fails, so the job is retried', async () => {
      const { mail, transporter } = setup();
      transporter.sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        mail.send({ recipient: 'alice@example.com' } as Email),
      ).rejects.toThrow('SMTP down');
    });
  });
});
