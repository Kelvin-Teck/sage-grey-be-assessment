process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'testsecretkeyforjesttesting123456';

import supertest from 'supertest';
import app from '../src/app';
import { db } from '../src/config/database';

const request = supertest(app);

let userAToken: string;
let userBToken: string;
let userBEmail = 'userb@example.com';

beforeAll(async () => {
  await db.migrate.latest();

  // Register User A
  const resA = await request.post('/api/v1/auth/register').send({
    email: 'usera@example.com',
    name: 'User A',
    password: 'password123',
  });
  userAToken = resA.body.data.token;

  // Register User B
  const resB = await request.post('/api/v1/auth/register').send({
    email: userBEmail,
    name: 'User B',
    password: 'password123',
  });
  userBToken = resB.body.data.token;
});

afterAll(async () => {
  await db.destroy();
});

describe('Wallet Operations', () => {
  it('should retrieve wallet details with 0 initial balance', async () => {
    const res = await request
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(0);
    expect(res.body.data.transactions.length).toBe(0);
  });

  it('should strictly reject financial mutations if X-Idempotency-Key is omitted', async () => {
    const res = await request
      .post('/api/v1/wallet/fund')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ amount: 5000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/X-Idempotency-Key/i);
  });

  it('should successfully fund wallet when X-Idempotency-Key is provided', async () => {
    const res = await request
      .post('/api/v1/wallet/fund')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', 'test-fund-key-1')
      .send({ amount: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(5000);
    expect(res.body.data.transaction.type).toBe('deposit');
    expect(res.body.data.transaction.amount).toBe(5000);
  });

  it('should fail withdrawal when amount exceeds balance', async () => {
    const res = await request
      .post('/api/v1/wallet/withdraw')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', 'test-withdraw-fail')
      .send({ amount: 10000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient/i);
  });

  it('should successfully withdraw funds', async () => {
    const res = await request
      .post('/api/v1/wallet/withdraw')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', 'test-withdraw-success')
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.data.wallet.balance).toBe(3000); // 5000 - 2000
    expect(res.body.data.transaction.type).toBe('withdrawal');
  });

  it('should successfully transfer funds to another user', async () => {
    const res = await request
      .post('/api/v1/wallet/transfer')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', 'test-transfer-key-1')
      .send({ recipient: userBEmail, amount: 1500 });

    expect(res.status).toBe(200);
    expect(res.body.data.senderWallet.balance).toBe(1500); // 3000 - 1500

    // Verify User B received the funds
    const resB = await request
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.wallet.balance).toBe(1500);
    expect(resB.body.data.transactions[0].type).toBe('transfer_in');
  });

  it('should prevent accidental double-spend via X-Idempotency-Key caching', async () => {
    const idempotencyKey = 'idem-key-999';

    // First request: funds wallet by 1000
    const res1 = await request
      .post('/api/v1/wallet/fund')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: 1000 });

    expect(res1.status).toBe(200);
    const balanceAfterFirst = res1.body.data.wallet.balance;

    // Second duplicate request with exact same idempotency key
    const res2 = await request
      .post('/api/v1/wallet/fund')
      .set('Authorization', `Bearer ${userAToken}`)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: 1000 });

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual(res1.body); // Exact cached JSON match!

    // Verify balance was NOT doubled!
    const verifyRes = await request
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(verifyRes.body.data.wallet.balance).toBe(balanceAfterFirst);
  });
});
