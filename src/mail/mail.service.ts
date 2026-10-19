import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { Account } from '../accounts/account.entity.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { Transfer } from '../transfers/transfer.entity.js';
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
  ) {}

  notifyTransfer(transfer: Transfer, from: Account, to: Account) {
    const value = brl.format(transfer.amount / 100);

    void this.send(
      from.email,
      'Transferência enviada',
      `Você enviou ${value} para ${to.name}.\nID da transferência: ${transfer.id}`,
    );
    void this.send(
      to.email,
      'Transferência recebida',
      `Você recebeu ${value} de ${from.name}.\nID da transferência: ${transfer.id}`,
    );
  }

  private async send(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM', { infer: true }),
        to,
        subject,
        text,
      });
    } catch (error) {
      this.logger.error(`Failed to email ${to}: ${String(error)}`);
    }
  }
}
