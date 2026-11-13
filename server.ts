import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data_store.json');

// Body parser & CORS
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Sistem Informasi Kas Warga & Server Desa Kotayasa',
    time: new Date().toISOString(),
  });
});

// GET Database - Seluruh data yang tersimpan aman di server
app.get('/api/data', (req, res) => {
  const data = readServerData();
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
});

// POST Database - Sinkronisasi aman dengan proteksi multi-perangkat (tidak menghapus akun yang sudah ada)
app.post('/api/data', (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ success: false, message: 'Data kosong' });
  }

  // Jika admin secara sadar melakukan Hard Reset via menu server
  if (payload.isHardReset === true) {
    const ok = writeServerData(payload);
    return res.json({
      success: ok,
      message: 'Database server berhasil direset secara bersih',
      timestamp: new Date().toISOString(),
    });
  }

  // Proteksi data server: Lakukan smart-merge agar akun & data yang sudah masuk server tidak tertimpa/hilang saat dibuka dari HP lain
  const existing = readServerData() || {};

  // 1. Merge Admin Accounts (Akun Admin RT tidak boleh hilang)
  const existingAdmins = Array.isArray(existing.adminAccounts) ? existing.adminAccounts : [];
  const incomingAdmins = Array.isArray(payload.adminAccounts) ? payload.adminAccounts : [];
  const mergedAdmins = [...incomingAdmins];
  for (const ea of existingAdmins) {
    if (!mergedAdmins.some((a) => a.username.toLowerCase() === ea.username.toLowerCase())) {
      mergedAdmins.push(ea);
    }
  }

  // 2. Merge Warga List (Akun & data warga di server tetap aman walau HP berbeda masuk aplikasi)
  const existingWarga = Array.isArray(existing.wargaList) ? existing.wargaList : [];
  const incomingWarga = Array.isArray(payload.wargaList) ? payload.wargaList : [];
  const deletedWargaIds: string[] = Array.isArray(payload.deletedWargaIds) ? payload.deletedWargaIds : [];

  let mergedWarga = [...incomingWarga];
  for (const ew of existingWarga) {
    // Jika tidak ada di daftar hapus dan belum ada di incoming, PERTAHANKAN data warga di server
    if (!deletedWargaIds.includes(ew.id) && !mergedWarga.some((w) => w.id === ew.id || w.noKK === ew.noKK)) {
      mergedWarga.push(ew);
    }
  }

  // 3. Merge Transactions (Kas warga tetap utuh 100%)
  const existingTx = Array.isArray(existing.transactions) ? existing.transactions : [];
  const incomingTx = Array.isArray(payload.transactions) ? payload.transactions : [];
  const mergedTx = [...incomingTx];
  for (const et of existingTx) {
    if (!mergedTx.some((t) => t.id === et.id)) {
      mergedTx.push(et);
    }
  }

  // 4. Merge Pengumuman
  const existingPengumuman = Array.isArray(existing.pengumumanList) ? existing.pengumumanList : [];
  const incomingPengumuman = Array.isArray(payload.pengumumanList) ? payload.pengumumanList : [];
  const deletedPengumumanIds: string[] = Array.isArray(payload.deletedPengumumanIds) ? payload.deletedPengumumanIds : [];
  const mergedPengumuman = [...incomingPengumuman];
  for (const ep of existingPengumuman) {
    if (!deletedPengumumanIds.includes(ep.id) && !mergedPengumuman.some((p) => p.id === ep.id)) {
      mergedPengumuman.push(ep);
    }
  }

  // 5. Merge Bantuan & Dokumen
  const existingBantuan = Array.isArray(existing.bantuanList) ? existing.bantuanList : [];
  const incomingBantuan = Array.isArray(payload.bantuanList) ? payload.bantuanList : [];
  const mergedBantuan = [...incomingBantuan];
  for (const eb of existingBantuan) {
    if (!mergedBantuan.some((b) => b.id === eb.id)) {
      mergedBantuan.push(eb);
    }
  }

  const existingDokumen = Array.isArray(existing.dokumenList) ? existing.dokumenList : [];
  const incomingDokumen = Array.isArray(payload.dokumenList) ? payload.dokumenList : [];
  const mergedDokumen = [...incomingDokumen];
  for (const ed of existingDokumen) {
    if (!mergedDokumen.some((d) => d.id === ed.id)) {
      mergedDokumen.push(ed);
    }
  }

  const mergedData = {
    ...existing,
    ...payload,
    version: 2,
    lastUpdated: new Date().toISOString(),
    wargaList: mergedWarga,
    adminAccounts: mergedAdmins,
    transactions: mergedTx,
    pengumumanList: mergedPengumuman,
    bantuanList: mergedBantuan,
    dokumenList: mergedDokumen,
  };

  const ok = writeServerData(mergedData);
  res.json({
    success: ok,
    message: ok ? 'Data berhasil disinkronisasi & diamankan permanen di server' : 'Gagal menyimpan ke server',
    data: mergedData,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/warga - Akses daftar warga langsung dari server
app.get('/api/warga', (req, res) => {
  const current = readServerData() || {};
  res.json({
    success: true,
    wargaList: current.wargaList || [],
    totalWarga: (current.wargaList || []).length,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/warga - Simpan atau perbarui data warga secara langsung ke file server
app.post('/api/warga', (req, res) => {
  const { warga } = req.body || {};
  if (!warga || !warga.noKK) {
    return res.status(400).json({ success: false, message: 'Data warga tidak lengkap' });
  }

  const current = readServerData() || {};
  const currentWarga: any[] = Array.isArray(current.wargaList) ? current.wargaList : [];
  const idx = currentWarga.findIndex((w) => w.id === warga.id || w.noKK === warga.noKK);

  let updatedList = [...currentWarga];
  if (idx >= 0) {
    updatedList[idx] = { ...updatedList[idx], ...warga };
  } else {
    updatedList.unshift(warga);
  }

  current.wargaList = updatedList;
  current.lastUpdated = new Date().toISOString();
  writeServerData(current);

  res.json({
    success: true,
    message: `Data warga ${warga.nama} berhasil tersimpan aman di server`,
    warga,
    totalWarga: updatedList.length,
    timestamp: new Date().toISOString(),
  });
});

// DELETE /api/warga/:id - Hapus data warga dari server secara eksplisit
app.delete('/api/warga/:id', (req, res) => {
  const { id } = req.params;
  const current = readServerData() || {};
  const currentWarga: any[] = Array.isArray(current.wargaList) ? current.wargaList : [];
  const updatedList = currentWarga.filter((w) => w.id !== id && w.noKK !== id);

  current.wargaList = updatedList;
  current.lastUpdated = new Date().toISOString();
  writeServerData(current);

  res.json({
    success: true,
    message: 'Data warga berhasil dihapus dari server',
    totalWarga: updatedList.length,
    timestamp: new Date().toISOString(),
  });
});

// POST Monthly RT Update to Server
app.post('/api/sync-monthly', (req, res) => {
  const report = req.body;
  const currentData = readServerData() || {};
  const currentReports = currentData.laporanBulananRT || [];

  const updatedReports = [
    report,
    ...currentReports.filter((r: any) => r.id !== report.id),
  ];

  currentData.laporanBulananRT = updatedReports;
  currentData.lastUpdated = new Date().toISOString();
  writeServerData(currentData);

  res.json({
    success: true,
    message: `Laporan bulanan ${report.rt || 'RT'} berhasil diterima server desa`,
    timestamp: new Date().toISOString(),
  });
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
