import { io, type Socket } from 'socket.io-client';
import type { AppNotification, RealtimeDeltaEvent } from '../types';
import { getApiBaseUrl } from './cloudSync';

export interface SocketAnnouncementPayload {
  action: 'upsert' | 'delete';
  id: string;
  revision: number;
  targetRts: string[];
  announcement?: any;
  updatedAt: string;
}

export interface SocketAdminRegistryPayload {
  revision: number;
  updatedAt: string;
}

export interface SocketCallbacks {
  onConnected?: (info: { role?: string; rw?: string; rt?: string }) => void;
  onDisconnected?: (reason?: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onDelta?: (event: RealtimeDeltaEvent) => void;
  onAnnouncement?: (payload: SocketAnnouncementPayload) => void;
  onNotification?: (notification: AppNotification) => void;
  onAdminRegistry?: (payload: SocketAdminRegistryPayload) => void;
  onAuthError?: (message: string) => void;
}

let activeSocket: Socket | null = null;
let activeToken: string | null = null;

export function getSocketConnected(): boolean {
  return Boolean(activeSocket && activeSocket.connected);
}

export function disconnectSocket(): void {
  if (activeSocket) {
    try {
      activeSocket.removeAllListeners();
      activeSocket.disconnect();
    } catch {
      // ignore cleanup error
    }
    activeSocket = null;
    activeToken = null;
  }
}

export function connectSocket(token: string, callbacks: SocketCallbacks): () => void {
  const cleanToken = String(token || '').trim();
  if (!cleanToken || typeof window === 'undefined') {
    callbacks.onConnectionChange?.(false);
    return () => {};
  }

  disconnectSocket();
  activeToken = cleanToken;

  const base = getApiBaseUrl();
  const socket: Socket = base
    ? io(base, {
        path: '/socket.io',
        auth: { token: cleanToken },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 15000,
        withCredentials: true,
      })
    : io({
        path: '/socket.io',
        auth: { token: cleanToken },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 15000,
        withCredentials: true,
      });

  activeSocket = socket;

  socket.on('connect', () => {
    callbacks.onConnectionChange?.(true);
  });

  socket.on('sync:connected', (info) => {
    callbacks.onConnectionChange?.(true);
    callbacks.onConnected?.(info || {});
  });

  socket.on('sync:delta', (event: RealtimeDeltaEvent) => {
    if (event) callbacks.onDelta?.(event);
  });

  socket.on('announcement:new', (payload: SocketAnnouncementPayload) => {
    if (payload) callbacks.onAnnouncement?.(payload);
  });

  socket.on('notification:new', (notification: AppNotification) => {
    if (notification) callbacks.onNotification?.(notification);
  });

  socket.on('admin:registry', (payload: SocketAdminRegistryPayload) => {
    if (payload) callbacks.onAdminRegistry?.(payload);
  });

  socket.on('disconnect', (reason) => {
    callbacks.onConnectionChange?.(false);
    callbacks.onDisconnected?.(reason);
  });

  socket.on('connect_error', (err) => {
    callbacks.onConnectionChange?.(false);
    const msg = String(err?.message || '');
    if (msg.includes('UNAUTHORIZED')) {
      callbacks.onAuthError?.(msg);
    }
  });

  return () => {
    if (activeSocket === socket && activeToken === cleanToken) {
      disconnectSocket();
    } else {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch {
        // ignore
      }
    }
  };
}
