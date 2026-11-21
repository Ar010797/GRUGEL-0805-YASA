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
  Transaction,
  Warga,
} from '../types';
import {
  getBantuanRTCode,
  getTransactionRTCode,
  getWargaRTCode,
  normalizeRTCode,
  normalizeRWCode,
} from './rtFilter';
import { isPengumumanExpired } from './security';

export interface MqttPublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface MqttClientLike {
  connected?: boolean;
  on: (event: string, listener: (...args: any[]) => void) => void;
  subscribe: (
    topic: string | string[],
    opts?: { qos?: 0 | 1 | 2 },
    cb?: (err?: Error | null) => void
  ) => void;
  publish: (
    topic: string,
    payload: string,
    opts?: MqttPublishOptions,
    cb?: (err?: Error | null) => void
  ) => void;
  end: (force?: boolean, cb?: () => void) => void;
  removeAllListeners?: () => void;
}

declare global {
  interface Window {
    mqtt?: {
      connect: (
        url: string,
        opts?: {
          clientId?: string;
          clean?: boolean;
          reconnectPeriod?: number;
          connectTimeout?: number;
          keepalive?: number;
        }
      ) => MqttClientLike;
    };
  }
}

export const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
] as const;

export const MQTT_TOPIC_PREFIX = 'app_warga_rw05_sync_v1/';

export type MqttModuleTopic =
  | 'warga'
  | 'transactions'
  | 'bantuan'
  | 'pengumuman'
  | 'dokumen'
  | 'laporan'
  | 'accounts'
  | 'settings'
  | 'notifications'
  | 'audit_logs'
  | 'tombstones';

const ALL_MODULE_TOPICS: MqttModuleTopic[] = [
  'warga',
  'transactions',
  'bantuan',
  'pengumuman',
  'dokumen',
  'laporan',
  'accounts',
  'settings',
  'notifications',
  'audit_logs',
  'tombstones',
];

export type MqttConnectionState = 'connected' | 'syncing' | 'offline';

export interface TombstoneEntry {
  id: string;
  deletedAt: string;
  deletedBy?: string;
}

export interface TombstonesMap {
  warga: TombstoneEntry[];
  transactions: TombstoneEntry[];
  bantuan: TombstoneEntry[];
  pengumuman: TombstoneEntry[];
  dokumen: TombstoneEntry[];
  laporan: TombstoneEntry[];
  accounts: TombstoneEntry[];
}

export interface MqttDatabaseStore {
  warga: Warga[];
  transactions: Transaction[];
  bantuan: BantuanPemerintah[];
  pengumuman: PengumumanRT[];
  dokumen: DokumenPdfWarga[];
  laporan: PembaruanBulananRT[];
  accounts: AdminRTAccount[];
  settings: {
    pengaturanKas: PengaturanKas;
    tahunAktif: number;
    updatedAt: string;
    updatedBy?: string;
  };
  notifications: AppNotification[];
  audit_logs: AuditLogEntry[];
  tombstones: TombstonesMap;
  lastSyncedAt?: string;
}

const STORAGE_STORE_KEY = 'kaswarga_mqtt_store_v1';
const STORAGE_DIRTY_KEY = 'kaswarga_mqtt_dirty_v1';
const STORAGE_SESSION_KEY = 'kaswarga_active_session_v1';
const STORAGE_NOTIF_READS_PREFIX = 'kaswarga_notif_reads_v1_';
const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const DEFAULT_PENGATURAN_KAS: PengaturanKas = {
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
  updatedAt: SEED_TIMESTAMP,
};

