import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentAccountId } from '../auth/current-account.decorator.js';
import { CreateTransferDto } from './create-transfer.dto.js';
import { TransferService } from './transfer.service.js';

@Controller('transfer')
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Post()
  create(
    @CurrentAccountId() accountId: string,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transfers.create(accountId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentAccountId() accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transfers.findOne(id, accountId);
  }
}
