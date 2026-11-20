import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  Warga,
  Transaction,
  BantuanPemerintah,
  PengumumanRT,
  PengaturanKas,
  DokumenPdfWarga,
  AdminRTAccount,
  PembaruanBulananRT,
  AuthUser,
  AppNotification,
  AuditLogEntry,
  RiwayatPerubahanKK,
} from '../types';

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

const LEGACY_LOCAL_STORAGE_KEY = 'kas_rt08_rw05_database_v2';
const AUTH_TOKEN_KEY = 'kaswarga_auth_token_v1';
const API_BASE_URL_KEY = 'kaswarga_api_base_url_v1';

export function normalizeBaseUrl(raw?: string | null): string {
  const val = String(raw || '').trim().replace(/\/+$/, '');
  if (!val) return '';
  if (!/^https?:\/\//i.test(val)) {
    return `https://${val}`;
  }
  return val;
}

export function getApiBaseUrl(): string {
  try {
    const override = localStorage.getItem(API_BASE_URL_KEY);
    if (override && override.trim()) {
      return normalizeBaseUrl(override);
    }
  } catch {
    // ignore storage errors
  }
  const envUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_API_BASE_URL) || '';
  return normalizeBaseUrl(envUrl);
}

export function setApiBaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(API_BASE_URL_KEY, normalized);
    } else {
      localStorage.removeItem(API_BASE_URL_KEY);
    }
  } catch {
    // ignore storage errors
  }
  return normalized;
}

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${cleanPath}` : cleanPath;
}

export function getResolvedEndpointDisplay(path: string): string {
  const target = apiUrl(path);
  if (/^https?:\/\//i.test(target)) return target;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${target}`;
  }
  return target;
}

async function readApiJsonSafely(
  res: Response,
  endpointUrl: string
): Promise<{ json: any | null; errorMessage?: string }> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text().catch(() => '');
  const trimmed = rawText.trim();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html');

  if (looksLikeHtml) {
    const isAuthRedirect =
      res.url.includes('__cookie_check') ||
      res.url.includes('accounts.google.com') ||
      trimmed.includes('_aistudio-iframe');
    return {
      json: null,
      errorMessage: isAuthRedirect
        ? `Akses ke ${endpointUrl} dialihkan ke halaman autentikasi AI Studio (HTTP ${res.status}). Perangkat luar memerlukan URL Server Publik yang dapat diakses tanpa login browser AI Studio.`
        : `Server mengembalikan HTML (HTTP ${res.status}) bukan JSON API pada ${endpointUrl}. Pastikan server backend aktif.`,
    };
  }

  if (!trimmed) {
    return {
      json: null,
      errorMessage:
        res.status === 404
          ? `Endpoint API tidak ditemukan (HTTP 404) pada ${endpointUrl}.`
          : `Server merespons kosong (HTTP ${res.status}) pada ${endpointUrl}.`,
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      json: parsed,
      errorMessage: parsed?.message,
    };
  } catch {
    return {
      json: null,
      errorMessage: `Respons server tidak valid (HTTP ${res.status}, bukan JSON) dari ${endpointUrl}.`,
    };
  }
}

function formatNetworkError(err: any, endpointUrl: string): string {
  const raw = String(err?.message || '').trim();
  if (err?.name === 'AbortError') {
    return `Koneksi ke server (${endpointUrl}) timeout melebihi batas waktu.`;
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return `Gagal menjangkau server (${endpointUrl}). Koneksi jaringan terputus atau server belum merespons.`;
  }
  return `Gagal terhubung ke ${endpointUrl}${raw ? `: ${raw}` : '.'}`;
}

function mapHttpWriteFailure(
  res: Response,
  json: any,
  errorMessage: string | undefined,
  fallbackMessage: string
): ServerWriteResult {
  const status = res.status;
  const code = typeof json?.code === 'string' ? json.code : undefined;
  const isTerminal =
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409;
  return {
    ok: false,
    status,
    code,
    errorCode:
      status === 403
        ? 'permission-denied'
        : status === 401
        ? 'unauthenticated'
        : status === 409
        ? 'version-conflict'
        : status === 400
        ? 'invalid-argument'
        : status === 404
        ? 'not-found'
        : code || 'unavailable',
    terminal: isTerminal,
    currentVersion: typeof json?.currentVersion === 'number' ? json.currentVersion : undefined,
    message: errorMessage || `${fallbackMessage} (HTTP ${status}).`,
  };
}

export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token && token.trim() ? token.trim() : null;
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
    // ignore storage restriction
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const LEGACY_LOCAL_STORAGE_FALLBACK_KEYS = [
  LEGACY_LOCAL_STORAGE_KEY,
  'kas_rt08_rw05_database_v1',
  'kaswarga_database_v1',
];

