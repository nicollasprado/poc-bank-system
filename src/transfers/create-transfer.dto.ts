import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  toAccountId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}
