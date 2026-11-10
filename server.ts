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

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const cleanMime = (mimeType || 'image/jpeg').split(';')[0].trim();
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

    const prompt = `Anda adalah sistem OCR AI kependudukan resmi Republik Indonesia untuk membaca dokumen KARTU KELUARGA (KK).
Baca dokumen Kartu Keluarga ini secara SANGAT TELITI, DETAIL, dan AKURAT sesuai apa yang tertulis fisik pada foto dokumen.

PANDUAN STRUKTUR DOKUMEN KARTU KELUARGA (KK):
1. NOMOR KARTU KELUARGA (No. KK):
   - Terletak di bagian atas formulir di bawah teks "KARTU KELUARGA".
   - Terdiri dari 16 digit angka murni (contoh: "3302211101230002").
   - Kembalikan HANYA 16 digit angka tanpa teks "No." atau tanda titik/strip.

2. IDENTITAS KEPALA KELUARGA & ALAMAT (HEADER 2 KOLOM):
   - "Nama Kepala Keluarga": Ekstrak HANYA nama orang kepala keluarga (contoh: "ALI PAMUJI").
     PERHATIAN SANGAT PENTING: JANGAN PERNAH menyertakan teks dari kolom kanan atau label formulir seperti "Desa/Kelurahan", "Kecamatan", "Kabupaten", "Alamat", "RT", "RW". Bersihkan label tersebut!
   - "Alamat": Jalan, Dusun, atau Lingkungan tempat tinggal.
   - "RT": Angka RT (misal "008" atau "08").
   - "RW": Angka RW (misal "005" atau "05").
   - "Desa/Kelurahan": Nama Desa/Kelurahan (misal "Kotayasa").
   - "Kecamatan": Nama Kecamatan (misal "Sumbang").

3. TABEL ANGGOTA KELUARGA (WAJIB EKSTRAK SELURUH ANGGOTA):
   - Dokumen KK memiliki tabel data anggota keluarga dengan nomor urut (1, 2, 3, dst).
   - Ekstrak SETIAP baris anggota keluarga yang tercantum. JANGAN SAMPAI ADA ANGGOTA YANG TERTINGGAL (jangan hanya baris pertama).
   - Untuk setiap baris anggota keluarga:
     * nik: Tepat 16 digit angka NIK dari kolom NIK. Pastikan angka NIK akurat dan tidak tertukar.
     * nama: Nama lengkap anggota keluarga dari kolom Nama Lengkap. HANYA nama orang, jangan gabungkan teks lain.
     * hubungan: Status Hubungan Dalam Keluarga (contoh: "Kepala Keluarga", "Istri", "Anak", "Orang Tua", "Mertua", "Famili Lain").
     * jenisKelamin: "Laki-laki" atau "Perempuan" sesuai kolom Jenis Kelamin.
     * tempatLahir: Nama tempat/kota lahir.
     * tanggalLahir: Tanggal lahir (format DD-MM-YYYY atau YYYY-MM-DD).
     * agama: Agama (Islam, Kristen, Katholik, Hindu, Buddha, Konghucu).
     * pekerjaan: Jenis Pekerjaan (Wiraswasta, Mengurus Rumah Tangga, Pelajar/Mahasiswa, Karyawan Swasta, Petani, dll).
     * statusPerkawinan: "Kawin", "Belum Kawin", "Cerai Hidup", "Cerai Mati".

ATURAN MUTLAK:
- DILARANG MENGARANG DATA.
- Jika ada 3 atau 4 orang dalam KK, kembalikan 3 atau 4 objek dalam array anggotaKeluarga.
- Pastikan noKK dan seluruh nik berformat tepat 16 digit angka murni.`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let response: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
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
                noKK: { type: Type.STRING, description: '16 digit angka Nomor Kartu Keluarga murni' },
                nama: { type: Type.STRING, description: 'Nama Kepala Keluarga SAJA (tanpa Desa/Kelurahan)' },
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
                      nik: { type: Type.STRING, description: '16 digit angka NIK anggota keluarga' },
                      nama: { type: Type.STRING, description: 'Nama Lengkap anggota keluarga' },
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

        if (response && response.text) {
          break; // Berhasil!
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} gagal atau sibuk, mencoba model cadangan...`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Gagal menghubungi engine AI.');
    }

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    // Sanitasi Nama dari label formulir KK yang tidak sengaja tertempel
    const sanitizeName = (raw: string) => {
      if (!raw) return '';
      let s = raw.trim();
      s = s.replace(/^(?:no\.?\s*)?\d+[\s.-]*/i, '').trim();
      s = s.replace(/^(?:nama\s*kepala\s*keluarga|nama\s*lengkap|nama)\s*[:=]\s*/i, '').trim();
      s = s.split(/(?:\b|(?<=[a-z]))(?:desa\s*[\/\.]?\s*kelurahan|desakelurahan|desa|kelurahan|kecamatan|kabupaten|kota|provinsi|kodepos|kode\s*pos|rt\s*[\/\.]?\s*rw|rt|rw|dusun|alamat)\b/i)[0].trim();
      s = s.replace(/[^a-zA-Z\s.,'-]/g, ' ').trim();
      return s.replace(/\s+/g, ' ');
    };

    const cleanNoKK = (parsed.noKK || '').replace(/\D/g, '').slice(0, 16);
    const cleanKepalaNama = sanitizeName(parsed.nama || '');

    const sanitizedMembers = Array.isArray(parsed.anggotaKeluarga)
      ? parsed.anggotaKeluarga.map((m: any, idx: number) => {
          const mNama = sanitizeName(m.nama || (idx === 0 ? cleanKepalaNama : `Anggota #${idx + 1}`));
          const mNik = (m.nik || '').replace(/\D/g, '').slice(0, 16);
          const mHubungan = (m.hubungan || (idx === 0 ? 'Kepala Keluarga' : idx === 1 ? 'Istri' : 'Anak')).trim();
          const mGender = (m.jenisKelamin || '').toLowerCase().includes('perempuan') ? 'Perempuan' : 'Laki-laki';

          return {
            nik: mNik,
            nama: mNama,
            hubungan: mHubungan,
            jenisKelamin: mGender,
            tempatLahir: (m.tempatLahir || '').trim(),
            tanggalLahir: (m.tanggalLahir || '').trim(),
            agama: (m.agama || 'Islam').trim(),
            pekerjaan: (m.pekerjaan || '').trim(),
            statusPerkawinan: (m.statusPerkawinan || (idx === 0 ? 'Kawin' : 'Belum Kawin')).trim(),
          };
        })
      : [];

    // Jika anggota keluarga kosong tetapi kepala keluarga ada, buat entry kepala keluarga
    if (sanitizedMembers.length === 0 && (cleanKepalaNama || cleanNoKK)) {
      sanitizedMembers.push({
        nik: cleanNoKK,
        nama: cleanKepalaNama || 'Kepala Keluarga',
        hubungan: 'Kepala Keluarga',
        jenisKelamin: parsed.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
        tempatLahir: '',
        tanggalLahir: '',
        agama: 'Islam',
        pekerjaan: '',
        statusPerkawinan: 'Kawin',
      });
    }

    const finalData = {
      noKK: cleanNoKK,
      nama: cleanKepalaNama || (sanitizedMembers[0]?.nama || ''),
      alamat: parsed.alamat || 'RT 08 RW 05 Desa Kotayasa',
      rt: (parsed.rt || '08').replace(/\D/g, '').padStart(2, '0').slice(0, 2),
      rw: (parsed.rw || '05').replace(/\D/g, '').padStart(2, '0').slice(0, 2),
      jenisKelamin: parsed.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
      jumlahJiwa: sanitizedMembers.length || 1,
      anggotaKeluarga: sanitizedMembers,
    };

    return res.json({
      success: true,
      data: finalData,
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
