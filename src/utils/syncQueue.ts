import type {
  AdminRTAccount,
  BantuanPemerintah,
  DokumenPdfWarga,
  PembaruanBulananRT,
  PengaturanKas,
  PengumumanRT,
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
    const code = (errOrMessage as any).errorCode || (errOrMessage as any).code;
    if (typeof code === 'string' && code.trim()) return code.trim().toLowerCase();
  }
  const str = typeof errOrMessage === 'string' ? errOrMessage : String((errOrMessage as any)?.message || errOrMessage || '');
  if (/permission-denied|missing or insufficient permissions|izin hilang atau tidak mencukupi/i.test(str)) {
    return 'permission-denied';
  }
  if (/unauthenticated/i.test(str)) return 'unauthenticated';
  if (/invalid-argument/i.test(str)) return 'invalid-argument';
  if (/failed-precondition/i.test(str)) return 'failed-precondition';
  if (/not-found/i.test(str)) return 'not-found';
  if (/unavailable/i.test(str)) return 'unavailable';
  if (/deadline-exceeded|timeout/i.test(str)) return 'deadline-exceeded';
  if (/aborted/i.test(str)) return 'aborted';
  if (/resource-exhausted|quota/i.test(str)) return 'resource-exhausted';
  if (/network|offline|failed to get document/i.test(str)) return 'unavailable';
  return '';
}

export function isTerminalFirestoreError(errOrMessage: unknown): boolean {
  const code = extractFirestoreErrorCode(errOrMessage);
  return (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'invalid-argument' ||
    code === 'failed-precondition'
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
  fallbackMessage = 'Gagal menyinkronkan data ke Cloud Firestore.'
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
      }
    } catch {
      // keep raw string
    }
  }

  const code = extractFirestoreErrorCode(errOrMessage) || extractFirestoreErrorCode(parsedErrorText);

  if (code === 'permission-denied') {
    return 'Akses ditolak Firestore (Missing or insufficient permissions). Pastikan akun sesuai wilayah RT/role yang berhak.';
  }
  if (code === 'unauthenticated') {
    return 'Sesi login Firebase belum aktif atau sudah berakhir. Silakan masuk kembali.';
  }
  if (code === 'invalid-argument') {
    return 'Format data tidak memenuhi validasi server Firestore.';
  }
  if (code === 'unavailable' || /offline|network/i.test(parsedErrorText)) {
    return 'Koneksi ke server Firestore terputus. Perubahan akan dicoba ulang otomatis saat terhubung.';
  }
  if (code === 'resource-exhausted') {
    return 'Kuota pembacaan/penulisan harian Firestore tercapai sementara.';
  }

  return parsedErrorText.trim() || fallbackMessage;
}

export type PendingSyncOp =
  | { opKey: string; kind: 'saveWarga'; payload: Warga; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deleteWarga'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveTx'; payload: Transaction; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deleteTx'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveBantuan'; payload: BantuanPemerintah; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deleteBantuan'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'savePengumuman'; payload: PengumumanRT; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deletePengumuman'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveDokumen'; payload: DokumenPdfWarga; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deleteDokumen'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveLaporan'; payload: PembaruanBulananRT; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveAdmin'; payload: AdminRTAccount; authUid?: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'deleteAdmin'; targetId: string; attempts?: number; updatedAtMs?: number }
  | { opKey: string; kind: 'saveSettings'; payload: PengaturanKas; tahunAktif: number; attempts?: number; updatedAtMs?: number };

export function getCanonicalEntityKey(op: PendingSyncOp): string {
  switch (op.kind) {
    case 'saveWarga':
      return `warga:${op.payload.id}`;
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

/**
 * Inserts or replaces a queued sync operation without creating duplicates:
 * - Multiple edits to the same document collapse into the latest save payload.
 * - Deleting a document supersedes any pending save or delete for that same document.
 */
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
