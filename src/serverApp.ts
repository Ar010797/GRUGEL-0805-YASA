import express from 'express';
import * as XLSX from 'xlsx';
import { buildTemplateExcelWorkbook, getTemplateExcelFilename } from './utils/excelTemplateBuilder.ts';
import {
  authenticateAndCreateSessionSql,
  authenticateFirebaseGoogleSql,
  BadRequestError,
  bulkImportWargaBantuanSql,
  checkDatabaseHealthSql,
  createSessionForAdminUserSql,
  deleteAdminAccountByServerSql,
  deleteBantuanSql,
  deleteDokumenSql,
  deletePengumumanSql,
  deleteTransactionSql,
  deleteWargaSql,
  extractUserRtRw,
  filterStateForUser,
  ForbiddenError,
  getAdminAccountsSql,
  getAuditLogsSql,
  getBackupExportSql,
  getDatabaseSnapshotForUser,
  getDeltaSinceRevisionSql,
  getNotificationsForUserSql,
  getPublicBootstrapInfoSql,
  getPushSubscriptionsForTargetSql,
  isSqlUnavailable,
  markAllNotificationsReadSql,
  markNotificationReadSql,
  mergeAndSaveFullStateSql,
  normalizeTargetRts,
  NotFoundError,
  readCloudSqlMigrationSnapshot,
  readFullStateSql,
  removePushSubscriptionByEndpointSql,
  removePushSubscriptionSql,
  revokeSessionTokenSql,
  savePushSubscriptionSql,
  searchWargaSql,
  syncAdminAccountSql,
  updateSettingsSql,
  updateWargaSelfSql,
  upgradeWargaKKTx,
  upsertAdminAccountByServerSql,
  upsertBantuanSql,
  upsertDokumenSql,
  upsertLaporanSql,
  upsertPengumumanSql,
  upsertTransactionSql,
  upsertWargaSql,
  verifySessionTokenSql,
  VersionConflictError,
} from './db/repository.ts';
import {
  extractTokenFromRequest,
  requireAdminOrServer,
  requireAuth,
  requireServerOnly,
  requireStreamAuth,
  type AuthRequest,
} from './middleware/auth.ts';
import type { RealtimeEmitter } from './realtime/socketServer.ts';
import { getVapidPublicKey, sendPushToSubscriptions } from './utils/pushService.ts';
import type { AppNotification, AuthUser } from './types.ts';

interface SseClient {
  res: express.Response;
  authUser: AuthUser;
}

function getHttpStatusFromError(err: any): { status: number; code?: string; extra?: Record<string, any> } {
  if (err instanceof ForbiddenError || err?.status === 403) {
    return { status: 403, code: 'FORBIDDEN' };
  }
  if (err instanceof VersionConflictError || err?.status === 409) {
    return {
      status: 409,
      code: 'VERSION_CONFLICT',
      extra: { currentVersion: err?.currentVersion },
    };
  }
  if (err instanceof BadRequestError || err?.status === 400) {
    return { status: 400, code: 'BAD_REQUEST' };
  }
  if (err instanceof NotFoundError || err?.status === 404) {
    return { status: 404, code: 'NOT_FOUND' };
  }
  if (isSqlUnavailable(err)) return { status: 503, code: 'DB_UNAVAILABLE' };
  const msg = String(err?.message || '');
  if (
    msg.includes('belum dikonfigurasi') ||
    msg.includes('Koneksi database server bermasalah') ||
    msg.includes('menginisialisasi database')
  ) {
    return { status: 503, code: 'DB_UNAVAILABLE' };
  }
  return { status: 500 };
}

function sendErrorResponse(res: express.Response, err: any, fallbackMessage: string) {
  const { status, code, extra } = getHttpStatusFromError(err);
  return res.status(status).json({
    success: false,
    ...(code ? { code } : {}),
    ...(extra || {}),
    message: err?.message || fallbackMessage,
  });
}

