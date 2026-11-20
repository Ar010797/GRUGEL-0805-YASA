import type {
  AdminRTAccount,
  BantuanPemerintah,
  DokumenPdfWarga,
  PembaruanBulananRT,
  PengaturanKas,
  PengumumanRT,
  RiwayatPerubahanKK,
  Transaction,
  Warga,
} from '../types';

export const SYNC_BACKOFF_STEPS_MS = [2000, 4000, 8000, 16000, 30000] as const;

export function computeBackoffDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(Number.isFinite(attempt) ? attempt : 0));
  const idx = Math.min(safeAttempt, SYNC_BACKOFF_STEPS_MS.length - 1);
  return SYNC_BACKOFF_STEPS_MS[idx];
}

export function extractFirestoreErrorCode(errOrMessage: unknown): string {
  if (!errOrMessage) return '';
  if (typeof errOrMessage === 'object') {
    const status = Number((errOrMessage as any).status);
    if (status === 403) return 'permission-denied';
    if (status === 401) return 'unauthenticated';
    if (status === 409) return 'version-conflict';
    if (status === 400) return 'invalid-argument';
    if (status === 404) return 'not-found';
    if (status === 503 || status === 502 || status === 504) return 'unavailable';
    const code = (errOrMessage as any).errorCode || (errOrMessage as any).code;
    if (typeof code === 'string' && code.trim()) {
      const normalized = code.trim().toLowerCase();
      if (normalized === 'forbidden') return 'permission-denied';
      if (normalized === 'version_conflict') return 'version-conflict';
      if (normalized === 'bad_request') return 'invalid-argument';
      if (normalized === 'db_unavailable') return 'unavailable';
      return normalized;
    }
  }
  const str =
    typeof errOrMessage === 'string'
      ? errOrMessage
      : String((errOrMessage as any)?.message || errOrMessage || '');
  if (/permission-denied|forbidden|missing or insufficient permissions|izin hilang atau tidak mencukupi|akses ditolak|hanya dapat|lintas rt/i.test(str)) {
    return 'permission-denied';
  }
  if (/version_conflict|version-conflict|bentrok versi|perubahan terbaru oleh perangkat lain/i.test(str)) {
    return 'version-conflict';
  }
  if (/unauthenticated|sesi.*berakhir|token.*tidak valid|http 401/i.test(str)) return 'unauthenticated';
  if (/invalid-argument|bad_request|wajib diisi|tidak valid/i.test(str)) return 'invalid-argument';
  if (/failed-precondition/i.test(str)) return 'failed-precondition';
  if (/not-found|tidak ditemukan/i.test(str)) return 'not-found';
  if (/unavailable|db_unavailable|http 503/i.test(str)) return 'unavailable';
  if (/deadline-exceeded|timeout/i.test(str)) return 'deadline-exceeded';
  if (/aborted/i.test(str)) return 'aborted';
  if (/resource-exhausted|quota/i.test(str)) return 'resource-exhausted';
  if (/network|offline|failed to fetch|load failed|network request failed/i.test(str)) return 'unavailable';
  return '';
}

export function isTerminalFirestoreError(errOrMessage: unknown): boolean {
  const code = extractFirestoreErrorCode(errOrMessage);
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'invalid-argument' ||
    code === 'failed-precondition' ||
    code === 'version-conflict' ||
    code === 'not-found'
  );
}

export function isTransientFirestoreError(errOrMessage: unknown): boolean {
  if (isTerminalFirestoreError(errOrMessage)) return false;
  const code = extractFirestoreErrorCode(errOrMessage);
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'resource-exhausted' ||
    code === 'internal' ||
    code === 'unknown' ||
    code === ''
  );
}

export function formatFriendlyFirestoreError(
  errOrMessage: unknown,
  fallbackMessage = 'Gagal menyinkronkan data ke Database Server Pusat.'
): string {
  const raw =
    typeof errOrMessage === 'string'
      ? errOrMessage
      : String((errOrMessage as any)?.message || '');

  let parsedErrorText = raw;
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        parsedErrorText = parsed.error;
      } else if (parsed && typeof parsed.message === 'string') {
        parsedErrorText = parsed.message;
      }
    } catch {
      // keep raw string
    }
  }

  const code = extractFirestoreErrorCode(errOrMessage) || extractFirestoreErrorCode(parsedErrorText);

  if (code === 'permission-denied') {
    return (
      parsedErrorText.trim() ||
      'Akses ditolak Server Pusat. Pastikan akun Anda sesuai role dan wilayah RT yang berhak.'
    );
  }
  if (code === 'version-conflict') {
    return (
      parsedErrorText.trim() ||
      'Data baru saja diperbarui oleh perangkat lain. Silakan muat ulang data terbaru lalu coba lagi.'
    );
  }
  if (code === 'unauthenticated') {
    return 'Sesi login server belum aktif atau sudah berakhir. Silakan masuk kembali.';
  }
  if (code === 'invalid-argument') {
    return parsedErrorText.trim() || 'Format data tidak memenuhi validasi server.';
  }
  if (code === 'unavailable' || /offline|network|failed to fetch/i.test(parsedErrorText)) {
    return 'Koneksi ke Database Server Pusat terputus. Perubahan akan dicoba ulang otomatis saat terhubung.';
  }

  return parsedErrorText.trim() || fallbackMessage;
}

