import * as authService from './auth.service.js';
import { success, created } from '../../shared/response.js';
import { ValidationError } from '../../shared/errors.js';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const result = await authService.login(email, password);

  res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
  return success(res, { accessToken: result.accessToken, user: result.user });
}

export async function register(req, res) {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password) {
    throw new ValidationError('Username, email and password are required');
  }

  const user = await authService.register({ username, email, password, role });
  return created(res, user);
}

export async function refresh(req, res) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const result = await authService.refreshAccessToken(refreshToken);
  return success(res, { accessToken: result.accessToken, user: result.user });
}

export async function logout(req, res) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(refreshToken);

  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  return success(res, null);
}

export async function getMe(req, res) {
  const user = await authService.getMe(req.user.id);
  return success(res, user);
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  await authService.changePassword(req.user.id, currentPassword, newPassword);
  return success(res, null);
}

export async function listUsers(req, res) {
  const users = await authService.listUsers();
  return success(res, users);
}

export async function updateUserRole(req, res) {
  const { role } = req.body;
  if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
    throw new ValidationError('Valid role (admin/editor/viewer) is required');
  }

  const user = await authService.updateUserRole(req.params.id, role, req.user.id);
  return success(res, user);
}

export async function deleteUser(req, res) {
  await authService.deleteUser(req.params.id, req.user.id);
  return success(res, null);
}
