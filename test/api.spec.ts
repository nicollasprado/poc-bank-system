import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ApiModule } from '../src/api.module.js';
import { configureApp } from '../src/app.setup.js';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Email } from '../src/mail/email.entity.js';
import { EmailProcessor } from '../src/mail/email.processor.js';
import { EMAIL_QUEUE } from '../src/mail/email.queue.js';
import { MailService } from '../src/mail/mail.service.js';
import { MAIL_TRANSPORTER } from '../src/mail/mail.transporter.js';
import { resetDatabase } from '../src/seed.js';
import { WorkerModule } from '../src/worker.module.js';
import { Transfer } from '../src/transfers/transfer.entity.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';

const transporter = { sendMail: vi.fn().mockResolvedValue({}) };
let app: INestApplication;
let dataSource: DataSource;
let emailQueue: Queue;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ApiModule, WorkerModule],
  })
    .overrideProvider(MAIL_TRANSPORTER)
    .useValue(transporter)
    .compile();

  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = `${await app.getUrl()}/api`;
  dataSource = app.get(DataSource);
  emailQueue = app.get(getQueueToken(EMAIL_QUEUE));
});

beforeEach(async () => {
  await vi.waitFor(
    async () => {
      const jobs = await emailQueue.getJobs(['active', 'waiting', 'delayed']);
      expect(jobs.filter((job) => job.name === 'send')).toEqual([]);
    },
    { timeout: 10_000 },
  );
  await resetDatabase(dataSource);
  transporter.sendMail.mockClear();
});

afterAll(async () => {
  await app.close();
});

async function send(path: string, init: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { status: response.status, body: (await response.json()) as any };
}

function get(path: string, account?: string) {
  return send(path, { headers: account ? { 'x-account-id': account } : {} });
}

