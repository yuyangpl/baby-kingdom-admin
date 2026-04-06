import jwt from 'jsonwebtoken';
import User from './auth.model.js';
import { getRedis } from '../../shared/redis.js';
import { UnauthorizedError, NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors.js';

const REFRESH_BLACKLIST_PREFIX = 'bl:rt:';

function generateAccessToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user._id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

export async function login(email, password) {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { accessToken, refreshToken, user: user.toJSON() };
}

export async function register(data) {
  const existing = await User.findOne({
    $or: [{ email: data.email }, { username: data.username }],
  });
  if (existing) {
    throw new ConflictError(
      existing.email === data.email ? 'Email already exists' : 'Username already exists'
    );
  }

  const user = await User.create(data);
  return user.toJSON();
}

export async function refreshAccessToken(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }

  // Check blacklist
  const redis = getRedis();
  const isBlacklisted = await redis.get(`${REFRESH_BLACKLIST_PREFIX}${refreshToken}`);
  if (isBlacklisted) {
    throw new UnauthorizedError('Token has been revoked');
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  const accessToken = generateAccessToken(user);
  return { accessToken, user: user.toJSON() };
}

export async function logout(refreshToken) {
  if (!refreshToken) return;

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      const redis = getRedis();
      await redis.setex(`${REFRESH_BLACKLIST_PREFIX}${refreshToken}`, ttl, '1');
    }
  } catch {
    // Token already expired or invalid, nothing to blacklist
  }
}

export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');
  return user.toJSON();
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new NotFoundError('User');

  if (!(await user.comparePassword(currentPassword))) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();
}

export async function listUsers() {
  return User.find().sort({ createdAt: -1 });
}

export async function updateUserRole(userId, role, operatorId) {
  if (userId === operatorId) {
    throw new ForbiddenError('Cannot change your own role');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  user.role = role;
  await user.save();

  // Invalidate all refresh tokens for this user by storing a role-change marker
  const redis = getRedis();
  await redis.set(`role_changed:${userId}`, Date.now().toString(), 'EX', 7 * 24 * 3600);

  return user.toJSON();
}

export async function deleteUser(userId, operatorId) {
  if (userId === operatorId) {
    throw new ForbiddenError('Cannot delete yourself');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  await User.findByIdAndDelete(userId);
}

export async function seedAdmin() {
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const exists = await User.findOne({ email: ADMIN_EMAIL });
  if (exists) return;

  await User.create({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
}
