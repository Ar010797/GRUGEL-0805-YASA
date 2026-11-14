import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminAccounts,
  appSettings,
  authSessions,
  bantuan,
  deletedEntities,
  dokumen,
  laporanBulanan,
  pengumuman,
  syncMeta,
  transactions,
  warga,
} from './schema.ts';
import type {
  AdminRTAccount,
  AuthUser,
  BantuanPemerintah,
  DokumenPdfWarga,
  PembaruanBulananRT,
  PengaturanKas,
  PengumumanRT,
  Transaction,
  Warga,
} from '../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const LEGACY_DATA_FILE = path.join(ROOT_DIR, 'data_store.json');
const LEGACY_BACKUP_FILE = path.join(ROOT_DIR, 'data_store.backup.json');

export interface DeletedIdsMap {
  warga: string[];
  transactions: string[];
  bantuan: string[];
  pengumuman: string[];
  dokumen: string[];
  adminAccounts: string[];
  laporanBulananRT: string[];
}

export interface FullAppDatabaseState {
  version: number;
  revision: number;
  lastUpdated: string;
  tahunAktif: number;
  pengaturanKas: PengaturanKas;
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengumumanList: PengumumanRT[];
  dokumenList: DokumenPdfWarga[];
  adminAccounts: AdminRTAccount[];
  laporanBulananRT: PembaruanBulananRT[];
  deletedIds: DeletedIdsMap;
}

export interface ServerSessionRecord extends AuthUser {
  tokenHash: string;
  expiresAt: number;
}

const DEFAULT_PENGATURAN_KAS: PengaturanKas = {
  nominalJimpitanTahunan: 300000,
  nominalJimpitanBulanan: 25000,
  nominalKematianTahunan: 120000,
  nominalKematianBulanan: 10000,
  saldoAwalKasUmum: 0,
  saldoAwalKasKematian: 0,
  keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu (Pindahan Buku Manual)',
  tanggalSaldoAwal: '2026-01-01',
  kontakKetuaRT: { nama: 'Bpk. Suwardi', telp: '0812-3456-7890' },
  kontakBendahara: { nama: 'Bpk. Bambang S.', telp: '0813-9876-5432' },
  tahunAktif: 2026,
  profilRT: {
    namaRT: '08',
    namaRW: '05',
    dusun: 'Dusun III',
    desa: 'Desa Kotayasa',
    kecamatan: 'Kecamatan Sumbang',
    kabupaten: 'Kabupaten Banyumas',
    provinsi: 'Jawa Tengah',
    kodePos: '53183',
    alamatSekretariat: 'RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183',
    judulKopSurat: 'PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05',
    sebutanWilayah: 'RT 08 RW 05 Desa Kotayasa',
  },
};

function toEpochMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
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

let dbWriteTail: Promise<unknown> = Promise.resolve();

function withDbWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = dbWriteTail.then(fn, fn);
  dbWriteTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function dedupeEntities<T extends { id: string; updatedAt?: string }>(
  list: T[],
  deletedIds: string[],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result: T[] = [];

  for (const item of list) {
    if (!item || !item.id || deletedSet.has(item.id)) continue;
    const idx = result.findIndex(
      (ex) => ex.id === item.id || (altMatch ? altMatch(ex, item) : false)
    );
    if (idx === -1) {
      result.push(item);
    } else {
      const existingItem = result[idx];
      if (toEpochMs(item.updatedAt) >= toEpochMs(existingItem.updatedAt)) {
        result[idx] = item;
      }
    }
  }

  return result;
}

function mergeEntities<T extends { id: string; updatedAt?: string }>(
  existingList: T[],
  incomingList: T[],
  deletedIds: string[],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result = dedupeEntities(existingList, deletedIds, altMatch);

  for (const inc of incomingList) {
    if (!inc || !inc.id || deletedSet.has(inc.id)) continue;
    const idx = result.findIndex(
      (ex) => ex.id === inc.id || (altMatch ? altMatch(ex, inc) : false)
    );
    if (idx === -1) {
      result.push(inc);
    } else {
      const existingItem = result[idx];
      if (toEpochMs(inc.updatedAt) >= toEpochMs(existingItem.updatedAt)) {
        result[idx] = inc;
      }
    }
  }

  return result;
}

function readLegacyJsonFile(): any | null {
  try {
    if (fs.existsSync(LEGACY_DATA_FILE)) {
      const raw = fs.readFileSync(LEGACY_DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && (Array.isArray(parsed.wargaList) || parsed.pengaturanKas)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Legacy JSON read skipped:', err);
  }
  try {
    if (fs.existsSync(LEGACY_BACKUP_FILE)) {
      const rawBackup = fs.readFileSync(LEGACY_BACKUP_FILE, 'utf-8');
      const parsed = JSON.parse(rawBackup);
      if (parsed && (Array.isArray(parsed.wargaList) || parsed.pengaturanKas)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Legacy backup JSON read skipped:', err);
  }
  return null;
}

let seedPromise: Promise<void> | null = null;
let hasCheckedInitialSeed = false;

/**
 * Automatically migrates existing data_store.json data into Cloud SQL on first access
 * if Cloud SQL has no sync_meta row yet. Idempotent and safe under concurrency.
 */
export async function ensureSqlSeeded(): Promise<void> {
  if (hasCheckedInitialSeed) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const metaRows = await db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1);
        if (metaRows.length > 0) {
          hasCheckedInitialSeed = true;
          return;
        }

        const legacy = readLegacyJsonFile();
        const nowIso = new Date().toISOString();
        const initRevision = Number(legacy?.revision) > 0 ? Number(legacy.revision) : Date.now();

        if (legacy) {
          await writeFullStateRaw(
            {
              version: 2,
              revision: initRevision,
              lastUpdated: legacy.lastUpdated || nowIso,
              tahunAktif: Number(legacy.tahunAktif) || 2026,
              pengaturanKas: legacy.pengaturanKas || DEFAULT_PENGATURAN_KAS,
              wargaList: Array.isArray(legacy.wargaList) ? legacy.wargaList : [],
              transactions: Array.isArray(legacy.transactions) ? legacy.transactions : [],
              bantuanList: Array.isArray(legacy.bantuanList) ? legacy.bantuanList : [],
              pengumumanList: Array.isArray(legacy.pengumumanList) ? legacy.pengumumanList : [],
              dokumenList: Array.isArray(legacy.dokumenList) ? legacy.dokumenList : [],
              adminAccounts: Array.isArray(legacy.adminAccounts) ? legacy.adminAccounts : [],
              laporanBulananRT: Array.isArray(legacy.laporanBulananRT) ? legacy.laporanBulananRT : [],
              deletedIds: {
                warga: legacy.deletedIds?.warga || [],
                transactions: legacy.deletedIds?.transactions || [],
                bantuan: legacy.deletedIds?.bantuan || [],
                pengumuman: legacy.deletedIds?.pengumuman || [],
                dokumen: legacy.deletedIds?.dokumen || [],
                adminAccounts: legacy.deletedIds?.adminAccounts || [],
                laporanBulananRT: legacy.deletedIds?.laporanBulananRT || [],
              },
            },
            initRevision
          );
          console.log('Legacy data_store.json berhasil dimigrasikan ke Cloud SQL PostgreSQL.');
        } else {
          await db
            .insert(appSettings)
            .values({
              id: 'kas',
              tahunAktif: DEFAULT_PENGATURAN_KAS.tahunAktif,
              nominalJimpitanTahunan: DEFAULT_PENGATURAN_KAS.nominalJimpitanTahunan,
              nominalJimpitanBulanan: DEFAULT_PENGATURAN_KAS.nominalJimpitanBulanan,
              nominalKematianTahunan: DEFAULT_PENGATURAN_KAS.nominalKematianTahunan,
              nominalKematianBulanan: DEFAULT_PENGATURAN_KAS.nominalKematianBulanan,
              saldoAwalKasUmum: DEFAULT_PENGATURAN_KAS.saldoAwalKasUmum,
              saldoAwalKasKematian: DEFAULT_PENGATURAN_KAS.saldoAwalKasKematian,
              keteranganSaldoAwal: DEFAULT_PENGATURAN_KAS.keteranganSaldoAwal,
              tanggalSaldoAwal: DEFAULT_PENGATURAN_KAS.tanggalSaldoAwal,
              kontakKetuaRT: DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
              kontakBendahara: DEFAULT_PENGATURAN_KAS.kontakBendahara,
              saldoBerlanjutPerTahun: DEFAULT_PENGATURAN_KAS.saldoBerlanjutPerTahun || null,
              profilRT: DEFAULT_PENGATURAN_KAS.profilRT || null,
              updatedAt: nowIso,
            })
            .onConflictDoNothing();

          await db
            .insert(syncMeta)
            .values({
              id: 'global',
              revision: initRevision,
              lastUpdated: nowIso,
            })
            .onConflictDoNothing();
        }
        hasCheckedInitialSeed = true;
      } catch (err) {
        console.error('SQL initial seed error:', err);
        throw new Error('Gagal menginisialisasi database server pusat.', { cause: err });
      } finally {
        seedPromise = null;
      }
    })();
  }
  await seedPromise;
}

