import { Module } from '@nestjs/common';
import { CoreModule } from './core.module.js';
import { EmailProcessor } from './mail/email.processor.js';
import { mailTransporterProvider } from './mail/mail.transporter.js';

@Module({
  imports: [CoreModule],
  providers: [EmailProcessor, mailTransporterProvider],
})
export class WorkerModule {}
