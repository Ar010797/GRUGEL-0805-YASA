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
  DEFAULT_PENGATURAN_KAS,
  authenticateMqttUser,
  getSavedAuthSession,
  mergeAccountsWithSeeds,
  mergeModuleLists,
  mqttSync,
  probeMqttConnection,
  saveAuthSession,
} from './mqttSync';

export interface DeletedIdsMap {
  warga: string[];
  transactions: string[];
  bantuan: string[];
  pengumuman: string[];
  dokumen: string[];
  adminAccounts: string[];
  laporanBulananRT: string[];
}

export const EMPTY_DELETED_IDS: DeletedIdsMap = {
  warga: [],
  transactions: [],
  bantuan: [],
  pengumuman: [],
  dokumen: [],
  adminAccounts: [],
  laporanBulananRT: [],
};

export interface AppDatabaseSchema {
  version: number;
  revision?: number;
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
  deletedIds?: Partial<DeletedIdsMap>;
}

export interface ServerWriteResult {
  ok: boolean;
  status?: number;
  code?: string;
  errorCode?: string;
  terminal?: boolean;
  pending?: boolean;
  currentVersion?: number;
  message?: string;
  revision?: number;
  warga?: Warga;
  transaction?: Transaction;
  pengumuman?: PengumumanRT;
  bantuan?: BantuanPemerintah;
  dokumen?: DokumenPdfWarga;
  laporan?: PembaruanBulananRT;
  pengaturanKas?: PengaturanKas;
  account?: AdminRTAccount;
  updatedTransactions?: Transaction[];
  createdTransactions?: Transaction[];
  updatedBantuan?: BantuanPemerintah[];
}

export interface ServerHealthDiagnostic {
  connected: boolean;
  databaseEngine?: string;
  schemaReady?: boolean;
  endpointUrl?: string;
  httpStatus?: number;
  message: string;
}

const LEGACY_LOCAL_STORAGE_KEY = 'kas_rt08_rw05_database_v2';
const AUTH_TOKEN_KEY = 'kaswarga_auth_token_v1';

