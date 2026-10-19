import { Controller, Get, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentAccountId } from '../auth/current-account.decorator.js';
import { Account } from './account.entity.js';

@Controller('balance')
export class BalanceController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  @Get()
  async get(@CurrentAccountId() accountId: string) {
    const account = await this.accounts.findOneBy({ id: accountId });
    if (!account) throw new NotFoundException('Account not found');

    return { accountId: account.id, balance: account.balance };
  }
}