export function createApiApp(options?: { realtime?: RealtimeEmitter }) {
  const app = express();
  const realtime = options?.realtime;

  // Body parser & CORS
  app.use(express.json({ limit: '25mb' }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.header('Access-Control-Allow-Origin', origin || '*');
    if (origin) {
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Role-filtered Server-Sent Events (SSE) fallback clients
  const sseClients = new Set<SseClient>();

  async function broadcastSyncEvent(type: 'sync' | 'reset' = 'sync') {
    if (sseClients.size === 0) return;
    try {
      const fullState = await readFullStateSql();
      const timestamp = new Date().toISOString();
      for (const client of Array.from(sseClients)) {
        try {
          const scopedData = filterStateForUser(fullState, client.authUser);
          const payload = `data: ${JSON.stringify({ type, timestamp, data: scopedData })}\n\n`;
          client.res.write(payload);
        } catch {
          sseClients.delete(client);
        }
      }
    } catch (err) {
      console.error('SSE broadcast error:', err);
    }
  }

  async function dispatchRealtimeAndPush(notification?: AppNotification) {
    if (!notification) return;
    realtime?.emitNotification(notification);
    try {
      const subs = await getPushSubscriptionsForTargetSql(
        notification.rwId,
        notification.targetRts,
        notification.targetRoles
      );
      if (subs.length > 0) {
        await sendPushToSubscriptions(
          subs,
          {
            title: notification.title,
            body: notification.body,
            category: notification.category,
            url: '/',
            tag: `rw05-${notification.category}-${notification.id}`,
          },
          removePushSubscriptionByEndpointSql
        );
      }
    } catch (err) {
      console.warn('Web Push dispatch notice (non-fatal):', err);
    }
  }

  // Health Check
  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const health = await checkDatabaseHealthSql();
      return res.json({
        status: 'ok',
        backend: 'postgresql',
        database: 'postgresql',
        cloudSqlConnected: true,
        engine: health.engine || 'PostgreSQL (Cloud SQL)',
        app: 'Sistem Informasi Kas Warga & Administrasi RW 05 Kotayasa',
        revision: health.revision,
        lastUpdated: health.lastUpdated,
        totalWarga: health.totalWarga,
        totalAdminAccounts: health.totalAdminAccounts,
        socketConnectedCount: realtime ? realtime.getConnectedCount() : 0,
        time: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'error',
        backend: 'postgresql',
        database: 'postgresql',
        cloudSqlConnected: false,
        engine: 'PostgreSQL',
        message: err?.message || 'Koneksi database PostgreSQL terputus.',
        time: new Date().toISOString(),
      });
    }
  });

  // Read-only Cloud SQL migration snapshot
  app.get('/api/migration/cloudsql-snapshot', requireAuth, requireServerOnly, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const snap = await readCloudSqlMigrationSnapshot();
      return res.status(200).json(snap);
    } catch (err: any) {
      return res.status(200).json({
        available: false,
        reason: err?.message || 'Cloud SQL tidak tersedia.',
      });
    }
  });

  // Public non-PII bootstrap info
  app.get('/api/public/info', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const info = await getPublicBootstrapInfoSql();
      return res.json({
        success: true,
        ...info,
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memuat info awal server.');
    }
  });

  // Central Authentication Endpoint (Server / Admin RT / Warga KK)
  app.post('/api/auth/login', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const role = req.body?.role;
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();

      if (role !== 'server' && role !== 'admin' && role !== 'warga') {
        return res.status(400).json({
          success: false,
          message: 'Tipe akses login tidak valid.',
        });
      }

      const result = await authenticateAndCreateSessionSql({ role, username, password });
      if (!result.ok) {
        return res.status(result.status).json({
          success: false,
          message: result.message,
        });
      }

      return res.json({
        success: true,
        token: result.token,
        user: result.user,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Terjadi kesalahan saat autentikasi ke server.');
    }
  });

  // Google Sign-In ID Token exchange for Super Admin Server (RW 05)
  app.post('/api/auth/firebase-google', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const idToken = String(req.body?.idToken || '').trim();
      const result = await authenticateFirebaseGoogleSql(idToken);
      if (!result.ok) {
        return res.status(result.status).json({
          success: false,
          message: result.message,
        });
      }
      return res.json({
        success: true,
        token: result.token,
        user: result.user,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memverifikasi login Google Super Admin.');
    }
  });

  // Verify current session token
  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      user: req.authUser,
      timestamp: new Date().toISOString(),
    });
  });

  // Explicit logout revokes token in PostgreSQL
  app.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res) => {
    if (req.authToken) {
      await revokeSessionTokenSql(req.authToken);
    }
    return res.json({
      success: true,
      message: 'Berhasil keluar dari sesi server.',
    });
  });

  // Lightweight revision check
  app.get('/api/sync-check', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const since = Number(req.query.since || 0);
      const info = await getPublicBootstrapInfoSql();
      return res.json({
        success: true,
        revision: info.revision,
        lastUpdated: info.lastUpdated,
        hasData: true,
        changed: since !== info.revision,
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memeriksa pembaruan server.');
    }
  });

  // Delta sync endpoint on Socket.IO reconnect
  app.get('/api/sync/delta', requireAuth, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const sinceRevision = Number(req.query.sinceRevision || req.query.since || 0);
      const delta = await getDeltaSinceRevisionSql(req.authUser!, sinceRevision);
      return res.json({
        success: true,
        ...delta,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyinkronkan pembaruan terbaru.');
    }
  });

  // Role-filtered Live Server-Sent Events stream (?token=...)
  app.get('/api/stream', requireStreamAuth, async (req: AuthRequest, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client: SseClient = { res, authUser: req.authUser! };
    sseClients.add(client);

    try {
      const snapshot = await getDatabaseSnapshotForUser(req.authUser!);
      res.write(
        `data: ${JSON.stringify({
          type: 'sync',
          timestamp: new Date().toISOString(),
          data: snapshot,
        })}\n\n`
      );
    } catch (err) {
      console.error('SSE initial snapshot error:', err);
    }

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(client);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(client);
    });
  });

  // GET Full Database Snapshot (role & RT isolated)
  app.get('/api/data', requireAuth, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await getDatabaseSnapshotForUser(req.authUser!);
      return res.json({
        success: true,
        data,
        revision: data.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengambil data dari database server.');
    }
  });

  // GET Admin accounts registry (Admin gets own record; Server gets all)
  app.get('/api/admin-accounts', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const info = await getAdminAccountsSql();
      const filteredAccounts =
        req.authUser!.role === 'server'
          ? info.adminAccounts
          : info.adminAccounts.filter(
              (a) => a.username.trim().toLowerCase() === req.authUser!.username.trim().toLowerCase()
            );
      return res.json({
        success: true,
        adminAccounts: filteredAccounts,
        deletedAdminIds: info.deletedAdminIds,
        serverHasData: true,
        revision: info.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengambil akun admin.');
    }
  });

  // Server-only Admin Account Management (Create, Edit, Toggle Active, Delete)
  app.post('/api/admin-accounts', requireAuth, requireServerOnly, async (req: AuthRequest, res) => {
    try {
      const account = req.body?.account || req.body;
      if (!account || !account.username) {
        return res.status(400).json({ success: false, message: 'Username akun Admin RT wajib diisi.' });
      }
      const saved = await upsertAdminAccountByServerSql(req.authUser!, account, {
        expectedVersion: req.body?.expectedVersion,
      });
      realtime?.emitAdminRegistryUpdate(saved.account.rw || '05', saved.revision);
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'admin_account',
        action: 'upsert',
        entityId: saved.account.id,
        rtScope: `RT ${saved.account.rt} RW ${saved.account.rw}`,
        payload: saved.account,
        updatedAt: saved.account.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        account: saved.account,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan akun Admin RT.');
    }
  });

  app.put('/api/admin-accounts/:id', requireAuth, requireServerOnly, async (req: AuthRequest, res) => {
    try {
      const account = req.body?.account || req.body;
      const saved = await upsertAdminAccountByServerSql(
        req.authUser!,
        { ...account, id: req.params.id },
        { expectedVersion: req.body?.expectedVersion }
      );
      realtime?.emitAdminRegistryUpdate(saved.account.rw || '05', saved.revision);
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'admin_account',
        action: 'upsert',
        entityId: saved.account.id,
        rtScope: `RT ${saved.account.rt} RW ${saved.account.rw}`,
        payload: saved.account,
        updatedAt: saved.account.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        account: saved.account,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui akun Admin RT.');
    }
  });

  app.delete('/api/admin-accounts/:id', requireAuth, requireServerOnly, async (req: AuthRequest, res) => {
    try {
      const result = await deleteAdminAccountByServerSql(req.authUser!, req.params.id);
      realtime?.emitAdminRegistryUpdate('05', result.revision);
      realtime?.emitDelta({
        revision: result.revision,
        entityType: 'admin_account',
        action: 'delete',
        entityId: req.params.id,
        updatedAt: new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        revision: result.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menghapus akun Admin RT.');
    }
  });

  // POST /api/admin/sync-account
  app.post('/api/admin/sync-account', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { account, syncData, deletedIds, allowOverwrite, securityPin } = req.body || {};
      const username = String(account?.username || '').trim();
      const passwordHash = String(account?.passwordHash || '').trim();

      if (!account || !username || !passwordHash) {
        return res.status(400).json({
          success: false,
          message: 'Username dan password akun admin harus diisi untuk sinkronisasi ke server.',
        });
      }

      let callerUser: AuthUser | null = null;
      const rawToken = extractTokenFromRequest(req, false);
      if (rawToken) {
        const session = await verifySessionTokenSql(rawToken);
        if (session) callerUser = session;
      }

      const isPrivilegedCaller = callerUser?.role === 'server' || callerUser?.role === 'admin';
      const existingInfo = await getAdminAccountsSql();
      const existingMatch = existingInfo.adminAccounts.find(
        (a) => a.username.trim().toLowerCase() === username.toLowerCase()
      );

      if (!isPrivilegedCaller) {
        const isDefaultAdmin = username.toLowerCase() === 'admin' && passwordHash === 'rt08rw05';
        const isMatchingExisting = existingMatch && existingMatch.passwordHash === passwordHash;
        const hasValidSecurityPin = String(securityPin || '').trim() === '123456';
        if (!isDefaultAdmin && !isMatchingExisting && !hasValidSecurityPin) {
          return res.status(403).json({
            success: false,
            code: 'PIN_REQUIRED',
            message:
              'Untuk mendaftarkan akun Admin baru ke Server Pusat, masukkan PIN Keamanan Pengurus 6 digit (awal: 123456).',
          });
        }
      }

      const resSync = await syncAdminAccountSql({
        account,
        syncData,
        deletedIds,
        allowOverwrite: Boolean(allowOverwrite && callerUser?.role === 'server'),
      });

      if (!resSync.ok) {
        return res.status(resSync.status).json({
          success: false,
          message: resSync.message,
        });
      }

      const adminAuthUser: AuthUser = {
        role: 'admin',
        username: resSync.account.username,
        nama: resSync.account.nama,
        rtScope: `RT ${resSync.account.rt} RW ${resSync.account.rw}`,
        isPinAuthenticated: false,
      };

      const token = await createSessionForAdminUserSql(adminAuthUser);
      const scopedMerged = filterStateForUser(resSync.mergedData, adminAuthUser);
      realtime?.emitAdminRegistryUpdate(resSync.account.rw || '05', resSync.mergedData.revision);
      await broadcastSyncEvent('sync');

      return res.json({
        success: true,
        message: `Akun Admin "${resSync.account.username}" berhasil tersimpan & tersinkron ke Database Server.`,
        account: resSync.account,
        token,
        user: adminAuthUser,
        data: scopedMerged,
        revision: resSync.mergedData.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyinkronkan akun admin ke server.');
    }
  });

  // POST /api/data (Server only for hard reset / full restore; Admins cannot wipe other RTs)
  app.post('/api/data', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const payload = req.body;
      if (!payload) {
        return res.status(400).json({ success: false, message: 'Data kosong' });
      }
      if (payload.isHardReset === true && req.authUser!.role !== 'server') {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Reset total database hanya diperbolehkan untuk Super Admin Server RW 05.',
        });
      }

      const mergedData = await mergeAndSaveFullStateSql(payload, { callerUser: req.authUser! });
      const scoped = filterStateForUser(mergedData, req.authUser!);
      realtime?.emitDelta({
        revision: mergedData.revision,
        entityType: 'snapshot',
        action: 'sync',
        updatedAt: mergedData.lastUpdated,
      });
      await broadcastSyncEvent(payload.isHardReset === true ? 'reset' : 'sync');

      return res.json({
        success: true,
        message:
          payload.isHardReset === true
            ? 'Database server berhasil direset secara bersih'
            : 'Data berhasil disinkronisasi ke database server pusat',
        data: scoped,
        revision: mergedData.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan data ke database server.');
    }
  });

  // POST /api/sync/migrate-local
  app.post(
    '/api/sync/migrate-local',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const payload = req.body;
        if (!payload || typeof payload !== 'object') {
          return res.status(400).json({ success: false, message: 'Payload migrasi tidak valid.' });
        }
        const safePayload = { ...payload, isHardReset: false };
        const mergedData = await mergeAndSaveFullStateSql(safePayload, { callerUser: req.authUser! });
        const scoped = filterStateForUser(mergedData, req.authUser!);
        realtime?.emitDelta({
          revision: mergedData.revision,
          entityType: 'snapshot',
          action: 'sync',
          updatedAt: mergedData.lastUpdated,
        });
        await broadcastSyncEvent('sync');
        return res.json({
          success: true,
          message: 'Data lokal perangkat berhasil dimigrasikan ke Database Server Pusat.',
          data: scoped,
          revision: mergedData.revision,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal memigrasikan data lokal ke server.');
      }
    }
  );

  // GET /api/warga (strictly RT/RW/Warga isolated)
  app.get('/api/warga', requireAuth, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const rt = typeof req.query.rt === 'string' ? req.query.rt : '';
      const wargaList = await searchWargaSql(req.authUser!, q, rt);
      return res.json({
        success: true,
        wargaList,
        totalWarga: wargaList.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengambil data warga dari server.');
    }
  });

  // PATCH /api/warga/self
  app.patch('/api/warga/self', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.authUser?.role !== 'warga') {
        return res.status(403).json({ success: false, message: 'Endpoint ini khusus akun Warga.' });
      }
      const updated = await updateWargaSelfSql(req.authUser.wargaId, req.authUser.noKK, {
        pin: req.body?.pin,
        telepon: req.body?.telepon,
      });
      if (!updated) {
        return res
          .status(404)
          .json({ success: false, message: 'Data warga tidak ditemukan di server.' });
      }
      realtime?.emitDelta({
        revision: updated.revision,
        entityType: 'warga',
        action: 'upsert',
        entityId: updated.warga.id,
        wargaId: updated.warga.id,
        rtScope: `RT ${updated.warga.rt} RW ${updated.warga.rw || '05'}`,
        payload: updated.warga,
        updatedAt: updated.warga.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        warga: updated.warga,
        revision: updated.revision,
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui profil warga.');
    }
  });

  // POST /api/warga
  app.post('/api/warga', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const incoming = req.body?.warga || req.body;
      if (!incoming || !incoming.nama || !incoming.noKK) {
        return res.status(400).json({
          success: false,
          message: 'Nama kepala keluarga dan Nomor KK wajib diisi.',
        });
      }
      const saved = await upsertWargaSql(req.authUser!, incoming, {
        clientMutationId: req.body?.clientMutationId,
        expectedVersion: req.body?.expectedVersion,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'warga',
        action: 'upsert',
        entityId: saved.warga.id,
        wargaId: saved.warga.id,
        rtScope: `RT ${saved.warga.rt} RW ${saved.warga.rw || '05'}`,
        payload: saved.warga,
        updatedAt: saved.warga.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: `Data warga ${saved.warga.nama} berhasil disimpan di database server.`,
        warga: saved.warga,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan data warga ke database server.');
    }
  });

  // PUT /api/warga/:id
  app.put('/api/warga/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const incoming = req.body?.warga || req.body;
      if (!incoming || !incoming.nama) {
        return res.status(400).json({ success: false, message: 'Data warga tidak lengkap.' });
      }
      const saved = await upsertWargaSql(
        req.authUser!,
        { ...incoming, id: req.params.id },
        {
          clientMutationId: req.body?.clientMutationId,
          expectedVersion: req.body?.expectedVersion ?? incoming.version,
        }
      );
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'warga',
        action: 'upsert',
        entityId: saved.warga.id,
        wargaId: saved.warga.id,
        rtScope: `RT ${saved.warga.rt} RW ${saved.warga.rw || '05'}`,
        payload: saved.warga,
        updatedAt: saved.warga.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: `Data warga ${saved.warga.nama} berhasil diperbarui di database server.`,
        warga: saved.warga,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui data warga di server.');
    }
  });

  // Atomic Upgrade KK endpoint
  app.post(
    '/api/warga/:id/upgrade-kk',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const updatedWarga = req.body?.updatedWarga;
        const historyRecord = req.body?.historyRecord;
        if (!updatedWarga || !historyRecord || !updatedWarga.nama || !updatedWarga.noKK) {
          return res.status(400).json({
            success: false,
            message: 'Data Upgrade KK (Kepala Keluarga, Nomor KK baru, dan riwayat) wajib lengkap.',
          });
        }
        const result = await upgradeWargaKKTx(req.authUser!, {
          wargaId: req.params.id,
          updatedWarga,
          historyRecord,
          oldNoKK: req.body?.oldNoKK,
          oldKepalaNama: req.body?.oldKepalaNama,
          catatSantunanKematian: Boolean(req.body?.catatSantunanKematian),
          nominalSantunanKematian: req.body?.nominalSantunanKematian,
          expectedVersion: req.body?.expectedVersion ?? updatedWarga.version,
          clientMutationId: req.body?.clientMutationId,
        });

        realtime?.emitDelta({
          revision: result.revision,
          entityType: 'warga',
          action: 'upgrade_kk',
          entityId: result.warga.id,
          wargaId: result.warga.id,
          rtScope: `RT ${result.warga.rt} RW ${result.warga.rw || '05'}`,
          payload: {
            warga: result.warga,
            updatedTransactions: result.updatedTransactions,
            createdTransactions: result.createdTransactions,
            updatedBantuan: result.updatedBantuan,
          },
          updatedAt: result.warga.updatedAt || new Date().toISOString(),
        });
        await dispatchRealtimeAndPush(result.notification);
        await broadcastSyncEvent('sync');

        return res.json({
          success: true,
          message: `Upgrade KK ${result.warga.nama} berhasil disimpan secara atomik ke server.`,
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal memproses Upgrade KK di server.');
      }
    }
  );

  // POST /api/warga/bulk
  app.post('/api/warga/bulk', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const wargaList = Array.isArray(req.body?.wargaList) ? req.body.wargaList : [];
      const bantuanList = Array.isArray(req.body?.bantuanList) ? req.body.bantuanList : [];
      const mergeExisting = Boolean(req.body?.mergeExisting ?? true);
      const tahunAktif = Number(req.body?.tahunAktif) || 2026;

      const result = await bulkImportWargaBantuanSql(req.authUser!, {
        wargaList,
        bantuanList,
        mergeExisting,
        tahunAktif,
        clientMutationId: req.body?.clientMutationId,
      });

      const userScope = extractUserRtRw(req.authUser!);
      realtime?.emitDelta({
        revision: result.revision,
        entityType: 'snapshot',
        action: 'bulk_import',
        rtScope: req.authUser!.role === 'admin' ? `RT ${userScope.rt} RW ${userScope.rw}` : undefined,
        targetRts: req.authUser!.role === 'admin' ? [userScope.rt] : ['SEMUA'],
        updatedAt: new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(result.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengimpor data Excel ke database server.');
    }
  });

  // DELETE /api/warga/:id
  app.delete('/api/warga/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const expectedVersion =
        req.body?.expectedVersion !== undefined
          ? Number(req.body.expectedVersion)
          : req.query.expectedVersion !== undefined
          ? Number(req.query.expectedVersion)
          : undefined;
      const result = await deleteWargaSql(req.authUser!, req.params.id, {
        expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : undefined,
        clientMutationId: req.body?.clientMutationId,
      });
      realtime?.emitDelta({
        revision: result.revision,
        entityType: 'warga',
        action: 'delete',
        entityId: req.params.id,
        wargaId: req.params.id,
        rtScope: result.deletedRt ? `RT ${result.deletedRt} RW 05` : undefined,
        updatedAt: new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(result.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: 'Data warga berhasil dihapus dari database server.',
        totalWarga: result.totalWarga,
        revision: result.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menghapus data warga dari database server.');
    }
  });

  // Transactions CRUD
  app.post('/api/transactions', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const txItem = req.body?.transaction || req.body;
      if (!txItem || !txItem.id) {
        return res.status(400).json({ success: false, message: 'Data transaksi tidak valid.' });
      }
      const saved = await upsertTransactionSql(req.authUser!, txItem, {
        clientMutationId: req.body?.clientMutationId,
        expectedVersion: req.body?.expectedVersion,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'transaction',
        action: 'upsert',
        entityId: saved.transaction.id,
        rtScope: saved.transaction.rtScope,
        payload: saved.transaction,
        updatedAt: saved.transaction.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        transaction: saved.transaction,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan transaksi kas.');
    }
  });

  app.put('/api/transactions/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const txItem = req.body?.transaction || req.body;
      if (!txItem) {
        return res.status(400).json({ success: false, message: 'Data transaksi tidak valid.' });
      }
      const saved = await upsertTransactionSql(
        req.authUser!,
        { ...txItem, id: req.params.id },
        {
          clientMutationId: req.body?.clientMutationId,
          expectedVersion: req.body?.expectedVersion ?? txItem.version,
        }
      );
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'transaction',
        action: 'upsert',
        entityId: saved.transaction.id,
        rtScope: saved.transaction.rtScope,
        payload: saved.transaction,
        updatedAt: saved.transaction.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        transaction: saved.transaction,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui transaksi kas.');
    }
  });

  app.delete(
    '/api/transactions/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const result = await deleteTransactionSql(req.authUser!, req.params.id, {
          expectedVersion: req.body?.expectedVersion,
        });
        realtime?.emitDelta({
          revision: result.revision,
          entityType: 'transaction',
          action: 'delete',
          entityId: req.params.id,
          rtScope: result.rtScope,
          updatedAt: new Date().toISOString(),
        });
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision: result.revision });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal menghapus transaksi.');
      }
    }
  );

  // Pengumuman CRUD (strictly RT-targeted)
  app.post('/api/pengumuman', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.pengumuman || req.body;
      if (!item || !item.id || !item.judul) {
        return res.status(400).json({ success: false, message: 'Data pengumuman tidak lengkap.' });
      }
      const saved = await upsertPengumumanSql(req.authUser!, item, {
        clientMutationId: req.body?.clientMutationId,
        expectedVersion: req.body?.expectedVersion,
      });
      const targetRts = normalizeTargetRts(saved.pengumuman.targetRts, saved.pengumuman.rtScope);
      realtime?.emitAnnouncement({
        rwId: saved.pengumuman.senderRw || '05',
        targetRts,
        action: 'upsert',
        announcementId: saved.pengumuman.id,
        revision: saved.revision,
        announcement: saved.pengumuman,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'pengumuman',
        action: 'upsert',
        entityId: saved.pengumuman.id,
        targetRts,
        payload: saved.pengumuman,
        updatedAt: saved.pengumuman.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, pengumuman: saved.pengumuman, revision: saved.revision });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan pengumuman.');
    }
  });

  app.put('/api/pengumuman/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.pengumuman || req.body;
      if (!item || !item.judul) {
        return res.status(400).json({ success: false, message: 'Data pengumuman tidak lengkap.' });
      }
      const saved = await upsertPengumumanSql(
        req.authUser!,
        { ...item, id: req.params.id },
        {
          clientMutationId: req.body?.clientMutationId,
          expectedVersion: req.body?.expectedVersion ?? item.version,
        }
      );
      const targetRts = normalizeTargetRts(saved.pengumuman.targetRts, saved.pengumuman.rtScope);
      realtime?.emitAnnouncement({
        rwId: saved.pengumuman.senderRw || '05',
        targetRts,
        action: 'upsert',
        announcementId: saved.pengumuman.id,
        revision: saved.revision,
        announcement: saved.pengumuman,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'pengumuman',
        action: 'upsert',
        entityId: saved.pengumuman.id,
        targetRts,
        payload: saved.pengumuman,
        updatedAt: saved.pengumuman.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, pengumuman: saved.pengumuman, revision: saved.revision });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui pengumuman.');
    }
  });

  app.delete(
    '/api/pengumuman/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const result = await deletePengumumanSql(req.authUser!, req.params.id);
        realtime?.emitAnnouncement({
          rwId: '05',
          targetRts: result.targetRts,
          action: 'delete',
          announcementId: req.params.id,
          revision: result.revision,
        });
        realtime?.emitDelta({
          revision: result.revision,
          entityType: 'pengumuman',
          action: 'delete',
          entityId: req.params.id,
          targetRts: result.targetRts,
          updatedAt: new Date().toISOString(),
        });
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision: result.revision });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal menghapus pengumuman.');
      }
    }
  );

  // Bantuan Pemerintah CRUD
  app.post('/api/bantuan', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.bantuan || req.body;
      if (!item || !item.id) {
        return res.status(400).json({ success: false, message: 'Data bantuan tidak valid.' });
      }
      const saved = await upsertBantuanSql(req.authUser!, item, {
        expectedVersion: req.body?.expectedVersion,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'bantuan',
        action: 'upsert',
        entityId: saved.bantuan.id,
        rtScope: saved.bantuan.rtScope,
        payload: saved.bantuan,
        updatedAt: saved.bantuan.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({ success: true, bantuan: saved.bantuan, revision: saved.revision });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan data bantuan.');
    }
  });

  app.put('/api/bantuan/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.bantuan || req.body;
      const saved = await upsertBantuanSql(
        req.authUser!,
        { ...item, id: req.params.id },
        { expectedVersion: req.body?.expectedVersion ?? item?.version }
      );
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'bantuan',
        action: 'upsert',
        entityId: saved.bantuan.id,
        rtScope: saved.bantuan.rtScope,
        payload: saved.bantuan,
        updatedAt: saved.bantuan.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({ success: true, bantuan: saved.bantuan, revision: saved.revision });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memperbarui data bantuan.');
    }
  });

  app.delete(
    '/api/bantuan/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const result = await deleteBantuanSql(req.authUser!, req.params.id);
        realtime?.emitDelta({
          revision: result.revision,
          entityType: 'bantuan',
          action: 'delete',
          entityId: req.params.id,
          rtScope: result.rtScope,
          updatedAt: new Date().toISOString(),
        });
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision: result.revision });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal menghapus data bantuan.');
      }
    }
  );

  // Dokumen PDF CRUD
  app.post('/api/dokumen', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.dokumen || req.body;
      if (!item || !item.id || !item.judul) {
        return res.status(400).json({ success: false, message: 'Data dokumen tidak lengkap.' });
      }
      const saved = await upsertDokumenSql(req.authUser!, item);
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'dokumen',
        action: 'upsert',
        entityId: saved.dokumen.id,
        rtScope: saved.dokumen.rtScope,
        payload: saved.dokumen,
        updatedAt: saved.dokumen.updatedAt || new Date().toISOString(),
      });
      await broadcastSyncEvent('sync');
      return res.json({ success: true, dokumen: saved.dokumen, revision: saved.revision });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan dokumen.');
    }
  });

  app.delete(
    '/api/dokumen/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const result = await deleteDokumenSql(req.authUser!, req.params.id);
        realtime?.emitDelta({
          revision: result.revision,
          entityType: 'dokumen',
          action: 'delete',
          entityId: req.params.id,
          rtScope: result.rtScope,
          updatedAt: new Date().toISOString(),
        });
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision: result.revision });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal menghapus dokumen.');
      }
    }
  );

  // Laporan Bulanan RT -> Server
  app.post(
    ['/api/laporan-bulanan', '/api/sync-monthly'],
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const report = req.body?.laporan || req.body;
        if (!report || !report.id) {
          return res
            .status(400)
            .json({ success: false, message: 'Data laporan bulanan tidak valid.' });
        }
        const saved = await upsertLaporanSql(req.authUser!, report);
        realtime?.emitDelta({
          revision: saved.revision,
          entityType: 'laporan',
          action: 'upsert',
          entityId: saved.laporan.id,
          rtScope: `RT ${saved.laporan.rt} RW ${saved.laporan.rw}`,
          payload: saved.laporan,
          updatedAt: saved.laporan.updatedAt || new Date().toISOString(),
        });
        await dispatchRealtimeAndPush(saved.notification);
        await broadcastSyncEvent('sync');
        return res.json({
          success: true,
          message: `Laporan bulanan RT ${saved.laporan.rt} berhasil diterima server desa.`,
          laporan: saved.laporan,
          revision: saved.revision,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return sendErrorResponse(res, err, 'Gagal menyimpan laporan bulanan.');
      }
    }
  );

  // Settings Update (Per-RT isolated)
  app.post('/api/settings', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const settings = req.body?.pengaturanKas || req.body;
      const tahunAktif = req.body?.tahunAktif;
      if (!settings) {
        return res.status(400).json({ success: false, message: 'Pengaturan tidak boleh kosong.' });
      }
      const saved = await updateSettingsSql(req.authUser!, settings, tahunAktif, {
        expectedVersion: req.body?.expectedVersion ?? settings.version,
      });
      realtime?.emitDelta({
        revision: saved.revision,
        entityType: 'settings',
        action: 'upsert',
        targetRts: [saved.targetRt],
        rtScope: `RT ${saved.targetRt} RW 05`,
        payload: saved.settings,
        updatedAt: saved.settings.updatedAt || new Date().toISOString(),
      });
      await dispatchRealtimeAndPush(saved.notification);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        pengaturanKas: saved.settings,
        revision: saved.revision,
      });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menyimpan pengaturan.');
    }
  });

  // Notification Center Endpoints
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const limit = Number(req.query.limit) || 60;
      const result = await getNotificationsForUserSql(req.authUser!, limit);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memuat notifikasi.');
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      await markNotificationReadSql(req.authUser!, req.params.id);
      return res.json({ success: true });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menandai notifikasi dibaca.');
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      const count = await markAllNotificationsReadSql(req.authUser!);
      return res.json({ success: true, markedCount: count });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menandai semua notifikasi dibaca.');
    }
  });

  // Web Push Endpoints
  app.get('/api/push/vapid-public-key', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const publicKey = await getVapidPublicKey();
      return res.json({ success: true, publicKey });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal memuat VAPID public key.');
    }
  });

  app.post('/api/push/subscribe', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sub = req.body?.subscription || req.body;
      await savePushSubscriptionSql(req.authUser!, sub, req.headers['user-agent']);
      return res.json({ success: true, message: 'Notifikasi perangkat berhasil diaktifkan.' });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mendaftarkan notifikasi perangkat.');
    }
  });

  app.post('/api/push/unsubscribe', requireAuth, async (req: AuthRequest, res) => {
    try {
      const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : undefined;
      await removePushSubscriptionSql(req.authUser!, endpoint);
      return res.json({ success: true, message: 'Notifikasi perangkat dinonaktifkan.' });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal menonaktifkan notifikasi perangkat.');
    }
  });

  // Audit Logs & Backup Export
  app.get('/api/audit-logs', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const limit = Number(req.query.limit) || 100;
      const logs = await getAuditLogsSql(req.authUser!, limit);
      return res.json({ success: true, logs });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengambil riwayat audit.');
    }
  });

  app.get('/api/backup/export', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const backup = await getBackupExportSql(req.authUser!);
      const filename = `backup-kaswarga-${req.authUser!.role}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.json({ success: true, ...backup });
    } catch (err: any) {
      return sendErrorResponse(res, err, 'Gagal mengekspor cadangan database.');
    }
  });

  // GET Template Excel (.xlsx)
  app.get(
    [
      '/api/template-excel',
      '/api/template-excel/:filename',
      '/api/template-excel-rt/:rt/:rw/:filename',
    ],
    (req, res) => {
      try {
        const rt =
          typeof req.params.rt === 'string'
            ? req.params.rt
            : typeof req.query.rt === 'string'
            ? req.query.rt
            : undefined;
        const rw =
          typeof req.params.rw === 'string'
            ? req.params.rw
            : typeof req.query.rw === 'string'
            ? req.query.rw
            : undefined;
        const desa = typeof req.query.desa === 'string' ? req.query.desa : undefined;

        const wb = buildTemplateExcelWorkbook({ rt, rw, desa });
        const rawBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const xlsxBuffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);

        const requestedName = typeof req.params.filename === 'string' ? req.params.filename : '';
        const sanitizedBase = requestedName.replace(/[^a-zA-Z0-9._-]/g, '');
        const safeFilename =
          sanitizedBase && sanitizedBase.toLowerCase().endsWith('.xlsx')
            ? sanitizedBase
            : getTemplateExcelFilename();

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Length', String(xlsxBuffer.length));

        return res.status(200).send(xlsxBuffer);
      } catch (err: any) {
        console.error('Error generating Excel template:', err);
        return res.status(500).json({
          success: false,
          message: 'Gagal membuat file template Excel (.xlsx)',
        });
      }
    }
  );

  // Ensure unknown /api/* paths return clean JSON 404 instead of SPA index.html
  app.use('/api/*', (req, res) => {
    return res.status(404).json({
      success: false,
      message: `Endpoint API "${req.originalUrl}" tidak ditemukan di server.`,
    });
  });

  return app;
}
