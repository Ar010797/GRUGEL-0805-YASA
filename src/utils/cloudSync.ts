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

const LEGACY_LOCAL_STORAGE_KEY = 'kas_rt08_rw05_database_v2';
const AUTH_TOKEN_KEY = 'kaswarga_auth_token_v1';

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

/**
 * Reads any legacy pre-migration HP Admin cache so it can be migrated once to Central SQL Database.
 * Never used as the active database store.
 */
export function readLegacyLocalCacheForMigration(): AppDatabaseSchema | null {
  try {
    const cached = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as AppDatabaseSchema;
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

/**
 * Merges two entity arrays preserving newer edits by updatedAt and respecting tombstones.
 */
export function mergeEntityList<T extends { id: string; updatedAt?: string }>(
  primaryList: T[],
  secondaryList: T[],
  deletedIds: string[] = [],
  altMatch?: (a: T, b: T) => boolean
): T[] {
  const deletedSet = new Set(deletedIds);
  const result: T[] = [];

  for (const item of primaryList) {
    if (!deletedSet.has(item.id)) {
      result.push(item);
    }
  }

  for (const sec of secondaryList) {
    if (deletedSet.has(sec.id)) continue;
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

export async function checkServerHealth(): Promise<{
  connected: boolean;
  revision?: number;
  message?: string;
}> {
  try {
    const res = await fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.status !== 'ok') {
      return {
        connected: false,
        message: json?.message || 'Koneksi database server sedang bermasalah.',
      };
    }
    return {
      connected: true,
      revision: Number(json.revision) || 1,
    };
  } catch {
    return {
      connected: false,
      message: 'Tidak dapat terhubung ke server pusat. Periksa koneksi internet Anda.',
    };
  }
}

export async function fetchPublicBootstrapInfo(): Promise<{
  pengaturanKas: PengaturanKas;
  tahunAktif: number;
  revision: number;
} | null> {
  try {
    const res = await fetch(`/api/public/info?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
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
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, password }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json?.token || !json?.user) {
      return {
        ok: false,
        status: res.status,
        message: json?.message || 'Login gagal. Periksa kembali kredensial Anda.',
      };
    }
    setAuthToken(json.token);
    return {
      ok: true,
      status: res.status,
      token: json.token,
      user: json.user as AuthUser,
    };
  } catch {
    return {
      ok: false,
      message: 'Gagal menghubungi server autentikasi. Periksa koneksi internet Anda.',
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
    const res = await fetch(`/api/auth/me?t=${Date.now()}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      clearAuthToken();
      return { ok: false, unauthorized: true };
    }
    if (!res.ok) return { ok: false };
    const json = await res.json().catch(() => null);
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
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(),
      }).catch(() => {});
    }
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
      `/api/sync-check?since=${encodeURIComponent(String(sinceRevision))}&t=${Date.now()}`,
      {
        method: 'GET',
        headers: authHeaders(),
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
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

export async function fetchServerSnapshotWithStatus(): Promise<{
  ok: boolean;
  status?: number;
  data?: AppDatabaseSchema;
  message?: string;
}> {
  if (!getAuthToken()) {
    return { ok: false, status: 401, message: 'Sesi login tidak ditemukan.' };
  }
  try {
    const res = await fetch(`/api/data?t=${Date.now()}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data) {
      return {
        ok: false,
        status: res.status,
        message: json?.message || 'Gagal mengambil data terbaru dari database server.',
      };
    }
    return {
      ok: true,
      status: res.status,
      data: json.data as AppDatabaseSchema,
    };
  } catch {
    return {
      ok: false,
      message: 'Koneksi ke server pusat terputus saat mengambil data.',
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

    const res = await fetch('/api/data', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      keepalive: options?.keepalive ?? false,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json?.message || 'Gagal menyinkronkan data ke database server.',
      };
    }
    return {
      ok: true,
      status: res.status,
      serverData: json?.data as AppDatabaseSchema | undefined,
    };
  } catch {
    return {
      ok: false,
      message: 'Koneksi ke server pusat gagal saat menyimpan data.',
    };
  }
}

export async function migrateLegacyLocalDataToServer(
  localData: Partial<AppDatabaseSchema>
): Promise<{ ok: boolean; serverData?: AppDatabaseSchema; message?: string }> {
  if (!getAuthToken()) return { ok: false, message: 'Belum login.' };
  try {
    const res = await fetch('/api/sync/migrate-local', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...localData, isHardReset: false }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        message: json?.message || 'Gagal memigrasikan data lokal ke server pusat.',
      };
    }
    return {
      ok: true,
      serverData: json.data as AppDatabaseSchema | undefined,
      message: json.message,
    };
  } catch {
    return { ok: false, message: 'Koneksi gagal saat migrasi data ke server.' };
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
    const res = await fetch(`/api/admin-accounts?t=${Date.now()}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
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

export async function syncAdminAccountToServer(params: {
  account: AdminRTAccount;
  syncData?: AppDatabaseSchema;
  deletedIds?: Partial<DeletedIdsMap>;
  allowOverwrite?: boolean;
  securityPin?: string;
}): Promise<{
  ok: boolean;
  status?: number;
  message?: string;
  account?: AdminRTAccount;
  token?: string;
  user?: AuthUser;
  serverData?: AppDatabaseSchema;
}> {
  try {
    const res = await fetch('/api/admin/sync-account', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return {
        ok: false,
        status: res.status,
        message: json?.message || 'Gagal menyinkronkan akun admin ke server.',
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
  } catch {
    return {
      ok: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
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
      fetch('/api/data', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: fullPayloadStr,
        keepalive: true,
      }).catch(() => {});
      return;
    }

    const compactPayloadStr = JSON.stringify({
      ...updatedData,
      dokumenList: [],
      isHardReset: false,
      deletedIds: deletedIds || {},
    });
    const compactLength =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(compactPayloadStr).length
        : compactPayloadStr.length;

    if (compactLength <= 60000) {
      fetch('/api/data', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: compactPayloadStr,
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
      es = new EventSource(`/api/stream?token=${encodeURIComponent(latestToken)}`);
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
          }, 4000);
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
    const res = await fetch(`/api/warga?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (json?.success && Array.isArray(json.wargaList)) {
      return json.wargaList as Warga[];
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSingleWargaToServer(
  warga: Warga
): Promise<{ ok: boolean; warga?: Warga; message?: string }> {
  try {
    const res = await fetch('/api/warga', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        warga: {
          ...warga,
          updatedAt: warga.updatedAt || new Date().toISOString(),
        },
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        message: json?.message || 'Gagal menyimpan data warga ke server.',
      };
    }
    return { ok: true, warga: json?.warga as Warga | undefined };
  } catch {
    return { ok: false, message: 'Koneksi gagal saat menyimpan data warga ke server.' };
  }
}

export async function bulkImportWargaOnServer(params: {
  wargaList: Array<Omit<Warga, 'id' | 'no'>>;
  bantuanList: Array<Omit<BantuanPemerintah, 'id'>>;
  mergeExisting: boolean;
  tahunAktif: number;
}): Promise<{ ok: boolean; addedKK?: number; updatedKK?: number; addedBantuan?: number; message?: string }> {
  try {
    const res = await fetch('/api/warga/bulk', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, message: json?.message || 'Gagal mengimpor Excel ke server.' };
    }
    return {
      ok: true,
      addedKK: json.addedKK,
      updatedKK: json.updatedKK,
      addedBantuan: json.addedBantuan,
    };
  } catch {
    return { ok: false, message: 'Koneksi gagal saat mengimpor Excel ke server.' };
  }
}

export async function deleteWargaFromServer(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/warga/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, message: json?.message || 'Gagal menghapus data warga di server.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi gagal saat menghapus data warga di server.' };
  }
}

export async function updateWargaSelfOnServer(patch: {
  pin?: string;
  telepon?: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/warga/self', {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, message: json?.message || 'Gagal memperbarui PIN warga di server.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Koneksi gagal saat memperbarui profil ke server.' };
  }
}

async function postEntity(url: string, body: unknown, errMsg: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: json?.message || errMsg };
    return { ok: true };
  } catch {
    return { ok: false, message: `${errMsg} (koneksi gagal)` };
  }
}

async function deleteEntity(url: string, errMsg: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: json?.message || errMsg };
    return { ok: true };
  } catch {
    return { ok: false, message: `${errMsg} (koneksi gagal)` };
  }
}

export const saveTransactionOnServer = (tx: Transaction) =>
  postEntity('/api/transactions', { transaction: tx }, 'Gagal menyimpan transaksi kas ke server.');

export const deleteTransactionOnServer = (id: string) =>
  deleteEntity(`/api/transactions/${encodeURIComponent(id)}`, 'Gagal menghapus transaksi dari server.');

export const savePengumumanOnServer = (p: PengumumanRT) =>
  postEntity('/api/pengumuman', { pengumuman: p }, 'Gagal menyimpan pengumuman ke server.');

export const deletePengumumanOnServer = (id: string) =>
  deleteEntity(`/api/pengumuman/${encodeURIComponent(id)}`, 'Gagal menghapus pengumuman dari server.');

export const saveBantuanOnServer = (b: BantuanPemerintah) =>
  postEntity('/api/bantuan', { bantuan: b }, 'Gagal menyimpan data bantuan ke server.');

export const deleteBantuanOnServer = (id: string) =>
  deleteEntity(`/api/bantuan/${encodeURIComponent(id)}`, 'Gagal menghapus data bantuan dari server.');

export const saveDokumenOnServer = (d: DokumenPdfWarga) =>
  postEntity('/api/dokumen', { dokumen: d }, 'Gagal menyimpan dokumen ke server.');

export const deleteDokumenOnServer = (id: string) =>
  deleteEntity(`/api/dokumen/${encodeURIComponent(id)}`, 'Gagal menghapus dokumen dari server.');

export const saveLaporanOnServer = (l: PembaruanBulananRT) =>
  postEntity('/api/laporan-bulanan', { laporan: l }, 'Gagal mengirim laporan bulanan ke server.');

export const saveSettingsOnServer = (pengaturanKas: PengaturanKas, tahunAktif?: number) =>
  postEntity('/api/settings', { pengaturanKas, tahunAktif }, 'Gagal menyimpan pengaturan ke server.');

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

    const res = await fetch('/api/data', {
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
