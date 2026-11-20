import type http from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { extractUserRtRw, verifySessionTokenSql } from '../db/repository.ts';
import type { AppNotification, AuthUser, RealtimeDeltaEvent } from '../types.ts';

export interface RealtimeEmitter {
  emitDelta: (event: RealtimeDeltaEvent) => void;
  emitAnnouncement: (params: {
    rwId: string;
    targetRts: string[];
    action: 'upsert' | 'delete';
    announcementId: string;
    revision: number;
    announcement?: any;
  }) => void;
  emitNotification: (notification: AppNotification) => void;
  emitAdminRegistryUpdate: (rwId: string, revision: number) => void;
  getConnectedCount: () => number;
}

interface AuthedSocket extends Socket {
  data: {
    authUser?: AuthUser;
    rt?: string;
    rw?: string;
    userKey?: string;
  };
}

function getUserKeyFromAuthUser(user: AuthUser): string {
  if (user.role === 'warga') {
    return `warga:${user.wargaId || user.noKK || user.username}`;
  }
  return `${user.role}:${user.username.toLowerCase()}`;
}

export function normalizeRtTargetList(targetRts?: string[]): string[] {
  if (!Array.isArray(targetRts) || targetRts.length === 0) return ['SEMUA'];
  const cleaned = targetRts
    .map((x) => String(x || '').trim().toUpperCase())
    .filter(Boolean);
  if (cleaned.includes('SEMUA') || cleaned.includes('ALL')) return ['SEMUA'];
  return Array.from(
    new Set(
      cleaned.map((x) => {
        const m = x.match(/\d+/);
        return m ? m[0].padStart(2, '0') : x;
      })
    )
  );
}

export function initSocketServer(httpServer: http.Server): RealtimeEmitter {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (_origin, callback) => callback(null, true),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: AuthedSocket, next) => {
    try {
      const token =
        (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token.trim()) ||
        (typeof socket.handshake.query?.token === 'string' && socket.handshake.query.token.trim()) ||
        '';
      if (!token) {
        return next(new Error('UNAUTHORIZED: Token sesi tidak ditemukan.'));
      }
      const session = await verifySessionTokenSql(token);
      if (!session) {
        return next(new Error('UNAUTHORIZED: Sesi tidak valid atau kedaluwarsa.'));
      }

      const authUser: AuthUser = {
        role: session.role,
        username: session.username,
        nama: session.nama,
        noKK: session.noKK,
        wargaId: session.wargaId,
        rtScope: session.rtScope,
        isPinAuthenticated: session.isPinAuthenticated,
      };
      const { rt, rw } = extractUserRtRw(authUser);
      socket.data.authUser = authUser;
      socket.data.rt = rt;
      socket.data.rw = rw;
      socket.data.userKey = getUserKeyFromAuthUser(authUser);
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED: Gagal memverifikasi sesi socket.'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const user = socket.data.authUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const rw = socket.data.rw || '05';
    const rt = socket.data.rt || '08';
    const userKey = socket.data.userKey || '';

    if (userKey) {
      socket.join(`user:${userKey}`);
    }

    if (user.role === 'server') {
      socket.join(`rw:${rw}:server`);
    } else if (user.role === 'admin') {
      socket.join(`rw:${rw}:rt:${rt}`);
      socket.join(`rw:${rw}:rt:${rt}:admins`);
    } else {
      socket.join(`rw:${rw}:rt:${rt}`);
      socket.join(`rw:${rw}:rt:${rt}:warga`);
    }

    socket.emit('sync:connected', {
      role: user.role,
      rw,
      rt: user.role === 'server' ? 'SEMUA' : rt,
      connectedAt: new Date().toISOString(),
    });
  });

  function resolveRoomsForTarget(
    rwId: string,
    targetRts: string[],
    options?: { adminsOnly?: boolean; wargaId?: string; includeServer?: boolean }
  ): string[] {
    const rooms = new Set<string>();
    const normalized = normalizeRtTargetList(targetRts);
    const rw = (rwId || '05').replace(/\D/g, '').padStart(2, '0') || '05';

    if (options?.includeServer !== false) {
      rooms.add(`rw:${rw}:server`);
    }

    if (options?.wargaId) {
      rooms.add(`user:warga:${options.wargaId}`);
    }

    if (normalized.includes('SEMUA')) {
      for (let i = 1; i <= 12; i++) {
        const code = String(i).padStart(2, '0');
        if (options?.adminsOnly) {
          rooms.add(`rw:${rw}:rt:${code}:admins`);
        } else {
          rooms.add(`rw:${rw}:rt:${code}`);
        }
      }
    } else {
      for (const code of normalized) {
        if (options?.adminsOnly) {
          rooms.add(`rw:${rw}:rt:${code}:admins`);
        } else {
          rooms.add(`rw:${rw}:rt:${code}`);
        }
      }
    }

    return Array.from(rooms);
  }

  return {
    emitDelta(event: RealtimeDeltaEvent) {
      const rw = '05';
      const targets = event.targetRts
        ? normalizeRtTargetList(event.targetRts)
        : event.rtScope
        ? normalizeRtTargetList([event.rtScope])
        : ['SEMUA'];

      const adminOnlyEntity =
        event.entityType === 'bantuan' ||
        event.entityType === 'dokumen' ||
        event.entityType === 'laporan';

      // For privacy-sensitive resident updates, notify admins of that RT + the specific resident's own socket room
      if (event.entityType === 'warga') {
        const adminRooms = resolveRoomsForTarget(rw, targets, { adminsOnly: true });
        for (const room of adminRooms) {
          io.to(room).emit('sync:delta', event);
        }
        if (event.wargaId) {
          io.to(`user:warga:${event.wargaId}`).emit('sync:delta', event);
        } else if (event.entityId) {
          io.to(`user:warga:${event.entityId}`).emit('sync:delta', event);
        }
        return;
      }

      const rooms = resolveRoomsForTarget(rw, targets, {
        adminsOnly: adminOnlyEntity,
      });
      for (const room of rooms) {
        io.to(room).emit('sync:delta', event);
      }
    },

    emitAnnouncement({ rwId, targetRts, action, announcementId, revision, announcement }) {
      const rooms = resolveRoomsForTarget(rwId || '05', targetRts);
      const payload = {
        action,
        id: announcementId,
        revision,
        targetRts: normalizeRtTargetList(targetRts),
        announcement,
        updatedAt: new Date().toISOString(),
      };
      for (const room of rooms) {
        io.to(room).emit('announcement:new', payload);
      }
    },

    emitNotification(notification: AppNotification) {
      const targetRoles = notification.targetRoles;
      const adminsOnly =
        Array.isArray(targetRoles) &&
        targetRoles.length > 0 &&
        !targetRoles.includes('warga');
      const includeServer = !targetRoles || targetRoles.length === 0 || targetRoles.includes('server');

      const rooms = resolveRoomsForTarget(notification.rwId || '05', notification.targetRts, {
        adminsOnly,
        includeServer,
      });
      for (const room of rooms) {
        io.to(room).emit('notification:new', notification);
      }
    },

    emitAdminRegistryUpdate(rwId: string, revision: number) {
      const rw = (rwId || '05').replace(/\D/g, '').padStart(2, '0') || '05';
      io.to(`rw:${rw}:server`).emit('admin:registry', {
        revision,
        updatedAt: new Date().toISOString(),
      });
    },

    getConnectedCount() {
      return io.of('/').sockets.size;
    },
  };
}
