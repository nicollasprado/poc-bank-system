import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountsAndTransfers1792449030088 implements MigrationInterface {
  name = 'CreateAccountsAndTransfers1792449030088';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "email" character varying NOT NULL, "balance" bigint NOT NULL DEFAULT '0', CONSTRAINT "CHK_72115fb8669a3cbe05700ddc14" CHECK ("balance" >= 0), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "transfers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "from_account_id" uuid NOT NULL, "to_account_id" uuid NOT NULL, "amount" bigint NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f712e908b465e0085b4408cabc3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" ADD CONSTRAINT "FK_77a01df4f4cc8f5c87f9910385b" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" ADD CONSTRAINT "FK_6e92aab332875987c4bd6ddc763" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfers" DROP CONSTRAINT "FK_6e92aab332875987c4bd6ddc763"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transfers" DROP CONSTRAINT "FK_77a01df4f4cc8f5c87f9910385b"`,
    );
    await queryRunner.query(`DROP TABLE "transfers"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