async function bumpRevisionTx(executor: any = db, explicitRevision?: number): Promise<{ revision: number; lastUpdated: string }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const existingMeta = await executor.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1);
  const currentRev = existingMeta.length > 0 ? Number(existingMeta[0].revision) || 0 : 0;
  const nextRev = explicitRevision
    ? Math.max(explicitRevision, currentRev)
    : now > currentRev
    ? now
    : currentRev + 1;

  await executor
    .insert(syncMeta)
    .values({
      id: 'global',
      revision: nextRev,
      lastUpdated: nowIso,
    })
    .onConflictDoUpdate({
      target: syncMeta.id,
      set: {
        revision: nextRev,
        lastUpdated: nowIso,
      },
    });

  return { revision: nextRev, lastUpdated: nowIso };
}

function mapRowToSettings(row?: typeof appSettings.$inferSelect): PengaturanKas {
  if (!row) return { ...DEFAULT_PENGATURAN_KAS };
  return {
    nominalJimpitanTahunan: Number(row.nominalJimpitanTahunan) || 300000,
    nominalJimpitanBulanan: Number(row.nominalJimpitanBulanan) || 25000,
    nominalKematianTahunan: Number(row.nominalKematianTahunan) || 120000,
    nominalKematianBulanan: Number(row.nominalKematianBulanan) || 10000,
    saldoAwalKasUmum: Number(row.saldoAwalKasUmum) || 0,
    saldoAwalKasKematian: Number(row.saldoAwalKasKematian) || 0,
    keteranganSaldoAwal: row.keteranganSaldoAwal || 'Sisa Kas RT Periode Lalu',
    tanggalSaldoAwal: row.tanggalSaldoAwal || '2026-01-01',
    kontakKetuaRT: row.kontakKetuaRT || DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
    kontakBendahara: row.kontakBendahara || DEFAULT_PENGATURAN_KAS.kontakBendahara,
    tahunAktif: Number(row.tahunAktif) || 2026,
    saldoBerlanjutPerTahun: row.saldoBerlanjutPerTahun || undefined,
    profilRT: row.profilRT || DEFAULT_PENGATURAN_KAS.profilRT,
    updatedAt: row.updatedAt,
  };
}

