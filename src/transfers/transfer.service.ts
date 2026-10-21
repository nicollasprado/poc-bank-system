import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity.js';
import { MailService } from '../mail/mail.service.js';
import { CreateTransferDto } from './create-transfer.dto.js';
import { Transfer } from './transfer.entity.js';

@Injectable()
export class TransferService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Transfer)
    private readonly transfers: Repository<Transfer>,
    private readonly mail: MailService,
  ) {}

  async create(
    fromAccountId: string,
    { toAccountId, amount }: CreateTransferDto,
  ) {
    if (fromAccountId === toAccountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }

    const [from, to] = await Promise.all([
      this.accounts.findOneBy({ id: fromAccountId }),
      this.accounts.findOneBy({ id: toAccountId }),
    ]);
    if (!from) throw new NotFoundException('Account not found');
    if (!to) throw new NotFoundException('Recipient account not found');
    if (from.balance < amount) {
      throw new UnprocessableEntityException('Insufficient funds');
    }

    const { transfer, emailIds } = await this.dataSource.transaction(
      async (manager) => {
        const debit = async () => {
          const { affected } = await manager.decrement(
            Account,
            { id: fromAccountId, balance: MoreThanOrEqual(amount) },
            'balance',
            amount,
          );
          if (!affected) {
            throw new UnprocessableEntityException('Insufficient funds');
          }
        };
        const credit = () =>
          manager.increment(Account, { id: toAccountId }, 'balance', amount);

        if (fromAccountId < toAccountId) {
          await debit();
          await credit();
        } else {
          await credit();
          await debit();
        }

        const saved = await manager.save(
          manager.create(Transfer, { fromAccountId, toAccountId, amount }),
        );
        return {
          transfer: saved,
          emailIds: await this.mail.notifyTransfer(manager, saved, from, to),
        };
      },
    );

    await this.mail.enqueue(emailIds);

    return transfer;
  }

  async findOne(id: string, accountId: string) {
    const transfer = await this.transfers.findOne({
      where: [
        { id, fromAccountId: accountId },
        { id, toAccountId: accountId },
      ],
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    return transfer;
  }
}
