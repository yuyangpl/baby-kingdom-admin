import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';

let socket = null;

export function initSocket() {
  if (socket) return socket;

  const url = import.meta.env.VITE_SOCKET_URL || '';

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

export function connectSocket() {
  const s = initSocket();
  const auth = useAuthStore();
  if (auth.accessToken) {
    s.auth = { token: auth.accessToken };
  }
  s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

// Composable for room-based subscriptions
export function useSocketRoom(roomName) {
  const s = getSocket();
  if (!s) return;

  s.emit('join', roomName);

  return () => {
    s.emit('leave', roomName);
  };
}
