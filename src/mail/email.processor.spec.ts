import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
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
  const mail = {
    send: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
  };
  const queue = { upsertJobScheduler: vi.fn() };
  const processor = new EmailProcessor(
    emails as unknown as Repository<Email>,
    mail as unknown as MailService,
    queue as unknown as Queue,
  );
  return { processor, emails, mail, queue };
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
    it('sends a pending email and marks it as sent', async () => {
      const { processor, emails, mail } = setup();

      await processor.process(job());

      expect(emails.findOneBy).toHaveBeenCalledWith({
        id: 'email-1',
        status: 'pending',
      });
      expect(mail.send).toHaveBeenCalledWith(email);
      expect(emails.update).toHaveBeenCalledWith(
        { id: 'email-1', status: 'pending' },
        { status: 'sent', processedAt: expect.any(Date) },
      );
    });

    it('skips an email that is no longer pending, e.g. a duplicate job', async () => {
      const { processor, emails, mail } = setup();
      emails.findOneBy.mockResolvedValue(null);

      await processor.process(job());

      expect(mail.send).not.toHaveBeenCalled();
      expect(emails.update).not.toHaveBeenCalled();
    });

    it('rethrows when sending fails so BullMQ retries it', async () => {
      const { processor, emails, mail } = setup();
      mail.send.mockRejectedValue(new Error('SMTP down'));

      await expect(processor.process(job())).rejects.toThrow('SMTP down');
      expect(emails.update).not.toHaveBeenCalled();
    });

    it('runs the sweep for the scheduled sweep job', async () => {
      const { processor, emails, mail } = setup();

      await processor.process(job({ name: 'sweep' }));

      expect(emails.find).toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
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

  it('schedules the sweep when started', async () => {
    const { processor, queue } = setup();
    const run = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(processor, 'worker', { value: { run } });

    await processor.start();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'sweep',
      { every: 60_000 },
      { name: 'sweep', opts: { attempts: 1 } },
    );
    expect(run).toHaveBeenCalled();
  });
});
