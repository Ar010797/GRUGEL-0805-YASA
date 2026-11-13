import * as XLSX from 'xlsx';
import { PRESET_JENIS_BANTUAN } from '../types.ts';

export interface TemplateProfilRT {
  rt?: string;
  rw?: string;
  desa?: string;
}

/**
 * Header struktur Blok Kartu Keluarga (sesuai format Data_KK_Warga_RT):
 * - Kolom A (NAMA LENGKAP): Baris 1 keluarga berisi Nama Kepala Keluarga, baris tepat di bawahnya berisi No/ID KK 16 digit.
 * - Kolom B s.d. X: Daftar seluruh Anggota Keluarga + identitas lengkap + Bantuan Pemerintah.
 */
export const TEMPLATE_HEADERS = [
  'NAMA LENGKAP',
  'ANGGOTA KELUARGA',
  'NIK',
  'JENIS KELAMIN',
  'STATUS HUBUNGAN',
  'TEMPAT LAHIR',
  'TGL LAHIR',
  'STATUS PERKAWINAN',
  'NIKAH',
  'AGAMA',
  'PENDIDIKAN',
  'PEKERJAAN',
  'GOLONGAN DARAH',
  'KEWARGANEGARAAN',
  'NAMA AYAH',
  'NAMA IBU',
  'NO HP',
  'ALAMAT',
  'RT',
  'RW',
  'NO RUMAH',
  'STATUS IURAN',
  'JENIS BANTUAN',
  'NOMINAL BANTUAN',
  'TANGGAL BANTUAN',
  'STATUS BANTUAN',
  'SUMBER DANA BANTUAN',
  'KETERANGAN BANTUAN',
];

export const BANTUAN_SHEET_HEADERS = [
  'No',
  'No KK',
  'NIK Penerima',
  'Nama Penerima',
  'Jenis Bantuan',
  'Nominal / Barang Bantuan',
  'Tanggal Bantuan',
  'Status Bantuan',
  'Sumber Dana',
  'Keterangan',
];

function applyTextFormattingToSheet(ws: XLSX.WorkSheet, textColumnIndices: number[]) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    for (const C of textColumnIndices) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) {
        cell.t = 's';
        cell.v = cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
        cell.z = '@';
      }
    }
  }
}

export function getTemplateExcelFilename(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return `Template_Import_Warga_KK_Bansos_${dateStr}.xlsx`;
}

export function getTemplateExcelDownloadUrl(profilRT?: TemplateProfilRT): string {
  const filename = getTemplateExcelFilename();
  const rt = (profilRT?.rt || '08').replace(/\D/g, '').padStart(2, '0').slice(-2) || '08';
  const rw = (profilRT?.rw || '05').replace(/\D/g, '').padStart(2, '0').slice(-2) || '05';
  const desa = profilRT?.desa ? `?desa=${encodeURIComponent(profilRT.desa)}` : '';
  return `/api/template-excel-rt/${rt}/${rw}/${encodeURIComponent(filename)}${desa}`;
}

export function getCleanTemplateExcelDownloadUrl(profilRT?: TemplateProfilRT): string {
  const filename = getTemplateExcelFilename();
  const rt = (profilRT?.rt || '08').replace(/\D/g, '').padStart(2, '0').slice(-2) || '08';
  const rw = (profilRT?.rw || '05').replace(/\D/g, '').padStart(2, '0').slice(-2) || '05';
  return `/api/template-excel-rt/${rt}/${rw}/${encodeURIComponent(filename)}`;
}

