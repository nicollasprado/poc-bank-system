import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Account } from '../accounts/account.entity.js';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'from_account_id' })
  fromAccountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'from_account_id' })
  fromAccount?: Account;

  @Column({ name: 'to_account_id' })
  toAccountId: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'to_account_id' })
  toAccount?: Account;

  @Column({ type: 'bigint' })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
