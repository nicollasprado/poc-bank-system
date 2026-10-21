import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './accounts/account.entity.js';
import { BalanceController } from './accounts/balance.controller.js';
import { EnvironmentVariables, validateEnv } from './config/env.validation.js';
import { typeOrmOptions } from './database/typeorm.options.js';
import { Email } from './mail/email.entity.js';
import { EmailProcessor } from './mail/email.processor.js';
import { EMAIL_QUEUE } from './mail/email.queue.js';
import { MailService } from './mail/mail.service.js';
import { mailTransporterProvider } from './mail/mail.transporter.js';
import { TransferController } from './transfers/transfer.controller.js';
import { Transfer } from './transfers/transfer.entity.js';
import { TransferService } from './transfers/transfer.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        typeOrmOptions(config.get('DATABASE_URL', { infer: true })),
    }),
    TypeOrmModule.forFeature([Account, Transfer, Email]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
      }),
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    }),
  ],
  controllers: [BalanceController, TransferController],
  providers: [
    TransferService,
    MailService,
    EmailProcessor,
    mailTransporterProvider,
  ],
})
export class AppModule {}
