import * as XLSX from 'xlsx';
import { AnggotaKeluarga, BantuanPemerintah, PRESET_JENIS_BANTUAN, Warga } from '../types';
import { cleanIndonesianName, cleanNIK, inferGenderFromNIK } from './wargaHelpers';

export interface ExcelImportResult {
  wargaList: Omit<Warga, 'id' | 'no'>[];
  bantuanList: Omit<BantuanPemerintah, 'id'>[];
  totalRowsRead: number;
  totalKK: number;
  totalJiwa: number;
  totalBantuan: number;
  warnings: string[];
}

const TEMPLATE_HEADERS = [
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

const BANTUAN_SHEET_HEADERS = [
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

/**
 * Generates and downloads an official Excel (.xlsx) template containing:
 * - Sheet 1: Data Warga & Bantuan (All-in-one import: grouped automatically by No KK + Bansos columns)
 * - Sheet 2: Data Bantuan Tambahan (Optional extra aid allocations per KK)
 * - Sheet 3: Panduan Pengisian
 */
export function downloadTemplateExcelWargaBansos(profilRT?: { rt?: string; rw?: string; desa?: string }) {
  const rtDefault = profilRT?.rt || '08';
  const rwDefault = profilRT?.rw || '05';
  const alamatDefault = `RT ${rtDefault} RW ${rwDefault} ${profilRT?.desa || 'Desa Kotayasa'}`;

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
  const wsMain = XLSX.utils.aoa_to_sheet(sampleRows);

  // Force text format on No KK (1), No Rumah (2), RT (3), RW (4), Kode Pos (6), NIK (7), No HP (22)
  applyTextFormattingToSheet(wsMain, [1, 2, 3, 4, 6, 7, 22]);

  wsMain['!cols'] = [
    { wch: 5 },  // No
    { wch: 20 }, // No KK
    { wch: 10 }, // No Rumah
    { wch: 6 },  // RT
    { wch: 6 },  // RW
    { wch: 28 }, // Alamat
    { wch: 10 }, // Kode Pos
    { wch: 20 }, // NIK
    { wch: 26 }, // Nama Lengkap
    { wch: 18 }, // Status Hubungan
    { wch: 14 }, // Jenis Kelamin
    { wch: 16 }, // Tempat Lahir
    { wch: 14 }, // Tanggal Lahir
    { wch: 12 }, // Agama
    { wch: 22 }, // Pendidikan Terakhir
    { wch: 22 }, // Jenis Pekerjaan
    { wch: 14 }, // Golongan Darah
    { wch: 16 }, // Status Perkawinan
    { wch: 16 }, // Tanggal Perkawinan
    { wch: 16 }, // Kewarganegaraan
    { wch: 22 }, // Nama Ayah
    { wch: 22 }, // Nama Ibu
    { wch: 16 }, // No HP
    { wch: 12 }, // Status Iuran
    { wch: 30 }, // Jenis Bantuan
    { wch: 22 }, // Nominal / Barang Bantuan
    { wch: 15 }, // Tanggal Bantuan
    { wch: 18 }, // Status Bantuan
    { wch: 22 }, // Sumber Dana Bantuan
    { wch: 32 }, // Keterangan Bantuan
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, 'Data Warga & Bantuan');

  // Sheet 2: Optional extra aid sheet
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

  // Sheet 3: Panduan Pengisian
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

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Template_Import_Warga_KK_Bansos_${dateStr}.xlsx`);
}

function normalizeKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getField(row: Record<string, any>, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeKey(alias);
    for (const [k, v] of entries) {
      if (normalizeKey(k) === target && v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
  }
  return '';
}

function getRawField(row: Record<string, any>, aliases: string[]): any {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeKey(alias);
    for (const [k, v] of entries) {
      if (normalizeKey(k) === target && v !== undefined && v !== null && String(v).trim() !== '') {
        return v;
      }
    }
  }
  return '';
}

function parseExcelDate(val: any, outputFormat: 'dd-mm-yyyy' | 'yyyy-mm-dd' = 'dd-mm-yyyy'): string {
  if (val === undefined || val === null || val === '') return '';

  // Excel serial number
  if (typeof val === 'number' && val > 1000 && val < 100000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const dd = String(parsed.d).padStart(2, '0');
      const mm = String(parsed.m).padStart(2, '0');
      const yyyy = String(parsed.y);
      return outputFormat === 'yyyy-mm-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}-${mm}-${yyyy}`;
    }
  }

  const str = String(val).trim();
  if (!str || str === '-') return str;

  // Numeric string representing Excel serial
  if (/^\d{4,5}$/.test(str)) {
    const num = parseInt(str, 10);
    if (num > 1000 && num < 100000) {
      const parsed = XLSX.SSF.parse_date_code(num);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const dd = String(parsed.d).padStart(2, '0');
        const mm = String(parsed.m).padStart(2, '0');
        const yyyy = String(parsed.y);
        return outputFormat === 'yyyy-mm-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}-${mm}-${yyyy}`;
      }
    }
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return outputFormat === 'yyyy-mm-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}-${mm}-${yyyy}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    return outputFormat === 'yyyy-mm-dd' ? `${yyyy}-${mm}-${dd}` : `${dd}-${mm}-${yyyy}`;
  }

  return str;
}

