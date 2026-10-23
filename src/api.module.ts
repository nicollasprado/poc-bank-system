import { Module } from '@nestjs/common';
import { BalanceController } from './accounts/balance.controller.js';
import { CoreModule } from './core.module.js';
import { HealthController } from './health/health.controller.js';
import { TransferController } from './transfers/transfer.controller.js';
import { TransferService } from './transfers/transfer.service.js';

@Module({
  imports: [CoreModule],
  controllers: [BalanceController, HealthController, TransferController],
  providers: [TransferService],
})
export class ApiModule {}
