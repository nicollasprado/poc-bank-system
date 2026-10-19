import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './accounts/account.entity.js';
import { BalanceController } from './accounts/balance.controller.js';
import { EnvironmentVariables, validateEnv } from './config/env.validation.js';
import { typeOrmOptions } from './database/typeorm.options.js';
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
    TypeOrmModule.forFeature([Account, Transfer]),
  ],
  controllers: [BalanceController, TransferController],
  providers: [TransferService, MailService, mailTransporterProvider],
})
export class AppModule {}
