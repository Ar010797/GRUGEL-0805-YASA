import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getApps as getAdminApps, initializeApp as initAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import {
  db,
  getDatabaseConfigStatus,
  isSqlNetworkOrUnavailableError,
  isSqlTemporarilyUnavailable,
  markSqlUnavailable,
  pool,
} from './index.ts';
import {
  adminAccounts,
  appSettings,
  auditLogs,
  authSessions,
  bantuan,
  deletedEntities,
  dokumen,
  laporanBulanan,
  notificationReads,
  notifications,
  pengumuman,
  processedMutations,
  pushSubscriptions,
  syncMeta,
  transactions,
  warga,
} from './schema.ts';
import { scrubPiiFromNotificationText } from '../utils/pushService.ts';
import type {
  AdminRTAccount,
  AppNotification,
  AuditLogEntry,
  AuthUser,
  BantuanPemerintah,
  DokumenPdfWarga,
  PembaruanBulananRT,
  PengaturanKas,
  PengumumanRT,
  RiwayatPerubahanKK,
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
let hasEnsuredTables = false;
let ensureTablesPromise: Promise<void> | null = null;
let hasEnsuredSchema = false;
let ensureSchemaPromise: Promise<void> | null = null;

export class SqlUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SqlUnavailableError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  code = 'FORBIDDEN';
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class VersionConflictError extends Error {
  status = 409;
  code = 'VERSION_CONFLICT';
  currentVersion?: number;
  constructor(message: string, currentVersion?: number) {
    super(message);
    this.name = 'VersionConflictError';
    this.currentVersion = currentVersion;
  }
}

export class BadRequestError extends Error {
  status = 400;
  code = 'BAD_REQUEST';
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function isSqlUnavailable(err: unknown): boolean {
  if (err instanceof SqlUnavailableError || isSqlNetworkOrUnavailableError(err)) {
    markSqlUnavailable(60_000);
    return true;
  }
  return false;
}

function assertDatabaseConfigured() {
  if (isSqlTemporarilyUnavailable()) {
    throw new SqlUnavailableError('Koneksi PostgreSQL sedang tidak terjangkau pada runtime ini.');
  }
  const status = getDatabaseConfigStatus();
  if (!status.configured) {
    throw new SqlUnavailableError(
      status.errorMessage || 'Database PostgreSQL belum dikonfigurasi pada runtime ini.'
    );
  }
  return status;
}

export function normalizeRtCode(raw?: string | null): string {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '08';
  if (s === 'SEMUA' || s === 'ALL' || s.includes('SEMUA')) return 'SEMUA';
  const match = s.match(/RT\s*0*(\d+)/i) || s.match(/^0*(\d+)$/);
  if (match && match[1]) {
    return match[1].padStart(2, '0');
  }
  return '08';
}

export function normalizeRwCode(raw?: string | null): string {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '05';
  const match = s.match(/RW\s*0*(\d+)/i) || s.match(/^0*(\d+)$/);
  if (match && match[1]) {
    return match[1].padStart(2, '0');
  }
  return '05';
}

export function extractUserRtRw(user: AuthUser): { rt: string; rw: string } {
  if (user.role === 'server') {
    return { rt: 'SEMUA', rw: '05' };
  }
  const scope = String(user.rtScope || '').trim();
  const rtMatch = scope.match(/RT\s*0*(\d+)/i);
  const rwMatch = scope.match(/RW\s*0*(\d+)/i);
  return {
    rt: rtMatch ? rtMatch[1].padStart(2, '0') : '08',
    rw: rwMatch ? rwMatch[1].padStart(2, '0') : '05',
  };
}

export function extractScopeRtRw(rtScope?: string | null, fallbackRt = '08', fallbackRw = '05'): { rt: string; rw: string } {
  const s = String(rtScope || '').trim();
  if (!s) return { rt: normalizeRtCode(fallbackRt), rw: normalizeRwCode(fallbackRw) };
  if (/semua/i.test(s)) return { rt: 'SEMUA', rw: normalizeRwCode(fallbackRw) };
  const rtMatch = s.match(/RT\s*0*(\d+)/i);
  const rwMatch = s.match(/RW\s*0*(\d+)/i);
  return {
    rt: rtMatch ? rtMatch[1].padStart(2, '0') : normalizeRtCode(fallbackRt),
    rw: rwMatch ? rwMatch[1].padStart(2, '0') : normalizeRwCode(fallbackRw),
  };
}

export function formatRtScope(rt: string, rw = '05'): string {
  const cleanRt = normalizeRtCode(rt);
  if (cleanRt === 'SEMUA') return 'Semua RT';
  const cleanRw = normalizeRwCode(rw);
  return `RT ${cleanRt} RW ${cleanRw}`;
}

export function getRtSettingsId(rw: string, rt: string): string {
  const cleanRt = normalizeRtCode(rt);
  if (!cleanRt || cleanRt === 'SEMUA') return 'kas';
  const cleanRw = normalizeRwCode(rw);
  return `kas_rw${cleanRw}_rt${cleanRt}`;
}

export function normalizeTargetRts(targetRts?: string[] | null, rtScope?: string | null): string[] {
  if (Array.isArray(targetRts) && targetRts.length > 0) {
    const cleaned = targetRts.map((x) => normalizeRtCode(x)).filter(Boolean);
    if (cleaned.includes('SEMUA')) return ['SEMUA'];
    if (cleaned.length > 0) return Array.from(new Set(cleaned));
  }
  const parsed = extractScopeRtRw(rtScope, 'SEMUA', '05');
  if (parsed.rt === 'SEMUA') return ['SEMUA'];
  return [parsed.rt];
}

export function canUserAccessAnnouncement(p: PengumumanRT, user: AuthUser): boolean {
  if (user.role === 'server') return true;
  const { rt } = extractUserRtRw(user);
  const targets = normalizeTargetRts(p.targetRts, p.rtScope);
  if (targets.includes('SEMUA')) return true;
  return targets.includes(rt);
}

export function assertCanMutateRtRw(
  user: AuthUser,
  targetRt: string,
  targetRw = '05',
  allowAllForAdmin = false
): { rt: string; rw: string } {
  const cleanRt = normalizeRtCode(targetRt);
  const cleanRw = normalizeRwCode(targetRw);
  if (user.role === 'warga') {
    throw new ForbiddenError('Akun Warga tidak diizinkan mengubah data administrasi.');
  }
  if (user.role === 'server') {
    return { rt: cleanRt, rw: cleanRw };
  }
  const userScope = extractUserRtRw(user);
  if (!allowAllForAdmin && cleanRt === 'SEMUA') {
    throw new ForbiddenError(
      `Admin ${formatRtScope(userScope.rt, userScope.rw)} tidak diizinkan membuat/mengubah data lintas Semua RT.`
    );
  }
  if (cleanRt !== 'SEMUA' && (cleanRt !== userScope.rt || cleanRw !== userScope.rw)) {
    throw new ForbiddenError(
      `Akses ditolak: Anda hanya berwenang mengelola data wilayah ${formatRtScope(userScope.rt, userScope.rw)} (bukan RT ${cleanRt} RW ${cleanRw}).`
    );
  }
  return { rt: userScope.rt, rw: userScope.rw };
}

function getUserKey(user: AuthUser): string {
  if (user.role === 'warga') {
    return `warga:${user.wargaId || user.noKK || user.username}`;
  }
  return `${user.role}:${user.username.toLowerCase()}`;
}

async function checkSchemaAlreadyProvisioned(): Promise<{ allTables: boolean; allColumns: boolean }> {
  try {
    const res = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN (
           'app_settings', 'admin_accounts', 'warga', 'transactions',
           'bantuan', 'pengumuman', 'dokumen', 'laporan_bulanan',
           'deleted_entities', 'sync_meta', 'auth_sessions',
           'notifications', 'notification_reads', 'push_subscriptions',
           'audit_logs', 'processed_mutations'
         )`
    );
    const byTable = new Map<string, Set<string>>();
    for (const row of res.rows) {
      let set = byTable.get(row.table_name);
      if (!set) {
        set = new Set<string>();
        byTable.set(row.table_name, set);
      }
      set.add(row.column_name);
    }
    const requiredTables = [
      'app_settings',
      'admin_accounts',
      'warga',
      'transactions',
      'bantuan',
      'pengumuman',
      'dokumen',
      'laporan_bulanan',
      'deleted_entities',
      'sync_meta',
      'auth_sessions',
      'notifications',
      'notification_reads',
      'push_subscriptions',
      'audit_logs',
      'processed_mutations',
    ];
    const allTables = requiredTables.every((t) => byTable.has(t));
    const allColumns =
      allTables &&
      Boolean(byTable.get('app_settings')?.has('version')) &&
      Boolean(byTable.get('admin_accounts')?.has('version')) &&
      Boolean(byTable.get('warga')?.has('version')) &&
      Boolean(byTable.get('transactions')?.has('resident_id')) &&
      Boolean(byTable.get('transactions')?.has('version')) &&
      Boolean(byTable.get('bantuan')?.has('version')) &&
      Boolean(byTable.get('pengumuman')?.has('target_rts')) &&
      Boolean(byTable.get('pengumuman')?.has('sender_rt')) &&
      Boolean(byTable.get('pengumuman')?.has('version')) &&
      Boolean(byTable.get('dokumen')?.has('version')) &&
      Boolean(byTable.get('laporan_bulanan')?.has('version'));
    return { allTables, allColumns };
  } catch {
    return { allTables: false, allColumns: false };
  }
}

export async function ensureSchemaReadySql(): Promise<void> {
  if (hasEnsuredSchema) return;
  assertDatabaseConfigured();
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = (async () => {
      try {
        const check = await checkSchemaAlreadyProvisioned();
        if (check.allColumns) {
          hasEnsuredTables = true;
          hasEnsuredSchema = true;
          return;
        }
        await ensureTablesExistSql();
        await pool.query(`
          ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE warga ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS resident_id TEXT;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE bantuan ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE pengumuman ADD COLUMN IF NOT EXISTS target_rts JSONB;
          ALTER TABLE pengumuman ADD COLUMN IF NOT EXISTS sender_rt TEXT;
          ALTER TABLE pengumuman ADD COLUMN IF NOT EXISTS sender_rw TEXT;
          ALTER TABLE pengumuman ADD COLUMN IF NOT EXISTS sender_role TEXT;
          ALTER TABLE pengumuman ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE dokumen ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE laporan_bulanan ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            category TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            rw_id TEXT NOT NULL DEFAULT '05',
            target_rts JSONB NOT NULL,
            target_roles JSONB,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS notification_reads (
            id TEXT PRIMARY KEY,
            notification_id TEXT NOT NULL,
            user_key TEXT NOT NULL,
            read_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS push_subscriptions (
            id TEXT PRIMARY KEY,
            user_key TEXT NOT NULL,
            role TEXT NOT NULL,
            rt_id TEXT NOT NULL DEFAULT 'SEMUA',
            rw_id TEXT NOT NULL DEFAULT '05',
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            actor_username TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            actor_rt TEXT NOT NULL,
            actor_rw TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            rt_scope TEXT,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS processed_mutations (
            mutation_id TEXT PRIMARY KEY,
            user_key TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            revision BIGINT NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
          );
        `);
        hasEnsuredSchema = true;
      } finally {
        ensureSchemaPromise = null;
      }
    })();
  }
  await ensureSchemaPromise;
}

/**
 * Ensures all required PostgreSQL tables exist (idempotent DDL) so fresh databases
 * connected via DATABASE_URL on Vercel/Neon/Supabase work immediately on first boot
 * without touching existing Cloud SQL rows.
 */
export async function ensureTablesExistSql(): Promise<void> {
  if (hasEnsuredTables) return;
  assertDatabaseConfigured();
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      try {
        const check = await checkSchemaAlreadyProvisioned();
        if (check.allTables) {
          hasEnsuredTables = true;
          return;
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            uid TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'warga',
            created_at TIMESTAMP DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            tahun_aktif INTEGER NOT NULL DEFAULT 2026,
            nominal_jimpitan_tahunan BIGINT NOT NULL DEFAULT 300000,
            nominal_jimpitan_bulanan BIGINT NOT NULL DEFAULT 25000,
            nominal_kematian_tahunan BIGINT NOT NULL DEFAULT 120000,
            nominal_kematian_bulanan BIGINT NOT NULL DEFAULT 10000,
            saldo_awal_kas_umum BIGINT NOT NULL DEFAULT 0,
            saldo_awal_kas_kematian BIGINT NOT NULL DEFAULT 0,
            keterangan_saldo_awal TEXT NOT NULL DEFAULT 'Sisa Kas RT Periode Lalu',
            tanggal_saldo_awal TEXT NOT NULL DEFAULT '2026-01-01',
            kontak_ketua_rt JSONB NOT NULL,
            kontak_bendahara JSONB NOT NULL,
            saldo_berlanjut_per_tahun JSONB,
            profil_rt JSONB,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS admin_accounts (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            nama TEXT NOT NULL,
            rt TEXT NOT NULL DEFAULT '08',
            rw TEXT NOT NULL DEFAULT '05',
            kontak TEXT NOT NULL DEFAULT '',
            jabatan TEXT NOT NULL DEFAULT 'Ketua RT',
            status TEXT NOT NULL DEFAULT 'aktif',
            terakhir_login TEXT,
            terakhir_sinkronisasi TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS warga (
            id TEXT PRIMARY KEY,
            no INTEGER NOT NULL DEFAULT 0,
            nama TEXT NOT NULL,
            no_kk TEXT NOT NULL DEFAULT '',
            nik TEXT,
            no_rumah TEXT NOT NULL DEFAULT '',
            rt TEXT NOT NULL DEFAULT '08',
            rw TEXT DEFAULT '05',
            alamat TEXT,
            kode_pos TEXT,
            tanggal_dikeluarkan TEXT,
            jenis_kelamin TEXT NOT NULL DEFAULT 'Laki-laki',
            jumlah_jiwa INTEGER NOT NULL DEFAULT 1,
            status_iuran TEXT NOT NULL DEFAULT 'Belum',
            anggota_keluarga JSONB,
            riwayat_iuran JSONB,
            riwayat_kematian JSONB,
            riwayat_iuran_per_tahun JSONB,
            riwayat_kematian_per_tahun JSONB,
            status_iuran_per_tahun JSONB,
            iuran_umum_terbayar BIGINT,
            iuran_kematian_terbayar BIGINT,
            pilihan_skema TEXT,
            telepon TEXT,
            pin TEXT,
            pin_attempts INTEGER,
            pin_locked_until BIGINT,
            riwayat_perubahan_kk JSONB,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            tanggal TEXT NOT NULL,
            kategori TEXT NOT NULL,
            keterangan TEXT NOT NULL DEFAULT '',
            nominal BIGINT NOT NULL DEFAULT 0,
            tipe TEXT NOT NULL DEFAULT 'masuk',
            nama_warga TEXT,
            nomor_rumah TEXT,
            no_kk TEXT,
            is_saldo_awal BOOLEAN,
            tahun INTEGER DEFAULT 2026,
            rt_scope TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS bantuan (
            id TEXT PRIMARY KEY,
            jenis_bantuan TEXT NOT NULL,
            nama_penerima TEXT NOT NULL,
            no_kk TEXT NOT NULL DEFAULT '',
            nik TEXT,
            nominal_atau_barang TEXT NOT NULL DEFAULT '',
            tanggal TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Sudah Disalurkan',
            sumber_dana TEXT,
            keterangan TEXT,
            rt_scope TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS pengumuman (
            id TEXT PRIMARY KEY,
            judul TEXT NOT NULL,
            tanggal TEXT NOT NULL,
            tanggal_berakhir TEXT NOT NULL DEFAULT '',
            kategori TEXT NOT NULL DEFAULT 'Umum',
            isi TEXT NOT NULL,
            penulis TEXT NOT NULL DEFAULT '',
            nama_pengurus TEXT,
            jabatan_pengurus TEXT,
            penting BOOLEAN,
            tentang TEXT,
            hari_tanggal_acara TEXT,
            waktu_acara TEXT,
            tempat_acara TEXT,
            keterangan_tambahan TEXT,
            rt_scope TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS dokumen (
            id TEXT PRIMARY KEY,
            judul TEXT NOT NULL,
            nama_file TEXT NOT NULL,
            ukuran_kb INTEGER NOT NULL DEFAULT 0,
            tanggal_upload TEXT NOT NULL DEFAULT '',
            kategori TEXT NOT NULL DEFAULT 'Lainnya',
            keterangan TEXT,
            data_base64 TEXT,
            rt_scope TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS laporan_bulanan (
            id TEXT PRIMARY KEY,
            rt TEXT NOT NULL,
            rw TEXT NOT NULL,
            nama_admin_pengirim TEXT NOT NULL,
            tanggal_kirim TEXT NOT NULL,
            bulan_tahun TEXT NOT NULL,
            tahun INTEGER NOT NULL DEFAULT 2026,
            total_kk INTEGER NOT NULL DEFAULT 0,
            total_jiwa INTEGER NOT NULL DEFAULT 0,
            total_lunas_iuran INTEGER NOT NULL DEFAULT 0,
            total_belum_lunas INTEGER NOT NULL DEFAULT 0,
            total_kas_masuk_bulan_ini BIGINT NOT NULL DEFAULT 0,
            total_kas_keluar_bulan_ini BIGINT NOT NULL DEFAULT 0,
            saldo_kas_umum_berjalan BIGINT NOT NULL DEFAULT 0,
            saldo_kas_kematian_berjalan BIGINT NOT NULL DEFAULT 0,
            total_penerima_bansos INTEGER NOT NULL DEFAULT 0,
            catatan_khusus TEXT,
            status_verifikasi TEXT NOT NULL DEFAULT 'Menunggu Verifikasi',
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS deleted_entities (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            deleted_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS sync_meta (
            id TEXT PRIMARY KEY,
            revision BIGINT NOT NULL DEFAULT 1,
            last_updated TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            role TEXT NOT NULL,
            username TEXT NOT NULL,
            nama TEXT NOT NULL,
            no_kk TEXT,
            warga_id TEXT,
            rt_scope TEXT,
            expires_at BIGINT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
        hasEnsuredTables = true;
      } finally {
        ensureTablesPromise = null;
      }
    })();
  }
  await ensureTablesPromise;
}

/**
 * Automatically migrates existing data_store.json data into PostgreSQL on first access
 * if PostgreSQL has no sync_meta row yet. Idempotent and safe under concurrency.
 */
export async function ensureSqlSeeded(): Promise<void> {
  await ensureSchemaReadySql();
  if (hasCheckedInitialSeed) return;
  assertDatabaseConfigured();
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        await pool.query('SELECT 1');
        let metaRows;
        try {
          metaRows = await db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1);
          hasEnsuredTables = true;
        } catch (queryErr: any) {
          const errCode = queryErr?.code || queryErr?.cause?.code;
          const errMsg = String(queryErr?.message || '');
          if (errCode === '42P01' || errMsg.includes('does not exist')) {
            await ensureTablesExistSql();
            metaRows = await db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1);
          } else {
            throw queryErr;
          }
        }

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
          console.log('Legacy data_store.json berhasil dimigrasikan ke PostgreSQL.');
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
      } catch (err: any) {
        if (isSqlUnavailable(err)) {
          const msg = 'Cloud SQL tidak tersedia pada runtime ini (Mode Firebase aktif).';
          console.info(msg);
          throw err instanceof SqlUnavailableError ? err : new SqlUnavailableError(msg, { cause: err });
        }
        console.error('SQL initial seed error:', err);
        const detail = err?.code ? `${err.code}: ${err.message}` : err?.message;
        throw new Error(
          detail && detail.includes('belum dikonfigurasi')
            ? detail
            : `Gagal menginisialisasi database server pusat (${detail || 'SQL error'}).`,
          { cause: err }
        );
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
  if (!row) return { ...DEFAULT_PENGATURAN_KAS, version: 1 };
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
    version: Number((row as any).version) || 1,
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
    version: Number((row as any).version) || 1,
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
    residentId: (row as any).residentId || undefined,
    namaWarga: row.namaWarga || undefined,
    nomorRumah: row.nomorRumah || undefined,
    noKK: row.noKK || undefined,
    isSaldoAwal: row.isSaldoAwal ?? undefined,
    tahun: row.tahun ?? undefined,
    rtScope: row.rtScope || undefined,
    updatedAt: row.updatedAt,
    version: Number((row as any).version) || 1,
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
    version: Number((row as any).version) || 1,
  };
}

function mapRowToPengumuman(row: typeof pengumuman.$inferSelect): PengumumanRT {
  const targetRts = normalizeTargetRts((row as any).targetRts, row.rtScope);
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
    rtScope: row.rtScope || (targetRts.includes('SEMUA') ? 'Semua RT' : targetRts.map((r) => `RT ${r}`).join(', ')),
    targetRts,
    senderRt: (row as any).senderRt || undefined,
    senderRw: (row as any).senderRw || undefined,
    senderRole: (row as any).senderRole === 'server' || (row as any).senderRole === 'admin' ? (row as any).senderRole : undefined,
    updatedAt: row.updatedAt,
    version: Number((row as any).version) || 1,
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
    version: Number((row as any).version) || 1,
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
    version: Number((row as any).version) || 1,
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
    version: Number((row as any).version) || 1,
  };
}

function toWargaRow(w: Warga, fallbackIso: string, nextVersion?: number) {
  return {
    id: String(w.id),
    no: Number.isFinite(Number(w.no)) ? Number(w.no) : 0,
    nama: String(w.nama || 'Warga'),
    noKK: String(w.noKK || ''),
    nik: w.nik ? String(w.nik) : null,
    noRumah: String(w.noRumah || ''),
    rt: normalizeRtCode(w.rt || '08'),
    rw: normalizeRwCode(w.rw || '05'),
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
    version: nextVersion ?? (Number(w.version) || 1),
  };
}

function toTransactionRow(t: Transaction, fallbackIso: string, nextVersion?: number) {
  return {
    id: String(t.id),
    tanggal: String(t.tanggal || ''),
    kategori: String(t.kategori || 'Iuran Warga'),
    keterangan: String(t.keterangan || ''),
    nominal: Number.isFinite(Number(t.nominal)) ? Math.round(Number(t.nominal)) : 0,
    tipe: t.tipe === 'keluar' || t.tipe === 'kematian' ? t.tipe : 'masuk',
    residentId: t.residentId ? String(t.residentId) : null,
    namaWarga: t.namaWarga || null,
    nomorRumah: t.nomorRumah || null,
    noKK: t.noKK || null,
    isSaldoAwal: typeof t.isSaldoAwal === 'boolean' ? t.isSaldoAwal : null,
    tahun: Number.isFinite(Number(t.tahun)) ? Number(t.tahun) : 2026,
    rtScope: t.rtScope || null,
    updatedAt: t.updatedAt || fallbackIso,
    version: nextVersion ?? (Number(t.version) || 1),
  };
}

function toBantuanRow(b: BantuanPemerintah, fallbackIso: string, nextVersion?: number) {
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
    version: nextVersion ?? (Number(b.version) || 1),
  };
}

function toPengumumanRow(p: PengumumanRT, fallbackIso: string, nextVersion?: number) {
  const targetRts = normalizeTargetRts(p.targetRts, p.rtScope);
  const resolvedScope =
    p.rtScope ||
    (targetRts.includes('SEMUA') ? 'Semua RT' : targetRts.map((r) => `RT ${r}`).join(', '));
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
    rtScope: resolvedScope,
    targetRts,
    senderRt: p.senderRt || null,
    senderRw: p.senderRw || null,
    senderRole: p.senderRole || null,
    updatedAt: p.updatedAt || fallbackIso,
    version: nextVersion ?? (Number(p.version) || 1),
  };
}

function toDokumenRow(d: DokumenPdfWarga, fallbackIso: string, nextVersion?: number) {
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
    version: nextVersion ?? (Number(d.version) || 1),
  };
}

function toAdminRow(a: AdminRTAccount, fallbackIso: string, nextVersion?: number) {
  return {
    id: String(a.id),
    username: String(a.username || ''),
    passwordHash: String(a.passwordHash || ''),
    nama: String(a.nama || ''),
    rt: normalizeRtCode(a.rt || '08'),
    rw: normalizeRwCode(a.rw || '05'),
    kontak: String(a.kontak || ''),
    jabatan: String(a.jabatan || 'Ketua RT'),
    status: a.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    terakhirLogin: a.terakhirLogin || null,
    terakhirSinkronisasi: a.terakhirSinkronisasi || null,
    updatedAt: a.updatedAt || fallbackIso,
    version: nextVersion ?? (Number(a.version) || 1),
  };
}

function toLaporanRow(l: PembaruanBulananRT, fallbackIso: string, nextVersion?: number) {
  return {
    id: String(l.id),
    rt: normalizeRtCode(l.rt || '08'),
    rw: normalizeRwCode(l.rw || '05'),
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
    version: nextVersion ?? (Number(l.version) || 1),
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
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      throw err instanceof SqlUnavailableError
        ? err
        : new SqlUnavailableError(err?.message || 'Cloud SQL tidak tersedia.', { cause: err });
    }
    console.error('Database read error (readFullStateSql):', err);
    throw new Error('Gagal membaca database server pusat.', { cause: err });
  }
}

export function filterStateForUser(
  full: FullAppDatabaseState,
  user: AuthUser,
  overrideSettings?: PengaturanKas
): FullAppDatabaseState {
  const effectiveSettings = overrideSettings || full.pengaturanKas;

  if (user.role === 'server') {
    return {
      ...full,
      pengaturanKas: effectiveSettings,
      tahunAktif: effectiveSettings.tahunAktif || full.tahunAktif,
    };
  }

  const userScope = extractUserRtRw(user);

  const inUserRt = (rtScope?: string | null, fallbackRt = '08', fallbackRw = '05') => {
    const parsed = extractScopeRtRw(rtScope, fallbackRt, fallbackRw);
    if (parsed.rt === 'SEMUA') return true;
    return parsed.rt === userScope.rt && parsed.rw === userScope.rw;
  };

  if (user.role === 'admin') {
    const scopedWarga = full.wargaList.filter(
      (w) => normalizeRtCode(w.rt) === userScope.rt && normalizeRwCode(w.rw || '05') === userScope.rw
    );
    const scopedTx = full.transactions.filter((t) => inUserRt(t.rtScope));
    const scopedBantuan = full.bantuanList.filter((b) => inUserRt(b.rtScope));
    const scopedDokumen = full.dokumenList.filter((d) => inUserRt(d.rtScope));
    const scopedPengumuman = full.pengumumanList.filter((p) => canUserAccessAnnouncement(p, user));
    const scopedLaporan = full.laporanBulananRT.filter(
      (l) => normalizeRtCode(l.rt) === userScope.rt && normalizeRwCode(l.rw || '05') === userScope.rw
    );
    const ownAdminAccount = full.adminAccounts.filter(
      (a) => a.username.trim().toLowerCase() === user.username.trim().toLowerCase()
    );

    const rtScopedSettings: PengaturanKas = {
      ...effectiveSettings,
      profilRT: {
        ...(effectiveSettings.profilRT || DEFAULT_PENGATURAN_KAS.profilRT!),
        namaRT: effectiveSettings.profilRT?.namaRT || userScope.rt,
        namaRW: effectiveSettings.profilRT?.namaRW || userScope.rw,
      },
    };

    return {
      ...full,
      pengaturanKas: rtScopedSettings,
      tahunAktif: rtScopedSettings.tahunAktif || full.tahunAktif,
      wargaList: scopedWarga,
      transactions: scopedTx,
      bantuanList: scopedBantuan,
      dokumenList: scopedDokumen,
      pengumumanList: scopedPengumuman,
      laporanBulananRT: scopedLaporan,
      adminAccounts: ownAdminAccount,
    };
  }

  // Warga role: strict UU PDP privacy isolation (own KK + RT-scoped cash & announcements only)
  const targetKKDigits = String(user.noKK || '').replace(/\D/g, '');
  const ownWarga = full.wargaList.filter((w) => {
    if (user.wargaId && w.id === user.wargaId) return true;
    if (targetKKDigits && w.noKK.replace(/\D/g, '') === targetKKDigits) return true;
    return false;
  });
  const scopedTx = full.transactions.filter((t) => inUserRt(t.rtScope));
  const scopedPengumuman = full.pengumumanList.filter((p) => canUserAccessAnnouncement(p, user));

  return {
    ...full,
    pengaturanKas: effectiveSettings,
    tahunAktif: effectiveSettings.tahunAktif || full.tahunAktif,
    wargaList: ownWarga,
    transactions: scopedTx,
    pengumumanList: scopedPengumuman,
    bantuanList: [],
    dokumenList: [],
    adminAccounts: [],
    laporanBulananRT: [],
  };
}

export async function getDatabaseSnapshotForUser(user: AuthUser): Promise<FullAppDatabaseState> {
  const full = await readFullStateSql();
  if (user.role === 'server') {
    return filterStateForUser(full, user);
  }
  const userScope = extractUserRtRw(user);
  const rtSettingsId = getRtSettingsId(userScope.rw, userScope.rt);
  let perRtSettings: PengaturanKas | undefined;
  if (rtSettingsId && rtSettingsId !== 'kas') {
    const rtRows = await db.select().from(appSettings).where(eq(appSettings.id, rtSettingsId)).limit(1);
    if (rtRows.length > 0) {
      perRtSettings = mapRowToSettings(rtRows[0]);
    }
  }
  return filterStateForUser(full, user, perRtSettings);
}

export async function checkDatabaseHealthSql(): Promise<{
  connected: boolean;
  engine: string;
  revision: number;
  lastUpdated: string;
  totalWarga: number;
  totalAdminAccounts: number;
}> {
  try {
    const status = assertDatabaseConfigured();
    await db.execute(sql`SELECT 1`);
    await ensureSqlSeeded();
    const [metaRows, wargaCountRows, adminCountRows] = await Promise.all([
      db.select().from(syncMeta).where(eq(syncMeta.id, 'global')).limit(1),
      db.select({ count: sql<number>`count(*)::int` }).from(warga),
      db.select({ count: sql<number>`count(*)::int` }).from(adminAccounts),
    ]);
    return {
      connected: true,
      engine: status.engineLabel,
      revision: metaRows[0] ? Number(metaRows[0].revision) || 1 : 1,
      lastUpdated: metaRows[0]?.lastUpdated || new Date().toISOString(),
      totalWarga: Number(wargaCountRows[0]?.count) || 0,
      totalAdminAccounts: Number(adminCountRows[0]?.count) || 0,
    };
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      throw err instanceof SqlUnavailableError
        ? err
        : new SqlUnavailableError(err?.message || 'Cloud SQL tidak terjangkau.', { cause: err });
    }
    console.error('Database health check failed:', err);
    const detail = err?.code ? `${err.code}: ${err.message}` : err?.message;
    if (detail && detail.includes('belum dikonfigurasi')) {
      throw new Error(detail, { cause: err });
    }
    throw new Error(`Koneksi database server bermasalah (${detail || 'SQL error'}).`, { cause: err });
  }
}

export async function getPublicBootstrapInfoSql() {
  try {
    if (!getDatabaseConfigStatus().configured) {
      return {
        pengaturanKas: { ...DEFAULT_PENGATURAN_KAS },
        tahunAktif: DEFAULT_PENGATURAN_KAS.tahunAktif,
        revision: 1,
        lastUpdated: new Date().toISOString(),
        backend: 'postgresql' as const,
      };
    }
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
      backend: 'postgresql' as const,
    };
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      return {
        pengaturanKas: { ...DEFAULT_PENGATURAN_KAS },
        tahunAktif: DEFAULT_PENGATURAN_KAS.tahunAktif,
        revision: 1,
        lastUpdated: new Date().toISOString(),
        backend: 'postgresql' as const,
      };
    }
    console.error('Public bootstrap info error:', err);
    throw new Error(err?.message || 'Gagal memuat info server.', { cause: err });
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
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      throw err instanceof SqlUnavailableError
        ? err
        : new SqlUnavailableError(err?.message || 'Cloud SQL tidak tersedia.', { cause: err });
    }
    console.error('Get admin accounts error:', err);
    throw new Error('Gagal mengambil daftar akun admin.', { cause: err });
  }
}

export async function authenticateAndCreateSessionSql(params: {
  role: 'server' | 'admin' | 'warga';
  username: string;
  password: string;
}): Promise<{ ok: true; token: string; user: AuthUser } | { ok: false; status: number; message: string }> {
  if (!getDatabaseConfigStatus().configured) {
    return {
      ok: false,
      status: 401,
      message:
        'Autentikasi aplikasi kini menggunakan Firebase Authentication. Silakan muat ulang halaman dan masuk menggunakan Firebase.',
    };
  }
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
      if (username === 'RW05GLEMPANG' && (password === 'Rw05glempang' || password === 'GLEMPANG1522')) {
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
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      console.info('Legacy SQL auth unavailable (Firebase-primary mode active).');
      throw err instanceof SqlUnavailableError
        ? err
        : new SqlUnavailableError(err?.message || 'Cloud SQL tidak tersedia.', { cause: err });
    }
    console.error('Authentication SQL error:', err);
    const detail = err?.message || '';
    throw new Error(
      detail.includes('belum dikonfigurasi') || detail.includes('menginisialisasi database')
        ? detail
        : `Gagal melakukan autentikasi ke database server (${detail || 'SQL error'}).`,
      { cause: err }
    );
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
  if (isSqlTemporarilyUnavailable() || !getDatabaseConfigStatus().configured) {
    return null;
  }
  try {
    assertDatabaseConfigured();
    const tokenHash = hashToken(rawToken);
    let rows;
    try {
      rows = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.tokenHash, tokenHash))
        .limit(1);
    } catch (queryErr: any) {
      const errCode = queryErr?.code || queryErr?.cause?.code;
      const errMsg = String(queryErr?.message || '');
      if (errCode === '42P01' || errMsg.includes('does not exist')) {
        await ensureTablesExistSql();
        rows = await db
          .select()
          .from(authSessions)
          .where(eq(authSessions.tokenHash, tokenHash))
          .limit(1);
      } else {
        throw queryErr;
      }
    }
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
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      console.info('Legacy SQL session check skipped (Firebase-primary mode active).');
      return null;
    }
    console.error('Verify session token SQL error:', err);
    throw new Error(err?.message || 'Gagal memverifikasi sesi server.', { cause: err });
  }
}

export async function revokeSessionTokenSql(rawToken: string): Promise<void> {
  if (!getDatabaseConfigStatus().configured) return;
  try {
    const tokenHash = hashToken(rawToken);
    await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      console.info('Legacy SQL session revoke skipped (Firebase-primary mode active).');
      return;
    }
    console.error('Revoke session token error:', err);
  }
}

export async function authenticateFirebaseGoogleSql(
  idToken: string
): Promise<{ ok: true; token: string; user: AuthUser } | { ok: false; status: number; message: string }> {
  await ensureSqlSeeded();
  const cleanToken = String(idToken || '').trim();
  if (!cleanToken) {
    return { ok: false, status: 400, message: 'Token Google Firebase wajib disertakan.' };
  }
  try {
    if (getAdminApps().length === 0) {
      initAdminApp({ projectId: 'laughing-azimuth-807pf' });
    }
    const decoded = await getAdminAuth().verifyIdToken(cleanToken);
    const email = String(decoded.email || '').trim().toLowerCase();
    const allowedSuperAdminEmails = new Set(['ar01071997@gmail.com']);
    if (!email || !allowedSuperAdminEmails.has(email) || !decoded.email_verified) {
      return {
        ok: false,
        status: 403,
        message: 'Akun Google ini tidak terdaftar sebagai Super Admin RW 05.',
      };
    }

    const user: AuthUser = {
      role: 'server',
      username: 'RW05GLEMPANG',
      nama: decoded.name || 'Super Admin Server RW 05 Glempang',
      rtScope: 'Semua RT se-RW 05 Glempang',
      isPinAuthenticated: false,
    };

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const nowMs = Date.now();
    await db.insert(authSessions).values({
      tokenHash,
      role: user.role,
      username: user.username,
      nama: user.nama,
      noKK: null,
      wargaId: null,
      rtScope: user.rtScope || null,
      expiresAt: nowMs + 30 * 24 * 60 * 60 * 1000,
      createdAt: new Date(nowMs).toISOString(),
    });

    return { ok: true, token: rawToken, user };
  } catch (err: any) {
    console.error('Firebase Google ID token verification error:', err);
    return {
      ok: false,
      status: 401,
      message: 'Token Google tidak valid atau sudah kedaluwarsa. Silakan login ulang.',
    };
  }
}

async function checkAndRecordMutationTx(
  tx: any,
  user: AuthUser,
  clientMutationId: string | undefined,
  entityType: string,
  entityId: string
): Promise<{ alreadyProcessed: boolean; existingRevision?: number }> {
  const mutId = String(clientMutationId || '').trim();
  if (!mutId) return { alreadyProcessed: false };
  const existing = await tx
    .select()
    .from(processedMutations)
    .where(eq(processedMutations.mutationId, mutId))
    .limit(1);
  if (existing.length > 0) {
    return {
      alreadyProcessed: true,
      existingRevision: Number(existing[0].revision) || 1,
    };
  }
  return { alreadyProcessed: false };
}

async function persistProcessedMutationTx(
  tx: any,
  user: AuthUser,
  clientMutationId: string | undefined,
  entityType: string,
  entityId: string,
  revision: number
) {
  const mutId = String(clientMutationId || '').trim();
  if (!mutId) return;
  await tx
    .insert(processedMutations)
    .values({
      mutationId: mutId,
      userKey: getUserKey(user),
      entityType,
      entityId,
      revision,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

async function writeAuditLogTx(
  tx: any,
  user: AuthUser,
  params: {
    action: string;
    entityType: string;
    entityId: string;
    rtScope?: string;
    summary: string;
  }
) {
  const { rt, rw } = extractUserRtRw(user);
  await tx.insert(auditLogs).values({
    id: `aud_${Date.now()}_${randomBytes(3).toString('hex')}`,
    actorUsername: user.username,
    actorRole: user.role,
    actorRt: rt,
    actorRw: rw,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    rtScope: params.rtScope || null,
    summary: scrubPiiFromNotificationText(params.summary),
    createdAt: new Date().toISOString(),
  });
}

export async function createNotificationForEventTx(
  tx: any,
  params: {
    title: string;
    body: string;
    category: AppNotification['category'];
    entityType?: string;
    entityId?: string;
    rwId?: string;
    targetRts: string[];
    targetRoles?: Array<'server' | 'admin' | 'warga'>;
    createdBy: string;
  }
): Promise<AppNotification> {
  const nowIso = new Date().toISOString();
  const notif: AppNotification = {
    id: `notif_${Date.now()}_${randomBytes(3).toString('hex')}`,
    title: scrubPiiFromNotificationText(params.title).slice(0, 140),
    body: scrubPiiFromNotificationText(params.body).slice(0, 280),
    category: params.category,
    entityType: params.entityType,
    entityId: params.entityId,
    rwId: normalizeRwCode(params.rwId || '05'),
    targetRts: normalizeTargetRts(params.targetRts),
    targetRoles: params.targetRoles,
    createdBy: params.createdBy,
    createdAt: nowIso,
  };
  await tx.insert(notifications).values({
    id: notif.id,
    title: notif.title,
    body: notif.body,
    category: notif.category,
    entityType: notif.entityType || null,
    entityId: notif.entityId || null,
    rwId: notif.rwId,
    targetRts: notif.targetRts,
    targetRoles: notif.targetRoles || null,
    createdBy: notif.createdBy,
    createdAt: notif.createdAt,
  });
  return notif;
}

export interface MutationOptions {
  clientMutationId?: string;
  expectedVersion?: number;
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
    } else if (user.role === 'admin') {
      const scope = extractUserRtRw(user);
      list = list.filter(
        (w) => normalizeRtCode(w.rt) === scope.rt && normalizeRwCode(w.rw || '05') === scope.rw
      );
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
    if (rt && user.role === 'server') {
      const cleanRt = normalizeRtCode(rt);
      if (cleanRt !== 'SEMUA') {
        list = list.filter((w) => normalizeRtCode(w.rt) === cleanRt);
      }
    }

    return list;
  } catch (err) {
    console.error('Search warga SQL error:', err);
    throw new Error('Gagal mencari data warga di server.', { cause: err });
  }
}

export async function upsertWargaSql(
  user: AuthUser,
  incoming: Warga,
  opts?: MutationOptions
): Promise<{ warga: Warga; revision: number; notification?: AppNotification; idempotent?: boolean }> {
  return withDbWriteLock(async () => {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const existingRows = await db.select().from(warga);
    const matchById = incoming.id ? existingRows.find((r) => r.id === incoming.id) : undefined;
    const matchByKK =
      !matchById && incoming.noKK
        ? existingRows.find((r) => r.noKK && r.noKK === incoming.noKK)
        : undefined;
    const existingRecord = matchById || matchByKK;

    if (existingRecord) {
      assertCanMutateRtRw(user, existingRecord.rt, existingRecord.rw || '05');
    }
    const desiredRt = normalizeRtCode(incoming.rt || existingRecord?.rt || (user.role === 'admin' ? extractUserRtRw(user).rt : '08'));
    const desiredRw = normalizeRwCode(incoming.rw || existingRecord?.rw || '05');
    const authorizedScope = assertCanMutateRtRw(user, desiredRt, desiredRw);

    if (existingRecord && opts?.expectedVersion !== undefined) {
      const currentVer = Number((existingRecord as any).version) || 1;
      if (Number(opts.expectedVersion) !== currentVer) {
        throw new VersionConflictError(
          `Data warga "${existingRecord.nama}" telah diperbarui oleh pengguna lain (versi server ${currentVer}). Muat ulang data terbaru sebelum menyimpan.`,
          currentVer
        );
      }
    }

    const targetId = existingRecord?.id || incoming.id || `w_${Date.now()}`;
    const nextNo =
      Number(incoming.no) > 0
        ? Number(incoming.no)
        : existingRecord?.no || existingRows.length + 1;
    const nextVersion = existingRecord ? (Number((existingRecord as any).version) || 1) + 1 : 1;

    const stamped: Warga = {
      ...incoming,
      id: targetId,
      no: nextNo,
      rt: authorizedScope.rt,
      rw: authorizedScope.rw,
      updatedAt: nowIso,
      version: nextVersion,
    };

    const row = toWargaRow(stamped, nowIso, nextVersion);
    let createdNotif: AppNotification | undefined;
    const txRes = await db.transaction(async (tx) => {
      const idem = await checkAndRecordMutationTx(tx, user, opts?.clientMutationId, 'warga', targetId);
      if (idem.alreadyProcessed) {
        return { revision: idem.existingRevision || 1, idempotent: true };
      }

      await tx.delete(deletedEntities).where(eq(deletedEntities.id, `warga:${targetId}`));
      await tx
        .insert(warga)
        .values(row)
        .onConflictDoUpdate({
          target: warga.id,
          set: row,
        });
      const meta = await bumpRevisionTx(tx);
      await persistProcessedMutationTx(tx, user, opts?.clientMutationId, 'warga', targetId, meta.revision);
      await writeAuditLogTx(tx, user, {
        action: existingRecord ? 'UPDATE_WARGA' : 'CREATE_WARGA',
        entityType: 'warga',
        entityId: targetId,
        rtScope: formatRtScope(authorizedScope.rt, authorizedScope.rw),
        summary: `${existingRecord ? 'Memperbarui' : 'Menambahkan'} data KK warga ${stamped.nama} (RT ${authorizedScope.rt})`,
      });
      createdNotif = await createNotificationForEventTx(tx, {
        title: existingRecord ? `Data Warga RT ${authorizedScope.rt} Diperbarui` : `Warga Baru RT ${authorizedScope.rt} Ditambahkan`,
        body: `Data keluarga ${stamped.nama} (No. Rumah ${stamped.noRumah || '-'}) telah disimpan oleh ${user.nama}.`,
        category: 'warga',
        entityType: 'warga',
        entityId: targetId,
        rwId: authorizedScope.rw,
        targetRts: [authorizedScope.rt],
        targetRoles: ['server', 'admin'],
        createdBy: user.username,
      });
      return { revision: meta.revision, idempotent: false };
    });

    if (txRes.idempotent && existingRecord) {
      return { warga: mapRowToWarga(existingRecord), revision: txRes.revision, idempotent: true };
    }
    return {
      warga: mapRowToWarga(row as typeof warga.$inferSelect),
      revision: txRes.revision,
      notification: createdNotif,
      idempotent: txRes.idempotent,
    };
  });
}

export async function upgradeWargaKKTx(
  user: AuthUser,
  params: {
    wargaId: string;
    updatedWarga: Warga;
    historyRecord: RiwayatPerubahanKK;
    oldNoKK?: string;
    oldKepalaNama?: string;
    catatSantunanKematian?: boolean;
    nominalSantunanKematian?: number;
    expectedVersion?: number;
    clientMutationId?: string;
  }
): Promise<{
  warga: Warga;
  updatedTransactions: Transaction[];
  createdTransactions: Transaction[];
  updatedBantuan: BantuanPemerintah[];
  revision: number;
  notification?: AppNotification;
  idempotent?: boolean;
}> {
  return withDbWriteLock(async () => {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();

    const existingRows = await db.select().from(warga);
    const existingRow = existingRows.find((r) => r.id === params.wargaId);
    if (!existingRow) {
      throw new NotFoundError('Data warga yang akan di-Upgrade KK tidak ditemukan di server.');
    }

    const authorizedScope = assertCanMutateRtRw(user, existingRow.rt, existingRow.rw || '05');
    if (params.expectedVersion !== undefined) {
      const currentVer = Number((existingRow as any).version) || 1;
      if (Number(params.expectedVersion) !== currentVer) {
        throw new VersionConflictError(
          `Data warga "${existingRow.nama}" sudah diubah pengguna lain (versi server ${currentVer}). Muat ulang sebelum Upgrade KK.`,
          currentVer
        );
      }
    }

    const existingWarga = mapRowToWarga(existingRow);
    const oldNoKK = String(params.oldNoKK || existingWarga.noKK || '').trim();
    const oldKepalaNama = String(params.oldKepalaNama || existingWarga.nama || '').trim();
    const newVersion = (existingWarga.version || 1) + 1;

    const mergedHistory: RiwayatPerubahanKK[] = [
      params.historyRecord,
      ...(Array.isArray(existingWarga.riwayatPerubahanKK) ? existingWarga.riwayatPerubahanKK : []),
    ];

    const finalWarga: Warga = {
      ...existingWarga,
      ...params.updatedWarga,
      id: existingWarga.id,
      no: existingWarga.no,
      rt: authorizedScope.rt,
      rw: authorizedScope.rw,
      riwayatPerubahanKK: mergedHistory,
      updatedAt: nowIso,
      version: newVersion,
    };

    const allTxRows = await db.select().from(transactions);
    const allBantuanRows = await db.select().from(bantuan);

    const matchingTx = allTxRows.map(mapRowToTransaction).filter((t) => {
      const scope = extractScopeRtRw(t.rtScope, authorizedScope.rt, authorizedScope.rw);
      if (scope.rt !== authorizedScope.rt) return false;
      if (t.residentId && t.residentId === existingWarga.id) return true;
      if (oldNoKK && t.noKK && t.noKK === oldNoKK) return true;
      if (oldKepalaNama && t.namaWarga && t.namaWarga.toLowerCase() === oldKepalaNama.toLowerCase()) return true;
      return false;
    });

    const relinkedTx: Transaction[] = matchingTx.map((t) => ({
      ...t,
      residentId: finalWarga.id,
      noKK: finalWarga.noKK,
      namaWarga: finalWarga.nama,
      nomorRumah: finalWarga.noRumah,
      rtScope: formatRtScope(authorizedScope.rt, authorizedScope.rw),
      updatedAt: nowIso,
      version: (t.version || 1) + 1,
    }));

    const createdTx: Transaction[] = [];
    if (params.catatSantunanKematian) {
      const santunanNominal = Number(params.nominalSantunanKematian) > 0 ? Number(params.nominalSantunanKematian) : 200000;
      const reasonLabel =
        params.historyRecord.alasan === 'meninggal'
          ? 'Santunan Kematian & Kain Mori'
          : 'Santunan Sosial Upgrade KK';
      createdTx.push({
        id: `tx_santunan_${Date.now()}_${randomBytes(2).toString('hex')}`,
        tanggal: params.historyRecord.tanggal || nowIso.slice(0, 10),
        kategori: reasonLabel,
        keterangan: `Santunan keluarga ${finalWarga.nama} (Upgrade KK dari ${oldKepalaNama})`,
        nominal: santunanNominal,
        tipe: 'kematian',
        residentId: finalWarga.id,
        namaWarga: finalWarga.nama,
        nomorRumah: finalWarga.noRumah,
        noKK: finalWarga.noKK,
        tahun: Number((params.historyRecord.tanggal || nowIso).slice(0, 4)) || 2026,
        rtScope: formatRtScope(authorizedScope.rt, authorizedScope.rw),
        updatedAt: nowIso,
        version: 1,
      });
    }

    const matchingBantuan = allBantuanRows.map(mapRowToBantuan).filter((b) => {
      const scope = extractScopeRtRw(b.rtScope, authorizedScope.rt, authorizedScope.rw);
      if (scope.rt !== authorizedScope.rt) return false;
      if (oldNoKK && b.noKK === oldNoKK) return true;
      if (oldKepalaNama && b.namaPenerima.toLowerCase() === oldKepalaNama.toLowerCase()) return true;
      return false;
    });

    const relinkedBantuan: BantuanPemerintah[] = matchingBantuan.map((b) => ({
      ...b,
      noKK: finalWarga.noKK,
      namaPenerima: finalWarga.nama,
      rtScope: formatRtScope(authorizedScope.rt, authorizedScope.rw),
      updatedAt: nowIso,
      version: (b.version || 1) + 1,
    }));

    let createdNotif: AppNotification | undefined;
    const txRes = await db.transaction(async (tx) => {
      const idem = await checkAndRecordMutationTx(tx, user, params.clientMutationId, 'warga', finalWarga.id);
      if (idem.alreadyProcessed) {
        return { revision: idem.existingRevision || 1, idempotent: true };
      }

      const wRow = toWargaRow(finalWarga, nowIso, newVersion);
      await tx.insert(warga).values(wRow).onConflictDoUpdate({ target: warga.id, set: wRow });

      for (const item of relinkedTx) {
        const row = toTransactionRow(item, nowIso, item.version);
        await tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
      }
      for (const item of createdTx) {
        const row = toTransactionRow(item, nowIso, item.version);
        await tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
      }
      for (const item of relinkedBantuan) {
        const row = toBantuanRow(item, nowIso, item.version);
        await tx.insert(bantuan).values(row).onConflictDoUpdate({ target: bantuan.id, set: row });
      }

      const meta = await bumpRevisionTx(tx);
      await persistProcessedMutationTx(tx, user, params.clientMutationId, 'warga', finalWarga.id, meta.revision);
      await writeAuditLogTx(tx, user, {
        action: 'UPGRADE_KK',
        entityType: 'warga',
        entityId: finalWarga.id,
        rtScope: formatRtScope(authorizedScope.rt, authorizedScope.rw),
        summary: `Upgrade KK ${oldKepalaNama} -> ${finalWarga.nama} (RT ${authorizedScope.rt}, alasan: ${params.historyRecord.alasan}, relink ${relinkedTx.length} transaksi)`,
      });
      createdNotif = await createNotificationForEventTx(tx, {
        title: `Upgrade KK Warga RT ${authorizedScope.rt}`,
        body: `Pembaruan Kepala Keluarga dari ${oldKepalaNama} menjadi ${finalWarga.nama} berhasil disimpan beserta riwayat kas.`,
        category: 'warga',
        entityType: 'warga',
        entityId: finalWarga.id,
        rwId: authorizedScope.rw,
        targetRts: [authorizedScope.rt],
        targetRoles: ['server', 'admin'],
        createdBy: user.username,
      });
      return { revision: meta.revision, idempotent: false };
    });

    return {
      warga: finalWarga,
      updatedTransactions: relinkedTx,
      createdTransactions: createdTx,
      updatedBantuan: relinkedBantuan,
      revision: txRes.revision,
      notification: createdNotif,
      idempotent: txRes.idempotent,
    };
  });
}

export async function updateWargaSelfSql(
  wargaId: string | undefined,
  noKK: string | undefined,
  patch: { pin?: string; telepon?: string }
): Promise<{ warga: Warga; revision: number } | null> {
  try {
    await ensureSqlSeeded();
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
    const nextVersion = (Number((target as any).version) || 1) + 1;

    const meta = await db.transaction(async (tx) => {
      await tx
        .update(warga)
        .set({
          pin: nextPin,
          telepon: nextTelp,
          updatedAt: nowIso,
          version: nextVersion,
        })
        .where(eq(warga.id, target.id));
      return bumpRevisionTx(tx);
    });

    return {
      warga: mapRowToWarga({ ...target, pin: nextPin, telepon: nextTelp, updatedAt: nowIso, version: nextVersion } as any),
      revision: meta.revision,
    };
  } catch (err) {
    console.error('Update warga self SQL error:', err);
    throw new Error('Gagal memperbarui profil warga.', { cause: err });
  }
}

export async function bulkImportWargaBantuanSql(
  user: AuthUser,
  params: {
    wargaList: Array<Omit<Warga, 'id' | 'no'> & { id?: string }>;
    bantuanList: Array<Omit<BantuanPemerintah, 'id'> & { id?: string }>;
    mergeExisting: boolean;
    tahunAktif: number;
    clientMutationId?: string;
  }
): Promise<{ addedKK: number; updatedKK: number; addedBantuan: number; revision: number; notification?: AppNotification }> {
  return withDbWriteLock(async () => {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const baseTime = Date.now();
    const userScope = extractUserRtRw(user);

    for (const incoming of params.wargaList) {
      const targetRt = normalizeRtCode(incoming.rt || (user.role === 'admin' ? userScope.rt : '08'));
      const targetRw = normalizeRwCode(incoming.rw || '05');
      assertCanMutateRtRw(user, targetRt, targetRw);
    }
    for (const b of params.bantuanList) {
      const bScope = extractScopeRtRw(b.rtScope, user.role === 'admin' ? userScope.rt : '08', '05');
      assertCanMutateRtRw(user, bScope.rt, bScope.rw);
    }

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
        assertCanMutateRtRw(user, existing.rt, existing.rw || '05');
      }

      if (existing) {
        if (params.mergeExisting) {
          const nextStatus = incoming.statusIuran || existing.statusIuran || 'Belum';
          const merged: Warga = {
            ...existing,
            nama: incoming.nama || existing.nama,
            noKK: incoming.noKK || existing.noKK,
            nik: incoming.nik || existing.nik,
            noRumah: incoming.noRumah || existing.noRumah,
            rt: normalizeRtCode(incoming.rt || existing.rt),
            rw: normalizeRwCode(incoming.rw || existing.rw || '05'),
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
            version: (existing.version || 1) + 1,
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
          rt: normalizeRtCode(incoming.rt || (user.role === 'admin' ? userScope.rt : '08')),
          rw: normalizeRwCode(incoming.rw || '05'),
          no: existingWarga.length + addedKK + 1,
          statusIuran: incoming.statusIuran || 'Belum',
          statusIuranPerTahun: { [params.tahunAktif]: incoming.statusIuran || 'Belum' },
          pin: incoming.pin || '123456',
          updatedAt: nowIso,
          version: 1,
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
          rtScope: b.rtScope || (user.role === 'admin' ? formatRtScope(userScope.rt, userScope.rw) : 'RT 08 RW 05'),
          updatedAt: nowIso,
          version: 1,
        });
        addedBantuan++;
      }
    });

    let createdNotif: AppNotification | undefined;
    const meta = await db.transaction(async (tx) => {
      for (const item of wargaToUpsert) {
        const row = toWargaRow(item, nowIso, item.version);
        await tx.delete(deletedEntities).where(eq(deletedEntities.id, `warga:${row.id}`));
        await tx
          .insert(warga)
          .values(row)
          .onConflictDoUpdate({ target: warga.id, set: row });
      }
      for (const bItem of bantuanToInsert) {
        const row = toBantuanRow(bItem, nowIso, bItem.version);
        await tx
          .insert(bantuan)
          .values(row)
          .onConflictDoUpdate({ target: bantuan.id, set: row });
      }
      const m = await bumpRevisionTx(tx);
      await writeAuditLogTx(tx, user, {
        action: 'BULK_IMPORT_EXCEL',
        entityType: 'warga',
        entityId: `bulk_${baseTime}`,
        rtScope: user.role === 'admin' ? formatRtScope(userScope.rt, userScope.rw) : 'RW 05',
        summary: `Impor Excel massal: ${addedKK} KK baru, ${updatedKK} KK diperbarui, ${addedBantuan} bansos`,
      });
      if (addedKK + updatedKK + addedBantuan > 0) {
        createdNotif = await createNotificationForEventTx(tx, {
          title: 'Impor Data Warga Selesai',
          body: `${user.nama} mengimpor ${addedKK} KK baru, ${updatedKK} pembaruan KK, dan ${addedBantuan} data bansos.`,
          category: 'warga',
          entityType: 'warga',
          rwId: '05',
          targetRts: user.role === 'admin' ? [userScope.rt] : ['SEMUA'],
          targetRoles: ['server', 'admin'],
          createdBy: user.username,
        });
      }
      return m;
    });

    return { addedKK, updatedKK, addedBantuan, revision: meta.revision, notification: createdNotif };
  });
}

export async function deleteWargaSql(
  user: AuthUser,
  idOrKK: string,
  opts?: MutationOptions
): Promise<{ revision: number; totalWarga: number; deletedRt?: string; notification?: AppNotification }> {
  return withDbWriteLock(async () => {
    await ensureSqlSeeded();
    const nowIso = new Date().toISOString();
    const rows = await db.select().from(warga);
    const matchingRows = rows.filter((r) => r.id === idOrKK || (r.noKK && r.noKK === idOrKK));
    if (matchingRows.length === 0) {
      throw new NotFoundError('Data warga tidak ditemukan atau sudah dihapus sebelumnya.');
    }

    for (const r of matchingRows) {
      assertCanMutateRtRw(user, r.rt, r.rw || '05');
    }
    const targetRow = matchingRows[0];
    if (opts?.expectedVersion !== undefined) {
      const currentVer = Number((targetRow as any).version) || 1;
      if (Number(opts.expectedVersion) !== currentVer) {
        throw new VersionConflictError(
          `Data warga "${targetRow.nama}" telah berubah (versi server ${currentVer}). Muat ulang sebelum menghapus.`,
          currentVer
        );
      }
    }

    const matchingIds = matchingRows.map((r) => r.id);
    const deletedRt = normalizeRtCode(targetRow.rt);
    const deletedRw = normalizeRwCode(targetRow.rw || '05');

    let createdNotif: AppNotification | undefined;
    const meta = await db.transaction(async (tx) => {
      const idem = await checkAndRecordMutationTx(tx, user, opts?.clientMutationId, 'warga', targetRow.id);
      if (idem.alreadyProcessed) {
        return { revision: idem.existingRevision || 1 };
      }

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
      const m = await bumpRevisionTx(tx);
      await persistProcessedMutationTx(tx, user, opts?.clientMutationId, 'warga', targetRow.id, m.revision);
      await writeAuditLogTx(tx, user, {
        action: 'DELETE_WARGA',
        entityType: 'warga',
        entityId: targetRow.id,
        rtScope: formatRtScope(deletedRt, deletedRw),
        summary: `Menghapus data warga ${targetRow.nama} dari RT ${deletedRt}`,
      });
      createdNotif = await createNotificationForEventTx(tx, {
        title: `Data Warga RT ${deletedRt} Dihapus`,
        body: `Data keluarga ${targetRow.nama} telah dihapus oleh ${user.nama}.`,
        category: 'warga',
        entityType: 'warga',
        entityId: targetRow.id,
        rwId: deletedRw,
        targetRts: [deletedRt],
        targetRoles: ['server', 'admin'],
        createdBy: user.username,
      });
      return m;
    });

    const remaining = await db.select({ id: warga.id }).from(warga);
    return { revision: meta.revision, totalWarga: remaining.length, deletedRt, notification: createdNotif };
  });
}

export async function upsertTransactionSql(
  user: AuthUser,
  txItem: Transaction,
  opts?: MutationOptions
): Promise<{ transaction: Transaction; revision: number; notification?: AppNotification }> {
  await ensureSqlSeeded();
  const nowIso = new Date().toISOString();
  const existingRows = await db.select().from(transactions).where(eq(transactions.id, txItem.id)).limit(1);
  const existing = existingRows[0];

  const userScope = extractUserRtRw(user);
  const existingScope = existing ? extractScopeRtRw(existing.rtScope, '08', '05') : null;
  if (existingScope) {
    assertCanMutateRtRw(user, existingScope.rt, existingScope.rw);
  }

  const desiredScope = extractScopeRtRw(
    txItem.rtScope || existing?.rtScope || (user.role === 'admin' ? formatRtScope(userScope.rt, userScope.rw) : 'RT 08 RW 05'),
    user.role === 'admin' ? userScope.rt : '08',
    '05'
  );
  const authorized = assertCanMutateRtRw(user, desiredScope.rt, desiredScope.rw);

  if (existing && opts?.expectedVersion !== undefined) {
    const currentVer = Number((existing as any).version) || 1;
    if (Number(opts.expectedVersion) !== currentVer) {
      throw new VersionConflictError(
        `Transaksi kas "${existing.kategori}" telah diubah pengguna lain (versi server ${currentVer}).`,
        currentVer
      );
    }
  }

  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const scopedTx: Transaction = {
    ...txItem,
    rtScope: formatRtScope(authorized.rt, authorized.rw),
    updatedAt: nowIso,
    version: nextVersion,
  };
  const row = toTransactionRow(scopedTx, nowIso, nextVersion);

  let createdNotif: AppNotification | undefined;
  const meta = await db.transaction(async (tx) => {
    const idem = await checkAndRecordMutationTx(tx, user, opts?.clientMutationId, 'transaction', row.id);
    if (idem.alreadyProcessed) {
      return { revision: idem.existingRevision || 1 };
    }
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `transactions:${row.id}`));
    await tx.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
    const m = await bumpRevisionTx(tx);
    await persistProcessedMutationTx(tx, user, opts?.clientMutationId, 'transaction', row.id, m.revision);
    await writeAuditLogTx(tx, user, {
      action: existing ? 'UPDATE_TRANSACTION' : 'CREATE_TRANSACTION',
      entityType: 'transaction',
      entityId: row.id,
      rtScope: scopedTx.rtScope,
      summary: `${existing ? 'Mengubah' : 'Mencatat'} ${scopedTx.tipe} ${scopedTx.kategori} Rp ${scopedTx.nominal.toLocaleString('id-ID')}`,
    });
    const cat: AppNotification['category'] =
      scopedTx.tipe === 'kematian'
        ? 'kematian'
        : /iuran|jimpitan/i.test(scopedTx.kategori)
        ? 'iuran'
        : 'kas';
    createdNotif = await createNotificationForEventTx(tx, {
      title: `Pembaruan ${cat === 'kematian' ? 'Kas Kematian' : cat === 'iuran' ? 'Iuran Warga' : 'Kas RT'} RT ${authorized.rt}`,
      body: `${scopedTx.kategori} sebesar Rp ${scopedTx.nominal.toLocaleString('id-ID')} ${scopedTx.namaWarga ? `(${scopedTx.namaWarga})` : ''} telah disimpan.`,
      category: cat,
      entityType: 'transaction',
      entityId: row.id,
      rwId: authorized.rw,
      targetRts: [authorized.rt],
      targetRoles: ['server', 'admin', 'warga'],
      createdBy: user.username,
    });
    return m;
  });

  return {
    transaction: mapRowToTransaction(row as typeof transactions.$inferSelect),
    revision: meta.revision,
    notification: createdNotif,
  };
}

export async function deleteTransactionSql(
  user: AuthUser,
  id: string,
  opts?: MutationOptions
): Promise<{ revision: number; rtScope?: string }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Transaksi kas tidak ditemukan atau sudah dihapus.');
  }
  const scope = extractScopeRtRw(existing.rtScope, '08', '05');
  assertCanMutateRtRw(user, scope.rt, scope.rw);

  if (opts?.expectedVersion !== undefined) {
    const currentVer = Number((existing as any).version) || 1;
    if (Number(opts.expectedVersion) !== currentVer) {
      throw new VersionConflictError(
        `Transaksi telah diubah pengguna lain (versi server ${currentVer}). Muat ulang sebelum menghapus.`,
        currentVer
      );
    }
  }

  const nowIso = new Date().toISOString();
  const meta = await db.transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.id, id));
    await tx
      .insert(deletedEntities)
      .values({ id: `transactions:${id}`, entityType: 'transactions', entityId: id, deletedAt: nowIso })
      .onConflictDoNothing();
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: 'DELETE_TRANSACTION',
      entityType: 'transaction',
      entityId: id,
      rtScope: existing.rtScope || formatRtScope(scope.rt, scope.rw),
      summary: `Menghapus transaksi ${existing.kategori} (${existing.keterangan})`,
    });
    return m;
  });
  return { revision: meta.revision, rtScope: existing.rtScope || formatRtScope(scope.rt, scope.rw) };
}

export async function upsertPengumumanSql(
  user: AuthUser,
  p: PengumumanRT,
  opts?: MutationOptions
): Promise<{ pengumuman: PengumumanRT; revision: number; notification?: AppNotification }> {
  await ensureSqlSeeded();
  const nowIso = new Date().toISOString();
  const existingRows = await db.select().from(pengumuman).where(eq(pengumuman.id, p.id)).limit(1);
  const existing = existingRows[0];
  const userScope = extractUserRtRw(user);

  if (existing) {
    const existingMapped = mapRowToPengumuman(existing);
    if (user.role === 'admin') {
      const existingTargets = normalizeTargetRts(existingMapped.targetRts, existingMapped.rtScope);
      if (
        existingMapped.senderRole === 'server' ||
        existingTargets.includes('SEMUA') ||
        !existingTargets.every((t) => t === userScope.rt)
      ) {
        throw new ForbiddenError('Admin RT hanya boleh mengubah atau menghapus pengumuman milik RT-nya sendiri.');
      }
    }
    if (opts?.expectedVersion !== undefined) {
      const currentVer = Number((existing as any).version) || 1;
      if (Number(opts.expectedVersion) !== currentVer) {
        throw new VersionConflictError(
          `Pengumuman "${existing.judul}" telah diubah pengguna lain (versi server ${currentVer}).`,
          currentVer
        );
      }
    }
  }

  let finalTargets: string[];
  let finalScopeLabel: string;
  if (user.role === 'admin') {
    const requestedTargets =
      Array.isArray(p.targetRts) && p.targetRts.length > 0
        ? normalizeTargetRts(p.targetRts)
        : p.rtScope
        ? normalizeTargetRts(undefined, p.rtScope)
        : [userScope.rt];
    if (
      requestedTargets.includes('SEMUA') ||
      requestedTargets.some((t) => t !== userScope.rt)
    ) {
      throw new ForbiddenError(
        `Akses ditolak: Admin ${formatRtScope(userScope.rt, userScope.rw)} hanya berwenang menerbitkan pengumuman untuk RT-nya sendiri.`
      );
    }
    finalTargets = [userScope.rt];
    finalScopeLabel = formatRtScope(userScope.rt, userScope.rw);
  } else {
    finalTargets = normalizeTargetRts(p.targetRts, p.rtScope);
    finalScopeLabel = finalTargets.includes('SEMUA')
      ? 'Semua RT RW 05'
      : finalTargets.map((r) => `RT ${r}`).join(', ');
  }

  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const normalizedAnnouncement: PengumumanRT = {
    ...p,
    targetRts: finalTargets,
    rtScope: finalScopeLabel,
    senderRt: existing ? (existing as any).senderRt || userScope.rt : userScope.rt,
    senderRw: existing ? (existing as any).senderRw || userScope.rw : userScope.rw,
    senderRole: existing
      ? ((existing as any).senderRole as 'server' | 'admin' | undefined) || (user.role === 'server' ? 'server' : 'admin')
      : user.role === 'server'
      ? 'server'
      : 'admin',
    updatedAt: nowIso,
    version: nextVersion,
  };

  const row = toPengumumanRow(normalizedAnnouncement, nowIso, nextVersion);
  let createdNotif: AppNotification | undefined;
  const meta = await db.transaction(async (tx) => {
    const idem = await checkAndRecordMutationTx(tx, user, opts?.clientMutationId, 'pengumuman', row.id);
    if (idem.alreadyProcessed) {
      return { revision: idem.existingRevision || 1 };
    }
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `pengumuman:${row.id}`));
    await tx.insert(pengumuman).values(row).onConflictDoUpdate({ target: pengumuman.id, set: row });
    const m = await bumpRevisionTx(tx);
    await persistProcessedMutationTx(tx, user, opts?.clientMutationId, 'pengumuman', row.id, m.revision);
    await writeAuditLogTx(tx, user, {
      action: existing ? 'UPDATE_PENGUMUMAN' : 'CREATE_PENGUMUMAN',
      entityType: 'pengumuman',
      entityId: row.id,
      rtScope: finalScopeLabel,
      summary: `${existing ? 'Memperbarui' : 'Menerbitkan'} pengumuman "${normalizedAnnouncement.judul}" untuk ${finalScopeLabel}`,
    });
    createdNotif = await createNotificationForEventTx(tx, {
      title: normalizedAnnouncement.penting
        ? `Pengumuman Penting: ${normalizedAnnouncement.judul}`
        : `Pengumuman Baru: ${normalizedAnnouncement.judul}`,
      body: `${normalizedAnnouncement.isi.slice(0, 140)} (${finalScopeLabel})`,
      category: 'pengumuman',
      entityType: 'pengumuman',
      entityId: row.id,
      rwId: userScope.rw,
      targetRts: finalTargets,
      targetRoles: ['server', 'admin', 'warga'],
      createdBy: user.username,
    });
    return m;
  });

  return {
    pengumuman: mapRowToPengumuman(row as any),
    revision: meta.revision,
    notification: createdNotif,
  };
}

export async function deletePengumumanSql(
  user: AuthUser,
  id: string
): Promise<{ revision: number; targetRts: string[] }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(pengumuman).where(eq(pengumuman.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Pengumuman tidak ditemukan atau sudah dihapus.');
  }
  const mapped = mapRowToPengumuman(existing);
  const targets = normalizeTargetRts(mapped.targetRts, mapped.rtScope);
  if (user.role === 'admin') {
    const userScope = extractUserRtRw(user);
    if (mapped.senderRole === 'server' || targets.includes('SEMUA') || !targets.every((t) => t === userScope.rt)) {
      throw new ForbiddenError('Admin RT hanya boleh menghapus pengumuman milik RT-nya sendiri.');
    }
  }

  const nowIso = new Date().toISOString();
  const meta = await db.transaction(async (tx) => {
    await tx.delete(pengumuman).where(eq(pengumuman.id, id));
    await tx
      .insert(deletedEntities)
      .values({ id: `pengumuman:${id}`, entityType: 'pengumuman', entityId: id, deletedAt: nowIso })
      .onConflictDoNothing();
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: 'DELETE_PENGUMUMAN',
      entityType: 'pengumuman',
      entityId: id,
      rtScope: mapped.rtScope || 'RW 05',
      summary: `Menghapus pengumuman "${mapped.judul}"`,
    });
    return m;
  });
  return { revision: meta.revision, targetRts: targets };
}

export async function upsertBantuanSql(
  user: AuthUser,
  b: BantuanPemerintah,
  opts?: MutationOptions
): Promise<{ bantuan: BantuanPemerintah; revision: number }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(bantuan).where(eq(bantuan.id, b.id)).limit(1);
  const existing = existingRows[0];
  const userScope = extractUserRtRw(user);

  if (existing) {
    const existingScope = extractScopeRtRw(existing.rtScope, '08', '05');
    assertCanMutateRtRw(user, existingScope.rt, existingScope.rw);
    if (opts?.expectedVersion !== undefined) {
      const currentVer = Number((existing as any).version) || 1;
      if (Number(opts.expectedVersion) !== currentVer) {
        throw new VersionConflictError(
          `Data bansos "${existing.namaPenerima}" telah diubah pengguna lain (versi server ${currentVer}).`,
          currentVer
        );
      }
    }
  }

  const desiredScope = extractScopeRtRw(
    b.rtScope || existing?.rtScope || (user.role === 'admin' ? formatRtScope(userScope.rt, userScope.rw) : 'RT 08 RW 05'),
    user.role === 'admin' ? userScope.rt : '08',
    '05'
  );
  const authorized = assertCanMutateRtRw(user, desiredScope.rt, desiredScope.rw);

  const nowIso = new Date().toISOString();
  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const scoped: BantuanPemerintah = {
    ...b,
    rtScope: formatRtScope(authorized.rt, authorized.rw),
    updatedAt: nowIso,
    version: nextVersion,
  };
  const row = toBantuanRow(scoped, nowIso, nextVersion);
  const meta = await db.transaction(async (tx) => {
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `bantuan:${row.id}`));
    await tx.insert(bantuan).values(row).onConflictDoUpdate({ target: bantuan.id, set: row });
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: existing ? 'UPDATE_BANTUAN' : 'CREATE_BANTUAN',
      entityType: 'bantuan',
      entityId: row.id,
      rtScope: scoped.rtScope,
      summary: `${existing ? 'Mengubah' : 'Menambah'} penerima bansos ${scoped.jenisBantuan}: ${scoped.namaPenerima}`,
    });
    return m;
  });
  return { bantuan: mapRowToBantuan(row as any), revision: meta.revision };
}

export async function deleteBantuanSql(
  user: AuthUser,
  id: string
): Promise<{ revision: number; rtScope?: string }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(bantuan).where(eq(bantuan.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Data bansos tidak ditemukan atau sudah dihapus.');
  }
  const scope = extractScopeRtRw(existing.rtScope, '08', '05');
  assertCanMutateRtRw(user, scope.rt, scope.rw);

  const nowIso = new Date().toISOString();
  const meta = await db.transaction(async (tx) => {
    await tx.delete(bantuan).where(eq(bantuan.id, id));
    await tx
      .insert(deletedEntities)
      .values({ id: `bantuan:${id}`, entityType: 'bantuan', entityId: id, deletedAt: nowIso })
      .onConflictDoNothing();
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: 'DELETE_BANTUAN',
      entityType: 'bantuan',
      entityId: id,
      rtScope: existing.rtScope || formatRtScope(scope.rt, scope.rw),
      summary: `Menghapus data bansos ${existing.jenisBantuan} (${existing.namaPenerima})`,
    });
    return m;
  });
  return { revision: meta.revision, rtScope: existing.rtScope || formatRtScope(scope.rt, scope.rw) };
}

export async function upsertDokumenSql(
  user: AuthUser,
  d: DokumenPdfWarga
): Promise<{ dokumen: DokumenPdfWarga; revision: number }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(dokumen).where(eq(dokumen.id, d.id)).limit(1);
  const existing = existingRows[0];
  const userScope = extractUserRtRw(user);

  if (existing) {
    const existingScope = extractScopeRtRw(existing.rtScope, '08', '05');
    assertCanMutateRtRw(user, existingScope.rt, existingScope.rw);
  }
  const desiredScope = extractScopeRtRw(
    d.rtScope || existing?.rtScope || (user.role === 'admin' ? formatRtScope(userScope.rt, userScope.rw) : 'RT 08 RW 05'),
    user.role === 'admin' ? userScope.rt : '08',
    '05'
  );
  const authorized = assertCanMutateRtRw(user, desiredScope.rt, desiredScope.rw);

  const nowIso = new Date().toISOString();
  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const scoped: DokumenPdfWarga = {
    ...d,
    rtScope: formatRtScope(authorized.rt, authorized.rw),
    updatedAt: nowIso,
    version: nextVersion,
  };
  const row = toDokumenRow(scoped, nowIso, nextVersion);
  const meta = await db.transaction(async (tx) => {
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `dokumen:${row.id}`));
    await tx.insert(dokumen).values(row).onConflictDoUpdate({ target: dokumen.id, set: row });
    return bumpRevisionTx(tx);
  });
  return { dokumen: mapRowToDokumen(row as any), revision: meta.revision };
}

export async function deleteDokumenSql(
  user: AuthUser,
  id: string
): Promise<{ revision: number; rtScope?: string }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(dokumen).where(eq(dokumen.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError('Dokumen tidak ditemukan atau sudah dihapus.');
  }
  const scope = extractScopeRtRw(existing.rtScope, '08', '05');
  assertCanMutateRtRw(user, scope.rt, scope.rw);

  const nowIso = new Date().toISOString();
  const meta = await db.transaction(async (tx) => {
    await tx.delete(dokumen).where(eq(dokumen.id, id));
    await tx
      .insert(deletedEntities)
      .values({ id: `dokumen:${id}`, entityType: 'dokumen', entityId: id, deletedAt: nowIso })
      .onConflictDoNothing();
    return bumpRevisionTx(tx);
  });
  return { revision: meta.revision, rtScope: existing.rtScope || formatRtScope(scope.rt, scope.rw) };
}

export async function upsertLaporanSql(
  user: AuthUser,
  l: PembaruanBulananRT
): Promise<{ laporan: PembaruanBulananRT; revision: number; notification?: AppNotification }> {
  await ensureSqlSeeded();
  const existingRows = await db.select().from(laporanBulanan).where(eq(laporanBulanan.id, l.id)).limit(1);
  const existing = existingRows[0];

  const authorized = assertCanMutateRtRw(user, l.rt || existing?.rt || '08', l.rw || existing?.rw || '05');
  if (user.role === 'admin' && existing && l.statusVerifikasi !== existing.statusVerifikasi) {
    throw new ForbiddenError('Status verifikasi laporan bulanan hanya dapat diubah oleh Super Admin Server RW 05.');
  }

  const nowIso = new Date().toISOString();
  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const scoped: PembaruanBulananRT = {
    ...l,
    rt: authorized.rt,
    rw: authorized.rw,
    statusVerifikasi:
      user.role === 'admin'
        ? (existing?.statusVerifikasi as PembaruanBulananRT['statusVerifikasi']) || 'Menunggu Verifikasi'
        : l.statusVerifikasi || 'Menunggu Verifikasi',
    updatedAt: nowIso,
    version: nextVersion,
  };
  const row = toLaporanRow(scoped, nowIso, nextVersion);
  let createdNotif: AppNotification | undefined;
  const meta = await db.transaction(async (tx) => {
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `laporanBulananRT:${row.id}`));
    await tx.insert(laporanBulanan).values(row).onConflictDoUpdate({ target: laporanBulanan.id, set: row });
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: existing ? 'UPDATE_LAPORAN_RT' : 'SUBMIT_LAPORAN_RT',
      entityType: 'laporan',
      entityId: row.id,
      rtScope: formatRtScope(authorized.rt, authorized.rw),
      summary: `Laporan bulanan ${scoped.bulanTahun} RT ${authorized.rt} (${scoped.statusVerifikasi})`,
    });
    createdNotif = await createNotificationForEventTx(tx, {
      title: `Laporan Bulanan RT ${authorized.rt} (${scoped.bulanTahun})`,
      body: `Status laporan: ${scoped.statusVerifikasi}. Saldo Kas Umum Rp ${scoped.saldoKasUmumBerjalan.toLocaleString('id-ID')}.`,
      category: 'laporan',
      entityType: 'laporan',
      entityId: row.id,
      rwId: authorized.rw,
      targetRts: [authorized.rt],
      targetRoles: ['server', 'admin'],
      createdBy: user.username,
    });
    return m;
  });
  return { laporan: mapRowToLaporan(row as any), revision: meta.revision, notification: createdNotif };
}

export async function updateSettingsSql(
  user: AuthUser,
  s: PengaturanKas,
  tahunAktif?: number,
  opts?: MutationOptions
): Promise<{ settings: PengaturanKas; revision: number; targetRt: string; notification?: AppNotification }> {
  await ensureSqlSeeded();
  const nowIso = new Date().toISOString();
  const nextTahun = Number(tahunAktif || s.tahunAktif) || 2026;

  const userScope = extractUserRtRw(user);
  const desiredRt = normalizeRtCode(
    user.role === 'admin' ? userScope.rt : s.profilRT?.namaRT || '08'
  );
  const desiredRw = normalizeRwCode(
    user.role === 'admin' ? userScope.rw : s.profilRT?.namaRW || '05'
  );
  if (user.role === 'admin') {
    assertCanMutateRtRw(user, desiredRt, desiredRw);
  }

  const settingsId =
    user.role === 'server' && (!s.profilRT?.namaRT || s.profilRT.namaRT === '08')
      ? 'kas'
      : getRtSettingsId(desiredRw, desiredRt);

  const existingRows = await db.select().from(appSettings).where(eq(appSettings.id, settingsId)).limit(1);
  const existing = existingRows[0];
  if (existing && opts?.expectedVersion !== undefined) {
    const currentVer = Number((existing as any).version) || 1;
    if (Number(opts.expectedVersion) !== currentVer) {
      throw new VersionConflictError(
        `Pengaturan kas RT ${desiredRt} telah diperbarui oleh pengguna lain (versi server ${currentVer}).`,
        currentVer
      );
    }
  }
  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;

  const valuesPayload = {
    id: settingsId,
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
    profilRT: {
      ...(s.profilRT || DEFAULT_PENGATURAN_KAS.profilRT!),
      namaRT: desiredRt,
      namaRW: desiredRw,
    },
    updatedAt: nowIso,
    version: nextVersion,
  };

  let createdNotif: AppNotification | undefined;
  const meta = await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values(valuesPayload)
      .onConflictDoUpdate({
        target: appSettings.id,
        set: valuesPayload,
      });

    // Keep global 'kas' synced when RT 08 or server updates default settings
    if (settingsId !== 'kas' && desiredRt === '08' && user.role === 'admin') {
      await tx
        .insert(appSettings)
        .values({ ...valuesPayload, id: 'kas' })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { ...valuesPayload, id: 'kas' },
        });
    }

    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: 'UPDATE_SETTINGS',
      entityType: 'settings',
      entityId: settingsId,
      rtScope: formatRtScope(desiredRt, desiredRw),
      summary: `Memperbarui pengaturan kas & tahun aktif (${nextTahun}) untuk ${formatRtScope(desiredRt, desiredRw)}`,
    });
    createdNotif = await createNotificationForEventTx(tx, {
      title: `Pengaturan Kas RT ${desiredRt} Diperbarui`,
      body: `Tarif iuran & saldo awal periode ${nextTahun} telah diperbarui oleh ${user.nama}.`,
      category: 'pengaturan',
      entityType: 'settings',
      entityId: settingsId,
      rwId: desiredRw,
      targetRts: [desiredRt],
      targetRoles: ['server', 'admin', 'warga'],
      createdBy: user.username,
    });
    return m;
  });

  return {
    settings: mapRowToSettings(valuesPayload as any),
    revision: meta.revision,
    targetRt: desiredRt,
    notification: createdNotif,
  };
}

export async function upsertAdminAccountByServerSql(
  user: AuthUser,
  account: AdminRTAccount,
  opts?: MutationOptions
): Promise<{ account: AdminRTAccount; revision: number }> {
  if (user.role !== 'server') {
    throw new ForbiddenError('Hanya Super Admin Server RW 05 yang berwenang mengelola akun Admin RT.');
  }
  await ensureSqlSeeded();
  const nowIso = new Date().toISOString();
  const rows = await db.select().from(adminAccounts);
  const existing = rows.find(
    (a) =>
      a.id === account.id ||
      a.username.trim().toLowerCase() === String(account.username || '').trim().toLowerCase()
  );

  if (existing && opts?.expectedVersion !== undefined) {
    const currentVer = Number((existing as any).version) || 1;
    if (Number(opts.expectedVersion) !== currentVer) {
      throw new VersionConflictError(
        `Akun admin "${existing.username}" telah diperbarui di sesi lain.`,
        currentVer
      );
    }
  }

  const targetId = existing?.id || account.id || `adm_${Date.now()}`;
  const nextVersion = existing ? (Number((existing as any).version) || 1) + 1 : 1;
  const stamped: AdminRTAccount = {
    ...(existing ? mapRowToAdmin(existing) : ({} as AdminRTAccount)),
    ...account,
    id: targetId,
    rt: normalizeRtCode(account.rt || existing?.rt || '08'),
    rw: normalizeRwCode(account.rw || existing?.rw || '05'),
    passwordHash: account.passwordHash || existing?.passwordHash || 'rt08rw05',
    updatedAt: nowIso,
    version: nextVersion,
  };

  const row = toAdminRow(stamped, nowIso, nextVersion);
  const meta = await db.transaction(async (tx) => {
    await tx.delete(deletedEntities).where(eq(deletedEntities.id, `adminAccounts:${targetId}`));
    await tx.insert(adminAccounts).values(row).onConflictDoUpdate({ target: adminAccounts.id, set: row });
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: existing ? 'UPDATE_ADMIN_ACCOUNT' : 'CREATE_ADMIN_ACCOUNT',
      entityType: 'admin_account',
      entityId: targetId,
      rtScope: formatRtScope(stamped.rt, stamped.rw),
      summary: `${existing ? 'Memperbarui' : 'Menambah'} akun pengurus ${stamped.username} (RT ${stamped.rt})`,
    });
    return m;
  });

  return { account: mapRowToAdmin(row as any), revision: meta.revision };
}

export async function deleteAdminAccountByServerSql(
  user: AuthUser,
  id: string
): Promise<{ revision: number }> {
  if (user.role !== 'server') {
    throw new ForbiddenError('Hanya Super Admin Server RW 05 yang berwenang menghapus akun Admin RT.');
  }
  await ensureSqlSeeded();
  const existingRows = await db.select().from(adminAccounts).where(eq(adminAccounts.id, id)).limit(1);
  if (existingRows.length === 0) {
    throw new NotFoundError('Akun Admin RT tidak ditemukan.');
  }
  const existing = existingRows[0];
  const nowIso = new Date().toISOString();
  const meta = await db.transaction(async (tx) => {
    await tx.delete(adminAccounts).where(eq(adminAccounts.id, id));
    await tx
      .insert(deletedEntities)
      .values({ id: `adminAccounts:${id}`, entityType: 'adminAccounts', entityId: id, deletedAt: nowIso })
      .onConflictDoNothing();
    const m = await bumpRevisionTx(tx);
    await writeAuditLogTx(tx, user, {
      action: 'DELETE_ADMIN_ACCOUNT',
      entityType: 'admin_account',
      entityId: id,
      rtScope: formatRtScope(existing.rt, existing.rw),
      summary: `Menghapus akun pengurus ${existing.username} (RT ${existing.rt})`,
    });
    return m;
  });
  return { revision: meta.revision };
}

export async function getNotificationsForUserSql(
  user: AuthUser,
  limit = 60
): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  await ensureSqlSeeded();
  const allRows = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(250);
  const userKey = getUserKey(user);
  const readsRows = await db
    .select()
    .from(notificationReads)
    .where(eq(notificationReads.userKey, userKey));
  const readSet = new Set(readsRows.map((r) => r.notificationId));
  const userScope = extractUserRtRw(user);

  const visible: AppNotification[] = [];
  for (const r of allRows) {
    const targets = normalizeTargetRts(r.targetRts);
    const targetRoles = Array.isArray(r.targetRoles) ? r.targetRoles : null;
    if (targetRoles && targetRoles.length > 0 && !targetRoles.includes(user.role)) {
      continue;
    }
    if (user.role !== 'server') {
      if (!targets.includes('SEMUA') && !targets.includes(userScope.rt)) {
        continue;
      }
    }
    visible.push({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category as AppNotification['category'],
      entityType: r.entityType || undefined,
      entityId: r.entityId || undefined,
      rwId: r.rwId,
      targetRts: targets,
      targetRoles: (targetRoles as AppNotification['targetRoles']) || undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      isRead: readSet.has(r.id),
    });
    if (visible.length >= limit) break;
  }

  const unreadCount = visible.filter((n) => !n.isRead).length;
  return { notifications: visible, unreadCount };
}

export async function markNotificationReadSql(user: AuthUser, notificationId: string): Promise<void> {
  await ensureSqlSeeded();
  const userKey = getUserKey(user);
  await db
    .insert(notificationReads)
    .values({
      id: `${notificationId}:${userKey}`,
      notificationId,
      userKey,
      readAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

export async function markAllNotificationsReadSql(user: AuthUser): Promise<number> {
  const { notifications: visible } = await getNotificationsForUserSql(user, 200);
  const unread = visible.filter((n) => !n.isRead);
  if (unread.length === 0) return 0;
  const userKey = getUserKey(user);
  const nowIso = new Date().toISOString();
  await db
    .insert(notificationReads)
    .values(
      unread.map((n) => ({
        id: `${n.id}:${userKey}`,
        notificationId: n.id,
        userKey,
        readAt: nowIso,
      }))
    )
    .onConflictDoNothing();
  return unread.length;
}

export async function savePushSubscriptionSql(
  user: AuthUser,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  await ensureSqlSeeded();
  const endpoint = String(sub?.endpoint || '').trim();
  const p256dh = String(sub?.keys?.p256dh || '').trim();
  const auth = String(sub?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    throw new BadRequestError('Data langganan push notification tidak lengkap.');
  }
  const { rt, rw } = extractUserRtRw(user);
  const nowIso = new Date().toISOString();
  const id = createHash('sha256').update(endpoint).digest('hex');
  await db
    .insert(pushSubscriptions)
    .values({
      id,
      userKey: getUserKey(user),
      role: user.role,
      rtId: user.role === 'server' ? 'SEMUA' : rt,
      rwId: rw,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent ? userAgent.slice(0, 240) : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.id,
      set: {
        userKey: getUserKey(user),
        role: user.role,
        rtId: user.role === 'server' ? 'SEMUA' : rt,
        rwId: rw,
        p256dh,
        auth,
        userAgent: userAgent ? userAgent.slice(0, 240) : null,
        updatedAt: nowIso,
      },
    });
}

export async function removePushSubscriptionSql(user: AuthUser, endpoint?: string): Promise<void> {
  await ensureSqlSeeded();
  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userKey, getUserKey(user))
        )
      );
    return;
  }
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userKey, getUserKey(user)));
}

export async function removePushSubscriptionByEndpointSql(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function getPushSubscriptionsForTargetSql(
  rwId: string,
  targetRts: string[],
  targetRoles?: Array<'server' | 'admin' | 'warga'>
) {
  await ensureSqlSeeded();
  const rows = await db.select().from(pushSubscriptions);
  const normalizedTargets = normalizeTargetRts(targetRts);
  const cleanRw = normalizeRwCode(rwId || '05');

  return rows
    .filter((r) => {
      if (normalizeRwCode(r.rwId) !== cleanRw) return false;
      if (targetRoles && targetRoles.length > 0 && !targetRoles.includes(r.role as any)) {
        return false;
      }
      if (r.role === 'server') return true;
      if (normalizedTargets.includes('SEMUA')) return true;
      return normalizedTargets.includes(normalizeRtCode(r.rtId));
    })
    .map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
    }));
}

export async function getDeltaSinceRevisionSql(user: AuthUser, sinceRevision: number) {
  const snapshot = await getDatabaseSnapshotForUser(user);
  return {
    changed: sinceRevision !== snapshot.revision,
    revision: snapshot.revision,
    lastUpdated: snapshot.lastUpdated,
    data: snapshot,
  };
}

export async function getAuditLogsSql(user: AuthUser, limit = 100): Promise<AuditLogEntry[]> {
  await ensureSqlSeeded();
  if (user.role === 'warga') {
    throw new ForbiddenError('Akun Warga tidak memiliki akses log audit.');
  }
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(300);
  const scope = extractUserRtRw(user);
  const filtered = rows.filter((r) => {
    if (user.role === 'server') return true;
    return normalizeRtCode(r.actorRt) === scope.rt || (r.rtScope && extractScopeRtRw(r.rtScope).rt === scope.rt);
  });
  return filtered.slice(0, limit).map((r) => ({
    id: r.id,
    actorUsername: r.actorUsername,
    actorRole: r.actorRole,
    actorRt: r.actorRt,
    actorRw: r.actorRw,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    rtScope: r.rtScope || undefined,
    summary: r.summary,
    createdAt: r.createdAt,
  }));
}

export async function getBackupExportSql(user: AuthUser) {
  if (user.role === 'warga') {
    throw new ForbiddenError('Hanya Admin RT atau Super Admin Server yang dapat mengekspor backup database.');
  }
  const data = await getDatabaseSnapshotForUser(user);
  return {
    exportedAt: new Date().toISOString(),
    exportedBy: user.username,
    role: user.role,
    rtScope: user.rtScope || 'RW 05',
    data,
  };
}

export async function mergeAndSaveFullStateSql(
  payload: any,
  options?: { reviveAdminIds?: string[]; callerUser?: AuthUser }
): Promise<FullAppDatabaseState> {
  return withDbWriteLock(async () => {
  try {
    await ensureSqlSeeded();
    const caller = options?.callerUser;

    if (payload?.isHardReset === true) {
      if (caller && caller.role !== 'server') {
        throw new ForbiddenError('Reset total database server hanya diperbolehkan untuk Super Admin Server RW 05.');
      }
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

export async function readCloudSqlMigrationSnapshot(): Promise<{
  available: boolean;
  data?: FullAppDatabaseState;
  reason?: string;
}> {
  if (isSqlTemporarilyUnavailable()) {
    return {
      available: false,
      reason: 'Cloud SQL tidak terjangkau pada runtime ini (mode Firebase aktif).',
    };
  }
  const status = getDatabaseConfigStatus();
  if (!status.configured) {
    return { available: false, reason: 'Cloud SQL tidak dikonfigurasi pada runtime ini.' };
  }
  try {
    await pool.query('SELECT 1');
    await ensureSqlSeeded();
    const state = await readFullStateSql();
    const hasMeaningfulData =
      state.wargaList.length > 0 ||
      state.transactions.length > 0 ||
      state.bantuanList.length > 0 ||
      state.pengumumanList.length > 0 ||
      state.dokumenList.length > 0 ||
      state.adminAccounts.length > 0;
    if (!hasMeaningfulData) {
      return { available: false, reason: 'Cloud SQL kosong.' };
    }
    return { available: true, data: state };
  } catch (err: any) {
    if (isSqlUnavailable(err)) {
      return {
        available: false,
        reason: 'Cloud SQL tidak terjangkau pada runtime ini (mode Firebase aktif).',
      };
    }
    console.info('Cloud SQL migration snapshot skipped (non-fatal).');
    return {
      available: false,
      reason: 'Cloud SQL tidak terjangkau dari runtime ini.',
    };
  }
}

