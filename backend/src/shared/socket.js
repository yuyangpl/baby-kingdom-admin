import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from './redis.js';
import jwt from 'jsonwebtoken';
import logger from './logger.js';

let io = null;

/**
 * Initialize Socket.io server with Redis adapter.
 * Called from server.js after HTTP server is created.
 */
export function initSocketIO(httpServer) {
  const redis = getRedis();
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();

  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  });

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: payload.id, role: payload.role };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ userId: socket.user.id }, 'Socket connected');

    // Room management
    socket.on('join', (room) => {
      socket.join(room);
      logger.debug({ room, userId: socket.user.id }, 'Joined room');
    });

    socket.on('leave', (room) => {
      socket.leave(room);
      logger.debug({ room, userId: socket.user.id }, 'Left room');
    });

    socket.on('disconnect', () => {
      logger.debug({ userId: socket.user.id }, 'Socket disconnected');
    });
  });

  logger.info('Socket.io initialized with Redis adapter');
  return io;
}

/**
 * Get the Socket.io instance for emitting events.
 * Can be called from any service/module.
 */
export function getIO() {
  return io;
}

/**
 * Emit an event to a specific room or broadcast to all.
 */
export function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

export function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}
