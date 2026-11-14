import express from 'express';
import * as XLSX from 'xlsx';
import { buildTemplateExcelWorkbook, getTemplateExcelFilename } from './utils/excelTemplateBuilder.ts';
import {
  authenticateAndCreateSessionSql,
  bulkImportWargaBantuanSql,
  checkDatabaseHealthSql,
  createSessionForAdminUserSql,
  deleteBantuanSql,
  deleteDokumenSql,
  deletePengumumanSql,
  deleteTransactionSql,
  deleteWargaSql,
  getAdminAccountsSql,
  getDatabaseSnapshotForUser,
  getPublicBootstrapInfoSql,
  mergeAndSaveFullStateSql,
  readFullStateSql,
  revokeSessionTokenSql,
  searchWargaSql,
  syncAdminAccountSql,
  updateSettingsSql,
  updateWargaSelfSql,
  upsertBantuanSql,
  upsertDokumenSql,
  upsertLaporanSql,
  upsertPengumumanSql,
  upsertTransactionSql,
  upsertWargaSql,
  verifySessionTokenSql,
} from './db/repository.ts';
import {
  extractTokenFromRequest,
  requireAdminOrServer,
  requireAuth,
  requireStreamAuth,
  type AuthRequest,
} from './middleware/auth.ts';
import type { AuthUser } from './types.ts';

interface SseClient {
  res: express.Response;
  authUser: AuthUser;
}

function filterStateForUser(full: Awaited<ReturnType<typeof readFullStateSql>>, user: AuthUser) {
  if (user.role === 'server' || user.role === 'admin') {
    return full;
  }
  const targetKKDigits = String(user.noKK || '').replace(/\D/g, '');
  const ownWarga = full.wargaList.filter((w) => {
    if (user.wargaId && w.id === user.wargaId) return true;
    if (targetKKDigits && w.noKK.replace(/\D/g, '') === targetKKDigits) return true;
    return false;
  });
  return {
    ...full,
    wargaList: ownWarga,
    bantuanList: [],
    dokumenList: [],
    adminAccounts: [],
    laporanBulananRT: [],
  };
}

function getSqlErrorHttpStatus(err: any): number {
  const msg = String(err?.message || '');
  if (
    msg.includes('belum dikonfigurasi') ||
    msg.includes('Koneksi database server bermasalah') ||
    msg.includes('menginisialisasi database')
  ) {
    return 503;
  }
  return 500;
}

