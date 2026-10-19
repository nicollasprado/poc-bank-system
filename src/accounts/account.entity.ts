import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('accounts')
@Check('"balance" >= 0')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ type: 'bigint', default: 0 })
  balance: number;
}
