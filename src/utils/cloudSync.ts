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

export interface AppDatabaseSchema {
  version: number;
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
}

const LOCAL_STORAGE_KEY = 'kas_rt08_rw05_database_v2';

/**
 * Loads data from localStorage first (offline-first), then syncs with server API if available.
 */
export async function loadAppData(defaultData: AppDatabaseSchema): Promise<AppDatabaseSchema> {
  let localData: AppDatabaseSchema | null = null;

  // 1. Check client-side local cache
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Gagal membaca cache lokal:', err);
  }

  // 2. Try to fetch from Server backend API
  try {
    const res = await fetch('/api/data', { method: 'GET' });
    if (res.ok) {
      const serverPayload = await res.json();
      if (serverPayload && serverPayload.data) {
        const remoteData = serverPayload.data as AppDatabaseSchema;
        // Merge or prefer server data if it has newer lastUpdated
        if (!localData || (remoteData.lastUpdated && remoteData.lastUpdated > (localData.lastUpdated || ''))) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remoteData));
          return remoteData;
        }
      }
    }
  } catch (err) {
    // Server might be in dev mode or offline; fallback to local
  }

  return localData || defaultData;
}

/**
 * Saves data immediately to localStorage and sends to server backend.
 */
export async function saveAppData(data: AppDatabaseSchema): Promise<boolean> {
  const updatedData: AppDatabaseSchema = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };

  // 1. Immediate local write (synchronous guarantee)
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
  } catch (err) {
    console.error('Error writing to localStorage:', err);
  }

  // 2. Async server write
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData),
    });
    return res.ok;
  } catch (err) {
    // Server write silently queued in local storage
    return false;
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
      } catch (err) {
        reject(new Error('Gagal mengurai file JSON: Format rusak.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
    reader.readAsText(file);
  });
}