function mapRowToWarga(row: typeof warga.$inferSelect): Warga {
  return {
    id: row.id,
    no: Number(row.no) || 0,
    nama: row.nama,
    noKK: row.noKK,
    nik: row.nik || undefined,
    noRumah: row.noRumah,
    rt: row.rt,
    rw: row.rw || undefined,
    alamat: row.alamat || undefined,
    kodePos: row.kodePos || undefined,
    tanggalDikeluarkan: row.tanggalDikeluarkan || undefined,
    jenisKelamin: row.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    jumlahJiwa: Number(row.jumlahJiwa) || 1,
    statusIuran: row.statusIuran === 'Sudah' ? 'Sudah' : 'Belum',
    anggotaKeluarga: row.anggotaKeluarga || undefined,
    riwayatIuran: row.riwayatIuran || undefined,
    riwayatKematian: row.riwayatKematian || undefined,
    riwayatIuranPerTahun: row.riwayatIuranPerTahun || undefined,
    riwayatKematianPerTahun: row.riwayatKematianPerTahun || undefined,
    statusIuranPerTahun: row.statusIuranPerTahun || undefined,
    iuranUmumTerbayar: row.iuranUmumTerbayar ?? undefined,
    iuranKematianTerbayar: row.iuranKematianTerbayar ?? undefined,
    pilihanSkema: row.pilihanSkema === 'bulanan' || row.pilihanSkema === 'tahunan' ? row.pilihanSkema : undefined,
    telepon: row.telepon || undefined,
    pin: row.pin || undefined,
    pinAttempts: row.pinAttempts ?? undefined,
    pinLockedUntil: row.pinLockedUntil ?? undefined,
    riwayatPerubahanKK: row.riwayatPerubahanKK || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToTransaction(row: typeof transactions.$inferSelect): Transaction {
  return {
    id: row.id,
    tanggal: row.tanggal,
    kategori: row.kategori,
    keterangan: row.keterangan,
    nominal: Number(row.nominal) || 0,
    tipe: row.tipe === 'keluar' || row.tipe === 'kematian' ? row.tipe : 'masuk',
    namaWarga: row.namaWarga || undefined,
    nomorRumah: row.nomorRumah || undefined,
    noKK: row.noKK || undefined,
    isSaldoAwal: row.isSaldoAwal ?? undefined,
    tahun: row.tahun ?? undefined,
    rtScope: row.rtScope || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToBantuan(row: typeof bantuan.$inferSelect): BantuanPemerintah {
  return {
    id: row.id,
    jenisBantuan: row.jenisBantuan,
    namaPenerima: row.namaPenerima,
    noKK: row.noKK,
    nik: row.nik || undefined,
    nominalAtauBarang: row.nominalAtauBarang,
    tanggal: row.tanggal,
    status: (['Sudah Disalurkan', 'Baru Diusulkan', 'Proses Verifikasi', 'Ditolak'].includes(row.status)
      ? row.status
      : 'Sudah Disalurkan') as BantuanPemerintah['status'],
    sumberDana: row.sumberDana || undefined,
    keterangan: row.keterangan || undefined,
    rtScope: row.rtScope || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToPengumuman(row: typeof pengumuman.$inferSelect): PengumumanRT {
  return {
    id: row.id,
    judul: row.judul,
    tanggal: row.tanggal,
    tanggalBerakhir: row.tanggalBerakhir,
    kategori: (['Kegiatan', 'Iuran', 'Keamanan', 'Sosial', 'Umum'].includes(row.kategori)
      ? row.kategori
      : 'Umum') as PengumumanRT['kategori'],
    isi: row.isi,
    penulis: row.penulis,
    namaPengurus: row.namaPengurus || undefined,
    jabatanPengurus: row.jabatanPengurus || undefined,
    penting: row.penting ?? undefined,
    tentang: row.tentang || undefined,
    hariTanggalAcara: row.hariTanggalAcara || undefined,
    waktuAcara: row.waktuAcara || undefined,
    tempatAcara: row.tempatAcara || undefined,
    keteranganTambahan: row.keteranganTambahan || undefined,
    rtScope: row.rtScope || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToDokumen(row: typeof dokumen.$inferSelect): DokumenPdfWarga {
  return {
    id: row.id,
    judul: row.judul,
    namaFile: row.namaFile,
    ukuranKb: Number(row.ukuranKb) || 0,
    tanggalUpload: row.tanggalUpload,
    kategori: row.kategori,
    keterangan: row.keterangan || undefined,
    dataBase64: row.dataBase64 || undefined,
    rtScope: row.rtScope || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToAdmin(row: typeof adminAccounts.$inferSelect): AdminRTAccount {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    nama: row.nama,
    rt: row.rt,
    rw: row.rw,
    kontak: row.kontak,
    jabatan: row.jabatan,
    status: row.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    terakhirLogin: row.terakhirLogin || undefined,
    terakhirSinkronisasi: row.terakhirSinkronisasi || undefined,
    updatedAt: row.updatedAt,
  };
}

function mapRowToLaporan(row: typeof laporanBulanan.$inferSelect): PembaruanBulananRT {
  return {
    id: row.id,
    rt: row.rt,
    rw: row.rw,
    namaAdminPengirim: row.namaAdminPengirim,
    tanggalKirim: row.tanggalKirim,
    bulanTahun: row.bulanTahun,
    tahun: Number(row.tahun) || 2026,
    totalKK: Number(row.totalKK) || 0,
    totalJiwa: Number(row.totalJiwa) || 0,
    totalLunasIuran: Number(row.totalLunasIuran) || 0,
    totalBelumLunas: Number(row.totalBelumLunas) || 0,
    totalKasMasukBulanIni: Number(row.totalKasMasukBulanIni) || 0,
    totalKasKeluarBulanIni: Number(row.totalKasKeluarBulanIni) || 0,
    saldoKasUmumBerjalan: Number(row.saldoKasUmumBerjalan) || 0,
    saldoKasKematianBerjalan: Number(row.saldoKasKematianBerjalan) || 0,
    totalPenerimaBansos: Number(row.totalPenerimaBansos) || 0,
    catatanKhusus: row.catatanKhusus || undefined,
    statusVerifikasi: (['Diterima', 'Menunggu Verifikasi', 'Perlu Klarifikasi'].includes(row.statusVerifikasi)
      ? row.statusVerifikasi
      : 'Menunggu Verifikasi') as PembaruanBulananRT['statusVerifikasi'],
    updatedAt: row.updatedAt,
  };
}

function toWargaRow(w: Warga, fallbackIso: string) {
  return {
    id: String(w.id),
    no: Number.isFinite(Number(w.no)) ? Number(w.no) : 0,
    nama: String(w.nama || 'Warga'),
    noKK: String(w.noKK || ''),
    nik: w.nik ? String(w.nik) : null,
    noRumah: String(w.noRumah || ''),
    rt: String(w.rt || '08'),
    rw: w.rw ? String(w.rw) : '05',
    alamat: w.alamat ? String(w.alamat) : null,
    kodePos: w.kodePos ? String(w.kodePos) : null,
    tanggalDikeluarkan: w.tanggalDikeluarkan ? String(w.tanggalDikeluarkan) : null,
    jenisKelamin: w.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    jumlahJiwa: Number.isFinite(Number(w.jumlahJiwa))
      ? Number(w.jumlahJiwa)
      : Array.isArray(w.anggotaKeluarga) && w.anggotaKeluarga.length > 0
      ? w.anggotaKeluarga.length
      : 1,
    statusIuran: w.statusIuran === 'Sudah' ? 'Sudah' : 'Belum',
    anggotaKeluarga: Array.isArray(w.anggotaKeluarga) ? w.anggotaKeluarga : null,
    riwayatIuran: w.riwayatIuran || null,
    riwayatKematian: w.riwayatKematian || null,
    riwayatIuranPerTahun: w.riwayatIuranPerTahun || null,
    riwayatKematianPerTahun: w.riwayatKematianPerTahun || null,
    statusIuranPerTahun: w.statusIuranPerTahun || null,
    iuranUmumTerbayar:
      typeof w.iuranUmumTerbayar === 'number' && Number.isFinite(w.iuranUmumTerbayar)
        ? w.iuranUmumTerbayar
        : null,
    iuranKematianTerbayar:
      typeof w.iuranKematianTerbayar === 'number' && Number.isFinite(w.iuranKematianTerbayar)
        ? w.iuranKematianTerbayar
        : null,
    pilihanSkema: w.pilihanSkema || null,
    telepon: w.telepon || null,
    pin: w.pin || null,
    pinAttempts: typeof w.pinAttempts === 'number' ? w.pinAttempts : null,
    pinLockedUntil: typeof w.pinLockedUntil === 'number' ? w.pinLockedUntil : null,
    riwayatPerubahanKK: Array.isArray(w.riwayatPerubahanKK) ? w.riwayatPerubahanKK : null,
    updatedAt: w.updatedAt || fallbackIso,
  };
}

function toTransactionRow(t: Transaction, fallbackIso: string) {
  return {
    id: String(t.id),
    tanggal: String(t.tanggal || ''),
    kategori: String(t.kategori || 'Iuran Warga'),
    keterangan: String(t.keterangan || ''),
    nominal: Number.isFinite(Number(t.nominal)) ? Math.round(Number(t.nominal)) : 0,
    tipe: t.tipe === 'keluar' || t.tipe === 'kematian' ? t.tipe : 'masuk',
    namaWarga: t.namaWarga || null,
    nomorRumah: t.nomorRumah || null,
    noKK: t.noKK || null,
    isSaldoAwal: typeof t.isSaldoAwal === 'boolean' ? t.isSaldoAwal : null,
    tahun: Number.isFinite(Number(t.tahun)) ? Number(t.tahun) : 2026,
    rtScope: t.rtScope || null,
    updatedAt: t.updatedAt || fallbackIso,
  };
}

function toBantuanRow(b: BantuanPemerintah, fallbackIso: string) {
  return {
    id: String(b.id),
    jenisBantuan: String(b.jenisBantuan || 'Bantuan'),
    namaPenerima: String(b.namaPenerima || ''),
    noKK: String(b.noKK || ''),
    nik: b.nik || null,
    nominalAtauBarang: String(b.nominalAtauBarang || ''),
    tanggal: String(b.tanggal || ''),
    status: b.status || 'Sudah Disalurkan',
    sumberDana: b.sumberDana || null,
    keterangan: b.keterangan || null,
    rtScope: b.rtScope || null,
    updatedAt: b.updatedAt || fallbackIso,
  };
}

function toPengumumanRow(p: PengumumanRT, fallbackIso: string) {
  return {
    id: String(p.id),
    judul: String(p.judul || ''),
    tanggal: String(p.tanggal || ''),
    tanggalBerakhir: String(p.tanggalBerakhir || ''),
    kategori: p.kategori || 'Umum',
    isi: String(p.isi || ''),
    penulis: String(p.penulis || ''),
    namaPengurus: p.namaPengurus || null,
    jabatanPengurus: p.jabatanPengurus || null,
    penting: typeof p.penting === 'boolean' ? p.penting : null,
    tentang: p.tentang || null,
    hariTanggalAcara: p.hariTanggalAcara || null,
    waktuAcara: p.waktuAcara || null,
    tempatAcara: p.tempatAcara || null,
    keteranganTambahan: p.keteranganTambahan || null,
    rtScope: p.rtScope || null,
    updatedAt: p.updatedAt || fallbackIso,
  };
}

function toDokumenRow(d: DokumenPdfWarga, fallbackIso: string) {
  return {
    id: String(d.id),
    judul: String(d.judul || ''),
    namaFile: String(d.namaFile || ''),
    ukuranKb: Number.isFinite(Number(d.ukuranKb)) ? Number(d.ukuranKb) : 0,
    tanggalUpload: String(d.tanggalUpload || ''),
    kategori: String(d.kategori || 'Lainnya'),
    keterangan: d.keterangan || null,
    dataBase64: d.dataBase64 || null,
    rtScope: d.rtScope || null,
    updatedAt: d.updatedAt || fallbackIso,
  };
}

function toAdminRow(a: AdminRTAccount, fallbackIso: string) {
  return {
    id: String(a.id),
    username: String(a.username || ''),
    passwordHash: String(a.passwordHash || ''),
    nama: String(a.nama || ''),
    rt: String(a.rt || '08'),
    rw: String(a.rw || '05'),
    kontak: String(a.kontak || ''),
    jabatan: String(a.jabatan || 'Ketua RT'),
    status: a.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    terakhirLogin: a.terakhirLogin || null,
    terakhirSinkronisasi: a.terakhirSinkronisasi || null,
    updatedAt: a.updatedAt || fallbackIso,
  };
}

function toLaporanRow(l: PembaruanBulananRT, fallbackIso: string) {
  return {
    id: String(l.id),
    rt: String(l.rt || '08'),
    rw: String(l.rw || '05'),
    namaAdminPengirim: String(l.namaAdminPengirim || ''),
    tanggalKirim: String(l.tanggalKirim || ''),
    bulanTahun: String(l.bulanTahun || ''),
    tahun: Number(l.tahun) || 2026,
    totalKK: Number(l.totalKK) || 0,
    totalJiwa: Number(l.totalJiwa) || 0,
    totalLunasIuran: Number(l.totalLunasIuran) || 0,
    totalBelumLunas: Number(l.totalBelumLunas) || 0,
    totalKasMasukBulanIni: Number(l.totalKasMasukBulanIni) || 0,
    totalKasKeluarBulanIni: Number(l.totalKasKeluarBulanIni) || 0,
    saldoKasUmumBerjalan: Number(l.saldoKasUmumBerjalan) || 0,
    saldoKasKematianBerjalan: Number(l.saldoKasKematianBerjalan) || 0,
    totalPenerimaBansos: Number(l.totalPenerimaBansos) || 0,
    catatanKhusus: l.catatanKhusus || null,
    statusVerifikasi: l.statusVerifikasi || 'Menunggu Verifikasi',
    updatedAt: l.updatedAt || fallbackIso,
  };
}

async function writeFullStateRaw(state: FullAppDatabaseState, explicitRevision?: number): Promise<FullAppDatabaseState> {
  const nowIso = state.lastUpdated || new Date().toISOString();
  const s = state.pengaturanKas || DEFAULT_PENGATURAN_KAS;

  return db.transaction(async (tx) => {
    await tx.delete(warga);
    await tx.delete(transactions);
    await tx.delete(bantuan);
    await tx.delete(pengumuman);
    await tx.delete(dokumen);
    await tx.delete(adminAccounts);
    await tx.delete(laporanBulanan);
    await tx.delete(deletedEntities);

    await tx
      .insert(appSettings)
      .values({
        id: 'kas',
        tahunAktif: Number(state.tahunAktif || s.tahunAktif) || 2026,
        nominalJimpitanTahunan: Number(s.nominalJimpitanTahunan) || 0,
        nominalJimpitanBulanan: Number(s.nominalJimpitanBulanan) || 0,
        nominalKematianTahunan: Number(s.nominalKematianTahunan) || 0,
        nominalKematianBulanan: Number(s.nominalKematianBulanan) || 0,
        saldoAwalKasUmum: Number(s.saldoAwalKasUmum) || 0,
        saldoAwalKasKematian: Number(s.saldoAwalKasKematian) || 0,
        keteranganSaldoAwal: String(s.keteranganSaldoAwal || ''),
        tanggalSaldoAwal: String(s.tanggalSaldoAwal || ''),
        kontakKetuaRT: s.kontakKetuaRT || DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
        kontakBendahara: s.kontakBendahara || DEFAULT_PENGATURAN_KAS.kontakBendahara,
        saldoBerlanjutPerTahun: s.saldoBerlanjutPerTahun || null,
        profilRT: s.profilRT || DEFAULT_PENGATURAN_KAS.profilRT,
        updatedAt: s.updatedAt || nowIso,
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          tahunAktif: Number(state.tahunAktif || s.tahunAktif) || 2026,
          nominalJimpitanTahunan: Number(s.nominalJimpitanTahunan) || 0,
          nominalJimpitanBulanan: Number(s.nominalJimpitanBulanan) || 0,
          nominalKematianTahunan: Number(s.nominalKematianTahunan) || 0,
          nominalKematianBulanan: Number(s.nominalKematianBulanan) || 0,
          saldoAwalKasUmum: Number(s.saldoAwalKasUmum) || 0,
          saldoAwalKasKematian: Number(s.saldoAwalKasKematian) || 0,
          keteranganSaldoAwal: String(s.keteranganSaldoAwal || ''),
          tanggalSaldoAwal: String(s.tanggalSaldoAwal || ''),
          kontakKetuaRT: s.kontakKetuaRT || DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
          kontakBendahara: s.kontakBendahara || DEFAULT_PENGATURAN_KAS.kontakBendahara,
          saldoBerlanjutPerTahun: s.saldoBerlanjutPerTahun || null,
          profilRT: s.profilRT || DEFAULT_PENGATURAN_KAS.profilRT,
          updatedAt: s.updatedAt || nowIso,
        },
      });

    const safeWarga = dedupeEntities(state.wargaList, [], (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK));
    const safeTx = dedupeEntities(state.transactions, []);
    const safeBantuan = dedupeEntities(state.bantuanList, []);
    const safePengumuman = dedupeEntities(state.pengumumanList, []);
    const safeDokumen = dedupeEntities(state.dokumenList, []);
    const safeAdmins = dedupeEntities(state.adminAccounts, [], (a, b) => a.username.toLowerCase() === b.username.toLowerCase());
    const safeLaporan = dedupeEntities(state.laporanBulananRT, []);

    if (safeWarga.length > 0) {
      await tx.insert(warga).values(safeWarga.map((w) => toWargaRow(w, nowIso)));
    }
    if (safeTx.length > 0) {
      await tx.insert(transactions).values(safeTx.map((t) => toTransactionRow(t, nowIso)));
    }
    if (safeBantuan.length > 0) {
      await tx.insert(bantuan).values(safeBantuan.map((b) => toBantuanRow(b, nowIso)));
    }
    if (safePengumuman.length > 0) {
      await tx.insert(pengumuman).values(safePengumuman.map((p) => toPengumumanRow(p, nowIso)));
    }
    if (safeDokumen.length > 0) {
      await tx.insert(dokumen).values(safeDokumen.map((d) => toDokumenRow(d, nowIso)));
    }
    if (safeAdmins.length > 0) {
      await tx.insert(adminAccounts).values(safeAdmins.map((a) => toAdminRow(a, nowIso)));
    }
    if (safeLaporan.length > 0) {
      await tx.insert(laporanBulanan).values(safeLaporan.map((l) => toLaporanRow(l, nowIso)));
    }

    const delRows: Array<{ id: string; entityType: string; entityId: string; deletedAt: string }> = [];
    const buckets: Array<[keyof DeletedIdsMap, string[]]> = [
      ['warga', state.deletedIds.warga],
      ['transactions', state.deletedIds.transactions],
      ['bantuan', state.deletedIds.bantuan],
      ['pengumuman', state.deletedIds.pengumuman],
      ['dokumen', state.deletedIds.dokumen],
      ['adminAccounts', state.deletedIds.adminAccounts],
      ['laporanBulananRT', state.deletedIds.laporanBulananRT],
    ];
    for (const [entityType, ids] of buckets) {
      for (const entityId of unionIdLists(ids)) {
        delRows.push({
          id: `${entityType}:${entityId}`,
          entityType,
          entityId,
          deletedAt: nowIso,
        });
      }
    }
    if (delRows.length > 0) {
      await tx.insert(deletedEntities).values(delRows);
    }

    const meta = await bumpRevisionTx(tx, explicitRevision);
    return {
      ...state,
      revision: meta.revision,
      lastUpdated: meta.lastUpdated,
    };
  });
}

export async function readFullStateSql(): Promise<FullAppDatabaseState> {
  try {
    await ensureSqlSeeded();

    const [
      settingsRows,
      wargaRows,
      txRows,
      bantuanRows,
      pengumumanRows,
      dokumenRows,
      adminRows,
      laporanRows,
      delRows,
      metaRows,
    ] = await Promise.all([
      db.select().from(appSettings).where(eq(appSettings.id, 'kas')).limit(1),
      db.select().from(warga),
      db.select().from(transactions),
      db.select().from(bantuan),
      db.select().from(pengumuman),
      db.select().from(dokumen),
      db.select().from(adminAccounts),
      db.select().from(laporanBulanan),
      db.select().from(deletedEntities),
      db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1),
    ]);

    const deletedIds: DeletedIdsMap = {
      warga: [],
      transactions: [],
      bantuan: [],
      pengumuman: [],
      dokumen: [],
      adminAccounts: [],
      laporanBulananRT: [],
    };
    for (const r of delRows) {
      const k = r.entityType as keyof DeletedIdsMap;
      if (k in deletedIds) {
        deletedIds[k].push(r.entityId);
      }
    }

    const settings = mapRowToSettings(settingsRows[0]);
    const revision = metaRows[0] ? Number(metaRows[0].revision) || 1 : 1;
    const lastUpdated = metaRows[0]?.lastUpdated || settings.updatedAt || new Date().toISOString();

    return {
      version: 2,
      revision,
      lastUpdated,
      tahunAktif: settings.tahunAktif || 2026,
      pengaturanKas: settings,
      wargaList: dedupeEntities(
        wargaRows.map(mapRowToWarga).sort((a, b) => (a.no || 0) - (b.no || 0)),
        deletedIds.warga,
        (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
      ),
      transactions: txRows.map(mapRowToTransaction).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
      bantuanList: bantuanRows.map(mapRowToBantuan),
      pengumumanList: pengumumanRows.map(mapRowToPengumuman).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
      dokumenList: dokumenRows.map(mapRowToDokumen),
      adminAccounts: adminRows.map(mapRowToAdmin),
      laporanBulananRT: laporanRows.map(mapRowToLaporan),
      deletedIds,
    };
  } catch (err) {
    console.error('Database read error (readFullStateSql):', err);
    throw new Error('Gagal membaca database server pusat.', { cause: err });
  }
}

export async function getDatabaseSnapshotForUser(user: AuthUser): Promise<FullAppDatabaseState> {
  const full = await readFullStateSql();
  if (user.role === 'server' || user.role === 'admin') {
    return full;
  }

  // Warga role: enforce UU PDP privacy isolation (only their own family card + public RT cash/announcements)
  const targetKKDigits = String(user.noKK || '').replace(/\D/g, '');
  const ownWarga = full.wargaList.filter((w) => {
    if (user.wargaId && w.id === user.wargaId) return true;
    if (targetKKDigits && w.noKK.replace(/\D/g, '') === targetKKDigits) return true;
    return false;
  });

  return {
    ...full,
    wargaList: ownWarga,
    bantuanList: [],
    dokumenList: [],
    adminAccounts: [],
    laporanBulananRT: [],
  };
}

export async function checkDatabaseHealthSql(): Promise<{
  connected: boolean;
  revision: number;
  lastUpdated: string;
  totalWarga: number;
  totalAdminAccounts: number;
}> {
  try {
    await db.execute(sql`SELECT 1`);
    await ensureSqlSeeded();
    const [metaRows, wargaCountRows, adminCountRows] = await Promise.all([
      db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1),
      db.select({ count: sql<number>`count(*)::int` }).from(warga),
      db.select({ count: sql<number>`count(*)::int` }).from(adminAccounts),
    ]);
    return {
      connected: true,
      revision: metaRows[0] ? Number(metaRows[0].revision) || 1 : 1,
      lastUpdated: metaRows[0]?.lastUpdated || new Date().toISOString(),
      totalWarga: Number(wargaCountRows[0]?.count) || 0,
      totalAdminAccounts: Number(adminCountRows[0]?.count) || 0,
    };
  } catch (err: any) {
    console.error('Database health check failed:', err);
    const detail = err?.code ? `${err.code}: ${err.message}` : err?.message;
    throw new Error(`Koneksi database server bermasalah (${detail || 'SQL error'}).`, { cause: err });
  }
}

export async function getPublicBootstrapInfoSql() {
  try {
    await ensureSqlSeeded();
    const [settingsRows, metaRows] = await Promise.all([
      db.select().from(appSettings).where(eq(appSettings.id, 'kas')).limit(1),
      db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1),
    ]);
    const settings = mapRowToSettings(settingsRows[0]);
    return {
      pengaturanKas: settings,
      tahunAktif: settings.tahunAktif,
      revision: metaRows[0] ? Number(metaRows[0].revision) || 1 : 1,
      lastUpdated: metaRows[0]?.lastUpdated || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Public bootstrap info error:', err);
    throw new Error('Gagal memuat info server.', { cause: err });
  }
}

export async function getAdminAccountsSql(): Promise<{
  adminAccounts: AdminRTAccount[];
  deletedAdminIds: string[];
  revision: number;
}> {
  try {
    await ensureSqlSeeded();
    const [rows, delRows, metaRows] = await Promise.all([
      db.select().from(adminAccounts),
      db.select().from(deletedEntities).where(eq(deletedEntities.entityType, 'adminAccounts')),
      db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1),
    ]);
    return {
      adminAccounts: rows.map(mapRowToAdmin),
      deletedAdminIds: delRows.map((d) => d.entityId),
      revision: metaRows[0] ? Number(metaRows[0].revision) || 1 : 1,
    };
  } catch (err) {
    console.error('Get admin accounts error:', err);
    throw new Error('Gagal mengambil daftar akun admin.', { cause: err });
  }
}

export async function authenticateAndCreateSessionSql(params: {
  role: 'server' | 'admin' | 'warga';
  username: string;
  password: string;
}): Promise<{ ok: true; token: string; user: AuthUser } | { ok: false; status: number; message: string }> {
  try {
    await ensureSqlSeeded();
    const role = params.role;
    const username = String(params.username || '').trim();
    const password = String(params.password || '').trim();

    if (!username || !password) {
      return { ok: false, status: 400, message: 'Username dan password harus diisi.' };
    }

    let matchedUser: AuthUser | null = null;

    if (role === 'server') {
      if (username === 'RW05GLEMPANG' && password === 'Rw05glempang') {
        matchedUser = {
          role: 'server',
          username: 'RW05GLEMPANG',
          nama: 'Super Admin Server RW 05 Glempang',
          rtScope: 'Semua RT se-RW 05 Glempang',
          isPinAuthenticated: false,
        };
      } else {
        return {
          ok: false,
          status: 401,
          message: 'Username atau password Server salah. Akses ini khusus Pengelola Server.',
        };
      }
    } else if (role === 'admin') {
      const [rows, settingsRows] = await Promise.all([
        db.select().from(adminAccounts),
        db.select().from(appSettings).where(eq(appSettings.id, 'kas')).limit(1),
      ]);
      const admins = rows.map(mapRowToAdmin);
      const matched = admins.find(
        (a) => a.username.trim().toLowerCase() === username.toLowerCase()
      );

      if (matched) {
        if (matched.passwordHash !== password) {
          return {
            ok: false,
            status: 401,
            message: 'Password salah! Periksa kembali kata sandi admin RT Anda.',
          };
        }
        if (matched.status === 'nonaktif') {
          return {
            ok: false,
            status: 403,
            message: `Akun Admin ${matched.nama} sedang dinonaktifkan oleh Server Pusat.`,
          };
        }
        const nowLabel = new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Asia/Jakarta',
        }).format(new Date());
        const nowIso = new Date().toISOString();
        await db
          .update(adminAccounts)
          .set({ terakhirLogin: nowLabel, updatedAt: nowIso })
          .where(eq(adminAccounts.id, matched.id));

        matchedUser = {
          role: 'admin',
          username: matched.username,
          nama: matched.nama,
          rtScope: `RT ${matched.rt} RW ${matched.rw}`,
          isPinAuthenticated: false,
        };
      } else if (username.toLowerCase() === 'admin' && password === 'rt08rw05') {
        // Built-in default Admin bootstrap stored straight to Cloud SQL so every device shares it
        const settings = mapRowToSettings(settingsRows[0]);
        const rtStr = settings.profilRT?.namaRT || '08';
        const rwStr = settings.profilRT?.namaRW || '05';
        const ketuaNama = settings.kontakKetuaRT?.nama?.trim();
        const nowIso = new Date().toISOString();
        const nowLabel = new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Asia/Jakarta',
        }).format(new Date());

        const newAdmin: AdminRTAccount = {
          id: 'adm_rt08',
          username: 'Admin',
          passwordHash: 'rt08rw05',
          nama: ketuaNama ? `${ketuaNama} (Ketua RT ${rtStr})` : `Ketua RT ${rtStr} RW ${rwStr}`,
          rt: rtStr,
          rw: rwStr,
          kontak: settings.kontakKetuaRT?.telp || '0812-3456-7890',
          jabatan: `Ketua RT ${rtStr} RW ${rwStr}`,
          status: 'aktif',
          terakhirLogin: nowLabel,
          terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
          updatedAt: nowIso,
        };

        await db
          .insert(adminAccounts)
          .values(toAdminRow(newAdmin, nowIso))
          .onConflictDoUpdate({
            target: adminAccounts.id,
            set: toAdminRow(newAdmin, nowIso),
          });
        await bumpRevisionTx();

        matchedUser = {
          role: 'admin',
          username: newAdmin.username,
          nama: newAdmin.nama,
          rtScope: `RT ${newAdmin.rt} RW ${newAdmin.rw}`,
          isPinAuthenticated: false,
        };
      } else {
        return {
          ok: false,
          status: 401,
          message: `Akun Admin "${username}" tidak ditemukan atau belum disinkronkan ke Database Server.`,
        };
      }
    } else if (role === 'warga') {
      const noKKRaw = password.replace(/\s+/g, '');
      const noKKDigits = noKKRaw.replace(/\D/g, '');
      const wargaRows = await db.select().from(warga);
      const list = wargaRows.map(mapRowToWarga);
      const lowerName = username.toLowerCase();

      const matchedWarga = list.find((w) => {
        if (!w.noKK) return false;
        const storedRaw = w.noKK.trim().replace(/\s+/g, '');
        const storedDigits = storedRaw.replace(/\D/g, '');
        const kkMatches =
          storedRaw === noKKRaw ||
          (noKKDigits.length >= 6 && storedDigits.length >= 6 && storedDigits === noKKDigits);
        if (!kkMatches) return false;

        const headMatches =
          w.nama.toLowerCase().includes(lowerName) || lowerName.includes(w.nama.toLowerCase());
        const memberMatches = Array.isArray(w.anggotaKeluarga)
          ? w.anggotaKeluarga.some(
              (a) =>
                a.nama &&
                (a.nama.toLowerCase().includes(lowerName) || lowerName.includes(a.nama.toLowerCase()))
            )
          : false;
        return headMatches || memberMatches;
      });

      if (!matchedWarga) {
        const nameExists = list.some(
          (w) =>
            w.nama.toLowerCase().includes(lowerName) || lowerName.includes(w.nama.toLowerCase())
        );
        return {
          ok: false,
          status: 401,
          message: nameExists
            ? 'Nomor KK tidak sesuai dengan data di database server. Pastikan 16 digit No KK benar.'
            : `Data warga "${username}" dengan Nomor KK tersebut tidak ditemukan di database server.`,
        };
      }

      matchedUser = {
        role: 'warga',
        username: matchedWarga.nama,
        nama: matchedWarga.nama,
        noKK: matchedWarga.noKK,
        wargaId: matchedWarga.id,
        rtScope: `RT ${matchedWarga.rt || '08'} RW ${matchedWarga.rw || '05'}`,
        isPinAuthenticated: false,
      };
    }

    if (!matchedUser) {
      return { ok: false, status: 401, message: 'Role login tidak valid.' };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const nowMs = Date.now();
    const expiresAt = nowMs + 30 * 24 * 60 * 60 * 1000;

    await db.insert(authSessions).values({
      tokenHash,
      role: matchedUser.role,
      username: matchedUser.username,
      nama: matchedUser.nama,
      noKK: matchedUser.noKK || null,
      wargaId: matchedUser.wargaId || null,
      rtScope: matchedUser.rtScope || null,
      expiresAt,
      createdAt: new Date(nowMs).toISOString(),
    });

    return { ok: true, token: rawToken, user: matchedUser };
  } catch (err) {
    console.error('Authentication SQL error:', err);
    throw new Error('Gagal melakukan autentikasi ke database server.', { cause: err });
  }
}

export async function createSessionForAdminUserSql(user: AuthUser): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const nowMs = Date.now();
  await db.insert(authSessions).values({
    tokenHash,
    role: user.role,
    username: user.username,
    nama: user.nama,
    noKK: user.noKK || null,
    wargaId: user.wargaId || null,
    rtScope: user.rtScope || null,
    expiresAt: nowMs + 30 * 24 * 60 * 60 * 1000,
    createdAt: new Date(nowMs).toISOString(),
  });
  return rawToken;
}

export async function verifySessionTokenSql(rawToken: string): Promise<ServerSessionRecord | null> {
  try {
    const tokenHash = hashToken(rawToken);
    const rows = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    if (rows.length === 0) return null;
    const session = rows[0];
    if (Date.now() > Number(session.expiresAt)) {
      await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
      return null;
    }

    // Re-check disabled admin status
    if (session.role === 'admin') {
      const admins = await db.select().from(adminAccounts);
      const matched = admins.find(
        (a) => a.username.trim().toLowerCase() === session.username.trim().toLowerCase()
      );
      if (matched && matched.status === 'nonaktif') {
        return null;
      }
    }

    return {
      tokenHash: session.tokenHash,
      role: (session.role === 'server' || session.role === 'admin' ? session.role : 'warga') as AuthUser['role'],
      username: session.username,
      nama: session.nama,
      noKK: session.noKK || undefined,
      wargaId: session.wargaId || undefined,
      rtScope: session.rtScope || undefined,
      isPinAuthenticated: false,
      expiresAt: Number(session.expiresAt),
    };
  } catch (err) {
    console.error('Verify session token SQL error:', err);
    throw new Error('Gagal memverifikasi sesi server.', { cause: err });
  }
}

export async function revokeSessionTokenSql(rawToken: string): Promise<void> {
  try {
    const tokenHash = hashToken(rawToken);
    await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  } catch (err) {
    console.error('Revoke session token error:', err);
  }
}

export async function searchWargaSql(user: AuthUser, searchQuery = '', rtFilter = ''): Promise<Warga[]> {
  try {
    await ensureSqlSeeded();
    const rows = await db.select().from(warga);
    let list = dedupeEntities(
      rows.map(mapRowToWarga).sort((a, b) => (a.no || 0) - (b.no || 0)),
      [],
      (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
    );

    if (user.role === 'warga') {
      const targetKK = String(user.noKK || '').replace(/\D/g, '');
      list = list.filter((w) => w.id === user.wargaId || (targetKK && w.noKK.replace(/\D/g, '') === targetKK));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w) =>
          w.nama.toLowerCase().includes(q) ||
          (w.noKK || '').toLowerCase().includes(q) ||
          (w.nik || '').toLowerCase().includes(q) ||
          (w.noRumah || '').toLowerCase().includes(q) ||
          (Array.isArray(w.anggotaKeluarga) &&
            w.anggotaKeluarga.some(
              (a) => a.nama.toLowerCase().includes(q) || (a.nik || '').toLowerCase().includes(q)
            ))
      );
    }

    const rt = rtFilter.trim();
    if (rt) {
      list = list.filter((w) => w.rt === rt);
    }

    return list;
  } catch (err) {
    console.error('Search warga SQL error:', err);
    throw new Error('Gagal mencari data warga di server.', { cause: err });
  }
}

export async function upsertWargaSql(incoming: Warga): Promise<{ warga: Warga; revision: number }> {
  return withDbWriteLock(async () => {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const existingRows = await db.select().from(warga);
    const matchById = existingRows.find((r) => r.id === incoming.id);
    const matchByKK =
      !matchById && incoming.noKK
        ? existingRows.find((r) => r.noKK && r.noKK === incoming.noKK)
        : undefined;

    const targetId = matchById?.id || matchByKK?.id || incoming.id || `w_${Date.now()}`;
    const nextNo =
      Number(incoming.no) > 0
        ? Number(incoming.no)
        : matchById?.no || matchByKK?.no || existingRows.length + 1;

    const stamped: Warga = {
      ...incoming,
      id: targetId,
      no: nextNo,
      updatedAt: incoming.updatedAt || nowIso,
    };

    const row = toWargaRow(stamped, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `warga:${targetId}`));
      await tx
        .insert(warga)
        .values(row)
        .onConflictDoUpdate({
          target: warga.id,
          set: row,
        });
      return bumpRevisionTx(tx);
    });

    return { warga: mapRowToWarga(row as typeof warga.$inferSelect), revision: meta.revision };
  } catch (err) {
    console.error('Upsert warga SQL error:', err);
    throw new Error('Gagal menyimpan data warga ke database server.', { cause: err });
  }
  });
}

