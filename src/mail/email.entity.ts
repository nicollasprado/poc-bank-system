import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EmailStatus = 'pending' | 'sent' | 'failed';

@Entity('emails')
@Index('IDX_emails_pending', ['createdAt'], { where: `"status" = 'pending'` })
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipient: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: EmailStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;
}
