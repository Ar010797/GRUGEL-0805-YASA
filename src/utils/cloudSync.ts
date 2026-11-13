import {
  Warga,
  Transaction,
  BantuanPemerintah,
  PengumumanRT,
  PengaturanKas,
  DokumenPdfWarga,
  AdminRTAccount,
  PembaruanBulananRT,
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

const LOCAL_STORAGE_KEY = 'kas_rt08_rw05_database_v2';

function toEpoch(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Merges two entity arrays without dropping records, preserving newer edits by updatedAt,
 * and respecting explicit deletion tombstones so deleted records never resurrect from stale caches.
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

function unionIds(a: string[] = [], b: string[] = []): string[] {
  return Array.from(new Set([...a, ...b]));
}

/**
 * Smart bidirectional merge where `authoritative` (server or Firestore) takes precedence
 * on ties, while preserving newer local edits and honoring deletion tombstones.
 */
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

export function writeLocalCache(data: AppDatabaseSchema) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Gagal menulis cache lokal:', err);
  }
}

export function readLocalCache(): AppDatabaseSchema | null {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    return cached ? (JSON.parse(cached) as AppDatabaseSchema) : null;
  } catch (err) {
    console.warn('Gagal membaca cache lokal:', err);
    return null;
  }
}

/**
 * Loads data from Server backend API and returns both merged data and raw server snapshot
 * so caller knows accurately whether local/cloud items still need pushing to server.
 */
export async function loadAppDataWithMeta(defaultData: AppDatabaseSchema): Promise<{
  resolved: AppDatabaseSchema;
  serverData: AppDatabaseSchema | null;
}> {
  const localData = readLocalCache();

  try {
    const res = await fetch(`/api/data?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (res.ok) {
      const serverPayload = await res.json();
      if (serverPayload && serverPayload.data) {
        const remoteData = serverPayload.data as AppDatabaseSchema;
        const resolvedData = mergeDatabaseStates(remoteData, localData);
        writeLocalCache(resolvedData);
        return { resolved: resolvedData, serverData: remoteData };
      }
    }
  } catch {
    // Server fetch error fallback to local
  }

  return { resolved: localData || defaultData, serverData: null };
}

export async function loadAppData(defaultData: AppDatabaseSchema): Promise<AppDatabaseSchema> {
  const { resolved } = await loadAppDataWithMeta(defaultData);
  return resolved;
}

/**
 * Checks lightweight server revision so mobile WebViews polling every few seconds
 * only download the full payload when a remote device actually saved new data.
 */
export async function checkServerRevision(
  sinceRevision: number
): Promise<{ changed: boolean; revision: number; hasData: boolean } | null> {
  try {
    const res = await fetch(`/api/sync-check?since=${encodeURIComponent(String(sinceRevision))}&t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
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

/**
 * Fetches latest state directly from Server without letting local cache resurrect deleted items.
 */
export async function fetchServerSnapshot(): Promise<AppDatabaseSchema | null> {
  try {
    const res = await fetch(`/api/data?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.data) {
      return json.data as AppDatabaseSchema;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves data immediately to localStorage and sends to server backend.
 * Returns the merged authoritative state from server so client stays 100% in sync.
 */
export async function saveAppData(
  data: AppDatabaseSchema,
  options?: {
    isHardReset?: boolean;
    deletedIds?: Partial<DeletedIdsMap>;
    deletedWargaIds?: string[];
    deletedPengumumanIds?: string[];
    keepalive?: boolean;
  }
): Promise<{ ok: boolean; serverData?: AppDatabaseSchema }> {
  const updatedData: AppDatabaseSchema = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };

  writeLocalCache(updatedData);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: options?.keepalive ?? false,
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    if (json?.data) {
      writeLocalCache(json.data as AppDatabaseSchema);
      return { ok: true, serverData: json.data as AppDatabaseSchema };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Fire-and-forget keepalive flush for pagehide/backgrounding in Median WebView & mobile browsers.
 */
export function flushSaveAppDataKeepalive(
  data: AppDatabaseSchema,
  deletedIds?: Partial<DeletedIdsMap>
) {
  const updatedData: AppDatabaseSchema = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };
  writeLocalCache(updatedData);

  try {
    const payloadStr = JSON.stringify({
      ...updatedData,
      isHardReset: false,
      deletedIds: deletedIds || {},
    });
    if (typeof fetch !== 'undefined') {
      fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // ignore unload flush error
  }
}

/**
 * Subscribes to live Server-Sent Events (/api/stream) so changes made from Median,
 * another browser, Admin RT, or Server appear in real time across all sessions.
 */
export function subscribeServerStream(
  onRemoteData: (data: AppDatabaseSchema, isReset?: boolean) => void,
  onConnectionChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      es = new EventSource('/api/stream');
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

/**
 * Saves a single citizen directly to the server database.
 */
export async function saveSingleWargaToServer(warga: Warga): Promise<boolean> {
  try {
    const res = await fetch('/api/warga', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warga: {
          ...warga,
          updatedAt: warga.updatedAt || new Date().toISOString(),
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Explicitly removes a citizen from the server database.
 */
export async function deleteWargaFromServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/warga/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Completely wipes all database data from both localStorage and server backend.
 * Explicitly passes isHardReset: true.
 */
export async function clearAppData(): Promise<boolean> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem('rt_dismissed_notifications_v2');
  } catch (err) {
    console.error('Error clearing localStorage:', err);
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
      adminAccounts: [],
      laporanBulananRT: [],
      deletedIds: { ...EMPTY_DELETED_IDS },
    };

    writeLocalCache(emptyPayload);

    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...emptyPayload, isHardReset: true }),
    });
    return res.ok;
  } catch {
    return true;
  }
}

/**
 * Exports complete database to a downloadable .JSON backup file.
 */
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

/**
 * Reads an uploaded .JSON file and restores database state.
 */
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