export async function updateWargaSelfSql(
  wargaId: string | undefined,
  noKK: string | undefined,
  patch: { pin?: string; telepon?: string }
): Promise<{ warga: Warga; revision: number } | null> {
  try {
    const rows = await db.select().from(warga);
    const target = rows.find(
      (r) => (wargaId && r.id === wargaId) || (noKK && r.noKK === noKK)
    );
    if (!target) return null;

    const nowIso = new Date().toISOString();
    const nextPin =
      patch.pin && /^\d{6}$/.test(patch.pin) ? patch.pin : target.pin;
    const nextTelp =
      typeof patch.telepon === 'string' ? patch.telepon.slice(0, 32) : target.telepon;

    const meta = await db.transaction(async (tx) => {
      await tx
        .update(warga)
        .set({
          pin: nextPin,
          telepon: nextTelp,
          updatedAt: nowIso,
        })
        .where(eq(warga.id, target.id));
      return bumpRevisionTx(tx);
    });

    return {
      warga: mapRowToWarga({ ...target, pin: nextPin, telepon: nextTelp, updatedAt: nowIso }),
      revision: meta.revision,
    };
  } catch (err) {
    console.error('Update warga self SQL error:', err);
    throw new Error('Gagal memperbarui profil warga.', { cause: err });
  }
}

