import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmails1792623705232 implements MigrationInterface {
  name = 'CreateEmails1792623705232';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "emails" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recipient" character varying NOT NULL, "subject" character varying NOT NULL, "text" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, CONSTRAINT "PK_a54dcebef8d05dca7e839749571" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_emails_pending" ON "emails"  ("created_at") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_emails_pending"`);
    await queryRunner.query(`DROP TABLE "emails"`);
  }
}