export function readLegacyLocalCacheForMigration(): AppDatabaseSchema | null {
  try {
    for (const key of LEGACY_LOCAL_STORAGE_FALLBACK_KEYS) {
      const cached = localStorage.getItem(key);
      if (!cached) continue;
      const parsed = JSON.parse(cached) as AppDatabaseSchema;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLegacyLocalCache() {
  try {
    for (const key of LEGACY_LOCAL_STORAGE_FALLBACK_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function toEpoch(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function unionIds(a: string[] = [], b: string[] = []): string[] {
  return Array.from(new Set([...a, ...b]));
}

export function dedupeEntityList<T extends { id: string; updatedAt?: string }>(
  list: T[],
  deletedIds: string[] = [],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result: T[] = [];

  for (const item of list) {
    if (!item || !item.id || deletedSet.has(item.id)) continue;
    const existingIdx = result.findIndex(
      (p) => p.id === item.id || (altMatch ? altMatch(p, item) : false)
    );
    if (existingIdx === -1) {
      result.push(item);
    } else {
      const existing = result[existingIdx];
      if (toEpoch(item.updatedAt) > toEpoch(existing.updatedAt)) {
        result[existingIdx] = item;
      }
    }
  }

  return result;
}

export function mergeEntityList<T extends { id: string; updatedAt?: string }>(
  primaryList: T[],
  secondaryList: T[],
  deletedIds: string[] = [],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result = dedupeEntityList(primaryList, deletedIds, altMatch);

  for (const sec of secondaryList) {
    if (!sec || !sec.id || deletedSet.has(sec.id)) continue;
    const existingIdx = result.findIndex(
      (p) => p.id === sec.id || (altMatch ? altMatch(p, sec) : false)
    );
    if (existingIdx === -1) {
      result.push(sec);
    } else {
      const existing = result[existingIdx];
      if (toEpoch(sec.updatedAt) > toEpoch(existing.updatedAt)) {
        result[existingIdx] = sec;
      }
    }
  }

  return result;
}

export function mergeDatabaseStates(
  authoritative: AppDatabaseSchema,
  secondary: AppDatabaseSchema | null,
  extraDeleted?: Partial<DeletedIdsMap>
): AppDatabaseSchema {
  if (!secondary) return authoritative;

  const mergedDeleted: DeletedIdsMap = {
    warga: unionIds(
      unionIds(authoritative.deletedIds?.warga, secondary.deletedIds?.warga),
      extraDeleted?.warga
    ),
    transactions: unionIds(
      unionIds(authoritative.deletedIds?.transactions, secondary.deletedIds?.transactions),
      extraDeleted?.transactions
    ),
    bantuan: unionIds(
      unionIds(authoritative.deletedIds?.bantuan, secondary.deletedIds?.bantuan),
      extraDeleted?.bantuan
    ),
    pengumuman: unionIds(
      unionIds(authoritative.deletedIds?.pengumuman, secondary.deletedIds?.pengumuman),
      extraDeleted?.pengumuman
    ),
    dokumen: unionIds(
      unionIds(authoritative.deletedIds?.dokumen, secondary.deletedIds?.dokumen),
      extraDeleted?.dokumen
    ),
    adminAccounts: unionIds(
      unionIds(authoritative.deletedIds?.adminAccounts, secondary.deletedIds?.adminAccounts),
      extraDeleted?.adminAccounts
    ),
    laporanBulananRT: unionIds(
      unionIds(authoritative.deletedIds?.laporanBulananRT, secondary.deletedIds?.laporanBulananRT),
      extraDeleted?.laporanBulananRT
    ),
  };

  const authSettingsEpoch = toEpoch(authoritative.pengaturanKas?.updatedAt);
  const secSettingsEpoch = toEpoch(secondary.pengaturanKas?.updatedAt);
  const chosenPengaturan =
    secSettingsEpoch > authSettingsEpoch ? secondary.pengaturanKas : authoritative.pengaturanKas;
  const chosenTahun =
    secSettingsEpoch > authSettingsEpoch ? secondary.tahunAktif : authoritative.tahunAktif;

  return {
    version: 2,
    revision: authoritative.revision,
    lastUpdated:
      toEpoch(secondary.lastUpdated) > toEpoch(authoritative.lastUpdated)
        ? secondary.lastUpdated
        : authoritative.lastUpdated || new Date().toISOString(),
    tahunAktif: chosenTahun || authoritative.tahunAktif || 2026,
    pengaturanKas: chosenPengaturan || authoritative.pengaturanKas,
    wargaList: mergeEntityList(
      Array.isArray(authoritative.wargaList) ? authoritative.wargaList : [],
      Array.isArray(secondary.wargaList) ? secondary.wargaList : [],
      mergedDeleted.warga,
      (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
    ),
    transactions: mergeEntityList(
      Array.isArray(authoritative.transactions) ? authoritative.transactions : [],
      Array.isArray(secondary.transactions) ? secondary.transactions : [],
      mergedDeleted.transactions
    ),
    bantuanList: mergeEntityList(
      Array.isArray(authoritative.bantuanList) ? authoritative.bantuanList : [],
      Array.isArray(secondary.bantuanList) ? secondary.bantuanList : [],
      mergedDeleted.bantuan
    ),
    pengumumanList: mergeEntityList(
      Array.isArray(authoritative.pengumumanList) ? authoritative.pengumumanList : [],
      Array.isArray(secondary.pengumumanList) ? secondary.pengumumanList : [],
      mergedDeleted.pengumuman
    ),
    dokumenList: mergeEntityList(
      Array.isArray(authoritative.dokumenList) ? authoritative.dokumenList : [],
      Array.isArray(secondary.dokumenList) ? secondary.dokumenList : [],
      mergedDeleted.dokumen
    ),
    adminAccounts: mergeEntityList(
      Array.isArray(authoritative.adminAccounts) ? authoritative.adminAccounts : [],
      Array.isArray(secondary.adminAccounts) ? secondary.adminAccounts : [],
      mergedDeleted.adminAccounts,
      (a, b) => a.username.toLowerCase() === b.username.toLowerCase()
    ),
    laporanBulananRT: mergeEntityList(
      Array.isArray(authoritative.laporanBulananRT) ? authoritative.laporanBulananRT : [],
      Array.isArray(secondary.laporanBulananRT) ? secondary.laporanBulananRT : [],
      mergedDeleted.laporanBulananRT
    ),
    deletedIds: mergedDeleted,
  };
}

export function formatWaktuSyncID(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(date);
  } catch {
    return date.toLocaleString('id-ID');
  }
}

export interface ServerHealthDiagnostic {
  connected: boolean;
  latencyMs: number;
  endpointUrl: string;
  httpStatus?: number;
  engine?: string;
  revision?: number;
  totalWarga?: number;
  totalAdminAccounts?: number;
  socketConnectedCount?: number;
  message: string;
  errorDetail?: string;
}

export async function checkServerHealth(): Promise<ServerHealthDiagnostic> {
  const endpointUrl = getResolvedEndpointDisplay('/api/health');
  const started = Date.now();
  try {
    const res = await fetch(apiUrl(`/api/health?t=${Date.now()}`), { cache: 'no-store' });
    const latencyMs = Date.now() - started;
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || json?.status !== 'ok') {
      const msg =
        errorMessage ||
        `Server merespons HTTP ${res.status} (${json?.database || 'error'}) pada ${endpointUrl}.`;
      return {
        connected: false,
        latencyMs,
        endpointUrl,
        httpStatus: res.status,
        message: msg,
        errorDetail: msg,
      };
    }
    return {
      connected: true,
      latencyMs,
      endpointUrl,
      httpStatus: res.status,
      engine: json.engine || 'PostgreSQL (Cloud SQL)',
      revision: Number(json.revision) || 1,
      totalWarga: typeof json.totalWarga === 'number' ? json.totalWarga : undefined,
      totalAdminAccounts:
        typeof json.totalAdminAccounts === 'number' ? json.totalAdminAccounts : undefined,
      socketConnectedCount:
        typeof json.socketConnectedCount === 'number' ? json.socketConnectedCount : undefined,
      message: `Terhubung ke ${json.engine || 'PostgreSQL (Cloud SQL)'} (${latencyMs} ms)`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    const msg = formatNetworkError(err, endpointUrl);
    return {
      connected: false,
      latencyMs,
      endpointUrl,
      message: msg,
      errorDetail: msg,
    };
  }
}

export async function fetchPublicBootstrapInfo(): Promise<{
  pengaturanKas: PengaturanKas;
  tahunAktif: number;
  revision: number;
} | null> {
  try {
    const res = await fetch(apiUrl(`/api/public/info?t=${Date.now()}`), { cache: 'no-store' });
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/public/info'));
    if (!json?.success || !json?.pengaturanKas) return null;
    return {
      pengaturanKas: json.pengaturanKas as PengaturanKas,
      tahunAktif: Number(json.tahunAktif) || 2026,
      revision: Number(json.revision) || 1,
    };
  } catch {
    return null;
  }
}

export async function loginWithServer(
  role: 'server' | 'admin' | 'warga',
  username: string,
  password: string
): Promise<{ ok: boolean; status?: number; token?: string; user?: AuthUser; message?: string }> {
  const endpointUrl = getResolvedEndpointDisplay('/api/auth/login');
  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, password }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success || !json?.token || !json?.user) {
      return {
        ok: false,
        status: res.status,
        message: errorMessage || `Login gagal (HTTP ${res.status}). Periksa kembali kredensial Anda.`,
      };
    }
    setAuthToken(json.token);
    return {
      ok: true,
      status: res.status,
      token: json.token,
      user: json.user as AuthUser,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatNetworkError(err, endpointUrl),
    };
  }
}

export async function loginWithGoogleTokenOnServer(): Promise<{
  ok: boolean;
  status?: number;
  token?: string;
  user?: AuthUser;
  message?: string;
}> {
  const endpointUrl = getResolvedEndpointDisplay('/api/auth/firebase-google');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken(true);

    const res = await fetch(apiUrl('/api/auth/firebase-google'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success || !json?.token || !json?.user) {
      await signOut(auth).catch(() => {});
      return {
        ok: false,
        status: res.status,
        message:
          errorMessage ||
          `Akun Google (${cred.user.email || '-'}) tidak berhak sebagai Super Admin RW 05.`,
      };
    }

    setAuthToken(json.token);
    return {
      ok: true,
      status: res.status,
      token: json.token,
      user: json.user as AuthUser,
    };
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/popup-closed-by-user') {
      return { ok: false, message: 'Jendela login Google ditutup sebelum selesai.' };
    }
    if (code === 'auth/popup-blocked') {
      return { ok: false, message: 'Popup Google diblokir browser. Izinkan popup lalu coba lagi.' };
    }
    return {
      ok: false,
      message: err?.message || formatNetworkError(err, endpointUrl),
    };
  }
}

export async function verifySavedSession(): Promise<{
  ok: boolean;
  user?: AuthUser;
  unauthorized?: boolean;
}> {
  const token = getAuthToken();
  if (!token) return { ok: false, unauthorized: true };
  try {
    const res = await fetch(apiUrl(`/api/auth/me?t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      clearAuthToken();
      return { ok: false, unauthorized: true };
    }
    if (!res.ok) return { ok: false };
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/auth/me'));
    if (json?.success && json?.user) {
      return { ok: true, user: json.user as AuthUser };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function logoutFromServer(): Promise<void> {
  try {
    if (getAuthToken()) {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: authHeaders(),
      }).catch(() => {});
    }
    await signOut(auth).catch(() => {});
  } finally {
    clearAuthToken();
  }
}

export async function checkServerRevision(
  sinceRevision: number
): Promise<{ changed: boolean; revision: number; hasData: boolean } | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/sync-check?since=${encodeURIComponent(String(sinceRevision))}&t=${Date.now()}`),
      {
        method: 'GET',
        headers: authHeaders(),
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/sync-check'));
    if (!json || typeof json.revision !== 'number') return null;
    return {
      changed: Boolean(json.changed),
      revision: json.revision,
      hasData: Boolean(json.hasData),
    };
  } catch {
    return null;
  }
}

export async function fetchDeltaSinceRevision(sinceRevision: number): Promise<{
  ok: boolean;
  status?: number;
  changed?: boolean;
  revision?: number;
  data?: AppDatabaseSchema;
} | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/sync/delta?sinceRevision=${encodeURIComponent(String(sinceRevision))}&t=${Date.now()}`),
      {
        method: 'GET',
        headers: authHeaders(),
        cache: 'no-store',
      }
    );
    if (!res.ok) return { ok: false, status: res.status };
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/sync/delta'));
    if (!json?.success) return { ok: false };
    return {
      ok: true,
      changed: Boolean(json.changed),
      revision: Number(json.revision) || sinceRevision,
      data: json.data as AppDatabaseSchema | undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchServerSnapshotWithStatus(): Promise<{
  ok: boolean;
  status?: number;
  data?: AppDatabaseSchema;
  message?: string;
}> {
  if (!getAuthToken()) {
    return { ok: false, status: 401, message: 'Sesi login tidak ditemukan.' };
  }
  const endpointUrl = getResolvedEndpointDisplay('/api/data');
  try {
    const res = await fetch(apiUrl(`/api/data?t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.data) {
      return {
        ok: false,
        status: res.status,
        message: errorMessage || `Gagal mengambil data dari database server (HTTP ${res.status}).`,
      };
    }
    return {
      ok: true,
      status: res.status,
      data: json.data as AppDatabaseSchema,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatNetworkError(err, endpointUrl),
    };
  }
}

export async function fetchServerSnapshot(): Promise<AppDatabaseSchema | null> {
  const res = await fetchServerSnapshotWithStatus();
  return res.ok && res.data ? res.data : null;
}

export async function saveAppData(
  data: AppDatabaseSchema,
  options?: {
    isHardReset?: boolean;
    deletedIds?: Partial<DeletedIdsMap>;
    deletedWargaIds?: string[];
    deletedPengumumanIds?: string[];
    keepalive?: boolean;
  }
): Promise<{ ok: boolean; status?: number; message?: string; serverData?: AppDatabaseSchema }> {
  if (!getAuthToken()) {
    return { ok: false, status: 401, message: 'Sesi login berakhir. Silakan login kembali.' };
  }
  const updatedData: AppDatabaseSchema = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };

  const endpointUrl = getResolvedEndpointDisplay('/api/data');
  try {
    const deletedIds: Partial<DeletedIdsMap> = {
      ...(options?.deletedIds || {}),
      warga: unionIds(options?.deletedIds?.warga, options?.deletedWargaIds),
      pengumuman: unionIds(options?.deletedIds?.pengumuman, options?.deletedPengumumanIds),
    };

    const payload = {
      ...updatedData,
      isHardReset: options?.isHardReset ?? false,
      deletedIds,
      deletedWargaIds: deletedIds.warga || [],
      deletedPengumumanIds: deletedIds.pengumuman || [],
    };

    const res = await fetch(apiUrl('/api/data'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      keepalive: options?.keepalive ?? false,
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: errorMessage || `Gagal menyinkronkan data ke database server (HTTP ${res.status}).`,
      };
    }
    return {
      ok: true,
      status: res.status,
      serverData: json?.data as AppDatabaseSchema | undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatNetworkError(err, endpointUrl),
    };
  }
}

export async function migrateLegacyLocalDataToServer(
  localData: Partial<AppDatabaseSchema>
): Promise<{ ok: boolean; serverData?: AppDatabaseSchema; message?: string }> {
  if (!getAuthToken()) return { ok: false, message: 'Belum login.' };
  const endpointUrl = getResolvedEndpointDisplay('/api/sync/migrate-local');
  try {
    const res = await fetch(apiUrl('/api/sync/migrate-local'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...localData, isHardReset: false }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        message: errorMessage || `Gagal memigrasikan data lokal ke server pusat (HTTP ${res.status}).`,
      };
    }
    return {
      ok: true,
      serverData: json.data as AppDatabaseSchema | undefined,
      message: json.message,
    };
  } catch (err: any) {
    return { ok: false, message: formatNetworkError(err, endpointUrl) };
  }
}

