import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../accounts/account.entity.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { Transfer } from '../transfers/transfer.entity.js';
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
  const mail = new MailService(
    transporter as unknown as Transporter,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { mail, transporter, config };
}

describe('MailService', () => {
  it('emails the sender and the recipient with the amount in reais', () => {
    const { mail, transporter } = setup();

    mail.notifyTransfer(transfer, alice, bob);

    expect(transporter.sendMail).toHaveBeenCalledTimes(2);
    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'POC Bank <no-reply@test>',
      to: 'alice@example.com',
      subject: 'Transferência enviada',
      text: expect.stringMatching(/Você enviou R\$\s150,00 para Bob/),
    });
    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'POC Bank <no-reply@test>',
      to: 'bob@example.com',
      subject: 'Transferência recebida',
      text: expect.stringMatching(/Você recebeu R\$\s150,00 de Alice/),
    });
  });

  it('reads the sender address from the config', () => {
    const { mail, config } = setup();

    mail.notifyTransfer(transfer, alice, bob);

    expect(config.get).toHaveBeenCalledWith('MAIL_FROM', { infer: true });
  });

  it('logs instead of throwing when an email fails', async () => {
    const { mail, transporter } = setup();
    transporter.sendMail.mockRejectedValue(new Error('SMTP down'));
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    expect(() => mail.notifyTransfer(transfer, alice, bob)).not.toThrow();

    await vi.waitFor(() => expect(logError).toHaveBeenCalledTimes(2));
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('alice@example.com'),
    );
  });
});