export async function bulkImportWargaBantuanSql(params: {
  wargaList: Array<Omit<Warga, 'id' | 'no'> & { id?: string }>;
  bantuanList: Array<Omit<BantuanPemerintah, 'id'> & { id?: string }>;
  mergeExisting: boolean;
  tahunAktif: number;
}): Promise<{ addedKK: number; updatedKK: number; addedBantuan: number; revision: number }> {
  return withDbWriteLock(async () => {
    try {
      await ensureSqlSeeded();
      const nowIso = new Date().toISOString();
      const baseTime = Date.now();
      const existingWargaRows = await db.select().from(warga);
      const existingWarga = existingWargaRows.map(mapRowToWarga);
      const existingBantuanRows = await db.select().from(bantuan);
      const existingBantuan = existingBantuanRows.map(mapRowToBantuan);

      let addedKK = 0;
      let updatedKK = 0;
      let addedBantuan = 0;

      const wargaToUpsert: Warga[] = [];
      const bantuanToInsert: BantuanPemerintah[] = [];
      const usedIds = new Set(existingWarga.map((w) => w.id));

      params.wargaList.forEach((incoming, idx) => {
        const findInPool = (pool: Warga[]) =>
          incoming.noKK
            ? pool.find((w) => w.noKK === incoming.noKK)
            : pool.find((w) => w.nama.toLowerCase() === incoming.nama.toLowerCase());

        const existing = findInPool(wargaToUpsert) || findInPool(existingWarga);

        if (existing) {
          if (params.mergeExisting) {
            const nextStatus = incoming.statusIuran || existing.statusIuran || 'Belum';
            const merged: Warga = {
              ...existing,
              nama: incoming.nama || existing.nama,
              noKK: incoming.noKK || existing.noKK,
              nik: incoming.nik || existing.nik,
              noRumah: incoming.noRumah || existing.noRumah,
              rt: incoming.rt || existing.rt,
              rw: incoming.rw || existing.rw,
              alamat: incoming.alamat || existing.alamat,
              kodePos: incoming.kodePos || existing.kodePos,
              jenisKelamin: incoming.jenisKelamin || existing.jenisKelamin,
              anggotaKeluarga:
                incoming.anggotaKeluarga && incoming.anggotaKeluarga.length > 0
                  ? incoming.anggotaKeluarga
                  : existing.anggotaKeluarga,
              jumlahJiwa:
                incoming.anggotaKeluarga && incoming.anggotaKeluarga.length > 0
                  ? incoming.anggotaKeluarga.length
                  : existing.jumlahJiwa,
              telepon: incoming.telepon || existing.telepon,
              statusIuran: nextStatus,
              statusIuranPerTahun: {
                ...(existing.statusIuranPerTahun || {}),
                [params.tahunAktif]: nextStatus,
              },
              updatedAt: nowIso,
            };
            const queuedIdx = wargaToUpsert.findIndex((w) => w.id === merged.id);
            if (queuedIdx >= 0) {
              wargaToUpsert[queuedIdx] = merged;
            } else {
              wargaToUpsert.push(merged);
              updatedKK++;
            }
          }
        } else {
          let candidateId =
            incoming.id && !usedIds.has(incoming.id)
              ? incoming.id
              : `w_${baseTime}_${idx}_${randomBytes(3).toString('hex')}`;
          while (usedIds.has(candidateId)) {
            candidateId = `w_${baseTime}_${idx}_${randomBytes(4).toString('hex')}`;
          }
          usedIds.add(candidateId);

          const newWarga: Warga = {
            ...incoming,
            id: candidateId,
            no: existingWarga.length + addedKK + 1,
            statusIuran: incoming.statusIuran || 'Belum',
            statusIuranPerTahun: { [params.tahunAktif]: incoming.statusIuran || 'Belum' },
            pin: incoming.pin || '123456',
            updatedAt: nowIso,
          };
          wargaToUpsert.push(newWarga);
          addedKK++;
        }
      });

      params.bantuanList.forEach((b, idx) => {
        const matchesBantuan = (ex: BantuanPemerintah) =>
          ex.noKK === b.noKK &&
          ex.namaPenerima.toLowerCase() === b.namaPenerima.toLowerCase() &&
          ex.jenisBantuan.toLowerCase() === b.jenisBantuan.toLowerCase() &&
          ex.tanggal === b.tanggal;
        const dup = existingBantuan.some(matchesBantuan) || bantuanToInsert.some(matchesBantuan);
        if (!dup) {
          bantuanToInsert.push({
            ...b,
            id: b.id || `b_${baseTime}_${idx}_${randomBytes(3).toString('hex')}`,
            updatedAt: nowIso,
          });
          addedBantuan++;
        }
      });

      const meta = await db.transaction(async (tx) => {
        for (const item of wargaToUpsert) {
          const row = toWargaRow(item, nowIso);
          await tx.delete(deletedEntities).where(eq(deletedEntities.id, `warga:${row.id}`));
          await tx
            .insert(warga)
            .values(row)
            .onConflictDoUpdate({ target: warga.id, set: row });
        }
        for (const bItem of bantuanToInsert) {
          const row = toBantuanRow(bItem, nowIso);
          await tx
            .insert(bantuan)
            .values(row)
            .onConflictDoUpdate({ target: bantuan.id, set: row });
        }
        return bumpRevisionTx(tx);
      });

      return { addedKK, updatedKK, addedBantuan, revision: meta.revision };
    } catch (err) {
      console.error('Bulk import SQL error:', err);
      throw new Error('Gagal mengimpor data Excel ke database server.', { cause: err });
    }
  });
}

