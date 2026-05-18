process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'testsecretkeyforjesttesting123456';

import supertest from 'supertest';
import app from '../src/app';
import { db } from '../src/config/database';

const request = supertest(app);

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});

describe('Authentication Endpoints', () => {
  const testUser = {
    email: 'testauth@example.com',
    name: 'Test Auth User',
    password: 'password123',
  };

  let authToken: string;

  it('should successfully register a new user and create a wallet', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.wallet).toBeDefined();
    expect(res.body.data.wallet.balance).toBe(0);

    authToken = res.body.data.token;
  });

  it('should prevent registration with an already existing email', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('should successfully login an existing user', async () => {
    const res = await request
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.wallet).toBeDefined();
  });

  it('should return user profile when authenticated', async () => {
    const res = await request
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.email).toBe(testUser.email);
  });

  it('should successfully logout user and prevent token reuse (token blacklisting)', async () => {
    // Logout with the active authToken
    const logoutRes = await request
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${authToken}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.status).toBe('success');
    expect(logoutRes.body.message).toMatch(/logged out successfully/i);

    // Attempt to access protected route with the blacklisted token
    const profileRes = await request
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(profileRes.status).toBe(401);
    expect(profileRes.body.status).toBe('error');
    expect(profileRes.body.message).toMatch(/logged out/i);
  });
});
