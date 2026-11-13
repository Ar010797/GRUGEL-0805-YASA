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