export async function deleteWargaSql(idOrKK: string): Promise<{ revision: number; totalWarga: number }> {
  return withDbWriteLock(async () => {
    try {
      await ensureSqlSeeded();
      const nowIso = new Date().toISOString();
      const rows = await db.select().from(warga);
      const matchingIds = rows
        .filter((r) => r.id === idOrKK || (r.noKK && r.noKK === idOrKK))
        .map((r) => r.id);
      if (matchingIds.length === 0) {
        matchingIds.push(idOrKK);
      }

      const meta = await db.transaction(async (tx) => {
        await tx.delete(warga).where(inArray(warga.id, matchingIds));
        for (const id of matchingIds) {
          await tx
            .insert(deletedEntities)
            .values({
              id: `warga:${id}`,
              entityType: 'warga',
              entityId: id,
              deletedAt: nowIso,
            })
            .onConflictDoNothing();
        }
        return bumpRevisionTx(tx);
      });

      const remaining = await db.select({ id: warga.id }).from(warga);
      return { revision: meta.revision, totalWarga: remaining.length };
    } catch (err) {
      console.error('Delete warga SQL error:', err);
      throw new Error('Gagal menghapus data warga dari database server.', { cause: err });
    }
  });
}

export async function upsertTransactionSql(txItem: Transaction): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const row = toTransactionRow({ ...txItem, updatedAt: txItem.updatedAt || nowIso }, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `transactions:${row.id}`));
      await tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Upsert transaction SQL error:', err);
    throw new Error('Gagal menyimpan transaksi kas ke server.', { cause: err });
  }
}

