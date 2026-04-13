import { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { success, created } from '../../shared/response.js';
import { ValidationError, UnauthorizedError } from '../../shared/errors.js';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const result = await authService.login(email, password);

  res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
  success(res, { accessToken: result.accessToken, user: result.user });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password) {
    throw new ValidationError('Username, email and password are required');
  }

  const user = await authService.register({ username, email, password, role });
  created(res, user);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const result = await authService.refreshAccessToken(refreshToken);
  success(res, { accessToken: result.accessToken, user: result.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(refreshToken);

  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  success(res, null);
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe((req as any).user.id);
  success(res, user);
}

export async function verifyPassword(req: Request, res: Response): Promise<void> {
  const { password } = req.body;
  if (!password) throw new ValidationError('Password is required');
  const ok = await authService.verifyPassword((req as any).user.id, password);
  if (!ok) throw new UnauthorizedError('Password incorrect');
  success(res, { verified: true });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  await authService.changePassword((req as any).user.id, currentPassword, newPassword);
  success(res, null);
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const users = await authService.listUsers();
  success(res, users);
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  const { role } = req.body;
  if (!role || !['admin', 'editor', 'approver', 'viewer'].includes(role)) {
    throw new ValidationError('Valid role (admin/editor/approver/viewer) is required');
  }

  const user = await authService.updateUserRole(req.params.id as string, role, (req as any).user.id);
  success(res, user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  await authService.deleteUser(req.params.id as string, (req as any).user.id);
  success(res, null);
}
