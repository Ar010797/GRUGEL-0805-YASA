import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { buildTemplateExcelWorkbook, getTemplateExcelFilename } from './src/utils/excelTemplateBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data_store.json');

// Body parser & CORS
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const BACKUP_FILE = path.join(__dirname, 'data_store.backup.json');

// Helper to read server data with dual-file fallback
function readServerData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && (Array.isArray(parsed.wargaList) || Array.isArray(parsed.adminAccounts))) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading data_store.json:', err);
  }

  // Fallback to backup file if primary is missing or corrupted
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const rawBackup = fs.readFileSync(BACKUP_FILE, 'utf-8');
      return JSON.parse(rawBackup);
    }
  } catch (err) {
    console.error('Error reading data_store.backup.json:', err);
  }

  return null;
}

// Helper to write server data with automatic backup copy
function writeServerData(data: any) {
  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, serialized, 'utf-8');
    // Mirror to backup file
    try {
      fs.writeFileSync(BACKUP_FILE, serialized, 'utf-8');
    } catch (e) {
      // ignore backup write failure
    }
    return true;
  } catch (err) {
    console.error('Error writing data_store.json:', err);
    return false;
  }
}

// Monotonic revision counter persisted inside data_store.json for fast multi-device polling
let currentRevision = (() => {
  const existing = readServerData();
  const rev = Number(existing?.revision);
  return Number.isFinite(rev) && rev > 0 ? rev : Date.now();
})();

function nextRevision(): number {
  const now = Date.now();
  currentRevision = now > currentRevision ? now : currentRevision + 1;
  return currentRevision;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Sistem Informasi Kas Warga & Server Desa Kotayasa',
    revision: currentRevision,
    time: new Date().toISOString(),
  });
});

// Lightweight revision check for mobile WebViews / browsers where SSE may stall
app.get('/api/sync-check', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const since = Number(req.query.since || 0);
  const existing = readServerData();
  const rev = Number(existing?.revision) || currentRevision;
  if (rev > currentRevision) currentRevision = rev;
  res.json({
    success: true,
    revision: currentRevision,
    lastUpdated: existing?.lastUpdated || null,
    hasData: Boolean(existing),
    changed: Boolean(existing) && since !== currentRevision,
  });
});

// Real-time Server-Sent Events (SSE) Clients so Median, Web, Warga, Admin & Server stay live-synced
const sseClients = new Set<express.Response>();

function broadcastSyncEvent(type: 'sync' | 'reset', data: any) {
  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify({ type, timestamp: new Date().toISOString(), data })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function toEpochMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function mergeServerEntities<T extends { id: string; updatedAt?: string }>(
  existingList: T[],
  incomingList: T[],
  deletedIds: string[],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result: T[] = [];

  for (const item of existingList) {
    if (!deletedSet.has(item.id)) {
      result.push(item);
    }
  }

  for (const inc of incomingList) {
    if (!inc || !inc.id || deletedSet.has(inc.id)) continue;
    const idx = result.findIndex(
      (ex) => ex.id === inc.id || (altMatch ? altMatch(ex, inc) : false)
    );
    if (idx === -1) {
      result.push(inc);
    } else {
      const existingItem = result[idx];
      const incTs = toEpochMs(inc.updatedAt);
      const exTs = toEpochMs(existingItem.updatedAt);
      if (incTs >= exTs) {
        result[idx] = inc;
      }
    }
  }

  return result;
}

function unionIdLists(...lists: Array<string[] | undefined>): string[] {
  const s = new Set<string>();
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const id of list) {
        if (id) s.add(String(id));
      }
    }
  }
  return Array.from(s).slice(-2000);
}

