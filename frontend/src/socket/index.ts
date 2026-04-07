import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';

let socket: Socket | null = null;

export function initSocket(): Socket {
  if (socket) return socket;

  const url: string = import.meta.env.VITE_SOCKET_URL || '';

  socket = io(url, {
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  return socket;
}

export function connectSocket(): Socket {
  const s = initSocket();
  const auth = useAuthStore();
  if (auth.accessToken) {
    s.auth = { token: auth.accessToken };
  }
  s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

// Composable for room-based subscriptions
export function useSocketRoom(roomName: string): (() => void) | undefined {
  const s = getSocket();
  if (!s) return;

  s.emit('join', roomName);

  return () => {
    s.emit('leave', roomName);
  };
}
