import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data_store.json');

// Body parser
app.use(express.json({ limit: '25mb' }));

// Helper to read server data
function readServerData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading data_store.json:', err);
  }
  return null;
}

// Helper to write server data
function writeServerData(data: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

// GET Database
app.get('/api/data', (req, res) => {
  const data = readServerData();
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
});

// POST Database
app.post('/api/data', (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ success: false, message: 'Data kosong' });
  }

  const ok = writeServerData(payload);
  res.json({
    success: ok,
    message: ok ? 'Data berhasil disimpan aman di server' : 'Gagal menyimpan ke server',
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Rukun Tetangga berjalan aktif di port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal error starting server:', err);
});