function normalizeGender(raw: string, nik?: string): 'Laki-laki' | 'Perempuan' {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'p' || s === 'pr' || s.includes('perempuan') || s.includes('wanita')) {
    return 'Perempuan';
  }
  if (s === 'l' || s === 'lk' || s.includes('laki') || s.includes('pria')) {
    return 'Laki-laki';
  }
  if (nik && nik.length === 16) {
    return inferGenderFromNIK(nik);
  }
  return 'Laki-laki';
}

function normalizeHubungan(raw: string, fallbackIndex: number): string {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('kepala') || s === 'kk') return 'Kepala Keluarga';
  if (s.includes('istri') || s === 'isteri') return 'Istri';
  if (s.includes('suami')) return 'Suami';
  if (s.includes('anak')) return 'Anak';
  if (s.includes('orang tua') || s.includes('ortu')) return 'Orang Tua';
  if (s.includes('mertua')) return 'Mertua';
  if (s.includes('cucu')) return 'Cucu';
  if (s.includes('famili')) return 'Famili Lain';
  if (raw.trim()) return raw.trim();
  return fallbackIndex === 0 ? 'Kepala Keluarga' : 'Anggota Keluarga';
}

function normalizeStatusBantuan(raw: string): BantuanPemerintah['status'] {
  const s = (raw || '').trim().toLowerCase();
  if (s.includes('usul')) return 'Baru Diusulkan';
  if (s.includes('verif') || s.includes('proses')) return 'Proses Verifikasi';
  if (s.includes('tolak')) return 'Ditolak';
  return 'Sudah Disalurkan';
}

function splitAidNames(raw: string): string[] {
  if (!raw) return [];
  // Split by comma, semicolon, newline, or '+' while preserving clean entries
  return raw
    .split(/[,;\n+]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '-');
}

/**
 * Parses an uploaded Excel (.xlsx / .xls / .csv) file and automatically:
 * 1. Groups rows by No KK into complete Warga (Family) objects with AnggotaKeluarga[]
 * 2. Extracts all Government Aid (BantuanPemerintah) records from aid columns and/or extra sheet
 */