export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token && token.trim()) return token.trim();
    const session = getSavedAuthSession();
    return session ? `mqtt_${session.username}` : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token && token.trim()) {
      localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearAuthToken() {
  setAuthToken(null);
  saveAuthSession(null);
}

export function readLegacyLocalCacheForMigration(): AppDatabaseSchema | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppDatabaseSchema;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLegacyLocalCache() {
  try {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

function toEpochMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function getApiBaseUrl(): string {
  return '';
}

export function dedupeEntityList<T extends { id: string; updatedAt?: string }>(
  list: T[],
  deletedIds: string[] = [],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const byId = new Map<string, T>();
  for (const item of list) {
    if (!item || !item.id || deletedSet.has(item.id)) continue;
    const prev = byId.get(item.id);
    if (!prev || toEpochMs(item.updatedAt) >= toEpochMs(prev.updatedAt)) {
      byId.set(item.id, item);
    }
  }
  const values = Array.from(byId.values());
  if (!altMatch) return values;
  const deduped: T[] = [];
  for (const item of values) {
    const matchIdx = deduped.findIndex((existing) => altMatch(existing, item));
    if (matchIdx === -1) {
      deduped.push(item);
    } else if (toEpochMs(item.updatedAt) >= toEpochMs(deduped[matchIdx].updatedAt)) {
      deduped[matchIdx] = item;
    }
  }
  return deduped;
}

export function mergeEntityList<T extends { id: string; updatedAt?: string }>(
  localList: T[],
  remoteList: T[],
  deletedIds: string[] = []
): T[] {
  return dedupeEntityList([...localList, ...remoteList], deletedIds);
}

export function mergeDatabaseStates(
  local: AppDatabaseSchema,
  remote: AppDatabaseSchema
): AppDatabaseSchema {
  const deletedIds: DeletedIdsMap = {
    warga: Array.from(
      new Set([...(local.deletedIds?.warga || []), ...(remote.deletedIds?.warga || [])])
    ),
    transactions: Array.from(
      new Set([
        ...(local.deletedIds?.transactions || []),
        ...(remote.deletedIds?.transactions || []),
      ])
    ),
    bantuan: Array.from(
      new Set([...(local.deletedIds?.bantuan || []), ...(remote.deletedIds?.bantuan || [])])
    ),
    pengumuman: Array.from(
      new Set([
        ...(local.deletedIds?.pengumuman || []),
        ...(remote.deletedIds?.pengumuman || []),
      ])
    ),
    dokumen: Array.from(
      new Set([...(local.deletedIds?.dokumen || []), ...(remote.deletedIds?.dokumen || [])])
    ),
    adminAccounts: Array.from(
      new Set([
        ...(local.deletedIds?.adminAccounts || []),
        ...(remote.deletedIds?.adminAccounts || []),
      ])
    ),
    laporanBulananRT: Array.from(
      new Set([
        ...(local.deletedIds?.laporanBulananRT || []),
        ...(remote.deletedIds?.laporanBulananRT || []),
      ])
    ),
  };

  const localUpdated = toEpochMs(local.lastUpdated);
  const remoteUpdated = toEpochMs(remote.lastUpdated);
  const useRemoteSettings = remoteUpdated >= localUpdated;

  return {
    version: Math.max(local.version || 1, remote.version || 1),
    revision: Math.max(local.revision || 0, remote.revision || 0),
    lastUpdated: useRemoteSettings
      ? remote.lastUpdated || new Date().toISOString()
      : local.lastUpdated || new Date().toISOString(),
    tahunAktif: useRemoteSettings ? remote.tahunAktif : local.tahunAktif,
    pengaturanKas: useRemoteSettings ? remote.pengaturanKas : local.pengaturanKas,
    wargaList: mergeModuleLists(local.wargaList || [], remote.wargaList || []),
    transactions: mergeModuleLists(local.transactions || [], remote.transactions || []),
    bantuanList: mergeModuleLists(local.bantuanList || [], remote.bantuanList || []),
    pengumumanList: mergeModuleLists(local.pengumumanList || [], remote.pengumumanList || []),
    dokumenList: mergeModuleLists(local.dokumenList || [], remote.dokumenList || []),
    adminAccounts: mergeAccountsWithSeeds(
      local.adminAccounts || [],
      remote.adminAccounts || []
    ),
    laporanBulananRT: mergeModuleLists(
      local.laporanBulananRT || [],
      remote.laporanBulananRT || []
    ),
    deletedIds,
  };
}

export function formatWaktuSyncID(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export async function checkServerHealth(): Promise<ServerHealthDiagnostic> {
  return probeMqttConnection();
}

export async function loginWithServer(
  role: 'server' | 'admin' | 'warga',
  username: string,
  password: string
): Promise<{
  ok: boolean;
  token?: string;
  user?: AuthUser;
  message?: string;
  status?: number;
}> {
  const res = await authenticateMqttUser(role, username, password);
  if (res.ok && res.user) {
    const token = `mqtt_${res.user.username}`;
    setAuthToken(token);
    return { ok: true, token, user: res.user };
  }
  return { ok: false, message: res.message, status: 401 };
}

export async function verifySavedSession(): Promise<{
  valid: boolean;
  user?: AuthUser;
  offline?: boolean;
}> {
  const saved = getSavedAuthSession();
  if (!saved) return { valid: false };
  return { valid: true, user: saved };
}

export async function logoutFromServer(): Promise<void> {
  clearAuthToken();
}

export async function fetchServerSnapshot(): Promise<AppDatabaseSchema | null> {
  const s = mqttSync.getStore();
  return {
    version: 3,
    lastUpdated: s.lastSyncedAt || s.settings.updatedAt || new Date().toISOString(),
    tahunAktif: s.settings.tahunAktif || 2026,
    pengaturanKas: s.settings.pengaturanKas || DEFAULT_PENGATURAN_KAS,
    wargaList: s.warga,
    transactions: s.transactions,
    bantuanList: s.bantuan,
    pengumumanList: s.pengumuman,
    dokumenList: s.dokumen,
    adminAccounts: s.accounts,
    laporanBulananRT: s.laporan,
  };
}

export async function exportBackupFromServer(): Promise<AppDatabaseSchema | null> {
  return fetchServerSnapshot();
}

export async function fetchAuditLogsFromServer(limit = 100): Promise<AuditLogEntry[]> {
  return mqttSync.getStore().audit_logs.slice(0, limit);
}

export async function fetchNotificationsFromServer(limit = 60): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const list = mqttSync.getStore().notifications.slice(0, limit);
  return {
    notifications: list,
    unreadCount: list.filter((n) => !n.isRead).length,
  };
}

export function downloadBackupJSON(data: AppDatabaseSchema) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `Cadangan_Data_Kas_RW05_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(file: File): Promise<AppDatabaseSchema> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text) as AppDatabaseSchema;
        if (
          !parsed ||
          !Array.isArray(parsed.wargaList) ||
          !Array.isArray(parsed.transactions)
        ) {
          throw new Error('Format file cadangan JSON tidak valid.');
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file cadangan JSON.'));
    reader.readAsText(file);
  });
}
