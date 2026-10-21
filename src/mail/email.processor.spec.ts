import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EnvironmentVariables } from '../config/env.validation.js';
import { Email } from './email.entity.js';
import { EmailProcessor } from './email.processor.js';
import { SendEmailJobData } from './email.queue.js';
import { MailService } from './mail.service.js';

const email = {
  id: 'email-1',
  recipient: 'alice@example.com',
  subject: 'Transferência enviada',
  text: 'Você enviou R$ 150,00 para Bob.',
  status: 'pending',
} as Email;

function setup() {
  const emails = {
    findOneBy: vi.fn().mockResolvedValue(email),
    find: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const mail = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const queue = { upsertJobScheduler: vi.fn() };
  const transporter = { sendMail: vi.fn().mockResolvedValue({}) };
  const config = { get: vi.fn().mockReturnValue('POC Bank <no-reply@test>') };
  const processor = new EmailProcessor(
    emails as unknown as Repository<Email>,
    mail as unknown as MailService,
    queue as unknown as Queue,
    transporter as unknown as Transporter,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { processor, emails, mail, queue, transporter, config };
}

function job(overrides: Partial<Job<SendEmailJobData>> = {}) {
  return {
    name: 'send',
    data: { emailId: 'email-1' },
    attemptsMade: 1,
    opts: { attempts: 5 },
    ...overrides,
  } as Job<SendEmailJobData>;
}

describe('EmailProcessor', () => {
  describe('process', () => {
    it('sends a pending email from the configured address and marks it as sent', async () => {
      const { processor, emails, transporter, config } = setup();

      await processor.process(job());

      expect(emails.findOneBy).toHaveBeenCalledWith({
        id: 'email-1',
        status: 'pending',
      });
      expect(config.get).toHaveBeenCalledWith('MAIL_FROM', { infer: true });
      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: 'POC Bank <no-reply@test>',
        to: 'alice@example.com',
        subject: 'Transferência enviada',
        text: 'Você enviou R$ 150,00 para Bob.',
      });
      expect(emails.update).toHaveBeenCalledWith(
        { id: 'email-1', status: 'pending' },
        { status: 'sent', processedAt: expect.any(Date) },
      );
    });

    it('skips an email that is no longer pending, e.g. a duplicate job', async () => {
      const { processor, emails, transporter } = setup();
      emails.findOneBy.mockResolvedValue(null);

      await processor.process(job());

      expect(transporter.sendMail).not.toHaveBeenCalled();
      expect(emails.update).not.toHaveBeenCalled();
    });

    it('rethrows when sending fails so BullMQ retries it', async () => {
      const { processor, emails, transporter } = setup();
      transporter.sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(processor.process(job())).rejects.toThrow('SMTP down');
      expect(emails.update).not.toHaveBeenCalled();
    });

    it('runs the sweep for the scheduled sweep job', async () => {
      const { processor, emails, transporter } = setup();

      await processor.process(job({ name: 'sweep' }));

      expect(emails.find).toHaveBeenCalled();
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    it('queues the emails left pending for more than 30s', async () => {
      const { processor, emails, mail } = setup();
      emails.find.mockResolvedValue([{ id: 'email-1' }, { id: 'email-2' }]);

      await processor.sweep();

      const { where } = emails.find.mock.calls[0][0];
      expect(where.status).toBe('pending');
      expect(where.createdAt.getSql('created_at')).toBe(
        "created_at < now() - interval '30 seconds'",
      );
      expect(mail.enqueue).toHaveBeenCalledWith(['email-1', 'email-2']);
    });

    it('does not touch the queue when nothing is stuck', async () => {
      const { processor, mail } = setup();

      await processor.sweep();

      expect(mail.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('marks the email as failed after the last attempt', async () => {
      const { processor, emails } = setup();

      await processor.onFailed(job({ attemptsMade: 5 }));

      expect(emails.update).toHaveBeenCalledWith(
        { id: 'email-1', status: 'pending' },
        { status: 'failed', processedAt: expect.any(Date) },
      );
    });

    it('leaves the email pending while there are attempts left', async () => {
      const { processor, emails } = setup();

      await processor.onFailed(job({ attemptsMade: 2 }));

      expect(emails.update).not.toHaveBeenCalled();
    });

    it('ignores a failed sweep', async () => {
      const { processor, emails } = setup();

      await processor.onFailed(job({ name: 'sweep', attemptsMade: 1 }));

      expect(emails.update).not.toHaveBeenCalled();
    });
  });

  it('schedules the sweep when the worker boots', async () => {
    const { processor, queue } = setup();

    await processor.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'sweep',
      { every: 60_000 },
      { name: 'sweep', opts: { attempts: 1 } },
    );
  });
});