export function buildTemplateExcelWorkbook(profilRT?: TemplateProfilRT): XLSX.WorkBook {
  const rtDefault = (profilRT?.rt || '08').replace(/\D/g, '').padStart(2, '0').slice(-2) || '08';
  const rwDefault = (profilRT?.rw || '05').replace(/\D/g, '').padStart(2, '0').slice(-2) || '05';
  const desaDefault = profilRT?.desa || 'Desa Kotayasa';
  const alamatDefault = `RT ${rtDefault} RW ${rwDefault} ${desaDefault}`;

  // Susunan persis format Blok KK:
  // Baris pemisah berisi Nomor KK (1, 2, 3...) di kolom A,
  // Baris 1 keluarga: Kolom A = NAMA KEPALA KELUARGA, Kolom B+ = Anggota 1 (Kepala Keluarga)
  // Baris 2 keluarga: Kolom A = ID/NO KK (di bawah nama Kepala Keluarga), Kolom B+ = Anggota 2 (Istri) atau kosong bila KK tunggal
  // Baris 3+ keluarga: Kolom A = kosong, Kolom B+ = Anak / anggota berikutnya
  const sampleRows: (string | number)[][] = [
    TEMPLATE_HEADERS,
    [1],
    [
      'BUDI SANTOSO',
      'Budi Santoso',
      '3302210101850001',
      'L',
      'Kep.Keluarga',
      'Banyumas',
      '01-01-1985',
      'Kawin tercatat',
      '10-05-2012',
      'Islam',
      'SLTA/Sederajat',
      'Wiraswasta',
      'O',
      'WNI',
      'SUKIRMAN',
      'PARTINAH',
      '081234567890',
      alamatDefault,
      rtDefault,
      rwDefault,
      '01',
      'Sudah',
      'BPNT (Bantuan Pangan Non Tunai)',
      'Rp 600.000 / Triwulan',
      '2026-10-01',
      'Sudah Disalurkan',
      'Kemensos RI',
      'Penyaluran tahap berjalan via Kantor Pos',
    ],
    [
      '330221-010185-0001',
      'Siti Aminah',
      '3302215206880002',
      'P',
      'Istri',
      'Banyumas',
      '12-06-1988',
      'Kawin tercatat',
      '10-05-2012',
      'Islam',
      'SLTP/Sederajat',
      'Mengurus Rumah Tangga',
      'A',
      'WNI',
      'DARSONO',
      'SUMIYATI',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      '',
      'Rafa Pratama',
      '3302211408140003',
      'L',
      'Anak',
      'Banyumas',
      '14-08-2014',
      'Belum kawin',
      '-',
      'Islam',
      'Tamat SD/Sederajat',
      'Pelajar/Mahasiswa',
      'O',
      'WNI',
      'BUDI SANTOSO',
      'SITI AMINAH',
      '',
      '',
      '',
      '',
      '',
      '',
      'KIP / PIP Siswa & Pelajar',
      'Rp 450.000 / Semester',
      '2026-09-15',
      'Sudah Disalurkan',
      'Kemendikbud RI',
      'Bantuan pendidikan siswa SD/SMP',
    ],
    [2],
    [
      'HENDRA WIJAYA',
      'Hendra Wijaya',
      '3302210506880002',
      'L',
      'Kep.Keluarga',
      'Banyumas',
      '05-06-1988',
      'Kawin tercatat',
      '20-11-2016',
      'Islam',
      'Diploma IV/Strata I',
      'Karyawan Swasta',
      'B',
      'WNI',
      'SLAMET RIYADI',
      'MURTININGSIH',
      '085612345678',
      alamatDefault,
      rtDefault,
      rwDefault,
      '02',
      'Belum',
      'PKH (Program Keluarga Harapan)',
      'Rp 750.000 / Triwulan',
      '2026-10-05',
      'Proses Verifikasi',
      'Kemensos RI',
      'Menunggu jadwal penyaluran tahap berikutnya',
    ],
    [
      '330221-050688-0002',
      'Ratna Sari',
      '3302214809900001',
      'P',
      'Istri',
      'Purwokerto',
      '08-09-1990',
      'Kawin tercatat',
      '20-11-2016',
      'Islam',
      'SLTA/Sederajat',
      'Mengurus Rumah Tangga',
      'AB',
      'WNI',
      'SUWARDI',
      'TUTI HARYATI',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [3],
    [
      'SUTRISNO',
      'Sutrisno',
      '3302211203600001',
      'L',
      'Kep.Keluarga',
      'Banyumas',
      '12-03-1960',
      'Cerai mati',
      '-',
      'Islam',
      'SD/Sederajat',
      'Petani/Pekebun',
      'O',
      'WNI',
      'KARSO',
      'WAGINEM',
      '085200001122',
      alamatDefault,
      rtDefault,
      rwDefault,
      '03',
      'Sudah',
      'Bantuan Lansia Disabilitas',
      'Rp 300.000 / Bulan',
      '2026-10-01',
      'Sudah Disalurkan',
      'Dana Desa',
      'Contoh KK tunggal (1 anggota, No KK tepat di bawah nama)',
    ],
    ['330221-120360-0001'],
  ];

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Template Import Data KK Warga & Bantuan Pemerintah',
    Subject: 'Data Kependudukan Blok KK & Bansos RT',
    Author: `Pengurus RT ${rtDefault} RW ${rwDefault} ${desaDefault}`,
  };

  const wsMain = XLSX.utils.aoa_to_sheet(sampleRows);
  // Format text on Col A (No KK & Nama), C (NIK), G (Tgl Lahir), I (Tgl Nikah), Q (No HP), S (RT), T (RW), U (No Rumah)
  applyTextFormattingToSheet(wsMain, [0, 2, 6, 8, 16, 18, 19, 20]);

  wsMain['!cols'] = [
    { wch: 24 }, // A: NAMA LENGKAP / NO KK
    { wch: 26 }, // B: ANGGOTA KELUARGA
    { wch: 20 }, // C: NIK
    { wch: 14 }, // D: JENIS KELAMIN
    { wch: 16 }, // E: STATUS HUBUNGAN
    { wch: 16 }, // F: TEMPAT LAHIR
    { wch: 14 }, // G: TGL LAHIR
    { wch: 16 }, // H: STATUS PERKAWINAN
    { wch: 14 }, // I: NIKAH
    { wch: 12 }, // J: AGAMA
    { wch: 20 }, // K: PENDIDIKAN
    { wch: 22 }, // L: PEKERJAAN
    { wch: 14 }, // M: GOL DARAH
    { wch: 15 }, // N: KEWARGANEGARAAN
    { wch: 20 }, // O: NAMA AYAH
    { wch: 20 }, // P: NAMA IBU
    { wch: 16 }, // Q: NO HP
    { wch: 28 }, // R: ALAMAT
    { wch: 6 },  // S: RT
    { wch: 6 },  // T: RW
    { wch: 10 }, // U: NO RUMAH
    { wch: 12 }, // V: STATUS IURAN
    { wch: 28 }, // W: JENIS BANTUAN
    { wch: 22 }, // X: NOMINAL BANTUAN
    { wch: 15 }, // Y: TANGGAL BANTUAN
    { wch: 18 }, // Z: STATUS BANTUAN
    { wch: 22 }, // AA: SUMBER DANA
    { wch: 32 }, // AB: KETERANGAN BANTUAN
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, 'Data KK Halaman 1');

  const wsBantuan = XLSX.utils.aoa_to_sheet([BANTUAN_SHEET_HEADERS]);
  applyTextFormattingToSheet(wsBantuan, [1, 2]);
  wsBantuan['!cols'] = [
    { wch: 5 },
    { wch: 20 },
    { wch: 20 },
    { wch: 26 },
    { wch: 30 },
    { wch: 22 },
    { wch: 15 },
    { wch: 18 },
    { wch: 22 },
    { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBantuan, 'Data Bantuan Tambahan');

  const guideRows: string[][] = [
    ['PANDUAN PENGISIAN TEMPLATE IMPORT DATA KK WARGA & BANTUAN PEMERINTAH'],
    [''],
    ['1. FORMAT BLOK KARTU KELUARGA (SESUAI DATA_KK_WARGA_RT)'],
    ['- Kolom A (NAMA LENGKAP):'],
    ['  * Baris pemisah keluarga boleh diberi nomor urut (1, 2, 3, ...).'],
    ['  * Baris pertama anggota (Kepala Keluarga): isi Nama Kepala Keluarga pada Kolom A.'],
    ['  * Baris tepat di bawah Nama Kepala Keluarga pada Kolom A: isi Nomor/ID KK 16 digit (boleh pakai strip seperti 330221-010185-0001 atau angka murni 3302210101850001).'],
    ['  * Jika Kepala Keluarga hanya 1 orang (tidak punya istri/anak), tetap tuliskan Nomor KK pada baris kosong tepat di bawah namanya di Kolom A.'],
    ['- Kolom B (ANGGOTA KELUARGA) s.d. Kolom L: isi semua anggota keluarga (Kep.Keluarga, Istri, Anak, dll).'],
    ['- Aplikasi juga tetap mendukung format tabel biasa yang memiliki kolom "No KK" di setiap baris.'],
    [''],
    ['2. ATURAN PENULISAN KOLOM'],
    ['- NIK & ID KK: 16 digit (format dengan tanda strip "-" maupun tanpa strip sama-sama terbaca otomatis).'],
    ['- Jenis Kelamin: L / P / Laki-laki / Perempuan.'],
    ['- Status Hubungan: Kep.Keluarga / Kepala Keluarga | Istri | Anak | Orang Tua | Mertua | Famili Lain.'],
    ['- Tanggal Lahir / Tanggal Nikah: DD-MM-YYYY (contoh: 31-12-1950) atau format tanggal Excel biasa.'],
    [''],
    ['3. DATA PENERIMAAN BANTUAN PEMERINTAH (SEKALI IMPORT BERES SEMUA)'],
    ['- Isi kolom JENIS BANTUAN s.d. KETERANGAN BANTUAN pada baris warga penerima, atau gunakan sheet "Data Bantuan Tambahan".'],
    ['- Jika 1 warga menerima lebih dari 1 bantuan, pisahkan dengan tanda koma (misal: "BPNT, Sembako Beras").'],
    ['- Contoh Program Bantuan Standar:', ...PRESET_JENIS_BANTUAN],
    [''],
    ['4. CATATAN'],
    ['- Hapus atau timpa 3 keluarga contoh (BUDI SANTOSO, HENDRA WIJAYA, SUTRISNO) dengan data warga RT Anda sebelum import.'],
    ['- Jika file Excel Anda memiliki beberapa sheet seperti "Data KK Halaman 1", "Data KK Halaman 2", seluruh sheet akan otomatis digabung saat import.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 115 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  return wb;
}