// GET /api/stream - Live Server-Sent Events stream across all installed apps, Median WebViews & browsers
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);

  const snapshot = readServerData();
  if (snapshot) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'sync', timestamp: new Date().toISOString(), data: snapshot })}\n\n`);
    } catch {
      // ignore
    }
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// GET Database - Seluruh data yang tersimpan aman di server
app.get('/api/data', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const data = readServerData();
  if (data && typeof data.revision === 'number' && data.revision > currentRevision) {
    currentRevision = data.revision;
  }
  res.json({
    success: true,
    data: data ? { ...data, revision: data.revision || currentRevision } : null,
    revision: currentRevision,
    timestamp: new Date().toISOString(),
  });
});

// Shared non-destructive multi-device merge helper
function mergeAndSaveServerState(
  existing: any,
  payload: any,
  options?: { reviveAdminIds?: string[] }
) {
  const existingDeleted = existing?.deletedIds || {};
  const incomingDeleted = payload?.deletedIds || {};
  const reviveSet = new Set((options?.reviveAdminIds || []).filter(Boolean));

  const mergedDeletedAdmins = unionIdLists(
    existingDeleted.adminAccounts,
    incomingDeleted.adminAccounts
  ).filter((id) => !reviveSet.has(id));

  const deletedIds = {
    warga: unionIdLists(existingDeleted.warga, incomingDeleted.warga, payload?.deletedWargaIds),
    transactions: unionIdLists(existingDeleted.transactions, incomingDeleted.transactions),
    bantuan: unionIdLists(existingDeleted.bantuan, incomingDeleted.bantuan),
    pengumuman: unionIdLists(existingDeleted.pengumuman, incomingDeleted.pengumuman, payload?.deletedPengumumanIds),
    dokumen: unionIdLists(existingDeleted.dokumen, incomingDeleted.dokumen),
    adminAccounts: mergedDeletedAdmins,
    laporanBulananRT: unionIdLists(existingDeleted.laporanBulananRT, incomingDeleted.laporanBulananRT),
  };

  const mergedAdmins = mergeServerEntities(
    Array.isArray(existing?.adminAccounts) ? existing.adminAccounts : [],
    Array.isArray(payload?.adminAccounts) ? payload.adminAccounts : [],
    deletedIds.adminAccounts,
    (a: any, b: any) => String(a.username || '').toLowerCase() === String(b.username || '').toLowerCase()
  );

  const mergedWarga = mergeServerEntities(
    Array.isArray(existing?.wargaList) ? existing.wargaList : [],
    Array.isArray(payload?.wargaList) ? payload.wargaList : [],
    deletedIds.warga,
    (a: any, b: any) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
  );

  const mergedTx = mergeServerEntities(
    Array.isArray(existing?.transactions) ? existing.transactions : [],
    Array.isArray(payload?.transactions) ? payload.transactions : [],
    deletedIds.transactions
  );

  const mergedPengumuman = mergeServerEntities(
    Array.isArray(existing?.pengumumanList) ? existing.pengumumanList : [],
    Array.isArray(payload?.pengumumanList) ? payload.pengumumanList : [],
    deletedIds.pengumuman
  );

  const mergedBantuan = mergeServerEntities(
    Array.isArray(existing?.bantuanList) ? existing.bantuanList : [],
    Array.isArray(payload?.bantuanList) ? payload.bantuanList : [],
    deletedIds.bantuan
  );

  const mergedDokumen = mergeServerEntities(
    Array.isArray(existing?.dokumenList) ? existing.dokumenList : [],
    Array.isArray(payload?.dokumenList) ? payload.dokumenList : [],
    deletedIds.dokumen
  );

  const mergedLaporan = mergeServerEntities(
    Array.isArray(existing?.laporanBulananRT) ? existing.laporanBulananRT : [],
    Array.isArray(payload?.laporanBulananRT) ? payload.laporanBulananRT : [],
    deletedIds.laporanBulananRT
  );

  // Protect newer pengaturanKas from being overwritten by older client cache
  const existingSettingsTs = toEpochMs(existing?.pengaturanKas?.updatedAt);
  const incomingSettingsTs = toEpochMs(payload?.pengaturanKas?.updatedAt);
  const mergedPengaturanKas =
    !existing?.pengaturanKas || (payload?.pengaturanKas && incomingSettingsTs >= existingSettingsTs)
      ? payload?.pengaturanKas || existing?.pengaturanKas
      : existing?.pengaturanKas;
  const mergedTahunAktif =
    !existing?.pengaturanKas || (payload?.pengaturanKas && incomingSettingsTs >= existingSettingsTs)
      ? payload?.tahunAktif || existing?.tahunAktif || 2026
      : existing?.tahunAktif || payload?.tahunAktif || 2026;

  const rev = nextRevision();
  const mergedData = {
    version: 2,
    revision: rev,
    lastUpdated: new Date().toISOString(),
    tahunAktif: mergedTahunAktif,
    pengaturanKas: mergedPengaturanKas,
    wargaList: mergedWarga,
    adminAccounts: mergedAdmins,
    transactions: mergedTx,
    pengumumanList: mergedPengumuman,
    bantuanList: mergedBantuan,
    dokumenList: mergedDokumen,
    laporanBulananRT: mergedLaporan,
    deletedIds,
  };

  const ok = writeServerData(mergedData);
  if (ok) broadcastSyncEvent('sync', mergedData);
  return { ok, mergedData, revision: rev };
}

// GET /api/admin-accounts - Authoritative registry of admin accounts currently persisted on server
app.get('/api/admin-accounts', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const existing = readServerData();
  if (existing && typeof existing.revision === 'number' && existing.revision > currentRevision) {
    currentRevision = existing.revision;
  }
  const list = Array.isArray(existing?.adminAccounts) ? existing.adminAccounts : [];
  res.json({
    success: true,
    adminAccounts: list,
    deletedAdminIds: existing?.deletedIds?.adminAccounts || [],
    serverHasData: Boolean(existing),
    revision: currentRevision,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/admin/sync-account - Register/sync an Admin RT account & all device-held data safely to Server
app.post('/api/admin/sync-account', (req, res) => {
  const { account, syncData, deletedIds, allowOverwrite } = req.body || {};
  const username = String(account?.username || '').trim();
  const passwordHash = String(account?.passwordHash || '').trim();

  if (!account || !username || !passwordHash) {
    return res.status(400).json({
      success: false,
      message: 'Username dan password akun admin harus diisi untuk sinkronisasi ke server.',
    });
  }

  const existing = readServerData() || {};
  const existingAdmins: any[] = Array.isArray(existing.adminAccounts) ? existing.adminAccounts : [];
  const existingMatch = existingAdmins.find(
    (a) => String(a.username || '').trim().toLowerCase() === username.toLowerCase()
  );

  if (existingMatch && !allowOverwrite && existingMatch.passwordHash !== passwordHash) {
    return res.status(403).json({
      success: false,
      message:
        'Username admin tersebut sudah terdaftar di server dengan password berbeda. Gunakan password yang benar atau hubungi Server Pusat.',
    });
  }

  const nowIso = new Date().toISOString();
  const nowLabel = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const targetId = String(existingMatch?.id || account.id || `adm_${Date.now()}`);
  const stampedAccount = {
    ...(existingMatch || {}),
    ...account,
    id: targetId,
    username,
    passwordHash,
    nama: String(account.nama || existingMatch?.nama || `Admin RT ${account.rt || '08'}`),
    rt: String(account.rt || existingMatch?.rt || '08'),
    rw: String(account.rw || existingMatch?.rw || '05'),
    kontak: String(account.kontak || existingMatch?.kontak || ''),
    jabatan: String(account.jabatan || existingMatch?.jabatan || `Ketua RT ${account.rt || '08'}`),
    status: (existingMatch?.status === 'nonaktif' ? 'nonaktif' : account.status === 'nonaktif' ? 'nonaktif' : 'aktif'),
    terakhirLogin: account.terakhirLogin || nowLabel,
    terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
    updatedAt: nowIso,
  };

  if (stampedAccount.status === 'nonaktif') {
    return res.status(403).json({
      success: false,
      message: `Akun Admin ${stampedAccount.nama} berstatus nonaktif di Server Pusat.`,
    });
  }

  const incomingSync = syncData && typeof syncData === 'object' ? syncData : {};
  const incomingAdmins = Array.isArray(incomingSync.adminAccounts) ? incomingSync.adminAccounts : [];
  const nextAdminsPayload = [
    stampedAccount,
    ...incomingAdmins.filter(
      (a: any) =>
        a &&
        a.id !== targetId &&
        String(a.username || '').trim().toLowerCase() !== username.toLowerCase()
    ),
  ];

  const payloadForMerge = {
    ...incomingSync,
    adminAccounts: nextAdminsPayload,
    deletedIds: deletedIds || incomingSync.deletedIds || {},
  };

  const reviveIds = [targetId, account.id, existingMatch?.id].filter(Boolean) as string[];
  if (username.toLowerCase() === 'admin') {
    reviveIds.push('adm_rt08');
  }

  const { ok, mergedData, revision } = mergeAndSaveServerState(existing, payloadForMerge, {
    reviveAdminIds: reviveIds,
  });

  if (!ok) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan sinkronisasi akun admin ke server.',
    });
  }

  const confirmedAccount =
    mergedData.adminAccounts.find(
      (a: any) => String(a.username || '').trim().toLowerCase() === username.toLowerCase()
    ) || stampedAccount;

  return res.json({
    success: true,
    message: `Akun Admin "${confirmedAccount.username}" dan seluruh datanya berhasil terdaftar & tersinkron ke Server Pusat.`,
    account: confirmedAccount,
    data: mergedData,
    revision,
    timestamp: nowIso,
  });
});

// POST Database - Sinkronisasi aman dengan proteksi multi-perangkat & tombstone merge
app.post('/api/data', (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ success: false, message: 'Data kosong' });
  }

  // Jika admin secara sadar melakukan Hard Reset via menu server
  if (payload.isHardReset === true) {
    const rev = nextRevision();
    const cleanPayload = {
      ...payload,
      isHardReset: undefined,
      revision: rev,
      deletedIds: {
        warga: [],
        transactions: [],
        bantuan: [],
        pengumuman: [],
        dokumen: [],
        adminAccounts: [],
        laporanBulananRT: [],
      },
      lastUpdated: new Date().toISOString(),
    };
    const ok = writeServerData(cleanPayload);
    if (ok) broadcastSyncEvent('reset', cleanPayload);
    return res.json({
      success: ok,
      data: cleanPayload,
      revision: rev,
      message: 'Database server berhasil direset secara bersih',
      timestamp: new Date().toISOString(),
    });
  }

  const existing = readServerData() || {};
  const { ok, mergedData, revision } = mergeAndSaveServerState(existing, payload);

  res.json({
    success: ok,
    message: ok ? 'Data berhasil disinkronisasi & diamankan permanen di server' : 'Gagal menyimpan ke server',
    data: mergedData,
    revision,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/warga - Akses daftar warga langsung dari server
app.get('/api/warga', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const current = readServerData() || {};
  res.json({
    success: true,
    wargaList: current.wargaList || [],
    totalWarga: (current.wargaList || []).length,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/warga - Simpan atau perbarui data warga secara langsung ke file server & broadcast live
app.post('/api/warga', (req, res) => {
  const { warga } = req.body || {};
  if (!warga || !warga.noKK) {
    return res.status(400).json({ success: false, message: 'Data warga tidak lengkap' });
  }

  const nowIso = new Date().toISOString();
  const stampedWarga = { ...warga, updatedAt: warga.updatedAt || nowIso };

  const current = readServerData() || {};
  const currentWarga: any[] = Array.isArray(current.wargaList) ? current.wargaList : [];
  const idx = currentWarga.findIndex((w) => w.id === stampedWarga.id || w.noKK === stampedWarga.noKK);

  const updatedList = [...currentWarga];
  if (idx >= 0) {
    updatedList[idx] = { ...updatedList[idx], ...stampedWarga };
  } else {
    updatedList.unshift(stampedWarga);
  }

  current.wargaList = updatedList;
  current.revision = nextRevision();
  current.lastUpdated = nowIso;
  writeServerData(current);
  broadcastSyncEvent('sync', current);

  res.json({
    success: true,
    message: `Data warga ${stampedWarga.nama} berhasil tersimpan aman di server`,
    warga: stampedWarga,
    totalWarga: updatedList.length,
    revision: current.revision,
    timestamp: nowIso,
  });
});

// DELETE /api/warga/:id - Hapus data warga dari server secara eksplisit & catat tombstone
app.delete('/api/warga/:id', (req, res) => {
  const { id } = req.params;
  const current = readServerData() || {};
  const currentWarga: any[] = Array.isArray(current.wargaList) ? current.wargaList : [];
  const updatedList = currentWarga.filter((w) => w.id !== id && w.noKK !== id);

  const existingDeleted = current.deletedIds || {};
  current.deletedIds = {
    ...existingDeleted,
    warga: unionIdLists(existingDeleted.warga, [id]),
  };
  current.wargaList = updatedList;
  current.revision = nextRevision();
  current.lastUpdated = new Date().toISOString();
  writeServerData(current);
  broadcastSyncEvent('sync', current);

  res.json({
    success: true,
    message: 'Data warga berhasil dihapus dari server',
    totalWarga: updatedList.length,
    revision: current.revision,
    timestamp: new Date().toISOString(),
  });
});

// POST Monthly RT Update to Server
app.post('/api/sync-monthly', (req, res) => {
  const report = req.body;
  const currentData = readServerData() || {};
  const currentReports = currentData.laporanBulananRT || [];
  const nowIso = new Date().toISOString();
  const stampedReport = { ...report, updatedAt: report.updatedAt || nowIso };

  const updatedReports = [
    stampedReport,
    ...currentReports.filter((r: any) => r.id !== stampedReport.id),
  ];

  currentData.laporanBulananRT = updatedReports;
  currentData.revision = nextRevision();
  currentData.lastUpdated = nowIso;
  writeServerData(currentData);
  broadcastSyncEvent('sync', currentData);

  res.json({
    success: true,
    message: `Laporan bulanan ${report.rt || 'RT'} berhasil diterima server desa`,
    revision: currentData.revision,
    timestamp: nowIso,
  });
});

// GET Template Excel (.xlsx) resmi dengan header MIME Excel asli (aman untuk Android WebView, Mobile & Desktop)
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
});

// Start Full-Stack Server
async function start() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Rukun Tetangga berjalan aktif di port ${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Fatal error starting server:', err);
});