export function createApiApp() {
  const app = express();

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

  // Role-filtered Server-Sent Events (SSE) clients
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

  // Health Check (verifies live PostgreSQL connection)
  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const health = await checkDatabaseHealthSql();
      return res.json({
        status: 'ok',
        database: 'connected',
        engine: health.engine,
        app: 'Sistem Informasi Kas Warga & Server Desa Kotayasa',
        revision: health.revision,
        lastUpdated: health.lastUpdated,
        totalWarga: health.totalWarga,
        totalAdminAccounts: health.totalAdminAccounts,
        time: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'error',
        database: 'disconnected',
        message: err?.message || 'Koneksi database server pusat terputus.',
        time: new Date().toISOString(),
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
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal memuat info awal server.',
      });
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
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Terjadi kesalahan saat autentikasi ke server.',
      });
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

  // Lightweight revision check for mobile WebViews / browsers
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
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal memeriksa pembaruan server.',
      });
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

  // GET Full Database Snapshot (UU PDP role-filtered)
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
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal mengambil data dari database server.',
      });
    }
  });

  // GET Admin accounts registry (Admin/Server only)
  app.get('/api/admin-accounts', requireAuth, requireAdminOrServer, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const info = await getAdminAccountsSql();
      return res.json({
        success: true,
        adminAccounts: info.adminAccounts,
        deletedAdminIds: info.deletedAdminIds,
        serverHasData: true,
        revision: info.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal mengambil akun admin.',
      });
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
      await broadcastSyncEvent('sync');

      return res.json({
        success: true,
        message: `Akun Admin "${resSync.account.username}" berhasil tersimpan & tersinkron ke Database Server.`,
        account: resSync.account,
        token,
        user: adminAuthUser,
        data: resSync.mergedData,
        revision: resSync.mergedData.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal menyinkronkan akun admin ke server.',
      });
    }
  });

  // POST /api/data
  app.post('/api/data', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const payload = req.body;
      if (!payload) {
        return res.status(400).json({ success: false, message: 'Data kosong' });
      }

      const mergedData = await mergeAndSaveFullStateSql(payload);
      await broadcastSyncEvent(payload.isHardReset === true ? 'reset' : 'sync');

      return res.json({
        success: true,
        message:
          payload.isHardReset === true
            ? 'Database server berhasil direset secara bersih'
            : 'Data berhasil disinkronisasi ke database server pusat',
        data: mergedData,
        revision: mergedData.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal menyimpan data ke database server.',
      });
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
        const mergedData = await mergeAndSaveFullStateSql(safePayload);
        await broadcastSyncEvent('sync');
        return res.json({
          success: true,
          message: 'Data lokal perangkat berhasil dimigrasikan ke Database Server Pusat.',
          data: mergedData,
          revision: mergedData.revision,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return res.status(getSqlErrorHttpStatus(err)).json({
          success: false,
          message: err?.message || 'Gagal memigrasikan data lokal ke server.',
        });
      }
    }
  );

  // GET /api/warga
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
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal mengambil data warga dari server.',
      });
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
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        warga: updated.warga,
        revision: updated.revision,
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal memperbarui profil warga.',
      });
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
      const saved = await upsertWargaSql(incoming);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: `Data warga ${saved.warga.nama} berhasil disimpan di database server.`,
        warga: saved.warga,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal menyimpan data warga ke database server.',
      });
    }
  });

  // PUT /api/warga/:id
  app.put('/api/warga/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const incoming = req.body?.warga || req.body;
      if (!incoming || !incoming.nama) {
        return res.status(400).json({ success: false, message: 'Data warga tidak lengkap.' });
      }
      const saved = await upsertWargaSql({ ...incoming, id: req.params.id });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: `Data warga ${saved.warga.nama} berhasil diperbarui di database server.`,
        warga: saved.warga,
        revision: saved.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal memperbarui data warga di server.',
      });
    }
  });

  // POST /api/warga/bulk
  app.post('/api/warga/bulk', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const wargaList = Array.isArray(req.body?.wargaList) ? req.body.wargaList : [];
      const bantuanList = Array.isArray(req.body?.bantuanList) ? req.body.bantuanList : [];
      const mergeExisting = Boolean(req.body?.mergeExisting ?? true);
      const tahunAktif = Number(req.body?.tahunAktif) || 2026;

      const result = await bulkImportWargaBantuanSql({
        wargaList,
        bantuanList,
        mergeExisting,
        tahunAktif,
      });
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal mengimpor data Excel ke database server.',
      });
    }
  });

  // DELETE /api/warga/:id
  app.delete('/api/warga/:id', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const result = await deleteWargaSql(req.params.id);
      await broadcastSyncEvent('sync');
      return res.json({
        success: true,
        message: 'Data warga berhasil dihapus dari database server.',
        totalWarga: result.totalWarga,
        revision: result.revision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(getSqlErrorHttpStatus(err)).json({
        success: false,
        message: err?.message || 'Gagal menghapus data warga dari database server.',
      });
    }
  });

  // Transactions CRUD
  app.post('/api/transactions', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const txItem = req.body?.transaction || req.body;
      if (!txItem || !txItem.id) {
        return res.status(400).json({ success: false, message: 'Data transaksi tidak valid.' });
      }
      const revision = await upsertTransactionSql(txItem);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, revision, timestamp: new Date().toISOString() });
    } catch (err: any) {
      return res
        .status(getSqlErrorHttpStatus(err))
        .json({ success: false, message: err?.message || 'Gagal menyimpan transaksi kas.' });
    }
  });

  app.delete(
    '/api/transactions/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const revision = await deleteTransactionSql(req.params.id);
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision });
      } catch (err: any) {
        return res
          .status(getSqlErrorHttpStatus(err))
          .json({ success: false, message: err?.message || 'Gagal menghapus transaksi.' });
      }
    }
  );

  // Pengumuman CRUD
  app.post('/api/pengumuman', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const item = req.body?.pengumuman || req.body;
      if (!item || !item.id || !item.judul) {
        return res.status(400).json({ success: false, message: 'Data pengumuman tidak lengkap.' });
      }
      const revision = await upsertPengumumanSql(item);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, revision });
    } catch (err: any) {
      return res
        .status(getSqlErrorHttpStatus(err))
        .json({ success: false, message: err?.message || 'Gagal menyimpan pengumuman.' });
    }
  });

  app.delete(
    '/api/pengumuman/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const revision = await deletePengumumanSql(req.params.id);
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision });
      } catch (err: any) {
        return res
          .status(getSqlErrorHttpStatus(err))
          .json({ success: false, message: err?.message || 'Gagal menghapus pengumuman.' });
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
      const revision = await upsertBantuanSql(item);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, revision });
    } catch (err: any) {
      return res
        .status(getSqlErrorHttpStatus(err))
        .json({ success: false, message: err?.message || 'Gagal menyimpan data bantuan.' });
    }
  });

  app.delete(
    '/api/bantuan/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const revision = await deleteBantuanSql(req.params.id);
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision });
      } catch (err: any) {
        return res
          .status(getSqlErrorHttpStatus(err))
          .json({ success: false, message: err?.message || 'Gagal menghapus data bantuan.' });
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
      const revision = await upsertDokumenSql(item);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, revision });
    } catch (err: any) {
      return res
        .status(getSqlErrorHttpStatus(err))
        .json({ success: false, message: err?.message || 'Gagal menyimpan dokumen.' });
    }
  });

  app.delete(
    '/api/dokumen/:id',
    requireAuth,
    requireAdminOrServer,
    async (req: AuthRequest, res) => {
      try {
        const revision = await deleteDokumenSql(req.params.id);
        await broadcastSyncEvent('sync');
        return res.json({ success: true, revision });
      } catch (err: any) {
        return res
          .status(getSqlErrorHttpStatus(err))
          .json({ success: false, message: err?.message || 'Gagal menghapus dokumen.' });
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
        const revision = await upsertLaporanSql(report);
        await broadcastSyncEvent('sync');
        return res.json({
          success: true,
          message: `Laporan bulanan ${report.rt || 'RT'} berhasil diterima server desa.`,
          revision,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return res
          .status(getSqlErrorHttpStatus(err))
          .json({ success: false, message: err?.message || 'Gagal menyimpan laporan bulanan.' });
      }
    }
  );

  // Settings Update
  app.post('/api/settings', requireAuth, requireAdminOrServer, async (req: AuthRequest, res) => {
    try {
      const settings = req.body?.pengaturanKas || req.body;
      const tahunAktif = req.body?.tahunAktif;
      if (!settings) {
        return res.status(400).json({ success: false, message: 'Pengaturan tidak boleh kosong.' });
      }
      const revision = await updateSettingsSql(settings, tahunAktif);
      await broadcastSyncEvent('sync');
      return res.json({ success: true, revision });
    } catch (err: any) {
      return res
        .status(getSqlErrorHttpStatus(err))
        .json({ success: false, message: err?.message || 'Gagal menyimpan pengaturan.' });
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
