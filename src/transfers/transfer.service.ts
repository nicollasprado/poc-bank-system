import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity.js';
import { MailService } from '../mail/mail.service.js';
import { CreateTransferDto } from './create-transfer.dto.js';
import { Transfer } from './transfer.entity.js';

type Party = Pick<Account, 'name' | 'email'>;

@Injectable()
export class TransferService {
  constructor(
    private readonly dataSource: DataSource,
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

    const { transfer, emailIds } = await this.dataSource.transaction(
      async (manager) => {
        const debit = async () => {
          const [rows]: [Party[], number] = await manager.query(
            `UPDATE "accounts" SET "balance" = "balance" - $1
             WHERE "id" = $2 AND "balance" >= $1
             RETURNING "name", "email"`,
            [amount, fromAccountId],
          );
          if (rows.length > 0) return rows[0];
          throw (await manager.existsBy(Account, { id: fromAccountId }))
            ? new UnprocessableEntityException('Insufficient funds')
            : new NotFoundException('Account not found');
        };
        const credit = async () => {
          const [rows]: [Party[], number] = await manager.query(
            `UPDATE "accounts" SET "balance" = "balance" + $1
             WHERE "id" = $2
             RETURNING "name", "email"`,
            [amount, toAccountId],
          );
          if (rows.length > 0) return rows[0];
          throw new NotFoundException('Recipient account not found');
        };

        let from: Party;
        let to: Party;
        if (fromAccountId < toAccountId) {
          from = await debit();
          to = await credit();
        } else {
          to = await credit();
          from = await debit();
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
