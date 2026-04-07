import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from './redis.js';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import type { Server as HttpServer } from 'http';

interface SocketUser {
  id: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  user: SocketUser;
}

let io: Server | null = null;

/**
 * Initialize Socket.io server with Redis adapter.
 * Called from server.js after HTTP server is created.
 */
export function initSocketIO(httpServer: HttpServer): Server {
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
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
      (socket as AuthenticatedSocket).user = { id: payload.id as string, role: payload.role as string };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info({ userId: authSocket.user.id }, 'Socket connected');

    // Room management
    socket.on('join', (room: string) => {
      socket.join(room);
      logger.debug({ room, userId: authSocket.user.id }, 'Joined room');
    });

    socket.on('leave', (room: string) => {
      socket.leave(room);
      logger.debug({ room, userId: authSocket.user.id }, 'Left room');
    });

    socket.on('disconnect', () => {
      logger.debug({ userId: authSocket.user.id }, 'Socket disconnected');
    });
  });

  logger.info('Socket.io initialized with Redis adapter');
  return io;
}

/**
 * Get the Socket.io instance for emitting events.
 * Can be called from any service/module.
 */
export function getIO(): Server | null {
  return io;
}

/**
 * Emit an event to a specific room or broadcast to all.
 */
export function emitToRoom(room: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(room).emit(event, data);
}

export function emitToAll(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}