export const DEFAULT_SEEDED_ACCOUNTS: AdminRTAccount[] = [
  {
    id: 'acc_super_rw05',
    username: 'adminrw05',
    passwordHash: '123456',
    nama: 'Super Admin RW 05',
    role: 'super_admin',
    rtId: 'ALL',
    rt: 'ALL',
    rw: '05',
    kontak: '0812-0000-0005',
    jabatan: 'Ketua RW 05',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt01',
    username: 'adminrt01',
    passwordHash: '111111',
    nama: 'Admin RT 01',
    role: 'admin_rt',
    rtId: 'RT01',
    rt: '01',
    rw: '05',
    kontak: '0812-0000-0001',
    jabatan: 'Ketua RT 01',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt02',
    username: 'adminrt02',
    passwordHash: '222222',
    nama: 'Admin RT 02',
    role: 'admin_rt',
    rtId: 'RT02',
    rt: '02',
    rw: '05',
    kontak: '0812-0000-0002',
    jabatan: 'Ketua RT 02',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt03',
    username: 'adminrt03',
    passwordHash: '333333',
    nama: 'Admin RT 03',
    role: 'admin_rt',
    rtId: 'RT03',
    rt: '03',
    rw: '05',
    kontak: '0812-0000-0003',
    jabatan: 'Ketua RT 03',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt04',
    username: 'adminrt04',
    passwordHash: '444444',
    nama: 'Admin RT 04',
    role: 'admin_rt',
    rtId: 'RT04',
    rt: '04',
    rw: '05',
    kontak: '0812-0000-0004',
    jabatan: 'Ketua RT 04',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt05',
    username: 'adminrt05',
    passwordHash: '555555',
    nama: 'Admin RT 05',
    role: 'admin_rt',
    rtId: 'RT05',
    rt: '05',
    rw: '05',
    kontak: '0812-0000-0005',
    jabatan: 'Ketua RT 05',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt06',
    username: 'adminrt06',
    passwordHash: '666666',
    nama: 'Admin RT 06',
    role: 'admin_rt',
    rtId: 'RT06',
    rt: '06',
    rw: '05',
    kontak: '0812-0000-0006',
    jabatan: 'Ketua RT 06',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt07',
    username: 'adminrt07',
    passwordHash: '777777',
    nama: 'Admin RT 07',
    role: 'admin_rt',
    rtId: 'RT07',
    rt: '07',
    rw: '05',
    kontak: '0812-0000-0007',
    jabatan: 'Ketua RT 07',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
  {
    id: 'acc_admin_rt08',
    username: 'adminrt08',
    passwordHash: '888888',
    nama: 'Admin RT 08',
    role: 'admin_rt',
    rtId: 'RT08',
    rt: '08',
    rw: '05',
    kontak: '0812-0000-0008',
    jabatan: 'Ketua RT 08',
    status: 'aktif',
    updatedAt: SEED_TIMESTAMP,
    updatedBy: 'system_seed',
    version: 1,
  },
];

export const EMPTY_TOMBSTONES: TombstonesMap = {
  warga: [],
  transactions: [],
  bantuan: [],
  pengumuman: [],
  dokumen: [],
  laporan: [],
  accounts: [],
};

export function createEmptyMqttStore(): MqttDatabaseStore {
  return {
    warga: [],
    transactions: [],
    bantuan: [],
    pengumuman: [],
    dokumen: [],
    laporan: [],
    accounts: DEFAULT_SEEDED_ACCOUNTS.map((a) => ({ ...a })),
    settings: {
      pengaturanKas: { ...DEFAULT_PENGATURAN_KAS },
      tahunAktif: DEFAULT_PENGATURAN_KAS.tahunAktif,
      updatedAt: SEED_TIMESTAMP,
      updatedBy: 'system_seed',
    },
    notifications: [],
    audit_logs: [],
    tombstones: {
      warga: [],
      transactions: [],
      bantuan: [],
      pengumuman: [],
      dokumen: [],
      laporan: [],
      accounts: [],
    },
  };
}

function toMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function scrubPII(text: string): string {
  if (!text) return '';
  return String(text).replace(/\b\d{12,18}\b/g, (digits) => {
    if (digits.length <= 6) return '******';
    return `${digits.slice(0, 4)}••••••••${digits.slice(-2)}`;
  });
}

export function formatRtId(rt?: string | null): string {
  const raw = String(rt || '').trim().toUpperCase();
  if (!raw || raw === 'ALL' || raw === 'SEMUA' || raw === 'SEMUA RT') return 'ALL';
  const norm = normalizeRTCode(raw);
  return norm ? `RT${norm}` : 'ALL';
}

export function getUserNormalizedRT(user?: AuthUser | null): string {
  if (!user) return '';
  if (user.role === 'server' || user.rtId === 'ALL') return 'ALL';
  return normalizeRTCode(user.rtId || user.rtScope || '') || '';
}

export function isSuperAdminUser(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'server' || user.rtId === 'ALL';
}

export function normalizeAccountRecord(acc: AdminRTAccount): AdminRTAccount {
  const isSuper =
    acc.role === 'super_admin' ||
    String(acc.rt).toUpperCase() === 'ALL' ||
    String(acc.rt).toUpperCase() === 'SEMUA' ||
    String(acc.rtId).toUpperCase() === 'ALL' ||
    acc.username?.trim().toLowerCase() === 'adminrw05';

  const rtCode = isSuper ? 'ALL' : normalizeRTCode(acc.rt || acc.rtId) || '08';
  return {
    ...acc,
    role: isSuper ? 'super_admin' : 'admin_rt',
    rt: rtCode,
    rtId: isSuper ? 'ALL' : `RT${rtCode}`,
    rw: normalizeRWCode(acc.rw, '05'),
    status: acc.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    updatedAt: acc.updatedAt || SEED_TIMESTAMP,
  };
}

export function mergeTombstoneLists(
  a: TombstoneEntry[] = [],
  b: TombstoneEntry[] = []
): TombstoneEntry[] {
  const byId = new Map<string, TombstoneEntry>();
  for (const item of [...a, ...b]) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    if (!prev || toMs(item.deletedAt) >= toMs(prev.deletedAt)) {
      byId.set(item.id, {
        id: String(item.id),
        deletedAt: item.deletedAt || new Date().toISOString(),
        deletedBy: item.deletedBy || prev?.deletedBy,
      });
    }
  }
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return Array.from(byId.values())
    .filter((t) => toMs(t.deletedAt) === 0 || toMs(t.deletedAt) >= cutoff)
    .slice(-1500);
}

export function mergeTombstoneMaps(a?: Partial<TombstonesMap>, b?: Partial<TombstonesMap>): TombstonesMap {
  return {
    warga: mergeTombstoneLists(a?.warga, b?.warga),
    transactions: mergeTombstoneLists(a?.transactions, b?.transactions),
    bantuan: mergeTombstoneLists(a?.bantuan, b?.bantuan),
    pengumuman: mergeTombstoneLists(a?.pengumuman, b?.pengumuman),
    dokumen: mergeTombstoneLists(a?.dokumen, b?.dokumen),
    laporan: mergeTombstoneLists(a?.laporan, b?.laporan),
    accounts: mergeTombstoneLists(a?.accounts, b?.accounts),
  };
}

function getTombstoneMs(tombstones: TombstoneEntry[], id: string): number {
  const entry = tombstones.find((t) => t.id === id);
  return entry ? toMs(entry.deletedAt) : 0;
}

export function mergeModuleLists<T extends { id: string; updatedAt?: string }>(
  localList: T[],
  remoteList: T[],
  tombstones: TombstoneEntry[] = [],
  secondaryKeyFn?: (item: T) => string | null
): T[] {
  const byId = new Map<string, T>();

  const applyItem = (item: T) => {
    if (!item || !item.id) return;
    const itemMs = toMs(item.updatedAt);
    const delMs = getTombstoneMs(tombstones, item.id);
    if (delMs > 0 && delMs >= itemMs) return;

    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      return;
    }
    const existingMs = toMs(existing.updatedAt);
    if (itemMs >= existingMs) {
      byId.set(item.id, item);
    }
  };

  for (const item of localList) applyItem(item);
  for (const item of remoteList) applyItem(item);

  const values = Array.from(byId.values());
  if (!secondaryKeyFn) return values;

  const bySecondary = new Map<string, T>();
  const passthrough: T[] = [];

  for (const item of values) {
    const secKey = secondaryKeyFn(item);
    if (!secKey) {
      passthrough.push(item);
      continue;
    }
    const prev = bySecondary.get(secKey);
    if (!prev) {
      bySecondary.set(secKey, item);
      continue;
    }
    const itemMs = toMs(item.updatedAt);
    const prevMs = toMs(prev.updatedAt);
    if (itemMs >= prevMs) {
      bySecondary.set(secKey, item);
    }
  }

  return [...passthrough, ...Array.from(bySecondary.values())];
}