export async function deleteTransactionSql(id: string): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const meta = await db.transaction(async (tx) => {
      await tx.delete(transactions).where(eq(transactions.id, id));
      await tx
        .insert(deletedEntities)
        .values({ id: `transactions:${id}`, entityType: 'transactions', entityId: id, deletedAt: nowIso })
        .onConflictDoNothing();
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Delete transaction SQL error:', err);
    throw new Error('Gagal menghapus transaksi dari server.', { cause: err });
  }
}

export async function upsertPengumumanSql(p: PengumumanRT): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const row = toPengumumanRow({ ...p, updatedAt: p.updatedAt || nowIso }, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `pengumuman:${row.id}`));
      await tx.insert(pengumuman).values(row).onConflictDoUpdate({ target: pengumuman.id, set: row });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Upsert pengumuman SQL error:', err);
    throw new Error('Gagal menyimpan pengumuman ke server.', { cause: err });
  }
}

export async function deletePengumumanSql(id: string): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const meta = await db.transaction(async (tx) => {
      await tx.delete(pengumuman).where(eq(pengumuman.id, id));
      await tx
        .insert(deletedEntities)
        .values({ id: `pengumuman:${id}`, entityType: 'pengumuman', entityId: id, deletedAt: nowIso })
        .onConflictDoNothing();
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Delete pengumuman SQL error:', err);
    throw new Error('Gagal menghapus pengumuman dari server.', { cause: err });
  }
}

export async function upsertBantuanSql(b: BantuanPemerintah): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const row = toBantuanRow({ ...b, updatedAt: b.updatedAt || nowIso }, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `bantuan:${row.id}`));
      await tx.insert(bantuan).values(row).onConflictDoUpdate({ target: bantuan.id, set: row });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Upsert bantuan SQL error:', err);
    throw new Error('Gagal menyimpan data bantuan ke server.', { cause: err });
  }
}

export async function deleteBantuanSql(id: string): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const meta = await db.transaction(async (tx) => {
      await tx.delete(bantuan).where(eq(bantuan.id, id));
      await tx
        .insert(deletedEntities)
        .values({ id: `bantuan:${id}`, entityType: 'bantuan', entityId: id, deletedAt: nowIso })
        .onConflictDoNothing();
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Delete bantuan SQL error:', err);
    throw new Error('Gagal menghapus data bantuan dari server.', { cause: err });
  }
}

export async function upsertDokumenSql(d: DokumenPdfWarga): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const row = toDokumenRow({ ...d, updatedAt: d.updatedAt || nowIso }, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `dokumen:${row.id}`));
      await tx.insert(dokumen).values(row).onConflictDoUpdate({ target: dokumen.id, set: row });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Upsert dokumen SQL error:', err);
    throw new Error('Gagal menyimpan dokumen ke server.', { cause: err });
  }
}

export async function deleteDokumenSql(id: string): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const meta = await db.transaction(async (tx) => {
      await tx.delete(dokumen).where(eq(dokumen.id, id));
      await tx
        .insert(deletedEntities)
        .values({ id: `dokumen:${id}`, entityType: 'dokumen', entityId: id, deletedAt: nowIso })
        .onConflictDoNothing();
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Delete dokumen SQL error:', err);
    throw new Error('Gagal menghapus dokumen dari server.', { cause: err });
  }
}

export async function upsertLaporanSql(l: PembaruanBulananRT): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const row = toLaporanRow({ ...l, updatedAt: l.updatedAt || nowIso }, nowIso);
    const meta = await db.transaction(async (tx) => {
      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `laporanBulananRT:${row.id}`));
      await tx.insert(laporanBulanan).values(row).onConflictDoUpdate({ target: laporanBulanan.id, set: row });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Upsert laporan SQL error:', err);
    throw new Error('Gagal menyimpan laporan bulanan ke server.', { cause: err });
  }
}

export async function updateSettingsSql(s: PengaturanKas, tahunAktif?: number): Promise<number> {
  try {
    await ensureSqlSeeded();
    const nowIso = s.updatedAt || new Date().toISOString();
    const nextTahun = Number(tahunAktif || s.tahunAktif) || 2026;
    const meta = await db.transaction(async (tx) => {
      await tx
        .insert(appSettings)
        .values({
          id: 'kas',
          tahunAktif: nextTahun,
          nominalJimpitanTahunan: Number(s.nominalJimpitanTahunan) || 0,
          nominalJimpitanBulanan: Number(s.nominalJimpitanBulanan) || 0,
          nominalKematianTahunan: Number(s.nominalKematianTahunan) || 0,
          nominalKematianBulanan: Number(s.nominalKematianBulanan) || 0,
          saldoAwalKasUmum: Number(s.saldoAwalKasUmum) || 0,
          saldoAwalKasKematian: Number(s.saldoAwalKasKematian) || 0,
          keteranganSaldoAwal: String(s.keteranganSaldoAwal || ''),
          tanggalSaldoAwal: String(s.tanggalSaldoAwal || ''),
          kontakKetuaRT: s.kontakKetuaRT || DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
          kontakBendahara: s.kontakBendahara || DEFAULT_PENGATURAN_KAS.kontakBendahara,
          saldoBerlanjutPerTahun: s.saldoBerlanjutPerTahun || null,
          profilRT: s.profilRT || DEFAULT_PENGATURAN_KAS.profilRT,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: {
            tahunAktif: nextTahun,
            nominalJimpitanTahunan: Number(s.nominalJimpitanTahunan) || 0,
            nominalJimpitanBulanan: Number(s.nominalJimpitanBulanan) || 0,
            nominalKematianTahunan: Number(s.nominalKematianTahunan) || 0,
            nominalKematianBulanan: Number(s.nominalKematianBulanan) || 0,
            saldoAwalKasUmum: Number(s.saldoAwalKasUmum) || 0,
            saldoAwalKasKematian: Number(s.saldoAwalKasKematian) || 0,
            keteranganSaldoAwal: String(s.keteranganSaldoAwal || ''),
            tanggalSaldoAwal: String(s.tanggalSaldoAwal || ''),
            kontakKetuaRT: s.kontakKetuaRT || DEFAULT_PENGATURAN_KAS.kontakKetuaRT,
            kontakBendahara: s.kontakBendahara || DEFAULT_PENGATURAN_KAS.kontakBendahara,
            saldoBerlanjutPerTahun: s.saldoBerlanjutPerTahun || null,
            profilRT: s.profilRT || DEFAULT_PENGATURAN_KAS.profilRT,
            updatedAt: nowIso,
          },
        });
      return bumpRevisionTx(tx);
    });
    return meta.revision;
  } catch (err) {
    console.error('Update settings SQL error:', err);
    throw new Error('Gagal menyimpan pengaturan ke server.', { cause: err });
  }
}