function post(path: string, account: string, body: unknown) {
  return send(path, {
    method: 'POST',
    headers: { 'x-account-id': account, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function transfer(from: string, to: string, amount: number) {
  return post('/transfer', from, { toAccountId: to, amount });
}

async function balanceOf(account: string): Promise<number> {
  const { body } = await get('/balance', account);
  return body.balance;
}

function countTransfers() {
  return dataSource.getRepository(Transfer).count();
}

function emails() {
  return dataSource.getRepository(Email).find({ order: { recipient: 'ASC' } });
}

describe('GET /api/balance', () => {
  it('returns the balance of the account in the header', async () => {
    const response = await get('/balance', alice);

    expect(response).toEqual({
      status: 200,
      body: { accountId: alice, balance: 100_000 },
    });
  });

  it('returns 401 without the x-account-id header', async () => {
    const response = await get('/balance');

    expect(response.status).toBe(401);
  });

  it('returns 404 for an account that does not exist', async () => {
    const response = await get('/balance', stranger);

    expect(response.status).toBe(404);
  });
});

describe('POST /api/transfer', () => {
  it('moves the money and saves the transfer', async () => {
    const response = await transfer(alice, bob, 15_000);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      fromAccountId: alice,
      toAccountId: bob,
      amount: 15_000,
    });
    expect(await balanceOf(alice)).toBe(85_000);
    expect(await balanceOf(bob)).toBe(65_000);
    await expect(
      dataSource.getRepository(Transfer).findOneBy({ id: response.body.id }),
    ).resolves.toMatchObject({ amount: 15_000 });
  });

  it('emails the sender and the recipient', async () => {
    await transfer(alice, bob, 15_000);

    await vi.waitFor(() =>
      expect(transporter.sendMail).toHaveBeenCalledTimes(2),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'POC Bank <no-reply@test>',
        to: 'alice@example.com',
        subject: 'Transferência enviada',
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        subject: 'Transferência recebida',
      }),
    );
    await vi.waitFor(async () =>
      expect(await emails()).toEqual([
        expect.objectContaining({
          recipient: 'alice@example.com',
          status: 'sent',
        }),
        expect.objectContaining({
          recipient: 'bob@example.com',
          status: 'sent',
        }),
      ]),
    );
  });

  it('retries an email that failed to send', async () => {
    transporter.sendMail.mockRejectedValueOnce(new Error('SMTP down'));

    await transfer(alice, bob, 15_000);

    await vi.waitFor(
      async () => {
        expect(transporter.sendMail).toHaveBeenCalledTimes(3);
        expect((await emails()).map((e) => e.status)).toEqual(['sent', 'sent']);
      },
      { timeout: 5_000 },
    );
  });

  it('sends an email only once even if it is queued twice', async () => {
    await transfer(alice, bob, 15_000);
    const ids = (await emails()).map((e) => e.id);

    await app.get(MailService).enqueue(ids);

    await vi.waitFor(async () =>
      expect((await emails()).map((e) => e.status)).toEqual(['sent', 'sent']),
    );
    expect(transporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('sweeps pending emails whose job was lost', async () => {
    await dataSource.query(
      `INSERT INTO "emails" ("recipient", "subject", "text", "created_at")
       VALUES ('alice@example.com', 'Assunto', 'Texto', now() - interval '1 minute')`,
    );

    await app.get(EmailProcessor).sweep();

    await vi.waitFor(async () =>
      expect(await emails()).toEqual([
        expect.objectContaining({ status: 'sent' }),
      ]),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com', subject: 'Assunto' }),
    );
  });

  it('returns 422 and changes nothing when the balance is not enough', async () => {
    const response = await transfer(bob, alice, 50_001);

    expect(response.status).toBe(422);
    expect(await balanceOf(alice)).toBe(100_000);
    expect(await balanceOf(bob)).toBe(50_000);
    expect(await countTransfers()).toBe(0);
    expect(await emails()).toEqual([]);
  });

  it('returns 400 for an invalid body', async () => {
    const response = await post('/transfer', alice, {
      toAccountId: 'not-a-uuid',
      amount: 10.5,
      extra: true,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'toAccountId must be a UUID',
        'amount must be an integer number',
        'property extra should not exist',
      ]),
    );
  });

  it('returns 400 for a transfer to the same account', async () => {
    const response = await transfer(alice, alice, 1_000);

    expect(response.status).toBe(400);
  });

  it('returns 404 when the recipient does not exist', async () => {
    const response = await transfer(alice, stranger, 1_000);

    expect(response.status).toBe(404);
    expect(await balanceOf(alice)).toBe(100_000);
  });

  it('never overdraws with concurrent transfers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => transfer(bob, alice, 5_000)),
    );
    const statuses = responses.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.filter((s) => s === 422)).toHaveLength(10);
    expect(await balanceOf(bob)).toBe(0);
    expect(await balanceOf(alice)).toBe(150_000);
    expect(await countTransfers()).toBe(10);
  });

  it('handles opposite concurrent transfers without deadlocks', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0 ? transfer(alice, bob, 100) : transfer(bob, alice, 100),
      ),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect((await balanceOf(alice)) + (await balanceOf(bob))).toBe(150_000);
  });
});

describe('GET /api/transfer/:id', () => {
  it('is visible to the sender and the recipient', async () => {
    const { body: created } = await transfer(alice, bob, 1_000);

    for (const account of [alice, bob]) {
      const response = await get(`/transfer/${created.id}`, account);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.id);
    }
  });

  it('returns 404 for any other account', async () => {
    const { body: created } = await transfer(alice, bob, 1_000);

    const response = await get(`/transfer/${created.id}`, stranger);

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const response = await get('/transfer/abc', alice);

    expect(response.status).toBe(400);
  });
});

describe('database', () => {
  it('has migrations that match the entities', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

    expect(upQueries).toEqual([]);
  });

  it('rejects a negative balance even outside the API', async () => {
    await expect(
      dataSource.query('UPDATE accounts SET balance = -1 WHERE id = $1', [
        alice,
      ]),
    ).rejects.toThrow(/check constraint/);
  });
});