export function mergeAccountsWithSeeds(
  localAccounts: AdminRTAccount[],
  remoteAccounts: AdminRTAccount[],
  accountTombstones: TombstoneEntry[] = []
): AdminRTAccount[] {
  const normalizedLocal = localAccounts.map(normalizeAccountRecord);
  const normalizedRemote = remoteAccounts.map(normalizeAccountRecord);
  const normalizedSeeds = DEFAULT_SEEDED_ACCOUNTS.map(normalizeAccountRecord);

  // Merge seeds first, then local + remote so newer edits or tombstones override seeds
  const seededPlusLocal = mergeModuleLists(
    normalizedSeeds,
    normalizedLocal,
    accountTombstones,
    (acc) => acc.username?.trim().toLowerCase() || null
  );
  return mergeModuleLists(
    seededPlusLocal,
    normalizedRemote,
    accountTombstones,
    (acc) => acc.username?.trim().toLowerCase() || null
  );
}

function mergeNotificationsList(
  localList: AppNotification[],
  remoteList: AppNotification[]
): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  for (const item of [...localList, ...remoteList]) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    if (!prev || toMs(item.createdAt) >= toMs(prev.createdAt)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
    .slice(0, 120);
}

function mergeAuditLogsList(
  localList: AuditLogEntry[],
  remoteList: AuditLogEntry[]
): AuditLogEntry[] {
  const byId = new Map<string, AuditLogEntry>();
  for (const item of [...localList, ...remoteList]) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    if (!prev || toMs(item.createdAt) >= toMs(prev.createdAt)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
    .slice(0, 200);
}

// ---------- Notification Local Read State ----------
function getUserReadStorageKey(user?: AuthUser | null): string {
  if (!user) return `${STORAGE_NOTIF_READS_PREFIX}anon`;
  const key =
    user.role === 'warga'
      ? `warga_${user.wargaId || user.noKK || user.username}`
      : `${user.role}_${user.username.toLowerCase()}`;
  return `${STORAGE_NOTIF_READS_PREFIX}${key}`;
}

export function readUserReadNotifIds(user?: AuthUser | null): Set<string> {
  try {
    const raw = localStorage.getItem(getUserReadStorageKey(user));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function writeUserReadNotifIds(user: AuthUser | null, ids: Set<string>) {
  try {
    localStorage.setItem(getUserReadStorageKey(user), JSON.stringify(Array.from(ids).slice(-300)));
  } catch {
    // ignore storage quota
  }
}

// ---------- RT Isolation & Scoped Filtering ----------
export function doesPengumumanMatchRT(p: PengumumanRT, targetRtCode: string): boolean {
  if (!targetRtCode || targetRtCode === 'ALL' || targetRtCode === 'SEMUA') return true;
  if (Array.isArray(p.targetRts) && p.targetRts.length > 0) {
    if (p.targetRts.some((r) => String(r).toUpperCase() === 'SEMUA' || String(r).toUpperCase() === 'ALL')) {
      return true;
    }
    return p.targetRts.some((r) => normalizeRTCode(r) === targetRtCode);
  }
  const scope = String(p.rtScope || '').trim();
  if (!scope || /semua/i.test(scope)) return true;
  return normalizeRTCode(scope) === targetRtCode;
}

export function doesNotificationMatchUser(notif: AppNotification, user: AuthUser): boolean {
  if (isSuperAdminUser(user)) return true;
  const userRt = getUserNormalizedRT(user);
  if (user.role === 'warga' && notif.targetRoles && !notif.targetRoles.includes('warga')) {
    return false;
  }
  if (!Array.isArray(notif.targetRts) || notif.targetRts.length === 0) return true;
  if (notif.targetRts.some((r) => String(r).toUpperCase() === 'SEMUA' || String(r).toUpperCase() === 'ALL')) {
    return true;
  }
  if (!userRt) return false;
  return notif.targetRts.some((r) => normalizeRTCode(r) === userRt);
}

export interface ScopedUserViewData {
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengumumanList: PengumumanRT[];
  dokumenList: DokumenPdfWarga[];
  laporanBulananRT: PembaruanBulananRT[];
  adminAccounts: AdminRTAccount[];
  pengaturanKas: PengaturanKas;
  tahunAktif: number;
  notifications: AppNotification[];
  unreadCount: number;
  auditLogs: AuditLogEntry[];
}

export function filterStoreForUser(
  store: MqttDatabaseStore,
  user: AuthUser | null
): ScopedUserViewData {
  const basePengaturan = store.settings?.pengaturanKas || DEFAULT_PENGATURAN_KAS;
  const tahunAktif = store.settings?.tahunAktif || basePengaturan.tahunAktif || 2026;
  const readIds = readUserReadNotifIds(user);

  if (!user) {
    return {
      wargaList: [],
      transactions: [],
      bantuanList: [],
      pengumumanList: [],
      dokumenList: [],
      laporanBulananRT: [],
      adminAccounts: store.accounts,
      pengaturanKas: { ...basePengaturan, tahunAktif },
      tahunAktif,
      notifications: [],
      unreadCount: 0,
      auditLogs: [],
    };
  }

  if (isSuperAdminUser(user)) {
    const notifications = store.notifications.map((n) => ({
      ...n,
      isRead: readIds.has(n.id),
    }));
    return {
      wargaList: store.warga,
      transactions: store.transactions,
      bantuanList: store.bantuan,
      pengumumanList: store.pengumuman,
      dokumenList: store.dokumen,
      laporanBulananRT: store.laporan,
      adminAccounts: store.accounts,
      pengaturanKas: { ...basePengaturan, tahunAktif },
      tahunAktif,
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
      auditLogs: store.audit_logs,
    };
  }

  const userRt = getUserNormalizedRT(user) || '08';
  const defaultRt = userRt;

  const wargaByRT = store.warga.filter((w) => getWargaRTCode(w, defaultRt) === userRt);
  const transactionsByRT = store.transactions.filter(
    (t) => getTransactionRTCode(t, wargaByRT, defaultRt) === userRt
  );
  const bantuanByRT = store.bantuan.filter(
    (b) => getBantuanRTCode(b, wargaByRT, defaultRt) === userRt
  );
  const pengumumanByRT = store.pengumuman.filter((p) => doesPengumumanMatchRT(p, userRt));
  const dokumenByRT = store.dokumen.filter((d) => {
    const dRt = normalizeRTCode(d.rtScope || '');
    return !dRt || /semua/i.test(String(d.rtScope || '')) || dRt === userRt;
  });
  const laporanByRT = store.laporan.filter((l) => normalizeRTCode(l.rt) === userRt);

  const notifications = store.notifications
    .filter((n) => doesNotificationMatchUser(n, user))
    .map((n) => ({
      ...n,
      isRead: readIds.has(n.id),
    }));

  const scopedProfil = basePengaturan.profilRT
    ? {
        ...basePengaturan.profilRT,
        namaRT: userRt,
        judulKopSurat: `PENGURUS RUKUN TETANGGA ${userRt} RUKUN WARGA ${normalizeRWCode(basePengaturan.profilRT.namaRW, '05')}`,
        sebutanWilayah: `RT ${userRt} RW ${normalizeRWCode(basePengaturan.profilRT.namaRW, '05')} ${basePengaturan.profilRT.desa || 'Desa Kotayasa'}`,
      }
    : DEFAULT_PENGATURAN_KAS.profilRT;

  if (user.role === 'warga') {
    const ownWarga = wargaByRT.filter(
      (w) =>
        (user.wargaId && w.id === user.wargaId) ||
        (user.noKK && w.noKK === user.noKK)
    );
    const activePengumuman = pengumumanByRT.filter((p) => !isPengumumanExpired(p.tanggalBerakhir));

    return {
      wargaList: ownWarga,
      transactions: transactionsByRT,
      bantuanList: bantuanByRT.filter(
        (b) => !user.noKK || String(b.noKK || '').trim() === String(user.noKK).trim()
      ),
      pengumumanList: activePengumuman,
      dokumenList: dokumenByRT,
      laporanBulananRT: [],
      adminAccounts: store.accounts.filter((a) => normalizeRTCode(a.rt) === userRt),
      pengaturanKas: { ...basePengaturan, tahunAktif, profilRT: scopedProfil },
      tahunAktif,
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
      auditLogs: [],
    };
  }

  return {
    wargaList: wargaByRT,
    transactions: transactionsByRT,
    bantuanList: bantuanByRT,
    pengumumanList: pengumumanByRT,
    dokumenList: dokumenByRT,
    laporanBulananRT: laporanByRT,
    adminAccounts: store.accounts.filter((a) => normalizeRTCode(a.rt) === userRt),
    pengaturanKas: { ...basePengaturan, tahunAktif, profilRT: scopedProfil },
    tahunAktif,
    notifications,
    unreadCount: notifications.filter((n) => !n.isRead).length,
    auditLogs: store.audit_logs.filter((l) => !l.actorRt || normalizeRTCode(l.actorRt) === userRt),
  };
}

export function assertRtWriteAllowed(
  user: AuthUser | null,
  targetRt?: string | null
): { ok: true } | { ok: false; message: string } {
  if (!user) {
    return { ok: false, message: 'Sesi login belum aktif. Silakan masuk terlebih dahulu.' };
  }
  if (isSuperAdminUser(user)) return { ok: true };
  if (user.role === 'warga') {
    return { ok: false, message: 'Akun Warga tidak memiliki izin mengubah data RT.' };
  }
  const userRt = getUserNormalizedRT(user);
  const reqRt = normalizeRTCode(targetRt || '');
  if (reqRt && userRt && reqRt !== userRt) {
    return {
      ok: false,
      message: `Akses ditolak: Admin RT ${userRt} hanya dapat mengelola data wilayah RT ${userRt}.`,
    };
  }
  return { ok: true };
}

// ---------- Active Session Helpers ----------
export function getSavedAuthSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed || !parsed.role || !parsed.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(user: AuthUser | null) {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    } else {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore storage errors
  }
}

// ---------- MQTT Sync Manager Singleton ----------
type StoreListener = (store: MqttDatabaseStore) => void;
type StatusListener = (status: {
  connectionState: MqttConnectionState;
  brokerUrl: string | null;
  error: string | null;
  pendingTopics: number;
  lastSyncedAt: string | null;
}) => void;

class MqttSyncEngine {
  private store: MqttDatabaseStore;
  private dirtyTopics: Set<MqttModuleTopic>;
  private client: MqttClientLike | null = null;
  private brokerIndex = 0;
  private activeBrokerUrl: string | null = null;
  private connectionState: MqttConnectionState = 'syncing';
  private lastError: string | null = null;
  private initialized = false;
  private hasReceivedBrokerAccounts = false;
  private seedCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private storeListeners = new Set<StoreListener>();
  private statusListeners = new Set<StatusListener>();

  constructor() {
    this.store = this.loadStoreFromLocal();
    this.dirtyTopics = this.loadDirtyFromLocal();
  }

  private loadStoreFromLocal(): MqttDatabaseStore {
    const empty = createEmptyMqttStore();
    try {
      const raw = localStorage.getItem(STORAGE_STORE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as Partial<MqttDatabaseStore>;
      if (!parsed || typeof parsed !== 'object') return empty;
      const tombstones = mergeTombstoneMaps(empty.tombstones, parsed.tombstones);
      return {
        warga: Array.isArray(parsed.warga) ? parsed.warga : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        bantuan: Array.isArray(parsed.bantuan) ? parsed.bantuan : [],
        pengumuman: Array.isArray(parsed.pengumuman) ? parsed.pengumuman : [],
        dokumen: Array.isArray(parsed.dokumen) ? parsed.dokumen : [],
        laporan: Array.isArray(parsed.laporan) ? parsed.laporan : [],
        accounts: mergeAccountsWithSeeds(
          Array.isArray(parsed.accounts) ? parsed.accounts : [],
          [],
          tombstones.accounts
        ),
        settings: parsed.settings?.pengaturanKas
          ? {
              pengaturanKas: {
                ...DEFAULT_PENGATURAN_KAS,
                ...parsed.settings.pengaturanKas,
                profilRT: {
                  ...DEFAULT_PENGATURAN_KAS.profilRT!,
                  ...(parsed.settings.pengaturanKas.profilRT || {}),
                },
              },
              tahunAktif:
                parsed.settings.tahunAktif ||
                parsed.settings.pengaturanKas.tahunAktif ||
                2026,
              updatedAt: parsed.settings.updatedAt || SEED_TIMESTAMP,
              updatedBy: parsed.settings.updatedBy,
            }
          : empty.settings,
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs : [],
        tombstones,
        lastSyncedAt: parsed.lastSyncedAt,
      };
    } catch {
      return empty;
    }
  }

  private saveStoreToLocal() {
    try {
      localStorage.setItem(STORAGE_STORE_KEY, JSON.stringify(this.store));
    } catch (err) {
      console.warn('Gagal menulis cache lokal MQTT:', err);
    }
  }

  private loadDirtyFromLocal(): Set<MqttModuleTopic> {
    try {
      const raw = localStorage.getItem(STORAGE_DIRTY_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr as MqttModuleTopic[]) : new Set();
    } catch {
      return new Set();
    }
  }

  private saveDirtyToLocal() {
    try {
      if (this.dirtyTopics.size === 0) {
        localStorage.removeItem(STORAGE_DIRTY_KEY);
      } else {
        localStorage.setItem(STORAGE_DIRTY_KEY, JSON.stringify(Array.from(this.dirtyTopics)));
      }
    } catch {
      // ignore storage errors
    }
  }

  private notifyStore() {
    for (const cb of this.storeListeners) {
      try {
        cb(this.store);
      } catch (e) {
        console.error('Store listener error:', e);
      }
    }
  }

  private notifyStatus() {
    const snapshot = this.getStatus();
    for (const cb of this.statusListeners) {
      try {
        cb(snapshot);
      } catch (e) {
        console.error('Status listener error:', e);
      }
    }
  }

  public getStore(): MqttDatabaseStore {
    return this.store;
  }

  public getStatus() {
    return {
      connectionState: this.connectionState,
      brokerUrl: this.activeBrokerUrl,
      error: this.lastError,
      pendingTopics: this.dirtyTopics.size,
      lastSyncedAt: this.store.lastSyncedAt || null,
    };
  }

  public subscribeStore(cb: StoreListener): () => void {
    this.storeListeners.add(cb);
    cb(this.store);
    return () => {
      this.storeListeners.delete(cb);
    };
  }

  public subscribeStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  public start() {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.client?.connected) {
          this.connectBroker(this.brokerIndex);
        } else {
          void this.flushDirtyTopics();
        }
      });
      window.addEventListener('offline', () => {
        this.connectionState = 'offline';
        this.lastError = 'Perangkat sedang offline. Perubahan disimpan di antrean lokal.';
        this.notifyStatus();
      });
    }

    this.connectBroker(0);
  }

  public reconnectNow() {
    this.brokerIndex = 0;
    this.connectBroker(0);
  }

  private cleanupClient() {
    if (this.seedCheckTimer) {
      clearTimeout(this.seedCheckTimer);
      this.seedCheckTimer = null;
    }
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try {
        this.client.removeAllListeners?.();
        this.client.end(true);
      } catch {
        // ignore close error
      }
      this.client = null;
    }
  }

  private connectBroker(index: number) {
    this.cleanupClient();

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.connectionState = 'offline';
      this.lastError = 'Tidak ada koneksi internet. Mode Offline aktif.';
      this.notifyStatus();
      return;
    }

    const mqttLib = typeof window !== 'undefined' ? window.mqtt : undefined;
    if (!mqttLib || typeof mqttLib.connect !== 'function') {
      this.connectionState = 'offline';
      this.lastError = 'Library sinkronisasi MQTT belum termuat di browser.';
      this.notifyStatus();
      this.reconnectTimer = setTimeout(() => this.connectBroker(index), 3000);
      return;
    }

    const url = MQTT_BROKERS[index % MQTT_BROKERS.length];
    this.brokerIndex = index % MQTT_BROKERS.length;
    this.activeBrokerUrl = url;
    this.connectionState = 'syncing';
    this.lastError = null;
    this.notifyStatus();

    const clientId = `rw05_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    let client: MqttClientLike;
    try {
      client = mqttLib.connect(url, {
        clientId,
        clean: true,
        reconnectPeriod: 0, // we handle failover explicitly
        connectTimeout: 8000,
        keepalive: 30,
      });
    } catch (err: any) {
      this.handleBrokerFailure(index, err?.message || 'Gagal membuka koneksi WSS MQTT.');
      return;
    }

    this.client = client;

    this.connectTimeoutTimer = setTimeout(() => {
      if (!client.connected) {
        this.handleBrokerFailure(index, `Timeout menghubungkan ke broker ${url}`);
      }
    }, 9000);

    client.on('connect', () => {
      if (this.client !== client) return;
      if (this.connectTimeoutTimer) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      this.lastError = null;
      this.connectionState = this.dirtyTopics.size > 0 ? 'syncing' : 'connected';
      this.notifyStatus();

      client.subscribe(`${MQTT_TOPIC_PREFIX}#`, { qos: 1 }, (subErr) => {
        if (this.client !== client) return;
        if (subErr) {
          this.lastError = `Gagal subscribe topik sinkronisasi: ${subErr.message}`;
          this.notifyStatus();
          return;
        }

        // Flush any dirty offline topics right away
        if (this.dirtyTopics.size > 0) {
          void this.flushDirtyTopics();
        }

        // After 1500ms, if broker didn't have retained accounts yet, seed the 9 initial accounts
        if (this.seedCheckTimer) clearTimeout(this.seedCheckTimer);
        this.seedCheckTimer = setTimeout(() => {
          if (this.client !== client || !client.connected) return;
          if (!this.hasReceivedBrokerAccounts) {
            void this.publishTopics(['accounts']);
          }
        }, 1500);
      });
    });

    client.on('message', (topic: string, rawPayload: any) => {
      if (this.client !== client) return;
      if (!topic || !topic.startsWith(MQTT_TOPIC_PREFIX)) return;
      const mod = topic.slice(MQTT_TOPIC_PREFIX.length) as MqttModuleTopic;
      if (!ALL_MODULE_TOPICS.includes(mod)) return;

      try {
        const text =
          typeof rawPayload === 'string'
            ? rawPayload
            : rawPayload?.toString
            ? rawPayload.toString('utf8')
            : String(rawPayload || '');
        if (!text || !text.trim()) return;
        const parsed = JSON.parse(text);
        this.handleIncomingModulePayload(mod, parsed);
      } catch (err) {
        console.warn(`Gagal parse payload MQTT (${topic}):`, err);
      }
    });

    client.on('error', (err: any) => {
      if (this.client !== client) return;
      this.handleBrokerFailure(index, err?.message || 'Koneksi broker MQTT terganggu.');
    });

    client.on('close', () => {
      if (this.client !== client) return;
      this.handleBrokerFailure(index, 'Koneksi MQTT terputus.');
    });

    client.on('offline', () => {
      if (this.client !== client) return;
      this.connectionState = 'offline';
      this.notifyStatus();
    });
  }

  private handleBrokerFailure(failedIndex: number, reason: string) {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.client) {
      try {
        this.client.removeAllListeners?.();
        this.client.end(true);
      } catch {
        // ignore
      }
      this.client = null;
    }

    const nextIndex = (failedIndex + 1) % MQTT_BROKERS.length;
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    this.connectionState = isOnline ? 'syncing' : 'offline';
    this.lastError = isOnline ? null : reason;
    this.notifyStatus();

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = nextIndex === 0 ? 4000 : 1200; // switch quickly from EMQX -> HiveMQ
    this.reconnectTimer = setTimeout(() => {
      this.connectBroker(nextIndex);
    }, delay);
  }

  private handleIncomingModulePayload(mod: MqttModuleTopic, payload: any) {
    let changed = false;

    if (mod === 'tombstones' && payload?.map) {
      const merged = mergeTombstoneMaps(this.store.tombstones, payload.map);
      this.store = {
        ...this.store,
        tombstones: merged,
        warga: mergeModuleLists(this.store.warga, [], merged.warga),
        transactions: mergeModuleLists(this.store.transactions, [], merged.transactions),
        bantuan: mergeModuleLists(this.store.bantuan, [], merged.bantuan),
        pengumuman: mergeModuleLists(this.store.pengumuman, [], merged.pengumuman),
        dokumen: mergeModuleLists(this.store.dokumen, [], merged.dokumen),
        laporan: mergeModuleLists(this.store.laporan, [], merged.laporan),
        accounts: mergeAccountsWithSeeds(this.store.accounts, [], merged.accounts),
        lastSyncedAt: new Date().toISOString(),
      };
      changed = true;
    } else if (mod === 'warga' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.warga,
        payload.list as Warga[],
        this.store.tombstones.warga,
        (w) => (w.noKK ? `kk_${String(w.noKK).trim()}` : null)
      );
      this.store = { ...this.store, warga: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'transactions' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.transactions,
        payload.list as Transaction[],
        this.store.tombstones.transactions
      );
      this.store = { ...this.store, transactions: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'bantuan' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.bantuan,
        payload.list as BantuanPemerintah[],
        this.store.tombstones.bantuan
      );
      this.store = { ...this.store, bantuan: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'pengumuman' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.pengumuman,
        payload.list as PengumumanRT[],
        this.store.tombstones.pengumuman
      );
      this.store = { ...this.store, pengumuman: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'dokumen' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.dokumen,
        payload.list as DokumenPdfWarga[],
        this.store.tombstones.dokumen
      );
      this.store = { ...this.store, dokumen: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'laporan' && Array.isArray(payload?.list)) {
      const merged = mergeModuleLists(
        this.store.laporan,
        payload.list as PembaruanBulananRT[],
        this.store.tombstones.laporan
      );
      this.store = { ...this.store, laporan: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'accounts' && Array.isArray(payload?.list)) {
      this.hasReceivedBrokerAccounts = true;
      const merged = mergeAccountsWithSeeds(
        this.store.accounts,
        payload.list as AdminRTAccount[],
        this.store.tombstones.accounts
      );
      this.store = { ...this.store, accounts: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'settings' && payload?.pengaturanKas) {
      const incomingMs = toMs(payload.updatedAt || payload.pengaturanKas?.updatedAt);
      const localMs = toMs(this.store.settings?.updatedAt);
      if (incomingMs >= localMs) {
        this.store = {
          ...this.store,
          settings: {
            pengaturanKas: {
              ...DEFAULT_PENGATURAN_KAS,
              ...payload.pengaturanKas,
              profilRT: {
                ...DEFAULT_PENGATURAN_KAS.profilRT!,
                ...(payload.pengaturanKas.profilRT || {}),
              },
            },
            tahunAktif: payload.tahunAktif || payload.pengaturanKas.tahunAktif || 2026,
            updatedAt: payload.updatedAt || new Date().toISOString(),
            updatedBy: payload.updatedBy,
          },
          lastSyncedAt: new Date().toISOString(),
        };
        changed = true;
      }
    } else if (mod === 'notifications' && Array.isArray(payload?.list)) {
      const merged = mergeNotificationsList(
        this.store.notifications,
        payload.list as AppNotification[]
      );
      this.store = { ...this.store, notifications: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    } else if (mod === 'audit_logs' && Array.isArray(payload?.list)) {
      const merged = mergeAuditLogsList(
        this.store.audit_logs,
        payload.list as AuditLogEntry[]
      );
      this.store = { ...this.store, audit_logs: merged, lastSyncedAt: new Date().toISOString() };
      changed = true;
    }

    if (changed) {
      this.saveStoreToLocal();
      this.notifyStore();
      if (this.client?.connected && this.dirtyTopics.size === 0) {
        this.connectionState = 'connected';
      }
      this.notifyStatus();
    }
  }

  private buildTopicPayload(mod: MqttModuleTopic): string {
    const now = new Date().toISOString();
    switch (mod) {
      case 'warga':
        return JSON.stringify({ list: this.store.warga, updatedAt: now });
      case 'transactions':
        return JSON.stringify({ list: this.store.transactions, updatedAt: now });
      case 'bantuan':
        return JSON.stringify({ list: this.store.bantuan, updatedAt: now });
      case 'pengumuman':
        return JSON.stringify({ list: this.store.pengumuman, updatedAt: now });
      case 'dokumen':
        return JSON.stringify({ list: this.store.dokumen, updatedAt: now });
      case 'laporan':
        return JSON.stringify({ list: this.store.laporan, updatedAt: now });
      case 'accounts':
        return JSON.stringify({ list: this.store.accounts, updatedAt: now });
      case 'settings':
        return JSON.stringify(this.store.settings);
      case 'notifications':
        return JSON.stringify({ list: this.store.notifications, updatedAt: now });
      case 'audit_logs':
        return JSON.stringify({ list: this.store.audit_logs, updatedAt: now });
      case 'tombstones':
        return JSON.stringify({ map: this.store.tombstones, updatedAt: now });
    }
  }

  private async publishSingleTopic(mod: MqttModuleTopic): Promise<boolean> {
    if (!this.client || !this.client.connected) return false;
    const topic = `${MQTT_TOPIC_PREFIX}${mod}`;
    const payload = this.buildTopicPayload(mod);
    return new Promise<boolean>((resolve) => {
      try {
        this.client!.publish(topic, payload, { retain: true, qos: 1 }, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch {
        resolve(false);
      }
    });
  }

  public async publishTopics(topics: MqttModuleTopic[]): Promise<boolean> {
    const unique = Array.from(new Set(topics));
    for (const t of unique) {
      this.dirtyTopics.add(t);
    }
    this.saveDirtyToLocal();

    if (!this.client?.connected) {
      this.connectionState = 'offline';
      this.notifyStatus();
      return false;
    }

    this.connectionState = 'syncing';
    this.notifyStatus();

    let allOk = true;
    for (const mod of unique) {
      const ok = await this.publishSingleTopic(mod);
      if (ok) {
        this.dirtyTopics.delete(mod);
      } else {
        allOk = false;
      }
    }

    this.saveDirtyToLocal();
    if (allOk && this.dirtyTopics.size === 0) {
      this.store = { ...this.store, lastSyncedAt: new Date().toISOString() };
      this.saveStoreToLocal();
      this.connectionState = 'connected';
      this.lastError = null;
    } else {
      this.connectionState = this.client?.connected ? 'syncing' : 'offline';
    }
    this.notifyStatus();
    return allOk;
  }

  public async flushDirtyTopics(): Promise<boolean> {
    if (this.dirtyTopics.size === 0) return true;
    return this.publishTopics(Array.from(this.dirtyTopics));
  }

  public async forceSyncNow(): Promise<boolean> {
    if (!this.client?.connected) {
      this.reconnectNow();
      return false;
    }
    if (this.dirtyTopics.size > 0) {
      return this.flushDirtyTopics();
    }
    return this.publishTopics(['accounts']);
  }

  public async mutate(
    mutator: (draft: MqttDatabaseStore, nowIso: string) => MqttModuleTopic[],
    auditMeta?: {
      user?: AuthUser | null;
      action: string;
      entityType: string;
      entityId: string;
      rtScope?: string;
      summary: string;
      notification?: Omit<AppNotification, 'id' | 'createdAt' | 'rwId'>;
    }
  ): Promise<{ ok: boolean; synced: boolean; store: MqttDatabaseStore }> {
    const nowIso = new Date().toISOString();
    const draft: MqttDatabaseStore = {
      ...this.store,
      warga: [...this.store.warga],
      transactions: [...this.store.transactions],
      bantuan: [...this.store.bantuan],
      pengumuman: [...this.store.pengumuman],
      dokumen: [...this.store.dokumen],
      laporan: [...this.store.laporan],
      accounts: [...this.store.accounts],
      settings: {
        ...this.store.settings,
        pengaturanKas: { ...this.store.settings.pengaturanKas },
      },
      notifications: [...this.store.notifications],
      audit_logs: [...this.store.audit_logs],
      tombstones: {
        warga: [...this.store.tombstones.warga],
        transactions: [...this.store.tombstones.transactions],
        bantuan: [...this.store.tombstones.bantuan],
        pengumuman: [...this.store.tombstones.pengumuman],
        dokumen: [...this.store.tombstones.dokumen],
        laporan: [...this.store.tombstones.laporan],
        accounts: [...this.store.tombstones.accounts],
      },
    };

    const touched = new Set<MqttModuleTopic>(mutator(draft, nowIso));

    if (auditMeta) {
      const actor = auditMeta.user;
      const actorRt = actor ? getUserNormalizedRT(actor) || 'ALL' : 'SYSTEM';
      const entry: AuditLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        actorUsername: actor?.username || 'system',
        actorRole: actor?.role || 'system',
        actorRt,
        actorRw: '05',
        action: auditMeta.action,
        entityType: auditMeta.entityType,
        entityId: auditMeta.entityId,
        rtScope: auditMeta.rtScope,
        summary: scrubPII(auditMeta.summary),
        createdAt: nowIso,
      };
      draft.audit_logs = [entry, ...draft.audit_logs].slice(0, 200);
      touched.add('audit_logs');

      if (auditMeta.notification) {
        const notif: AppNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: scrubPII(auditMeta.notification.title),
          body: scrubPII(auditMeta.notification.body),
          category: auditMeta.notification.category,
          entityType: auditMeta.notification.entityType,
          entityId: auditMeta.notification.entityId,
          rwId: '05',
          targetRts: auditMeta.notification.targetRts,
          targetRoles: auditMeta.notification.targetRoles,
          createdBy: auditMeta.notification.createdBy || actor?.username || 'system',
          createdAt: nowIso,
        };
        draft.notifications = [notif, ...draft.notifications].slice(0, 120);
        touched.add('notifications');
      }
    }

    this.store = draft;
    this.saveStoreToLocal();
    this.notifyStore();

    const synced = await this.publishTopics(Array.from(touched));
    return { ok: true, synced, store: this.store };
  }

  public addTombstone(
    draft: MqttDatabaseStore,
    key: keyof TombstonesMap,
    id: string,
    deletedAt: string,
    deletedBy?: string
  ) {
    draft.tombstones[key] = mergeTombstoneLists(draft.tombstones[key], [
      { id, deletedAt, deletedBy },
    ]);
  }
}

export const mqttSync = new MqttSyncEngine();

// ---------- Authentication against Synced Accounts & Warga ----------
export async function authenticateMqttUser(
  tabRole: 'server' | 'admin' | 'warga',
  username: string,
  secret: string
): Promise<{ ok: boolean; user?: AuthUser; message?: string }> {
  const cleanUser = String(username || '').trim();
  const cleanSecret = String(secret || '').trim();
  const store = mqttSync.getStore();
  const accounts = mergeAccountsWithSeeds(store.accounts, [], store.tombstones.accounts);

  if (tabRole === 'server' || tabRole === 'admin') {
    const matched = accounts.find(
      (acc) => acc.username.trim().toLowerCase() === cleanUser.toLowerCase()
    );

    // Also allow legacy RW05 super admin fallback if user still types RW05GLEMPANG
    if (!matched && tabRole === 'server' && cleanUser.toUpperCase() === 'RW05GLEMPANG' && cleanSecret === '123456') {
      const superAcc = accounts.find((a) => a.role === 'super_admin' || a.rtId === 'ALL') || DEFAULT_SEEDED_ACCOUNTS[0];
      const user: AuthUser = {
        role: 'server',
        username: superAcc.username,
        nama: superAcc.nama,
        rtScope: 'Semua RT',
        rtId: 'ALL',
      };
      saveAuthSession(user);
      return { ok: true, user };
    }

    if (!matched) {
      return {
        ok: false,
        message: `Username "${cleanUser}" tidak ditemukan. Akun awal: adminrw05 (PIN: 123456) atau adminrt01–adminrt08.`,
      };
    }

    if (matched.status === 'nonaktif') {
      return {
        ok: false,
        message: `Akun "${matched.username}" sedang dinonaktifkan oleh Super Admin RW 05.`,
      };
    }

    if (matched.passwordHash !== cleanSecret) {
      return {
        ok: false,
        message: 'PIN / Password salah. Periksa kembali kredensial Anda.',
      };
    }

    const isSuper = matched.role === 'super_admin' || matched.rt === 'ALL' || matched.rtId === 'ALL';
    if (tabRole === 'server' && !isSuper) {
      return {
        ok: false,
        message: `Akun "${matched.username}" adalah Admin RT ${matched.rt}. Gunakan tab Admin RT untuk masuk.`,
      };
    }

    const rtCode = isSuper ? 'ALL' : normalizeRTCode(matched.rt || matched.rtId) || '08';
    const user: AuthUser = {
      role: isSuper ? 'server' : 'admin',
      username: matched.username,
      nama: matched.nama,
      rtScope: isSuper ? 'Semua RT' : `RT ${rtCode} RW ${normalizeRWCode(matched.rw, '05')}`,
      rtId: isSuper ? 'ALL' : `RT${rtCode}`,
    };

    saveAuthSession(user);

    // Record login timestamp cleanly without blocking login UX
    void mqttSync.mutate((draft, nowIso) => {
      draft.accounts = draft.accounts.map((a) =>
        a.id === matched.id ? { ...a, terakhirLogin: nowIso, updatedAt: nowIso } : a
      );
      return ['accounts'];
    });

    return { ok: true, user };
  }

  // Warga login: Nama Kepala Keluarga / No. KK + 16-digit No. KK
  const matchedWarga = store.warga.find((w) => {
    const kkMatch = String(w.noKK || '').trim() === cleanSecret;
    if (!kkMatch) return false;
    const targetLower = cleanUser.toLowerCase();
    if (w.nama?.trim().toLowerCase() === targetLower) return true;
    if (String(w.noKK || '').trim() === cleanUser) return true;
    return (w.anggotaKeluarga || []).some(
      (ang) => ang.nama?.trim().toLowerCase() === targetLower
    );
  });

  if (!matchedWarga) {
    return {
      ok: false,
      message: 'Nama warga atau Nomor KK 16 digit tidak cocok dengan data yang tersinkronisasi.',
    };
  }

  const rtCode = getWargaRTCode(matchedWarga, '08');
  const rwCode = normalizeRWCode(matchedWarga.rw, '05');
  const user: AuthUser = {
    role: 'warga',
    username: matchedWarga.nama,
    nama: matchedWarga.nama,
    noKK: matchedWarga.noKK,
    wargaId: matchedWarga.id,
    rtScope: `RT ${rtCode} RW ${rwCode}`,
    rtId: `RT${rtCode}`,
  };
  saveAuthSession(user);
  return { ok: true, user };
}

export async function probeMqttConnection() {
  const status = mqttSync.getStatus();
  const isConnected = status.connectionState === 'connected';
  return {
    connected: isConnected || status.connectionState === 'syncing',
    databaseEngine: 'Cloud Broker MQTT WSS (EMQX / HiveMQ)',
    schemaReady: true,
    endpointUrl: status.brokerUrl || MQTT_BROKERS[0],
    message: isConnected
      ? `Terhubung & Tersinkron ke ${status.brokerUrl || MQTT_BROKERS[0]}`
      : status.connectionState === 'syncing'
      ? `Menyinkronkan ke ${status.brokerUrl || MQTT_BROKERS[0]}...`
      : status.error || 'Mode Offline (Cache & Antrean Lokal Aktif)',
  };
}
