import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { EnvironmentVariables } from '../config/env.validation.js';

export const MAIL_TRANSPORTER = 'MAIL_TRANSPORTER';

export const mailTransporterProvider: FactoryProvider<Transporter> = {
  provide: MAIL_TRANSPORTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
    createTransport({
      pool: true,
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
    }),
};
