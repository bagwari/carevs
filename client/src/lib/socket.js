import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(role) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // Connect straight to the API origin — the dev proxy does not upgrade websockets cleanly.
  socket = io(import.meta.env.VITE_API_URL ?? 'http://localhost:4000', {
    auth: { role },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
