import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../../shared/database.js';
import { UnauthorizedError, NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors.js';

interface TokenUser {
  id: string;
  role: string;
}

function generateAccessToken(user: TokenUser): string {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '30m') as any }
  );
}

function generateRefreshToken(user: TokenUser): string {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
  );
}

function stripPassword(user: Record<string, any>) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function login(email: string, password: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new UnauthorizedError('Invalid email or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { accessToken, refreshToken, user: stripPassword(user) };
}

export async function register(data: { email: string; username: string; password: string; role?: string }) {
  const prisma = getPrisma();

  // Check for existing email or username
  const existingEmail = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existingEmail) throw new ConflictError('Email already exists');

  const existingUsername = await prisma.user.findUnique({ where: { username: data.username } });
  if (existingUsername) throw new ConflictError('Username already exists');

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      username: data.username,
      passwordHash,
      role: data.role || 'viewer',
    },
  });

  return stripPassword(user);
}

export async function refreshAccessToken(refreshToken: string) {
  const prisma = getPrisma();
  let payload: any;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_SECRET!);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }

  // Check blacklist (PostgreSQL instead of Redis)
  const blacklisted = await prisma.tokenBlacklist.findUnique({
    where: { token: refreshToken },
  });
  if (blacklisted) {
    throw new UnauthorizedError('Token has been revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) throw new UnauthorizedError('User no longer exists');

  const accessToken = generateAccessToken(user);
  return { accessToken, user: stripPassword(user) };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;

  const prisma = getPrisma();
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as any;
    const expiresAt = new Date(payload.exp * 1000);
    if (expiresAt > new Date()) {
      await prisma.tokenBlacklist.create({
        data: { token: refreshToken, expiresAt },
      });
    }
  } catch {
    // Token already expired or invalid, nothing to blacklist
  }
}

export async function getMe(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  return stripPassword(user);
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  return bcrypt.compare(password, user.passwordHash);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function listUsers() {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return users.map(stripPassword);
}

export async function updateUserRole(userId: string, role: string, operatorId: string) {
  if (userId === operatorId) {
    throw new ForbiddenError('Cannot change your own role');
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  return stripPassword(updated);
}

export async function resetPassword(userId: string, newPassword: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return stripPassword(user);
}

export async function deleteUser(userId: string, operatorId: string) {
  if (userId === operatorId) {
    throw new ForbiddenError('Cannot delete yourself');
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  await prisma.user.delete({ where: { id: userId } });
}

export async function seedAdmin() {
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const prisma = getPrisma();

  // Skip if any admin user already exists
  const existsByEmail = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existsByEmail) return;
  const existsByUsername = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (existsByUsername) return;
  const existsAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existsAdmin) return;

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
    },
  });
}

/**
 * Cleanup expired token blacklist entries.
 * Should be called periodically (e.g., daily via Cloud Scheduler).
 */
export async function cleanupExpiredTokens() {
  const prisma = getPrisma();
  const result = await prisma.tokenBlacklist.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