export async function parseExcelWargaAndBantuan(
  file: File,
  defaults?: { rt?: string; rw?: string; alamat?: string }
): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('File Excel kosong atau tidak memiliki lembar kerja (sheet).');
  }

  // Pick main warga sheet
  const mainSheetName =
    workbook.SheetNames.find(
      (name) =>
        /warga|kk|keluarga|penduduk/i.test(name) && !/panduan|guide|bantuan\s*tambahan/i.test(name)
    ) || workbook.SheetNames[0];

  const mainSheet = workbook.Sheets[mainSheetName];
  const rawMainRows = XLSX.utils.sheet_to_json<Record<string, any>>(mainSheet, { defval: '' });

  if (!rawMainRows || rawMainRows.length === 0) {
    throw new Error(`Sheet "${mainSheetName}" belum memiliki baris data warga.`);
  }

  const warnings: string[] = [];
  const defaultRt = (defaults?.rt || '08').padStart(2, '0');
  const defaultRw = (defaults?.rw || '05').padStart(2, '0');
  const defaultAlamat = defaults?.alamat || `RT ${defaultRt} RW ${defaultRw} Desa Kotayasa`;
  const todayISO = new Date().toISOString().split('T')[0];

  interface FamilyBucket {
    noKK: string;
    noRumah: string;
    rt: string;
    rw: string;
    alamat: string;
    kodePos: string;
    telepon: string;
    statusIuran: 'Sudah' | 'Belum';
    explicitKepalaName: string;
    members: {
      member: AnggotaKeluarga;
      isExplicitHead: boolean;
      rowNumber: number;
    }[];
  }

  const familyMap = new Map<string, FamilyBucket>();
  const extractedBantuan: Omit<BantuanPemerintah, 'id'>[] = [];
  let totalRowsRead = 0;

  rawMainRows.forEach((row, index) => {
    const rowNumber = index + 2; // Excel 1-indexed + header row

    const rawNoKK = getRawField(row, ['No KK', 'Nomor KK', 'No Kartu Keluarga', 'KK', 'No_KK']);
    const rawNIK = getRawField(row, ['NIK', 'No NIK', 'Nomor Induk Kependudukan', 'NIK Anggota']);
    const rawNama = getField(row, [
      'Nama Lengkap',
      'Nama Anggota',
      'Nama',
      'Nama Warga',
      'Nama Kepala Keluarga',
    ]);
    const rawKepalaExplicit = getField(row, ['Nama Kepala Keluarga', 'Kepala Keluarga']);

    // Skip completely empty trailing rows
    if (!rawNoKK && !rawNIK && !rawNama && !rawKepalaExplicit) {
      return;
    }

    totalRowsRead++;

    let cleanedNoKK = cleanNIK(rawNoKK);
    const cleanedNIK = cleanNIK(rawNIK);
    const cleanedNama = cleanIndonesianName(rawNama || rawKepalaExplicit);

    if (!cleanedNama) {
      warnings.push(`Baris ${rowNumber}: Nama kosong/tidak valid, baris dilewati.`);
      return;
    }

    if (!cleanedNoKK) {
      if (cleanedNIK.length === 16) {
        cleanedNoKK = cleanedNIK;
        warnings.push(`Baris ${rowNumber} (${cleanedNama}): No KK kosong, sementara dikelompokkan dengan NIK.`);
      } else {
        const fallbackKey = `TANPA_KK_${(rawKepalaExplicit || cleanedNama).toUpperCase()}`;
        cleanedNoKK = fallbackKey;
        warnings.push(`Baris ${rowNumber} (${cleanedNama}): No KK kosong! Harap isi 16 digit No KK agar pengelompokan & login akurat.`);
      }
    } else if (cleanedNoKK.length < 16) {
      warnings.push(`Baris ${rowNumber} (${cleanedNama}): No KK "${cleanedNoKK}" kurang dari 16 digit (${cleanedNoKK.length} digit).`);
    }

    const rawHubungan = getField(row, [
      'Status Hubungan',
      'Hubungan Keluarga',
      'Hubungan Dalam Keluarga',
      'Hubungan',
      'Status Hubungan Dalam Keluarga',
      'Status Keluarga',
      'SHDK',
      'Posisi Keluarga',
    ]);
    const rawGender = getField(row, ['Jenis Kelamin', 'Kelamin', 'JK', 'Gender']);
    const jenisKelamin = normalizeGender(rawGender, cleanedNIK);
    const noRumah = getField(row, ['No Rumah', 'Nomor Rumah', 'Rumah', 'Blok']) || '';
    const rt = (getField(row, ['RT']) || defaultRt).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRt;
    const rw = (getField(row, ['RW']) || defaultRw).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRw;
    const alamat = getField(row, ['Alamat', 'Alamat Lengkap', 'Dusun', 'Jalan']) || defaultAlamat;
    const kodePos = getField(row, ['Kode Pos', 'KodePos']) || '53183';
    const tempatLahir = getField(row, ['Tempat Lahir', 'Tmpt Lahir', 'Kota Lahir']) || 'Banyumas';
    const tanggalLahir = parseExcelDate(getRawField(row, ['Tanggal Lahir', 'Tgl Lahir', 'TTL', 'TglLahir']), 'dd-mm-yyyy');
    const agama = getField(row, ['Agama']) || 'Islam';
    const pendidikan = getField(row, ['Pendidikan Terakhir', 'Pendidikan', 'Pendidikan Akhir']) || '';
    const pekerjaan = getField(row, ['Jenis Pekerjaan', 'Pekerjaan', 'Profesi']) || '';
    const golonganDarah = getField(row, ['Golongan Darah', 'Gol Darah', 'Gol. Darah']) || 'Tidak Tahu';
    const statusPerkawinan = getField(row, ['Status Perkawinan', 'Status Kawin', 'Perkawinan']) || '';
    const tanggalPerkawinan = parseExcelDate(getRawField(row, ['Tanggal Perkawinan', 'Tgl Perkawinan', 'Tgl Kawin']), 'dd-mm-yyyy') || '-';
    const kewarganegaraan = getField(row, ['Kewarganegaraan', 'WN']) || 'WNI';
    const namaAyah = cleanIndonesianName(getField(row, ['Nama Ayah', 'Ayah', 'Orang Tua Ayah']));
    const namaIbu = cleanIndonesianName(getField(row, ['Nama Ibu', 'Ibu', 'Orang Tua Ibu']));
    const telepon = getField(row, ['No HP / Telepon', 'No HP', 'Telepon', 'HP', 'No WA', 'WhatsApp']);
    const rawStatusIuran = getField(row, ['Status Iuran', 'Iuran', 'Status Bayar']);
    const statusIuran: 'Sudah' | 'Belum' = /sudah|lunas|ya|ok/i.test(rawStatusIuran) ? 'Sudah' : 'Belum';

    // Determine bucket
    if (!familyMap.has(cleanedNoKK)) {
      familyMap.set(cleanedNoKK, {
        noKK: cleanedNoKK.startsWith('TANPA_KK_') ? '' : cleanedNoKK,
        noRumah: noRumah || String(familyMap.size + 1).padStart(2, '0'),
        rt,
        rw,
        alamat,
        kodePos,
        telepon,
        statusIuran,
        explicitKepalaName: rawKepalaExplicit ? cleanIndonesianName(rawKepalaExplicit) : '',
        members: [],
      });
    }

    const bucket = familyMap.get(cleanedNoKK)!;
    if (noRumah && !bucket.noRumah) bucket.noRumah = noRumah;
    if (telepon && !bucket.telepon) bucket.telepon = telepon;
    if (statusIuran === 'Sudah') bucket.statusIuran = 'Sudah';
    if (rawKepalaExplicit && !bucket.explicitKepalaName) {
      bucket.explicitKepalaName = cleanIndonesianName(rawKepalaExplicit);
    }

    const hubungan = normalizeHubungan(rawHubungan, bucket.members.length);
    const isExplicitHead = hubungan.toLowerCase() === 'kepala keluarga';

    const member: AnggotaKeluarga = {
      nik: cleanedNIK || (bucket.noKK ? bucket.noKK.slice(0, 12) + String(bucket.members.length + 1).padStart(4, '0') : ''),
      nama: cleanedNama,
      hubungan,
      tempatLahir,
      tanggalLahir,
      jenisKelamin,
      agama,
      pendidikan:
        pendidikan ||
        (isExplicitHead ? 'SLTA/Sederajat' : hubungan === 'Istri' ? 'SLTA/Sederajat' : 'Tidak/Belum Sekolah'),
      pekerjaan:
        pekerjaan ||
        (hubungan === 'Istri'
          ? 'Mengurus Rumah Tangga'
          : isExplicitHead
          ? 'Wiraswasta'
          : 'Belum/Tidak Bekerja'),
      golonganDarah,
      statusPerkawinan:
        statusPerkawinan || (isExplicitHead || hubungan === 'Istri' ? 'Kawin Tercatat' : 'Belum Kawin'),
      tanggalPerkawinan,
      kewarganegaraan,
      namaAyah,
      namaIbu,
    };

    bucket.members.push({ member, isExplicitHead, rowNumber });

    // Check Government Aid columns on this row
    const rawJenisBantuan = getField(row, [
      'Jenis Bantuan',
      'Program Bantuan',
      'Bantuan',
      'Bansos',
      'Nama Bantuan',
      'Penerimaan Bantuan',
    ]);

    if (rawJenisBantuan && rawJenisBantuan !== '-' && !/^(?:tidak|nihil|kosong|none)$/i.test(rawJenisBantuan)) {
      const aidNames = splitAidNames(rawJenisBantuan);
      const nominalAtauBarang =
        getField(row, ['Nominal / Barang Bantuan', 'Nominal Bantuan', 'Barang Bantuan', 'Nominal', 'Jumlah Bantuan']) ||
        'Sesuai Program Pemerintah';
      const tanggalBantuan =
        parseExcelDate(
          getRawField(row, ['Tanggal Bantuan', 'Tanggal Terima Bantuan', 'Tanggal Terima', 'Tgl Bantuan', 'Tgl Terima', 'Tanggal Penyaluran']),
          'yyyy-mm-dd'
        ) || todayISO;
      const statusBantuan = normalizeStatusBantuan(
        getField(row, ['Status Bantuan', 'Status Penyaluran', 'Status Bansos', 'Status Penerimaan'])
      );
      const sumberDana =
        getField(row, ['Sumber Dana Bantuan', 'Sumber Dana', 'Instansi']) || 'Kemensos RI & Pemerintah Desa';
      const keterangan =
        getField(row, ['Keterangan Bantuan', 'Catatan Bantuan', 'Keterangan']) ||
        'Diimpor sekaligus dari Data Warga Excel';

      for (const jenis of aidNames) {
        extractedBantuan.push({
          jenisBantuan: jenis,
          namaPenerima: cleanedNama,
          noKK: bucket.noKK || cleanedNoKK,
          nik: member.nik,
          nominalAtauBarang,
          tanggal: tanggalBantuan,
          status: statusBantuan,
          sumberDana,
          keterangan,
          rtScope: `RT ${rt} RW ${rw}`,
        });
      }
    }
  });

  // Also parse any optional extra aid sheet (e.g., "Data Bantuan Tambahan" or "Data Bantuan")
  const extraAidSheets = workbook.SheetNames.filter(
    (name) => name !== mainSheetName && /bantuan|bansos/i.test(name) && !/panduan|guide/i.test(name)
  );

  for (const sheetName of extraAidSheets) {
    const sheet = workbook.Sheets[sheetName];
    const extraRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    extraRows.forEach((row) => {
      const jenisRaw = getField(row, ['Jenis Bantuan', 'Program Bantuan', 'Bantuan', 'Bansos']);
      const noKKRow = cleanNIK(getRawField(row, ['No KK', 'Nomor KK', 'KK']));
      const nikRow = cleanNIK(getRawField(row, ['NIK Penerima', 'NIK']));
      const namaRow = cleanIndonesianName(getField(row, ['Nama Penerima', 'Nama', 'Nama Lengkap']));

      if (!jenisRaw || (!noKKRow && !namaRow)) return;

      const matchedBucket = noKKRow ? familyMap.get(noKKRow) : undefined;
      const fallbackHeadName =
        matchedBucket?.members.find((m) => m.isExplicitHead)?.member.nama ||
        matchedBucket?.members[0]?.member.nama ||
        '';

      const nominalAtauBarang =
        getField(row, ['Nominal / Barang Bantuan', 'Nominal Bantuan', 'Barang Bantuan', 'Nominal', 'Barang', 'Jumlah Bantuan']) ||
        'Sesuai Program Pemerintah';
      const tanggal =
        parseExcelDate(
          getRawField(row, ['Tanggal Bantuan', 'Tanggal Terima Bantuan', 'Tanggal Terima', 'Tgl Terima', 'Tanggal', 'Tgl Penyaluran']),
          'yyyy-mm-dd'
        ) || todayISO;
      const status = normalizeStatusBantuan(getField(row, ['Status Bantuan', 'Status Penyaluran', 'Status Bansos', 'Status']));
      const sumberDana = getField(row, ['Sumber Dana', 'Sumber Dana Bantuan', 'Instansi']) || 'Kemensos RI & Pemerintah Desa';
      const keterangan = getField(row, ['Keterangan', 'Catatan', 'Keterangan Bantuan']) || 'Diimpor dari Sheet Bantuan Excel';

      for (const jenis of splitAidNames(jenisRaw)) {
        extractedBantuan.push({
          jenisBantuan: jenis,
          namaPenerima: namaRow || fallbackHeadName || 'Warga Penerima',
          noKK: noKKRow,
          nik: nikRow || matchedBucket?.members[0]?.member.nik || '',
          nominalAtauBarang,
          tanggal,
          status,
          sumberDana,
          keterangan,
          rtScope: matchedBucket ? `RT ${matchedBucket.rt} RW ${matchedBucket.rw}` : undefined,
        });
      }
    });
  }

  // Finalize grouped Warga list
  const wargaList: Omit<Warga, 'id' | 'no'>[] = [];
  familyMap.forEach((bucket) => {
    if (bucket.members.length === 0) return;

    // Sort members: Kepala Keluarga -> Istri -> others
    const sorted = [...bucket.members].sort((a, b) => {
      const rank = (m: { member: AnggotaKeluarga; isExplicitHead: boolean }) => {
        if (m.isExplicitHead) return 0;
        if (m.member.hubungan.toLowerCase() === 'istri' || m.member.hubungan.toLowerCase() === 'suami') return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });

    // Ensure first member is marked Kepala Keluarga if none explicitly set
    if (!sorted.some((m) => m.isExplicitHead)) {
      sorted[0].member.hubungan = 'Kepala Keluarga';
    }

    const headMember = sorted.find((m) => m.member.hubungan === 'Kepala Keluarga')?.member || sorted[0].member;
    const anggotaKeluarga = sorted.map((s) => s.member);

    wargaList.push({
      nama: bucket.explicitKepalaName || headMember.nama,
      noKK: bucket.noKK,
      nik: headMember.nik,
      noRumah: bucket.noRumah,
      rt: bucket.rt,
      rw: bucket.rw,
      alamat: bucket.alamat,
      kodePos: bucket.kodePos,
      jenisKelamin: headMember.jenisKelamin,
      jumlahJiwa: anggotaKeluarga.length,
      statusIuran: bucket.statusIuran,
      anggotaKeluarga,
      telepon: bucket.telepon || undefined,
      pin: '123456',
    });
  });

  // Deduplicate identical aid records inside the same import batch
  const dedupedBantuan: Omit<BantuanPemerintah, 'id'>[] = [];
  const seenAidKeys = new Set<string>();
  for (const b of extractedBantuan) {
    const key = `${b.noKK}|${b.namaPenerima.toLowerCase()}|${b.jenisBantuan.toLowerCase()}|${b.tanggal}`;
    if (!seenAidKeys.has(key)) {
      seenAidKeys.add(key);
      dedupedBantuan.push(b);
    }
  }

  const totalJiwa = wargaList.reduce((sum, w) => sum + w.anggotaKeluarga!.length, 0);

  return {
    wargaList,
    bantuanList: dedupedBantuan,
    totalRowsRead,
    totalKK: wargaList.length,
    totalJiwa,
    totalBantuan: dedupedBantuan.length,
    warnings,
  };
}
