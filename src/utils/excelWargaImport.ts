import * as XLSX from 'xlsx';
import { AnggotaKeluarga, BantuanPemerintah, Warga } from '../types';
import { cleanIndonesianName, cleanNIK, inferGenderFromNIK } from './wargaHelpers';
import {
  buildTemplateExcelWorkbook,
  getCleanTemplateExcelDownloadUrl,
  getTemplateExcelDownloadUrl,
  getTemplateExcelFilename,
  type TemplateProfilRT,
} from './excelTemplateBuilder.ts';
import { playNotificationSound } from './audioNotification';

export {
  getCleanTemplateExcelDownloadUrl,
  getTemplateExcelDownloadUrl,
  getTemplateExcelFilename,
};

export const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const EXCEL_DOWNLOAD_EVENT = 'rt-excel-download-notify';

export interface ExcelDownloadNotificationDetail {
  id: string;
  filename: string;
  sizeBytes: number;
  blob: Blob;
  serverUrl: string;
  timestamp: string;
}

export interface ExcelImportResult {
  wargaList: Omit<Warga, 'id' | 'no'>[];
  bantuanList: Omit<BantuanPemerintah, 'id'>[];
  totalRowsRead: number;
  totalKK: number;
  totalJiwa: number;
  totalBantuan: number;
  warnings: string[];
}

/**
 * Builds an absolute HTTPS URL for the clean query-free .xlsx template endpoint.
 */
export function getAbsoluteTemplateExcelUrl(profilRT?: TemplateProfilRT): string {
  const relativeUrl = getCleanTemplateExcelDownloadUrl(profilRT);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(relativeUrl, window.location.origin).toString();
  }
  return relativeUrl;
}

/**
 * Triggers a genuine .xlsx file download on Desktop, Mobile Chrome, Safari, and Android WebView/Median:
 * - Builds compressed OOXML .xlsx bytes client-side with official Excel MIME type
 *   (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 * - Dispatches MouseEvent('click') matching jsPDF.save() behavior (plus DataURI fallback if download attr unsupported)
 * - Plays subtle notification sound, fires Web Notification if granted, and dispatches
 *   EXCEL_DOWNLOAD_EVENT so the global in-app notification toast appears with filename & backup save actions.
 */
export function downloadTemplateExcelWargaBansos(profilRT?: TemplateProfilRT) {
  const filename = getTemplateExcelFilename();
  const serverUrl = getAbsoluteTemplateExcelUrl(profilRT);

  const wb = buildTemplateExcelWorkbook(profilRT);
  const wbOut = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });

  const blob = new Blob([wbOut], { type: EXCEL_MIME_TYPE });

  if (typeof document !== 'undefined') {
    const supportsDownloadAttr =
      typeof HTMLAnchorElement !== 'undefined' &&
      'download' in HTMLAnchorElement.prototype;

    if (supportsDownloadAttr && typeof URL !== 'undefined' && URL.createObjectURL) {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.type = EXCEL_MIME_TYPE;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);

      setTimeout(() => {
        try {
          link.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            })
          );
        } catch {
          link.click();
        }
        setTimeout(() => {
          link.remove();
        }, 500);
      }, 0);

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 40000);
    } else if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (result) {
          const link = document.createElement('a');
          link.href = result;
          link.download = filename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => link.remove(), 500);
        }
      };
      reader.readAsDataURL(blob);
    }
  }

  // Play gentle notification sound & dispatch system/in-app notification
  try {
    playNotificationSound();
  } catch {
    // ignore audio block
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Download Template Excel (.xlsx)', {
        body: `File ${filename} berhasil diunduh ke perangkat Anda.`,
      });
    }
  } catch {
    // ignore notification errors in WebView
  }

  if (typeof window !== 'undefined') {
    const detail: ExcelDownloadNotificationDetail = {
      id: 'dl_' + Date.now(),
      filename,
      sizeBytes: blob.size,
      blob,
      serverUrl,
      timestamp: new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    window.dispatchEvent(new CustomEvent(EXCEL_DOWNLOAD_EVENT, { detail }));
  }
}

/**
 * Backup save/share handler for Median / Android WebView if native Downloads folder needs explicit user action.
 */
export async function shareOrSaveExcelFile(blob: Blob, filename: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const file = new File([blob], filename, { type: EXCEL_MIME_TYPE });
      const canShare =
        typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
      if (canShare) {
        await navigator.share({
          title: 'Template Excel Warga & Bansos (.xlsx)',
          text: `Simpan file template ${filename}`,
          files: [file],
        });
        return true;
      }
    }
  } catch {
    // user cancelled or share unsupported, fall back to Data URI
  }

  return new Promise<boolean>((resolve) => {
    if (typeof FileReader === 'undefined' || typeof document === 'undefined') {
      resolve(false);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        resolve(false);
        return;
      }
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 500);
      resolve(true);
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(blob);
  });
}

