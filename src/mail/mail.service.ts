import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { EntityManager } from 'typeorm';
import { Account } from '../accounts/account.entity.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { Transfer } from '../transfers/transfer.entity.js';
import { Email } from './email.entity.js';
import {
  EMAIL_QUEUE,
  SEND_EMAIL_JOB,
  SendEmailJobData,
} from './email.queue.js';
import { MAIL_TRANSPORTER } from './mail.transporter.js';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @InjectQueue(EMAIL_QUEUE)
    private readonly queue: Queue<SendEmailJobData>,
  ) {}

  async notifyTransfer(
    manager: EntityManager,
    transfer: Transfer,
    from: Account,
    to: Account,
  ): Promise<string[]> {
    const value = brl.format(transfer.amount / 100);

    const { identifiers } = await manager.insert(Email, [
      {
        recipient: from.email,
        subject: 'Transferência enviada',
        text: `Você enviou ${value} para ${to.name}.\nID da transferência: ${transfer.id}`,
      },
      {
        recipient: to.email,
        subject: 'Transferência recebida',
        text: `Você recebeu ${value} de ${from.name}.\nID da transferência: ${transfer.id}`,
      },
    ]);
    return identifiers.map(({ id }) => id as string);
  }

  async enqueue(emailIds: string[]) {
    try {
      await this.queue.addBulk(
        emailIds.map((emailId) => ({
          name: SEND_EMAIL_JOB,
          data: { emailId },
          opts: { jobId: emailId },
        })),
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue emails ${emailIds.join(', ')}: ${String(error)}`,
      );
    }
  }

  async send({ recipient, subject, text }: Email) {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: recipient,
      subject,
      text,
    });
  }
}
