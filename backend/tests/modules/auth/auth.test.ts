import mongoose from 'mongoose';
import { request, setupDB, teardownDB, expectSuccess, expectError } from '../../helpers.js';
import User from '../../../src/modules/auth/auth.model.js';

let adminToken: string;
let adminCookie: string[];

beforeAll(async () => {
  await setupDB();
  // Clean users collection
  await User.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await teardownDB();
});

describe('Auth Flow', () => {
  // --- Register (first user as admin via direct creation) ---
  it('POST /api/v1/auth/register requires auth', async () => {
    const res = await request.post('/api/v1/auth/register').send({
      username: 'admin',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'admin',
    });
    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('seed admin user directly for testing', async () => {
    await User.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'admin',
    });
    const user = await User.findOne({ email: 'admin@test.com' });
    expect(user).toBeTruthy();
    expect(user.role).toBe('admin');
  });

  // --- Login ---
  it('POST /api/v1/auth/login with valid credentials', async () => {
    const res = await request.post('/api/v1/auth/login').send({
      email: 'admin@test.com',
      password: 'admin123',
    });

    expectSuccess(res);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@test.com');
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();

    adminToken = res.body.data.accessToken;
    adminCookie = res.headers['set-cookie'];
  });

  it('POST /api/v1/auth/login with wrong password', async () => {
    const res = await request.post('/api/v1/auth/login').send({
      email: 'admin@test.com',
      password: 'wrong',
    });
    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('POST /api/v1/auth/login with missing fields', async () => {
    const res = await request.post('/api/v1/auth/login').send({});
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  // --- Get Me ---
  it('GET /api/v1/auth/me returns current user', async () => {
    const res = await request
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(res.body.data.email).toBe('admin@test.com');
  });

  it('GET /api/v1/auth/me without token returns 401', async () => {
    const res = await request.get('/api/v1/auth/me');
    expectError(res, 401, 'UNAUTHORIZED');
  });

  // --- Register (as admin) ---
  it('POST /api/v1/auth/register creates editor user', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'editor1',
        email: 'editor@test.com',
        password: 'editor123',
        role: 'editor',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('editor');
    expect(res.body.data.password).toBeUndefined();
  });

  it('POST /api/v1/auth/register rejects duplicate email', async () => {
    const res = await request
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'another',
        email: 'editor@test.com',
        password: 'test123',
      });

    expectError(res, 409, 'CONFLICT');
  });

  // --- List Users ---
  it('GET /api/v1/auth/users returns all users', async () => {
    const res = await request
      .get('/api/v1/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);
    expect(res.body.data.length).toBe(2);
  });

  // --- Update Role ---
  it('PUT /api/v1/auth/users/:id/role updates role', async () => {
    const editor = await User.findOne({ email: 'editor@test.com' });

    const res = await request
      .put(`/api/v1/auth/users/${editor._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });

    expectSuccess(res);
    expect(res.body.data.role).toBe('viewer');
  });

  it('PUT /api/v1/auth/users/:id/role cannot change own role', async () => {
    const admin = await User.findOne({ email: 'admin@test.com' });

    const res = await request
      .put(`/api/v1/auth/users/${admin._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' });

    expectError(res, 403, 'FORBIDDEN');
  });

  // --- Editor cannot access admin routes ---
  it('editor cannot register users', async () => {
    const loginRes = await request.post('/api/v1/auth/login').send({
      email: 'editor@test.com',
      password: 'editor123',
    });
    const editorToken = loginRes.body.data.accessToken;

    const res = await request
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ username: 'x', email: 'x@test.com', password: '123456' });

    expectError(res, 403, 'FORBIDDEN');
  });

  // --- Change Password ---
  it('PUT /api/v1/auth/password changes password', async () => {
    const res = await request
      .put('/api/v1/auth/password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'newpass123' });

    expectSuccess(res);

    // Login with new password
    const loginRes = await request.post('/api/v1/auth/login').send({
      email: 'admin@test.com',
      password: 'newpass123',
    });
    expectSuccess(loginRes);

    // Update token for subsequent tests
    adminToken = loginRes.body.data.accessToken;
    adminCookie = loginRes.headers['set-cookie'];
  });

  // --- Refresh Token ---
  it('POST /api/v1/auth/refresh returns new access token', async () => {
    const res = await request
      .post('/api/v1/auth/refresh')
      .set('Cookie', adminCookie);

    expectSuccess(res);
    expect(res.body.data.accessToken).toBeDefined();
  });

  // --- Logout ---
  it('POST /api/v1/auth/logout blacklists refresh token', async () => {
    const res = await request
      .post('/api/v1/auth/logout')
      .set('Cookie', adminCookie);

    expectSuccess(res);

    // Refresh should fail after logout
    const refreshRes = await request
      .post('/api/v1/auth/refresh')
      .set('Cookie', adminCookie);

    expectError(refreshRes, 401, 'UNAUTHORIZED');
  });

  // --- Delete User ---
  it('DELETE /api/v1/auth/users/:id deletes user', async () => {
    // Login again first
    const loginRes = await request.post('/api/v1/auth/login').send({
      email: 'admin@test.com',
      password: 'newpass123',
    });
    adminToken = loginRes.body.data.accessToken;

    const editor = await User.findOne({ email: 'editor@test.com' });

    const res = await request
      .delete(`/api/v1/auth/users/${editor._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectSuccess(res);

    const deleted = await User.findById(editor._id);
    expect(deleted).toBeNull();
  });

  it('DELETE /api/v1/auth/users/:id cannot delete self', async () => {
    const admin = await User.findOne({ email: 'admin@test.com' });

    const res = await request
      .delete(`/api/v1/auth/users/${admin._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectError(res, 403, 'FORBIDDEN');
  });
});