export async function fetchServerAdminAccounts(): Promise<{
  adminAccounts: AdminRTAccount[];
  deletedAdminIds: string[];
  serverHasData: boolean;
  revision: number;
} | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(apiUrl(`/api/admin-accounts?t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/admin-accounts'));
    if (!json || !json.success) return null;
    return {
      adminAccounts: Array.isArray(json.adminAccounts) ? json.adminAccounts : [],
      deletedAdminIds: Array.isArray(json.deletedAdminIds) ? json.deletedAdminIds : [],
      serverHasData: Boolean(json.serverHasData),
      revision: Number(json.revision) || 0,
    };
  } catch {
    return null;
  }
}

export async function createAdminAccountOnServer(
  account: AdminRTAccount
): Promise<ServerWriteResult> {
  const endpointUrl = getResolvedEndpointDisplay('/api/admin-accounts');
  try {
    const res = await fetch(apiUrl('/api/admin-accounts'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ account }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, 'Gagal membuat akun Admin RT.');
    }
    return { ok: true, status: res.status, account: json.account, revision: json.revision };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function updateAdminAccountOnServer(
  account: AdminRTAccount,
  expectedVersion?: number
): Promise<ServerWriteResult> {
  const path = `/api/admin-accounts/${encodeURIComponent(account.id)}`;
  const endpointUrl = getResolvedEndpointDisplay(path);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ account, expectedVersion: expectedVersion ?? account.version }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, 'Gagal memperbarui akun Admin RT.');
    }
    return { ok: true, status: res.status, account: json.account, revision: json.revision };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function deleteAdminAccountOnServer(id: string): Promise<ServerWriteResult> {
  const path = `/api/admin-accounts/${encodeURIComponent(id)}`;
  const endpointUrl = getResolvedEndpointDisplay(path);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, 'Gagal menghapus akun Admin RT.');
    }
    return { ok: true, status: res.status, revision: json.revision };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function syncAdminAccountToServer(params: {
  account: AdminRTAccount;
  syncData?: AppDatabaseSchema;
  deletedIds?: Partial<DeletedIdsMap>;
  allowOverwrite?: boolean;
  securityPin?: string;
}): Promise<{
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  account?: AdminRTAccount;
  token?: string;
  user?: AuthUser;
  serverData?: AppDatabaseSchema;
}> {
  const endpointUrl = getResolvedEndpointDisplay('/api/admin/sync-account');
  try {
    const res = await fetch(apiUrl('/api/admin/sync-account'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        status: res.status,
        code: json?.code,
        message: errorMessage || `Gagal menyinkronkan akun admin ke server (HTTP ${res.status}).`,
      };
    }
    if (json.token) {
      setAuthToken(json.token);
    }
    return {
      ok: true,
      status: res.status,
      message: json.message,
      account: json.account as AdminRTAccount | undefined,
      token: json.token as string | undefined,
      user: json.user as AuthUser | undefined,
      serverData: json.data as AppDatabaseSchema | undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatNetworkError(err, endpointUrl),
    };
  }
}

export function flushSaveAppDataKeepalive(
  data: AppDatabaseSchema,
  deletedIds?: Partial<DeletedIdsMap>
) {
  if (!getAuthToken()) return;
  const updatedData: AppDatabaseSchema = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };

  try {
    if (typeof fetch === 'undefined') return;
    const fullPayloadStr = JSON.stringify({
      ...updatedData,
      isHardReset: false,
      deletedIds: deletedIds || {},
    });
    const byteLength =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(fullPayloadStr).length
        : fullPayloadStr.length;

    if (byteLength <= 60000) {
      fetch(apiUrl('/api/data'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: fullPayloadStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // ignore unload flush error
  }
}

export function subscribeServerStream(
  onRemoteData: (data: AppDatabaseSchema, isReset?: boolean) => void,
  onConnectionChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const token = getAuthToken();
  if (!token) {
    onConnectionChange?.(false);
    return () => {};
  }

  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    const latestToken = getAuthToken();
    if (!latestToken) {
      onConnectionChange?.(false);
      return;
    }
    try {
      es = new EventSource(apiUrl(`/api/stream?token=${encodeURIComponent(latestToken)}`));
      es.onopen = () => {
        onConnectionChange?.(true);
      };
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.data) {
            onRemoteData(parsed.data as AppDatabaseSchema, parsed.type === 'reset');
          }
        } catch {
          // ignore malformed keepalive
        }
      };
      es.onerror = () => {
        onConnectionChange?.(false);
        es?.close();
        es = null;
        if (!closed && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 5000);
        }
      };
    } catch {
      onConnectionChange?.(false);
    }
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    es?.close();
  };
}

export async function searchWargaOnServer(q: string, rt = ''): Promise<Warga[] | null> {
  if (!getAuthToken()) return null;
  try {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (rt.trim()) params.set('rt', rt.trim());
    params.set('t', String(Date.now()));
    const res = await fetch(apiUrl(`/api/warga?${params.toString()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/warga'));
    if (json?.success && Array.isArray(json.wargaList)) {
      return json.wargaList as Warga[];
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSingleWargaToServer(
  warga: Warga,
  options?: { isUpdate?: boolean; expectedVersion?: number; clientMutationId?: string }
): Promise<ServerWriteResult> {
  const isUpdate = Boolean(options?.isUpdate);
  const path = isUpdate ? `/api/warga/${encodeURIComponent(warga.id)}` : '/api/warga';
  const endpointUrl = getResolvedEndpointDisplay(path);
  try {
    const res = await fetch(apiUrl(path), {
      method: isUpdate ? 'PUT' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        warga: {
          ...warga,
          updatedAt: warga.updatedAt || new Date().toISOString(),
        },
        expectedVersion: options?.expectedVersion ?? warga.version,
        clientMutationId: options?.clientMutationId,
      }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, 'Gagal menyimpan data warga ke server.');
    }
    return {
      ok: true,
      status: res.status,
      warga: json?.warga as Warga | undefined,
      revision: Number(json?.revision) || undefined,
      message: json?.message,
    };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function putWargaToServer(
  warga: Warga,
  options?: { expectedVersion?: number; clientMutationId?: string }
): Promise<ServerWriteResult> {
  return saveSingleWargaToServer(warga, {
    isUpdate: true,
    expectedVersion: options?.expectedVersion ?? warga.version,
    clientMutationId: options?.clientMutationId,
  });
}

export async function upgradeWargaKKOnServer(params: {
  wargaId: string;
  updatedWarga: Warga;
  historyRecord: RiwayatPerubahanKK;
  oldNoKK?: string;
  oldKepalaNama?: string;
  catatSantunanKematian?: boolean;
  nominalSantunanKematian?: number;
  expectedVersion?: number;
  clientMutationId?: string;
}): Promise<ServerWriteResult> {
  const path = `/api/warga/${encodeURIComponent(params.wargaId)}/upgrade-kk`;
  const endpointUrl = getResolvedEndpointDisplay(path);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, 'Gagal memproses Upgrade KK di server.');
    }
    return {
      ok: true,
      status: res.status,
      warga: json.warga as Warga | undefined,
      updatedTransactions: json.updatedTransactions as Transaction[] | undefined,
      createdTransactions: json.createdTransactions as Transaction[] | undefined,
      updatedBantuan: json.updatedBantuan as BantuanPemerintah[] | undefined,
      revision: Number(json.revision) || undefined,
      message: json.message,
    };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function bulkImportWargaOnServer(params: {
  wargaList: Array<Omit<Warga, 'id' | 'no'> & { id?: string }>;
  bantuanList: Array<Omit<BantuanPemerintah, 'id'> & { id?: string }>;
  mergeExisting: boolean;
  tahunAktif: number;
  clientMutationId?: string;
}): Promise<{
  ok: boolean;
  status?: number;
  addedKK?: number;
  updatedKK?: number;
  addedBantuan?: number;
  revision?: number;
  message?: string;
}> {
  const endpointUrl = getResolvedEndpointDisplay('/api/warga/bulk');
  try {
    const res = await fetch(apiUrl('/api/warga/bulk'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        status: res.status,
        message: errorMessage || `Gagal mengimpor Excel ke server (HTTP ${res.status}).`,
      };
    }
    return {
      ok: true,
      status: res.status,
      addedKK: json.addedKK,
      updatedKK: json.updatedKK,
      addedBantuan: json.addedBantuan,
      revision: json.revision,
    };
  } catch (err: any) {
    return { ok: false, message: formatNetworkError(err, endpointUrl) };
  }
}

export async function deleteWargaFromServer(
  id: string,
  options?: { expectedVersion?: number; clientMutationId?: string }
): Promise<ServerWriteResult> {
  const path = `/api/warga/${encodeURIComponent(id)}`;
  const endpointUrl = getResolvedEndpointDisplay(path);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        expectedVersion: options?.expectedVersion,
        clientMutationId: options?.clientMutationId,
      }),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(
        res,
        json,
        errorMessage,
        'Gagal menghapus data warga dari server.'
      );
    }
    return { ok: true, status: res.status, revision: json.revision, message: json.message };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function updateWargaSelfOnServer(patch: {
  pin?: string;
  telepon?: string;
}): Promise<ServerWriteResult> {
  const endpointUrl = getResolvedEndpointDisplay('/api/warga/self');
  try {
    const res = await fetch(apiUrl('/api/warga/self'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(
        res,
        json,
        errorMessage,
        'Gagal memperbarui PIN warga di server.'
      );
    }
    return { ok: true, status: res.status, warga: json.warga, revision: json.revision };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

async function sendMutation(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body: unknown | undefined,
  errMsg: string
): Promise<ServerWriteResult & { json?: any }> {
  const endpointUrl = getResolvedEndpointDisplay(url);
  try {
    const res = await fetch(apiUrl(url), {
      method,
      headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const { json, errorMessage } = await readApiJsonSafely(res, endpointUrl);
    if (!res.ok || !json?.success) {
      return mapHttpWriteFailure(res, json, errorMessage, errMsg);
    }
    return {
      ok: true,
      status: res.status,
      revision: Number(json?.revision) || undefined,
      json,
    };
  } catch (err: any) {
    return { ok: false, errorCode: 'unavailable', message: formatNetworkError(err, endpointUrl) };
  }
}

export async function saveTransactionOnServer(
  tx: Transaction,
  options?: { isUpdate?: boolean; expectedVersion?: number; clientMutationId?: string }
): Promise<ServerWriteResult> {
  const isUpdate = Boolean(options?.isUpdate);
  const res = await sendMutation(
    isUpdate ? 'PUT' : 'POST',
    isUpdate ? `/api/transactions/${encodeURIComponent(tx.id)}` : '/api/transactions',
    {
      transaction: tx,
      expectedVersion: options?.expectedVersion ?? tx.version,
      clientMutationId: options?.clientMutationId,
    },
    'Gagal menyimpan transaksi kas ke server.'
  );
  return { ...res, transaction: res.json?.transaction };
}

export const putTransactionOnServer = (
  tx: Transaction,
  options?: { expectedVersion?: number; clientMutationId?: string }
) => saveTransactionOnServer(tx, { ...options, isUpdate: true });

export const deleteTransactionOnServer = (id: string, expectedVersion?: number) =>
  sendMutation(
    'DELETE',
    `/api/transactions/${encodeURIComponent(id)}`,
    expectedVersion !== undefined ? { expectedVersion } : undefined,
    'Gagal menghapus transaksi dari server.'
  );

export async function savePengumumanOnServer(
  p: PengumumanRT,
  options?: { isUpdate?: boolean; expectedVersion?: number; clientMutationId?: string }
): Promise<ServerWriteResult> {
  const isUpdate = Boolean(options?.isUpdate);
  const res = await sendMutation(
    isUpdate ? 'PUT' : 'POST',
    isUpdate ? `/api/pengumuman/${encodeURIComponent(p.id)}` : '/api/pengumuman',
    {
      pengumuman: p,
      expectedVersion: options?.expectedVersion ?? p.version,
      clientMutationId: options?.clientMutationId,
    },
    'Gagal menyimpan pengumuman ke server.'
  );
  return { ...res, pengumuman: res.json?.pengumuman };
}

export const putPengumumanOnServer = (
  p: PengumumanRT,
  options?: { expectedVersion?: number; clientMutationId?: string }
) => savePengumumanOnServer(p, { ...options, isUpdate: true });

export const deletePengumumanOnServer = (id: string) =>
  sendMutation(
    'DELETE',
    `/api/pengumuman/${encodeURIComponent(id)}`,
    undefined,
    'Gagal menghapus pengumuman dari server.'
  );

export async function saveBantuanOnServer(
  b: BantuanPemerintah,
  options?: { isUpdate?: boolean; expectedVersion?: number }
): Promise<ServerWriteResult> {
  const isUpdate = Boolean(options?.isUpdate);
  const res = await sendMutation(
    isUpdate ? 'PUT' : 'POST',
    isUpdate ? `/api/bantuan/${encodeURIComponent(b.id)}` : '/api/bantuan',
    { bantuan: b, expectedVersion: options?.expectedVersion ?? b.version },
    'Gagal menyimpan data bantuan ke server.'
  );
  return { ...res, bantuan: res.json?.bantuan };
}

export const deleteBantuanOnServer = (id: string) =>
  sendMutation(
    'DELETE',
    `/api/bantuan/${encodeURIComponent(id)}`,
    undefined,
    'Gagal menghapus data bantuan dari server.'
  );

export async function saveDokumenOnServer(d: DokumenPdfWarga): Promise<ServerWriteResult> {
  const res = await sendMutation(
    'POST',
    '/api/dokumen',
    { dokumen: d },
    'Gagal menyimpan dokumen ke server.'
  );
  return { ...res, dokumen: res.json?.dokumen };
}

export const deleteDokumenOnServer = (id: string) =>
  sendMutation(
    'DELETE',
    `/api/dokumen/${encodeURIComponent(id)}`,
    undefined,
    'Gagal menghapus dokumen dari server.'
  );

export async function saveLaporanOnServer(l: PembaruanBulananRT): Promise<ServerWriteResult> {
  const res = await sendMutation(
    'POST',
    '/api/laporan-bulanan',
    { laporan: l },
    'Gagal mengirim laporan bulanan ke server.'
  );
  return { ...res, laporan: res.json?.laporan };
}

export async function saveSettingsOnServer(
  pengaturanKas: PengaturanKas,
  tahunAktif?: number,
  expectedVersion?: number
): Promise<ServerWriteResult> {
  const res = await sendMutation(
    'POST',
    '/api/settings',
    {
      pengaturanKas,
      tahunAktif,
      expectedVersion: expectedVersion ?? pengaturanKas.version,
    },
    'Gagal menyimpan pengaturan ke server.'
  );
  return { ...res, pengaturanKas: res.json?.pengaturanKas };
}

// Notifications & Web Push API helpers
export async function fetchNotificationsFromServer(limit = 60): Promise<{
  ok: boolean;
  notifications: AppNotification[];
  unreadCount: number;
}> {
  if (!getAuthToken()) return { ok: false, notifications: [], unreadCount: 0 };
  try {
    const res = await fetch(apiUrl(`/api/notifications?limit=${limit}&t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, notifications: [], unreadCount: 0 };
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/notifications'));
    if (!json?.success) return { ok: false, notifications: [], unreadCount: 0 };
    return {
      ok: true,
      notifications: Array.isArray(json.notifications) ? json.notifications : [],
      unreadCount: Number(json.unreadCount) || 0,
    };
  } catch {
    return { ok: false, notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationReadOnServer(id: string): Promise<boolean> {
  const res = await sendMutation(
    'POST',
    `/api/notifications/${encodeURIComponent(id)}/read`,
    {},
    'Gagal menandai notifikasi dibaca.'
  );
  return res.ok;
}

export async function markAllNotificationsReadOnServer(): Promise<boolean> {
  const res = await sendMutation(
    'POST',
    '/api/notifications/read-all',
    {},
    'Gagal menandai semua notifikasi dibaca.'
  );
  return res.ok;
}

export async function fetchVapidPublicKeyFromServer(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl(`/api/push/vapid-public-key?t=${Date.now()}`), {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(
      res,
      getResolvedEndpointDisplay('/api/push/vapid-public-key')
    );
    return typeof json?.publicKey === 'string' && json.publicKey ? json.publicKey : null;
  } catch {
    return null;
  }
}

export async function subscribePushOnServer(
  subscription: PushSubscriptionJSON
): Promise<ServerWriteResult> {
  return sendMutation(
    'POST',
    '/api/push/subscribe',
    { subscription },
    'Gagal mendaftarkan langganan notifikasi push.'
  );
}

export async function unsubscribePushOnServer(endpoint?: string): Promise<ServerWriteResult> {
  return sendMutation(
    'POST',
    '/api/push/unsubscribe',
    endpoint ? { endpoint } : {},
    'Gagal menonaktifkan langganan notifikasi push.'
  );
}

export async function fetchAuditLogsFromServer(limit = 100): Promise<AuditLogEntry[]> {
  if (!getAuthToken()) return [];
  try {
    const res = await fetch(apiUrl(`/api/audit-logs?limit=${limit}&t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/audit-logs'));
    return json?.success && Array.isArray(json.logs) ? json.logs : [];
  } catch {
    return [];
  }
}

export async function exportBackupFromServer(): Promise<AppDatabaseSchema | null> {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(apiUrl(`/api/backup/export?t=${Date.now()}`), {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { json } = await readApiJsonSafely(res, getResolvedEndpointDisplay('/api/backup/export'));
    if (!json?.success) return null;
    return {
      version: 2,
      revision: json.revision,
      lastUpdated: json.exportedAt || new Date().toISOString(),
      tahunAktif: json.tahunAktif || 2026,
      pengaturanKas: json.pengaturanKas,
      wargaList: Array.isArray(json.wargaList) ? json.wargaList : [],
      transactions: Array.isArray(json.transactions) ? json.transactions : [],
      bantuanList: Array.isArray(json.bantuanList) ? json.bantuanList : [],
      pengumumanList: Array.isArray(json.pengumumanList) ? json.pengumumanList : [],
      dokumenList: Array.isArray(json.dokumenList) ? json.dokumenList : [],
      adminAccounts: Array.isArray(json.adminAccounts) ? json.adminAccounts : [],
      laporanBulananRT: Array.isArray(json.laporanBulananRT) ? json.laporanBulananRT : [],
    };
  } catch {
    return null;
  }
}

export async function clearAppData(preserveAdminAccounts: AdminRTAccount[] = []): Promise<boolean> {
  clearLegacyLocalCache();
  try {
    localStorage.removeItem('rt_dismissed_notifications_v2');
  } catch {
    // ignore
  }

  try {
    const emptyPayload: AppDatabaseSchema = {
      version: 2,
      lastUpdated: new Date().toISOString(),
      tahunAktif: 2026,
      pengaturanKas: {
        nominalJimpitanTahunan: 300000,
        nominalJimpitanBulanan: 25000,
        nominalKematianTahunan: 120000,
        nominalKematianBulanan: 10000,
        saldoAwalKasUmum: 0,
        saldoAwalKasKematian: 0,
        keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu',
        tanggalSaldoAwal: '2026-01-01',
        kontakKetuaRT: { nama: '', telp: '' },
        kontakBendahara: { nama: '', telp: '' },
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
        updatedAt: new Date().toISOString(),
      },
      wargaList: [],
      transactions: [],
      bantuanList: [],
      pengumumanList: [],
      dokumenList: [],
      adminAccounts: preserveAdminAccounts,
      laporanBulananRT: [],
      deletedIds: { ...EMPTY_DELETED_IDS },
    };

    const res = await fetch(apiUrl('/api/data'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...emptyPayload, isHardReset: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function downloadBackupJSON(data: AppDatabaseSchema) {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `Cadangan_Kas_Warga_DesaKotayasa_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function parseBackupFile(file: File): Promise<AppDatabaseSchema> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.wargaList && json.pengaturanKas) {
          resolve(json);
        } else {
          reject(new Error('Format file cadangan tidak valid (wargaList atau pengaturanKas hilang).'));
        }
      } catch {
        reject(new Error('Gagal mengurai file JSON: Format rusak.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
    reader.readAsText(file);
  });
}
