import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Raw, Repository } from 'typeorm';
import { Email } from './email.entity.js';
import {
  EMAIL_QUEUE,
  SendEmailJobData,
  SWEEP_EMAILS_JOB,
} from './email.queue.js';
import { MailService } from './mail.service.js';

const SWEEP_EVERY_MS = 60_000;
const SWEEP_OLDER_THAN = '30 seconds';
const SWEEP_BATCH_SIZE = 1_000;

@Processor(EMAIL_QUEUE, { concurrency: 10, autorun: false })
export class EmailProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Email)
    private readonly emails: Repository<Email>,
    private readonly mail: MailService,
    @InjectQueue(EMAIL_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
  }

  async start() {
    await this.queue.upsertJobScheduler(
      SWEEP_EMAILS_JOB,
      { every: SWEEP_EVERY_MS },
      { name: SWEEP_EMAILS_JOB, opts: { attempts: 1 } },
    );
    void this.worker.run();
  }

  async process(job: Job<SendEmailJobData>) {
    if (job.name === SWEEP_EMAILS_JOB) return this.sweep();

    const email = await this.emails.findOneBy({
      id: job.data.emailId,
      status: 'pending',
    });
    if (!email) return;

    await this.mail.send(email);
    await this.emails.update(
      { id: email.id, status: 'pending' },
      { status: 'sent', processedAt: new Date() },
    );
  }

  async sweep() {
    const stuck = await this.emails.find({
      select: { id: true },
      where: {
        status: 'pending',
        createdAt: Raw(
          (column) => `${column} < now() - interval '${SWEEP_OLDER_THAN}'`,
        ),
      },
      order: { createdAt: 'ASC' },
      take: SWEEP_BATCH_SIZE,
    });
    if (stuck.length > 0) await this.mail.enqueue(stuck.map(({ id }) => id));
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendEmailJobData> | undefined) {
    if (job?.name === SWEEP_EMAILS_JOB) return;
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.emails.update(
        { id: job.data.emailId, status: 'pending' },
        { status: 'failed', processedAt: new Date() },
      );
    }
  }
}