/**
 * Backup server URL download handler for Median JS Bridge or WebView DownloadListener.
 */
export function triggerServerExcelDownload(serverUrl: string) {
  const w = window as any;
  const medianBridgeDownload =
    w?.median?.downloads?.downloadFile ||
    w?.median?.share?.downloadFile ||
    w?.gonative?.share?.downloadFile;

  if (typeof medianBridgeDownload === 'function') {
    try {
      medianBridgeDownload({ url: serverUrl, open: true });
      return;
    } catch {
      // fallback below
    }
  }
  window.location.assign(serverUrl);
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
  if (s.includes('kep') || s === 'kk') return 'Kepala Keluarga';
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
  return raw
    .split(/[,;\n+]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '-');
}

function isIdKKString(rawVal: any): boolean {
  if (rawVal === undefined || rawVal === null) return false;
  const s = String(rawVal).trim();
  if (!s) return false;
  // Must not contain letters (only digits, hyphens, spaces, dots) and have >= 10 digits
  if (/[a-zA-Z]/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 20;
}

function isRowSeparatorNumber(rawVal: any): boolean {
  if (rawVal === undefined || rawVal === null) return false;
  const s = String(rawVal).trim();
  if (!s) return false;
  return /^\d{1,5}$/.test(s);
}

interface ColumnIndices {
  headerRowIdx: number;
  noUrutCol?: number;
  noKKCol?: number;
  namaLengkapCol?: number;
  anggotaCol?: number;
  nikCol?: number;
  genderCol?: number;
  hubunganCol?: number;
  tempatLahirCol?: number;
  tglLahirCol?: number;
  statusPerkawinanCol?: number;
  tglNikahCol?: number;
  agamaCol?: number;
  pendidikanCol?: number;
  pekerjaanCol?: number;
  golDarahCol?: number;
  kewarganegaraanCol?: number;
  ayahCol?: number;
  ibuCol?: number;
  teleponCol?: number;
  alamatCol?: number;
  rtCol?: number;
  rwCol?: number;
  noRumahCol?: number;
  kodePosCol?: number;
  statusIuranCol?: number;
  jenisBantuanCol?: number;
  nominalBantuanCol?: number;
  tglBantuanCol?: number;
  statusBantuanCol?: number;
  sumberDanaCol?: number;
  ketBantuanCol?: number;
}

function detectHeaderAndColumns(grid: any[][]): ColumnIndices | null {
  if (!grid || grid.length === 0) return null;

  const maxScan = Math.min(15, grid.length);
  let bestRowIdx = -1;
  let bestScore = 0;

  for (let r = 0; r < maxScan; r++) {
    const row = grid[r] || [];
    let score = 0;
    for (const cell of row) {
      const k = normalizeKey(String(cell || ''));
      if (!k) continue;
      if (
        [
          'namalengkap',
          'anggotakeluarga',
          'nik',
          'nokk',
          'idkk',
          'nomorkk',
          'jeniskelamin',
          'tempatlahir',
          'tgllahir',
          'tanggallahir',
          'setatus',
          'statushubungan',
          'statusperkawinan',
          'agama',
          'nikah',
        ].includes(k) ||
        k.startsWith('jeni')
      ) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  if (bestRowIdx === -1 || bestScore < 2) return null;

  const headerRow = grid[bestRowIdx] || [];
  const cols: ColumnIndices = { headerRowIdx: bestRowIdx };
  const ambiguousStatusCols: number[] = [];

  for (let c = 0; c < headerRow.length; c++) {
    const rawH = String(headerRow[c] || '').trim();
    const k = normalizeKey(rawH);
    if (!k) continue;

    if (k === 'no' || k === 'nourut') {
      if (cols.noUrutCol === undefined) cols.noUrutCol = c;
    } else if (
      ['nokk', 'nomorkk', 'idkk', 'nokartukeluarga', 'kk', 'kartukeluarga'].includes(k)
    ) {
      if (cols.noKKCol === undefined) cols.noKKCol = c;
    } else if (
      ['namalengkap', 'namakepalakeluarga', 'kepalakeluarga'].includes(k)
    ) {
      if (cols.namaLengkapCol === undefined) cols.namaLengkapCol = c;
    } else if (
      ['anggotakeluarga', 'namaanggota', 'namawarga', 'nama'].includes(k)
    ) {
      if (cols.anggotaCol === undefined) cols.anggotaCol = c;
    } else if (['nik', 'nonik', 'nomorindukkependudukan', 'nikanggota'].includes(k)) {
      if (cols.nikCol === undefined) cols.nikCol = c;
    } else if (
      ['jeniskelamin', 'kelamin', 'jk', 'gender', 'jeni', 'jenik'].includes(k) ||
      k.startsWith('jenisk')
    ) {
      if (cols.genderCol === undefined) cols.genderCol = c;
    } else if (
      ['statushubungan', 'hubungankeluarga', 'hubungandalamkeluarga', 'hubungan', 'statushubungandalamkeluarga', 'statuskeluarga', 'shdk', 'posisikeluarga'].includes(k)
    ) {
      if (cols.hubunganCol === undefined) cols.hubunganCol = c;
    } else if (
      ['statusperkawinan', 'statuskawin', 'perkawinan'].includes(k)
    ) {
      if (cols.statusPerkawinanCol === undefined) cols.statusPerkawinanCol = c;
    } else if (k === 'setatus' || k === 'status') {
      ambiguousStatusCols.push(c);
    } else if (['tempatlahir', 'tmptlahir', 'kotalahir'].includes(k)) {
      if (cols.tempatLahirCol === undefined) cols.tempatLahirCol = c;
    } else if (['tgllahir', 'tanggallahir', 'ttl'].includes(k)) {
      if (cols.tglLahirCol === undefined) cols.tglLahirCol = c;
    } else if (
      ['nikah', 'tanggalperkawinan', 'tglperkawinan', 'tglnikah', 'tanggalnikah', 'tglkawin'].includes(k)
    ) {
      if (cols.tglNikahCol === undefined) cols.tglNikahCol = c;
    } else if (k === 'agama') {
      if (cols.agamaCol === undefined) cols.agamaCol = c;
    } else if (['pendidikan', 'pendidikanterakhir', 'pendidikanakhir'].includes(k)) {
      if (cols.pendidikanCol === undefined) cols.pendidikanCol = c;
    } else if (['pekerjaan', 'jenispekerjaan', 'profesi'].includes(k)) {
      if (cols.pekerjaanCol === undefined) cols.pekerjaanCol = c;
    } else if (['golongandarah', 'goldarah'].includes(k)) {
      if (cols.golDarahCol === undefined) cols.golDarahCol = c;
    } else if (['kewarganegaraan', 'wn'].includes(k)) {
      if (cols.kewarganegaraanCol === undefined) cols.kewarganegaraanCol = c;
    } else if (['namaayah', 'ayah', 'orangtuaayah'].includes(k)) {
      if (cols.ayahCol === undefined) cols.ayahCol = c;
    } else if (['namaibu', 'ibu', 'orangtuaibu'].includes(k)) {
      if (cols.ibuCol === undefined) cols.ibuCol = c;
    } else if (['nohp', 'nohptelepon', 'telepon', 'hp', 'nowa', 'whatsapp'].includes(k)) {
      if (cols.teleponCol === undefined) cols.teleponCol = c;
    } else if (['alamat', 'alamatlengkap', 'dusun', 'jalan'].includes(k)) {
      if (cols.alamatCol === undefined) cols.alamatCol = c;
    } else if (k === 'rt') {
      if (cols.rtCol === undefined) cols.rtCol = c;
    } else if (k === 'rw') {
      if (cols.rwCol === undefined) cols.rwCol = c;
    } else if (['norumah', 'nomorrumah', 'rumah', 'blok'].includes(k)) {
      if (cols.noRumahCol === undefined) cols.noRumahCol = c;
    } else if (k === 'kodepos') {
      if (cols.kodePosCol === undefined) cols.kodePosCol = c;
    } else if (['statusiuran', 'iuran', 'statusbayar'].includes(k)) {
      if (cols.statusIuranCol === undefined) cols.statusIuranCol = c;
    } else if (
      ['jenisbantuan', 'programbantuan', 'bantuan', 'bansos', 'namabantuan', 'penerimaanbantuan'].includes(k)
    ) {
      if (cols.jenisBantuanCol === undefined) cols.jenisBantuanCol = c;
    } else if (
      ['nominalbarangbantuan', 'nominalbantuan', 'barangbantuan', 'nominal', 'jumlahbantuan'].includes(k)
    ) {
      if (cols.nominalBantuanCol === undefined) cols.nominalBantuanCol = c;
    } else if (
      ['tanggalbantuan', 'tanggalterimabantuan', 'tanggalterima', 'tglbantuan', 'tglterima', 'tanggalpenyaluran'].includes(k)
    ) {
      if (cols.tglBantuanCol === undefined) cols.tglBantuanCol = c;
    } else if (
      ['statusbantuan', 'statuspenyaluran', 'statusbansos', 'statuspenerimaan'].includes(k)
    ) {
      if (cols.statusBantuanCol === undefined) cols.statusBantuanCol = c;
    } else if (['sumberdanabantuan', 'sumberdana', 'instansi'].includes(k)) {
      if (cols.sumberDanaCol === undefined) cols.sumberDanaCol = c;
    } else if (['keteranganbantuan', 'catatanbantuan', 'keterangan'].includes(k)) {
      if (cols.ketBantuanCol === undefined) cols.ketBantuanCol = c;
    }
  }

  // Disambiguate duplicate "SETATUS" / "STATUS" columns by inspecting sample cell values
  for (const colIdx of ambiguousStatusCols) {
    let looksLikeHubungan = false;
    let looksLikeKawin = false;
    const sampleLimit = Math.min(grid.length, bestRowIdx + 25);
    for (let r = bestRowIdx + 1; r < sampleLimit; r++) {
      const val = String((grid[r] && grid[r][colIdx]) || '').toLowerCase();
      if (!val) continue;
      if (/kep\.?|kepala|istri|suami|anak|ortu|famili|cucu/.test(val)) {
        looksLikeHubungan = true;
      }
      if (/kawin|cerai|janda|duda/.test(val)) {
        looksLikeKawin = true;
      }
    }

    if (looksLikeHubungan && cols.hubunganCol === undefined) {
      cols.hubunganCol = colIdx;
    } else if (looksLikeKawin && cols.statusPerkawinanCol === undefined) {
      cols.statusPerkawinanCol = colIdx;
    } else if (cols.hubunganCol === undefined) {
      cols.hubunganCol = colIdx;
    } else if (cols.statusPerkawinanCol === undefined) {
      cols.statusPerkawinanCol = colIdx;
    }
  }

  return cols;
}

/**
 * Parses an uploaded Excel (.xlsx / .xls / .csv) file and automatically:
 * 1. Supports BOTH:
 *    - Blok KK format (ID KK located below Nama Kepala Keluarga in Column A, e.g. Data_KK_Warga_RT.xlsx)
 *    - Flat Table format (dedicated No KK column repeated on each member row)
 * 2. Groups all members into complete Warga (Family) objects with AnggotaKeluarga[]
 * 3. Extracts all Government Aid (BantuanPemerintah) records from aid columns and/or extra sheet
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
    pendingBantuan: Omit<BantuanPemerintah, 'id'>[];
  }

  const allBuckets: FamilyBucket[] = [];
  const flatFamilyMap = new Map<string, FamilyBucket>();
  const extraBantuanList: Omit<BantuanPemerintah, 'id'>[] = [];
  let totalRowsRead = 0;

  // Identify candidate data sheets (skip Panduan / Bantuan Tambahan)
  const candidateSheets = workbook.SheetNames.filter(
    (name) => !/panduan|guide|bantuan\s*tambahan/i.test(name) && !/^bantuan$/i.test(name.trim())
  );

  let parsedAnyDataSheet = false;

  for (const sheetName of candidateSheets) {
    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: true });
    const cols = detectHeaderAndColumns(grid);
    if (!cols) continue;

    parsedAnyDataSheet = true;

    const cellStr = (row: any[], colIdx?: number): string => {
      if (colIdx === undefined) return '';
      const v = row[colIdx];
      return v !== undefined && v !== null ? String(v).trim() : '';
    };
    const cellRaw = (row: any[], colIdx?: number): any => {
      if (colIdx === undefined) return '';
      return row[colIdx];
    };

    // Determine if this sheet uses Block KK format (no separate No KK column, or Col A has ID KK below name)
    const isBlockKKMode =
      cols.noKKCol === undefined &&
      cols.namaLengkapCol !== undefined &&
      cols.anggotaCol !== undefined;

    let currentBlock: FamilyBucket | null = null;
    let pendingNoRumah = '';

    for (let r = cols.headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const rowNumber = r + 1;

      const colAVal = cellRaw(row, cols.namaLengkapCol);
      const colAStr = colAVal !== undefined && colAVal !== null ? String(colAVal).trim() : '';
      const anggotaStr = cellStr(row, cols.anggotaCol);
      const nikRaw = cellRaw(row, cols.nikCol);
      const nikStr = nikRaw !== undefined && nikRaw !== null ? String(nikRaw).trim() : '';
      const noKKRowRaw = cellRaw(row, cols.noKKCol);

      // Skip completely blank row
      const hasAnyValue = row.some((v) => v !== undefined && v !== null && String(v).trim() !== '');
      if (!hasAnyValue) continue;

      if (isBlockKKMode) {
        // 1. Check if Col A is a separator row with just a small family number (e.g. "2", "3", "17")
        if (isRowSeparatorNumber(colAStr) && !anggotaStr && !nikStr) {
          pendingNoRumah = colAStr.padStart(2, '0');
          currentBlock = null;
          continue;
        }

        const colAIsIdKK = isIdKKString(colAStr);
        const rawHubungan = cellStr(row, cols.hubunganCol);
        const normalizedHubPeek = normalizeHubungan(rawHubungan, 1);
        const isHeadRow =
          (Boolean(colAStr) && !colAIsIdKK && !isRowSeparatorNumber(colAStr)) ||
          (normalizedHubPeek === 'Kepala Keluarga' && Boolean(anggotaStr));

        // 2. If Col A contains ID KK (below Kepala Keluarga name)
        if (colAIsIdKK) {
          const detectedKK = cleanNIK(colAStr);
          if (!currentBlock) {
            currentBlock = {
              noKK: detectedKK,
              noRumah: cellStr(row, cols.noRumahCol) || pendingNoRumah || String(allBuckets.length + 1).padStart(2, '0'),
              rt: (cellStr(row, cols.rtCol) || defaultRt).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRt,
              rw: (cellStr(row, cols.rwCol) || defaultRw).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRw,
              alamat: cellStr(row, cols.alamatCol) || defaultAlamat,
              kodePos: cellStr(row, cols.kodePosCol) || '53183',
              telepon: cellStr(row, cols.teleponCol),
              statusIuran: /sudah|lunas|ya|ok/i.test(cellStr(row, cols.statusIuranCol)) ? 'Sudah' : 'Belum',
              explicitKepalaName: cleanIndonesianName(anggotaStr),
              members: [],
              pendingBantuan: [],
            };
            allBuckets.push(currentBlock);
            pendingNoRumah = '';
          } else if (!currentBlock.noKK) {
            currentBlock.noKK = detectedKK;
          } else if (currentBlock.noKK !== detectedKK) {
            // Unexpected different ID KK without head row -> start new block
            currentBlock = {
              noKK: detectedKK,
              noRumah: cellStr(row, cols.noRumahCol) || pendingNoRumah || String(allBuckets.length + 1).padStart(2, '0'),
              rt: (cellStr(row, cols.rtCol) || defaultRt).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRt,
              rw: (cellStr(row, cols.rwCol) || defaultRw).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRw,
              alamat: cellStr(row, cols.alamatCol) || defaultAlamat,
              kodePos: cellStr(row, cols.kodePosCol) || '53183',
              telepon: cellStr(row, cols.teleponCol),
              statusIuran: /sudah|lunas|ya|ok/i.test(cellStr(row, cols.statusIuranCol)) ? 'Sudah' : 'Belum',
              explicitKepalaName: cleanIndonesianName(anggotaStr),
              members: [],
              pendingBantuan: [],
            };
            allBuckets.push(currentBlock);
            pendingNoRumah = '';
          }

          // If this row only held the ID KK (single-member family like CARTEM / SUNARJA / DIRKUN / SUTRISNO), we're done!
          if (!anggotaStr && !nikStr) {
            continue;
          }
        } else if (isHeadRow || !currentBlock) {
          // 3. New family head row (Col A has Kepala Keluarga name, or Kep.Keluarga marker)
          const headNameClean = cleanIndonesianName(
            (!colAIsIdKK && !isRowSeparatorNumber(colAStr) ? colAStr : '') || anggotaStr
          );
          if (!headNameClean && !anggotaStr && !nikStr) {
            continue;
          }
          currentBlock = {
            noKK: '',
            noRumah: cellStr(row, cols.noRumahCol) || pendingNoRumah || String(allBuckets.length + 1).padStart(2, '0'),
            rt: (cellStr(row, cols.rtCol) || defaultRt).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRt,
            rw: (cellStr(row, cols.rwCol) || defaultRw).replace(/\D/g, '').padStart(2, '0').slice(-2) || defaultRw,
            alamat: cellStr(row, cols.alamatCol) || defaultAlamat,
            kodePos: cellStr(row, cols.kodePosCol) || '53183',
            telepon: cellStr(row, cols.teleponCol),
            statusIuran: /sudah|lunas|ya|ok/i.test(cellStr(row, cols.statusIuranCol)) ? 'Sudah' : 'Belum',
            explicitKepalaName: headNameClean,
            members: [],
            pendingBantuan: [],
          };
          allBuckets.push(currentBlock);
          pendingNoRumah = '';
        }

        // Now add the member from this row to currentBlock
        const memberName = cleanIndonesianName(anggotaStr || (!colAIsIdKK && !isRowSeparatorNumber(colAStr) ? colAStr : ''));
        if (!memberName) continue;

        totalRowsRead++;
        const cleanedNIK = cleanNIK(nikRaw);
        const gender = normalizeGender(cellStr(row, cols.genderCol), cleanedNIK);
        const hubungan = normalizeHubungan(rawHubungan, currentBlock.members.length);
        const isExplicitHead = hubungan.toLowerCase() === 'kepala keluarga';

        const telp = cellStr(row, cols.teleponCol);
        if (telp && !currentBlock.telepon) currentBlock.telepon = telp;
        if (/sudah|lunas|ya|ok/i.test(cellStr(row, cols.statusIuranCol))) {
          currentBlock.statusIuran = 'Sudah';
        }
        const rowAlamat = cellStr(row, cols.alamatCol);
        if (rowAlamat && currentBlock.alamat === defaultAlamat) {
          currentBlock.alamat = rowAlamat;
        }

        const pendidikan = cellStr(row, cols.pendidikanCol);
        const pekerjaan = cellStr(row, cols.pekerjaanCol);
        const statusKawin = cellStr(row, cols.statusPerkawinanCol);

        const member: AnggotaKeluarga = {
          nik:
            cleanedNIK ||
            (currentBlock.noKK
              ? currentBlock.noKK.slice(0, 12) + String(currentBlock.members.length + 1).padStart(4, '0')
              : ''),
          nama: memberName,
          hubungan,
          tempatLahir: cellStr(row, cols.tempatLahirCol) || 'Banyumas',
          tanggalLahir: parseExcelDate(cellRaw(row, cols.tglLahirCol), 'dd-mm-yyyy'),
          jenisKelamin: gender,
          agama: cellStr(row, cols.agamaCol) || 'Islam',
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
          golonganDarah: cellStr(row, cols.golDarahCol) || 'Tidak Tahu',
          statusPerkawinan:
            statusKawin || (isExplicitHead || hubungan === 'Istri' ? 'Kawin Tercatat' : 'Belum Kawin'),
          tanggalPerkawinan: parseExcelDate(cellRaw(row, cols.tglNikahCol), 'dd-mm-yyyy') || '-',
          kewarganegaraan: cellStr(row, cols.kewarganegaraanCol) || 'WNI',
          namaAyah: cleanIndonesianName(cellStr(row, cols.ayahCol)),
          namaIbu: cleanIndonesianName(cellStr(row, cols.ibuCol)),
        };

        currentBlock.members.push({ member, isExplicitHead, rowNumber });

        // Extract aid columns if present on this row
        const rawJenisBantuan = cellStr(row, cols.jenisBantuanCol);
        if (
          rawJenisBantuan &&
          rawJenisBantuan !== '-' &&
          !/^(?:tidak|nihil|kosong|none)$/i.test(rawJenisBantuan)
        ) {
          const aidNames = splitAidNames(rawJenisBantuan);
          const nominalAtauBarang = cellStr(row, cols.nominalBantuanCol) || 'Sesuai Program Pemerintah';
          const tanggalBantuan =
            parseExcelDate(cellRaw(row, cols.tglBantuanCol), 'yyyy-mm-dd') || todayISO;
          const statusBantuan = normalizeStatusBantuan(cellStr(row, cols.statusBantuanCol));
          const sumberDana =
            cellStr(row, cols.sumberDanaCol) || 'Kemensos RI & Pemerintah Desa';
          const keterangan =
            cellStr(row, cols.ketBantuanCol) || 'Diimpor sekaligus dari Data KK Excel';

          for (const jenis of aidNames) {
            currentBlock.pendingBantuan.push({
              jenisBantuan: jenis,
              namaPenerima: memberName,
              noKK: currentBlock.noKK,
              nik: member.nik,
              nominalAtauBarang,
              tanggal: tanggalBantuan,
              status: statusBantuan,
              sumberDana,
              keterangan,
              rtScope: `RT ${currentBlock.rt} RW ${currentBlock.rw}`,
            });
          }
        }
      } else {
        // FLAT TABLE MODE (dedicated No KK column)
        const rawNama = anggotaStr || colAStr;
        const cleanedNama = cleanIndonesianName(rawNama);
        let cleanedNoKK = cleanNIK(noKKRowRaw);
        const cleanedNIK = cleanNIK(nikRaw);

        if (!cleanedNoKK && !cleanedNIK && !cleanedNama) continue;
        totalRowsRead++;

        if (!cleanedNama) {
          warnings.push(`${sheetName} Baris ${rowNumber}: Nama kosong/tidak valid, baris dilewati.`);
          continue;
        }

        if (!cleanedNoKK) {
          if (cleanedNIK.length === 16) {
            cleanedNoKK = cleanedNIK;
            warnings.push(
              `${sheetName} Baris ${rowNumber} (${cleanedNama}): No KK kosong, sementara dikelompokkan dengan NIK.`
            );
          } else {
            cleanedNoKK = `TANPA_KK_${cleanedNama.toUpperCase()}`;
            warnings.push(
              `${sheetName} Baris ${rowNumber} (${cleanedNama}): No KK kosong! Harap isi 16 digit No KK agar pengelompokan & login akurat.`
            );
          }
        } else if (cleanedNoKK.length < 16) {
          warnings.push(
            `${sheetName} Baris ${rowNumber} (${cleanedNama}): No KK "${cleanedNoKK}" kurang dari 16 digit (${cleanedNoKK.length} digit).`
          );
        }

        const rt =
          (cellStr(row, cols.rtCol) || defaultRt).replace(/\D/g, '').padStart(2, '0').slice(-2) ||
          defaultRt;
        const rw =
          (cellStr(row, cols.rwCol) || defaultRw).replace(/\D/g, '').padStart(2, '0').slice(-2) ||
          defaultRw;
        const alamat = cellStr(row, cols.alamatCol) || defaultAlamat;
        const noRumah = cellStr(row, cols.noRumahCol);
        const kodePos = cellStr(row, cols.kodePosCol) || '53183';
        const telepon = cellStr(row, cols.teleponCol);
        const statusIuran: 'Sudah' | 'Belum' = /sudah|lunas|ya|ok/i.test(
          cellStr(row, cols.statusIuranCol)
        )
          ? 'Sudah'
          : 'Belum';

        if (!flatFamilyMap.has(cleanedNoKK)) {
          const bucket: FamilyBucket = {
            noKK: cleanedNoKK.startsWith('TANPA_KK_') ? '' : cleanedNoKK,
            noRumah: noRumah || String(flatFamilyMap.size + 1).padStart(2, '0'),
            rt,
            rw,
            alamat,
            kodePos,
            telepon,
            statusIuran,
            explicitKepalaName:
              cols.namaLengkapCol !== undefined && cols.anggotaCol !== undefined && cols.namaLengkapCol !== cols.anggotaCol
                ? cleanIndonesianName(colAStr)
                : '',
            members: [],
            pendingBantuan: [],
          };
          flatFamilyMap.set(cleanedNoKK, bucket);
          allBuckets.push(bucket);
        }

        const bucket = flatFamilyMap.get(cleanedNoKK)!;
        if (noRumah && !bucket.noRumah) bucket.noRumah = noRumah;
        if (telepon && !bucket.telepon) bucket.telepon = telepon;
        if (statusIuran === 'Sudah') bucket.statusIuran = 'Sudah';

        const rawHubungan = cellStr(row, cols.hubunganCol);
        const hubungan = normalizeHubungan(rawHubungan, bucket.members.length);
        const isExplicitHead = hubungan.toLowerCase() === 'kepala keluarga';
        const gender = normalizeGender(cellStr(row, cols.genderCol), cleanedNIK);
        const pendidikan = cellStr(row, cols.pendidikanCol);
        const pekerjaan = cellStr(row, cols.pekerjaanCol);
        const statusKawin = cellStr(row, cols.statusPerkawinanCol);

        const member: AnggotaKeluarga = {
          nik:
            cleanedNIK ||
            (bucket.noKK
              ? bucket.noKK.slice(0, 12) + String(bucket.members.length + 1).padStart(4, '0')
              : ''),
          nama: cleanedNama,
          hubungan,
          tempatLahir: cellStr(row, cols.tempatLahirCol) || 'Banyumas',
          tanggalLahir: parseExcelDate(cellRaw(row, cols.tglLahirCol), 'dd-mm-yyyy'),
          jenisKelamin: gender,
          agama: cellStr(row, cols.agamaCol) || 'Islam',
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
          golonganDarah: cellStr(row, cols.golDarahCol) || 'Tidak Tahu',
          statusPerkawinan:
            statusKawin || (isExplicitHead || hubungan === 'Istri' ? 'Kawin Tercatat' : 'Belum Kawin'),
          tanggalPerkawinan: parseExcelDate(cellRaw(row, cols.tglNikahCol), 'dd-mm-yyyy') || '-',
          kewarganegaraan: cellStr(row, cols.kewarganegaraanCol) || 'WNI',
          namaAyah: cleanIndonesianName(cellStr(row, cols.ayahCol)),
          namaIbu: cleanIndonesianName(cellStr(row, cols.ibuCol)),
        };

        bucket.members.push({ member, isExplicitHead, rowNumber });

        const rawJenisBantuan = cellStr(row, cols.jenisBantuanCol);
        if (
          rawJenisBantuan &&
          rawJenisBantuan !== '-' &&
          !/^(?:tidak|nihil|kosong|none)$/i.test(rawJenisBantuan)
        ) {
          const aidNames = splitAidNames(rawJenisBantuan);
          const nominalAtauBarang = cellStr(row, cols.nominalBantuanCol) || 'Sesuai Program Pemerintah';
          const tanggalBantuan =
            parseExcelDate(cellRaw(row, cols.tglBantuanCol), 'yyyy-mm-dd') || todayISO;
          const statusBantuan = normalizeStatusBantuan(cellStr(row, cols.statusBantuanCol));
          const sumberDana =
            cellStr(row, cols.sumberDanaCol) || 'Kemensos RI & Pemerintah Desa';
          const keterangan =
            cellStr(row, cols.ketBantuanCol) || 'Diimpor sekaligus dari Data Warga Excel';

          for (const jenis of aidNames) {
            bucket.pendingBantuan.push({
              jenisBantuan: jenis,
              namaPenerima: cleanedNama,
              noKK: bucket.noKK,
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
      }
    }
  }

  if (!parsedAnyDataSheet) {
    throw new Error(
      'Header kolom tidak dikenali. Pastikan file memiliki kolom seperti "NAMA LENGKAP / ANGGOTA KELUARGA / NIK" atau "No KK / Nama Lengkap".'
    );
  }

  // Merge blocks sharing the exact same non-empty No KK (in case a family spanned blocks/sheets)
  const mergedBucketMap = new Map<string, FamilyBucket>();
  allBuckets.forEach((b, idx) => {
    if (b.members.length === 0) return;
    const mergeKey = b.noKK ? `KK_${b.noKK}` : `UNGROUPED_${idx}`;
    if (!mergedBucketMap.has(mergeKey)) {
      mergedBucketMap.set(mergeKey, b);
    } else {
      const target = mergedBucketMap.get(mergeKey)!;
      if (!target.explicitKepalaName && b.explicitKepalaName) {
        target.explicitKepalaName = b.explicitKepalaName;
      }
      if (!target.telepon && b.telepon) target.telepon = b.telepon;
      if (b.statusIuran === 'Sudah') target.statusIuran = 'Sudah';
      target.members.push(...b.members);
      target.pendingBantuan.push(...b.pendingBantuan);
    }
  });

  // Backfill noKK onto pendingBantuan (important for Block KK where ID KK appears on row below Kepala Keluarga!)
  const extractedBantuan: Omit<BantuanPemerintah, 'id'>[] = [];
  mergedBucketMap.forEach((bucket) => {
    for (const pb of bucket.pendingBantuan) {
      extractedBantuan.push({
        ...pb,
        noKK: bucket.noKK || pb.noKK,
      });
    }
  });

  // Also parse any optional extra aid sheet (e.g., "Data Bantuan Tambahan" or "Data Bantuan")
  const extraAidSheets = workbook.SheetNames.filter(
    (name) => /bantuan|bansos/i.test(name) && !/panduan|guide/i.test(name) && !/warga|kk|halaman/i.test(name)
  );

  for (const sheetName of extraAidSheets) {
    const sheet = workbook.Sheets[sheetName];
    const extraRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    extraRows.forEach((row) => {
      const jenisRaw = getField(row, ['Jenis Bantuan', 'Program Bantuan', 'Bantuan', 'Bansos']);
      const noKKRow = cleanNIK(getRawField(row, ['No KK', 'Nomor KK', 'ID KK', 'KK']));
      const nikRow = cleanNIK(getRawField(row, ['NIK Penerima', 'NIK']));
      const namaRow = cleanIndonesianName(getField(row, ['Nama Penerima', 'Nama', 'Nama Lengkap']));

      if (!jenisRaw || (!noKKRow && !namaRow)) return;

      const matchedBucket = noKKRow ? mergedBucketMap.get(`KK_${noKKRow}`) : undefined;
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
  mergedBucketMap.forEach((bucket) => {
    if (bucket.members.length === 0) return;

    const sorted = [...bucket.members].sort((a, b) => {
      const rank = (m: { member: AnggotaKeluarga; isExplicitHead: boolean }) => {
        if (m.isExplicitHead) return 0;
        if (m.member.hubungan.toLowerCase() === 'istri' || m.member.hubungan.toLowerCase() === 'suami') return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });

    if (!sorted.some((m) => m.isExplicitHead)) {
      sorted[0].member.hubungan = 'Kepala Keluarga';
    }

    const headMember = sorted.find((m) => m.member.hubungan === 'Kepala Keluarga')?.member || sorted[0].member;
    const anggotaKeluarga = sorted.map((s) => s.member);
    const kepalaName = bucket.explicitKepalaName || headMember.nama;

    if (!bucket.noKK) {
      warnings.push(`Keluarga "${kepalaName}": Nomor/ID KK belum terisi di bawah nama Kepala Keluarga.`);
    }

    wargaList.push({
      nama: kepalaName,
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

  extractedBantuan.push(...extraBantuanList);

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
