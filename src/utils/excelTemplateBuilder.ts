import * as XLSX from 'xlsx';
import { PRESET_JENIS_BANTUAN } from '../types.ts';

export interface TemplateProfilRT {
  rt?: string;
  rw?: string;
  desa?: string;
}

export const TEMPLATE_HEADERS = [
  'No',
  'No KK',
  'No Rumah',
  'RT',
  'RW',
  'Alamat',
  'Kode Pos',
  'NIK',
  'Nama Lengkap',
  'Status Hubungan',
  'Jenis Kelamin',
  'Tempat Lahir',
  'Tanggal Lahir',
  'Agama',
  'Pendidikan Terakhir',
  'Jenis Pekerjaan',
  'Golongan Darah',
  'Status Perkawinan',
  'Tanggal Perkawinan',
  'Kewarganegaraan',
  'Nama Ayah',
  'Nama Ibu',
  'No HP / Telepon',
  'Status Iuran',
  'Jenis Bantuan',
  'Nominal / Barang Bantuan',
  'Tanggal Bantuan',
  'Status Bantuan',
  'Sumber Dana Bantuan',
  'Keterangan Bantuan',
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

  const sampleRows: (string | number)[][] = [
    TEMPLATE_HEADERS,
    [
      1,
      '3302210101850001',
      '01',
      rtDefault,
      rwDefault,
      alamatDefault,
      '53183',
      '3302210101850001',
      'BUDI SANTOSO',
      'Kepala Keluarga',
      'Laki-laki',
      'Banyumas',
      '01-01-1985',
      'Islam',
      'SLTA/Sederajat',
      'Wiraswasta',
      'O',
      'Kawin Tercatat',
      '10-05-2012',
      'WNI',
      'SUKIRMAN',
      'PARTINAH',
      '081234567890',
      'Sudah',
      'BPNT (Bantuan Pangan Non Tunai)',
      'Rp 600.000 / Triwulan',
      '2026-10-01',
      'Sudah Disalurkan',
      'Kemensos RI',
      'Penyaluran tahap berjalan via Kantor Pos',
    ],
    [
      2,
      '3302210101850001',
      '01',
      rtDefault,
      rwDefault,
      alamatDefault,
      '53183',
      '3302215206880002',
      'SITI AMINAH',
      'Istri',
      'Perempuan',
      'Banyumas',
      '12-06-1988',
      'Islam',
      'SLTP/Sederajat',
      'Mengurus Rumah Tangga',
      'A',
      'Kawin Tercatat',
      '10-05-2012',
      'WNI',
      'DARSONO',
      'SUMIYATI',
      '',
      'Sudah',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      3,
      '3302210101850001',
      '01',
      rtDefault,
      rwDefault,
      alamatDefault,
      '53183',
      '3302211408140003',
      'RAFA PRATAMA',
      'Anak',
      'Laki-laki',
      'Banyumas',
      '14-08-2014',
      'Islam',
      'Tamat SD/Sederajat',
      'Pelajar/Mahasiswa',
      'O',
      'Belum Kawin',
      '-',
      'WNI',
      'BUDI SANTOSO',
      'SITI AMINAH',
      '',
      'Sudah',
      'KIP / PIP Siswa & Pelajar',
      'Rp 450.000 / Semester',
      '2026-09-15',
      'Sudah Disalurkan',
      'Kemendikbud RI',
      'Bantuan pendidikan siswa SD/SMP',
    ],
    [
      4,
      '3302210506880002',
      '02',
      rtDefault,
      rwDefault,
      alamatDefault,
      '53183',
      '3302210506880002',
      'HENDRA WIJAYA',
      'Kepala Keluarga',
      'Laki-laki',
      'Banyumas',
      '05-06-1988',
      'Islam',
      'Diploma IV/Strata I',
      'Karyawan Swasta',
      'B',
      'Kawin Tercatat',
      '20-11-2016',
      'WNI',
      'SLAMET RIYADI',
      'MURTININGSIH',
      '085612345678',
      'Belum',
      'PKH (Program Keluarga Harapan)',
      'Rp 750.000 / Triwulan',
      '2026-10-05',
      'Proses Verifikasi',
      'Kemensos RI',
      'Menunggu jadwal penyaluran tahap berikutnya',
    ],
    [
      5,
      '3302210506880002',
      '02',
      rtDefault,
      rwDefault,
      alamatDefault,
      '53183',
      '3302214809900001',
      'RATNA SARI',
      'Istri',
      'Perempuan',
      'Purwokerto',
      '08-09-1990',
      'Islam',
      'SLTA/Sederajat',
      'Mengurus Rumah Tangga',
      'AB',
      'Kawin Tercatat',
      '20-11-2016',
      'WNI',
      'SUWARDI',
      'TUTI HARYATI',
      '',
      'Belum',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ];

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Template Import Warga, Anggota Keluarga & Bantuan Pemerintah',
    Subject: 'Data Kependudukan & Bansos RT',
    Author: `Pengurus RT ${rtDefault} RW ${rwDefault} ${desaDefault}`,
  };

  const wsMain = XLSX.utils.aoa_to_sheet(sampleRows);
  applyTextFormattingToSheet(wsMain, [1, 2, 3, 4, 6, 7, 22]);

  wsMain['!cols'] = [
    { wch: 5 },
    { wch: 20 },
    { wch: 10 },
    { wch: 6 },
    { wch: 6 },
    { wch: 28 },
    { wch: 10 },
    { wch: 20 },
    { wch: 26 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 30 },
    { wch: 22 },
    { wch: 15 },
    { wch: 18 },
    { wch: 22 },
    { wch: 32 },
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, 'Data Warga & Bantuan');

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
    ['PANDUAN PENGISIAN TEMPLATE IMPORT EXCEL WARGA, ANGGOTA KELUARGA & BANTUAN PEMERINTAH'],
    [''],
    ['1. CARA PENGELOMPOKAN ANGGOTA KELUARGA OTOMATIS'],
    ['- Isi 1 baris untuk setiap orang (Kepala Keluarga, Istri, Anak, Orang Tua, dll).'],
    ['- Berikan Nomor Kartu Keluarga (No KK) yang SAMA persis pada seluruh anggota keluarga yang berada dalam 1 KK.'],
    ['- Saat file di-import, aplikasi otomatis mengelompokkan semua baris dengan No KK yang sama menjadi 1 Kartu Keluarga utuh.'],
    ['- Contoh pada sheet Data Warga & Bantuan: Baris 1-3 memiliki No KK sama (3302210101850001) sehingga otomatis menjadi 1 KK (Budi Santoso, Istri, Anak).'],
    [''],
    ['2. ATURAN PENULISAN KOLOM PENTING'],
    ['- No KK & NIK: Wajib 16 digit angka (format Teks agar tidak berubah menjadi 3,30221E+15 di Excel).'],
    ['- Status Hubungan: Gunakan salah satu dari: Kepala Keluarga | Istri | Anak | Orang Tua | Mertua | Famili Lain'],
    ['- Jenis Kelamin: Laki-laki atau Perempuan'],
    ['- Tanggal Lahir / Tanggal Perkawinan: Format DD-MM-YYYY (contoh: 25-12-1992) atau format tanggal Excel biasa.'],
    ['- Status Iuran: Isi "Sudah" atau "Belum" (diambil dari baris Kepala Keluarga).'],
    [''],
    ['3. DATA PENERIMAAN BANTUAN PEMERINTAH (SEKALI IMPORT LANGSUNG BERES)'],
    ['- Jika keluarga atau anggota tertentu menerima bantuan pemerintah, langsung isi kolom "Jenis Bantuan" s.d. "Keterangan Bantuan" di baris orang tersebut.'],
    ['- Jika tidak menerima bantuan, cukup kosongkan kolom Jenis Bantuan.'],
    ['- Jika 1 orang menerima lebih dari 1 bantuan sekaligus, pisahkan dengan tanda koma (misal: "BPNT, Sembako Beras") atau gunakan sheet "Data Bantuan Tambahan".'],
    ['- Pilihan Status Bantuan: Sudah Disalurkan | Baru Diusulkan | Proses Verifikasi | Ditolak'],
    ['- Contoh Program Bantuan Standar:', ...PRESET_JENIS_BANTUAN],
    [''],
    ['4. CATATAN PENTING'],
    ['- Hapus atau timpa 5 baris contoh (BUDI SANTOSO & HENDRA WIJAYA) pada sheet "Data Warga & Bantuan" dengan data warga RT Anda sebelum melakukan import.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  return wb;
}