export interface UpgradeKKPayload {
  updatedWarga: Warga;
  historyRecord: RiwayatPerubahanKK;
  oldNoKK?: string;
  oldKepalaNama?: string;
  catatSantunanKematian?: boolean;
  nominalSantunanKematian?: number;
  expectedVersion?: number;
  clientMutationId?: string;
}

export type PendingSyncOp =
  | {
      opKey: string;
      kind: 'saveWarga';
      payload: Warga;
      isUpdate?: boolean;
      expectedVersion?: number;
      clientMutationId?: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'upgradeKK';
      targetId: string;
      payload: UpgradeKKPayload;
      clientMutationId?: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deleteWarga';
      targetId: string;
      expectedVersion?: number;
      clientMutationId?: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveTx';
      payload: Transaction;
      isUpdate?: boolean;
      expectedVersion?: number;
      clientMutationId?: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deleteTx';
      targetId: string;
      expectedVersion?: number;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveBantuan';
      payload: BantuanPemerintah;
      isUpdate?: boolean;
      expectedVersion?: number;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deleteBantuan';
      targetId: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'savePengumuman';
      payload: PengumumanRT;
      isUpdate?: boolean;
      expectedVersion?: number;
      clientMutationId?: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deletePengumuman';
      targetId: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveDokumen';
      payload: DokumenPdfWarga;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deleteDokumen';
      targetId: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveLaporan';
      payload: PembaruanBulananRT;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveAdmin';
      payload: AdminRTAccount;
      isUpdate?: boolean;
      expectedVersion?: number;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'deleteAdmin';
      targetId: string;
      attempts?: number;
      updatedAtMs?: number;
    }
  | {
      opKey: string;
      kind: 'saveSettings';
      payload: PengaturanKas;
      tahunAktif: number;
      expectedVersion?: number;
      attempts?: number;
      updatedAtMs?: number;
    };

export function generateClientMutationId(prefix = 'mut'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function getCanonicalEntityKey(op: PendingSyncOp): string {
  switch (op.kind) {
    case 'saveWarga':
      return `warga:${op.payload.id}`;
    case 'upgradeKK':
      return `upgradekk:${op.targetId}`;
    case 'deleteWarga':
      return `warga:${op.targetId}`;
    case 'saveTx':
      return `tx:${op.payload.id}`;
    case 'deleteTx':
      return `tx:${op.targetId}`;
    case 'saveBantuan':
      return `bantuan:${op.payload.id}`;
    case 'deleteBantuan':
      return `bantuan:${op.targetId}`;
    case 'savePengumuman':
      return `pengumuman:${op.payload.id}`;
    case 'deletePengumuman':
      return `pengumuman:${op.targetId}`;
    case 'saveDokumen':
      return `dokumen:${op.payload.id}`;
    case 'deleteDokumen':
      return `dokumen:${op.targetId}`;
    case 'saveLaporan':
      return `laporan:${op.payload.id}`;
    case 'saveAdmin':
      return `admin:${op.payload.id}`;
    case 'deleteAdmin':
      return `admin:${op.targetId}`;
    case 'saveSettings':
      return 'settings:active';
  }
}

export function upsertPendingSyncOp(
  queue: PendingSyncOp[],
  incoming: PendingSyncOp
): PendingSyncOp[] {
  const canonicalKey = getCanonicalEntityKey(incoming);
  const filtered = queue.filter(
    (item) => getCanonicalEntityKey(item) !== canonicalKey && item.opKey !== incoming.opKey
  );
  return [
    ...filtered,
    {
      ...incoming,
      attempts: incoming.attempts ?? 0,
      updatedAtMs: incoming.updatedAtMs ?? Date.now(),
    },
  ];
}

export function removePendingSyncOpsByKey(
  queue: PendingSyncOp[],
  entityOrOpKeys: string[]
): PendingSyncOp[] {
  if (entityOrOpKeys.length === 0) return queue;
  const keySet = new Set(entityOrOpKeys);
  return queue.filter(
    (item) => !keySet.has(item.opKey) && !keySet.has(getCanonicalEntityKey(item))
  );
}