export async function mergeAndSaveFullStateSql(
  payload: any,
  options?: { reviveAdminIds?: string[] }
): Promise<FullAppDatabaseState> {
  return withDbWriteLock(async () => {
  try {
    await ensureSqlSeeded();

    if (payload?.isHardReset === true) {
      const nowIso = new Date().toISOString();
      return writeFullStateRaw({
        version: 2,
        revision: Date.now(),
        lastUpdated: nowIso,
        tahunAktif: Number(payload.tahunAktif) || 2026,
        pengaturanKas: payload.pengaturanKas || DEFAULT_PENGATURAN_KAS,
        wargaList: Array.isArray(payload.wargaList) ? payload.wargaList : [],
        transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
        bantuanList: Array.isArray(payload.bantuanList) ? payload.bantuanList : [],
        pengumumanList: Array.isArray(payload.pengumumanList) ? payload.pengumumanList : [],
        dokumenList: Array.isArray(payload.dokumenList) ? payload.dokumenList : [],
        adminAccounts: Array.isArray(payload.adminAccounts) ? payload.adminAccounts : [],
        laporanBulananRT: Array.isArray(payload.laporanBulananRT) ? payload.laporanBulananRT : [],
        deletedIds: {
          warga: [],
          transactions: [],
          bantuan: [],
          pengumuman: [],
          dokumen: [],
          adminAccounts: [],
          laporanBulananRT: [],
        },
      });
    }

    const existing = await readFullStateSql();
    const existingDeleted = existing.deletedIds;
    const incomingDeleted = payload?.deletedIds || {};
    const reviveSet = new Set((options?.reviveAdminIds || []).filter(Boolean));

    const mergedDeletedAdmins = unionIdLists(
      existingDeleted.adminAccounts,
      incomingDeleted.adminAccounts
    ).filter((id) => !reviveSet.has(id));

    const deletedIds: DeletedIdsMap = {
      warga: unionIdLists(existingDeleted.warga, incomingDeleted.warga, payload?.deletedWargaIds),
      transactions: unionIdLists(existingDeleted.transactions, incomingDeleted.transactions),
      bantuan: unionIdLists(existingDeleted.bantuan, incomingDeleted.bantuan),
      pengumuman: unionIdLists(
        existingDeleted.pengumuman,
        incomingDeleted.pengumuman,
        payload?.deletedPengumumanIds
      ),
      dokumen: unionIdLists(existingDeleted.dokumen, incomingDeleted.dokumen),
      adminAccounts: mergedDeletedAdmins,
      laporanBulananRT: unionIdLists(
        existingDeleted.laporanBulananRT,
        incomingDeleted.laporanBulananRT
      ),
    };

    const mergedAdmins = mergeEntities(
      existing.adminAccounts,
      Array.isArray(payload?.adminAccounts) ? payload.adminAccounts : [],
      deletedIds.adminAccounts,
      (a, b) => a.username.toLowerCase() === b.username.toLowerCase()
    );

    const mergedWarga = mergeEntities(
      existing.wargaList,
      Array.isArray(payload?.wargaList) ? payload.wargaList : [],
      deletedIds.warga,
      (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
    );

    const mergedTx = mergeEntities(
      existing.transactions,
      Array.isArray(payload?.transactions) ? payload.transactions : [],
      deletedIds.transactions
    );

    const mergedPengumuman = mergeEntities(
      existing.pengumumanList,
      Array.isArray(payload?.pengumumanList) ? payload.pengumumanList : [],
      deletedIds.pengumuman
    );

    const mergedBantuan = mergeEntities(
      existing.bantuanList,
      Array.isArray(payload?.bantuanList) ? payload.bantuanList : [],
      deletedIds.bantuan
    );

    const mergedDokumen = mergeEntities(
      existing.dokumenList,
      Array.isArray(payload?.dokumenList) ? payload.dokumenList : [],
      deletedIds.dokumen
    );

    const mergedLaporan = mergeEntities(
      existing.laporanBulananRT,
      Array.isArray(payload?.laporanBulananRT) ? payload.laporanBulananRT : [],
      deletedIds.laporanBulananRT
    );

    const existingSettingsTs = toEpochMs(existing.pengaturanKas?.updatedAt);
    const incomingSettingsTs = toEpochMs(payload?.pengaturanKas?.updatedAt);
    const mergedPengaturanKas =
      !existing.pengaturanKas || (payload?.pengaturanKas && incomingSettingsTs >= existingSettingsTs)
        ? payload?.pengaturanKas || existing.pengaturanKas
        : existing.pengaturanKas;
    const mergedTahunAktif =
      !existing.pengaturanKas || (payload?.pengaturanKas && incomingSettingsTs >= existingSettingsTs)
        ? Number(payload?.tahunAktif) || existing.tahunAktif || 2026
        : existing.tahunAktif || Number(payload?.tahunAktif) || 2026;

    const nowIso = new Date().toISOString();
    return writeFullStateRaw({
      version: 2,
      revision: existing.revision + 1,
      lastUpdated: nowIso,
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
    });
  } catch (err) {
    console.error('Merge and save SQL error:', err);
    throw new Error('Gagal menyinkronkan data ke database server.', { cause: err });
  }
  });
}

export async function syncAdminAccountSql(params: {
  account: AdminRTAccount;
  syncData?: any;
  deletedIds?: Partial<DeletedIdsMap>;
  allowOverwrite?: boolean;
}): Promise<
  | { ok: true; account: AdminRTAccount; mergedData: FullAppDatabaseState }
  | { ok: false; status: number; message: string }
> {
  try {
    await ensureSqlSeeded();
    const { account, syncData, deletedIds, allowOverwrite } = params;
    const username = String(account?.username || '').trim();
    const passwordHash = String(account?.passwordHash || '').trim();

    if (!account || !username || !passwordHash) {
      return {
        ok: false,
        status: 400,
        message: 'Username dan password akun admin harus diisi untuk sinkronisasi ke server.',
      };
    }

    const existing = await readFullStateSql();
    const existingMatch = existing.adminAccounts.find(
      (a) => a.username.trim().toLowerCase() === username.toLowerCase()
    );

    if (existingMatch && !allowOverwrite && existingMatch.passwordHash !== passwordHash) {
      return {
        ok: false,
        status: 403,
        message:
          'Username admin tersebut sudah terdaftar di server dengan password berbeda. Gunakan password yang benar atau hubungi Server Pusat.',
      };
    }

    const nowIso = new Date().toISOString();
    const nowLabel = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());

    const targetId = String(existingMatch?.id || account.id || `adm_${Date.now()}`);
    const stampedAccount: AdminRTAccount = {
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
      status:
        existingMatch?.status === 'nonaktif'
          ? 'nonaktif'
          : account.status === 'nonaktif'
          ? 'nonaktif'
          : 'aktif',
      terakhirLogin: account.terakhirLogin || nowLabel,
      terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
      updatedAt: nowIso,
    };

    if (stampedAccount.status === 'nonaktif') {
      return {
        ok: false,
        status: 403,
        message: `Akun Admin ${stampedAccount.nama} berstatus nonaktif di Server Pusat.`,
      };
    }

    const incomingSync = syncData && typeof syncData === 'object' ? syncData : {};
    const incomingAdmins: AdminRTAccount[] = Array.isArray(incomingSync.adminAccounts)
      ? incomingSync.adminAccounts
      : [];

    const payloadForMerge = {
      ...incomingSync,
      adminAccounts: [
        stampedAccount,
        ...incomingAdmins.filter(
          (a) =>
            a &&
            a.id !== targetId &&
            String(a.username || '').trim().toLowerCase() !== username.toLowerCase()
        ),
      ],
      deletedIds: deletedIds || incomingSync.deletedIds || {},
    };

    const reviveIds = [targetId, account.id, existingMatch?.id].filter(Boolean) as string[];
    if (username.toLowerCase() === 'admin') reviveIds.push('adm_rt08');

    const mergedData = await mergeAndSaveFullStateSql(payloadForMerge, {
      reviveAdminIds: reviveIds,
    });

    const confirmedAccount =
      mergedData.adminAccounts.find(
        (a) => a.username.trim().toLowerCase() === username.toLowerCase()
      ) || stampedAccount;

    return { ok: true, account: confirmedAccount, mergedData };
  } catch (err) {
    console.error('Sync admin account SQL error:', err);
    throw new Error('Gagal menyinkronkan akun admin ke database server.', { cause: err });
  }
}
