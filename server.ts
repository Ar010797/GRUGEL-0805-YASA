import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

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

// POST OCR / AI Scan Kartu Keluarga (KK)
app.post('/api/scan-kk', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Foto KK tidak ditemukan' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        noKey: true,
        message: 'API Key Gemini belum diset di server.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Anda adalah sistem OCR kependudukan resmi Republik Indonesia untuk membaca Kartu Keluarga (KK).
Baca dokumen Kartu Keluarga ini secara SANGAT TELITI dan AKURAT sesuai apa yang tertulis fisik pada foto.
ATURAN MUTLAK:
- DILARANG MENGARANG NAMA, NIK, ATAU NOMOR KK.
- DILARANG MENGACAK DATA. Ekstrak teks asli apa adanya.
- Pastikan noKK tepat 16 digit.
- Pastikan setiap nik tepat 16 digit angka.
- Ekstrak seluruh anggota keluarga pada tabel Kartu Keluarga.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            noKK: { type: Type.STRING, description: '16 digit Nomor Kartu Keluarga' },
            nama: { type: Type.STRING, description: 'Nama Kepala Keluarga' },
            alamat: { type: Type.STRING },
            rt: { type: Type.STRING },
            rw: { type: Type.STRING },
            jenisKelamin: { type: Type.STRING },
            jumlahJiwa: { type: Type.INTEGER },
            anggotaKeluarga: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nik: { type: Type.STRING, description: '16 digit NIK' },
                  nama: { type: Type.STRING, description: 'Nama Lengkap' },
                  hubungan: { type: Type.STRING, description: 'Kepala Keluarga, Istri, Anak, dll' },
                  jenisKelamin: { type: Type.STRING },
                  tempatLahir: { type: Type.STRING },
                  tanggalLahir: { type: Type.STRING },
                  agama: { type: Type.STRING },
                  pekerjaan: { type: Type.STRING },
                  statusPerkawinan: { type: Type.STRING },
                },
                required: ['nik', 'nama', 'hubungan'],
              },
            },
          },
          required: ['noKK', 'nama', 'anggotaKeluarga'],
        },
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error('Error in /api/scan-kk:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Gagal menganalisis dokumen Kartu Keluarga.',
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
