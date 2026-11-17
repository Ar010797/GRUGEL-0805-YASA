import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldValue,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  onSnapshotsInSync,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  ensureFirestoreNetworkOnline,
  firebaseConfig,
  getSecondaryAuth,
  handleFirestoreError,
  OperationType,
  reportFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
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
} from '../types';
import {
  normalizeRTCode,
  normalizeRWCode,
  normalizePersonName,
  getWargaRTCode,
  getTransactionRTCode,
  resolveTransactionResidentId,
} from './rtFilter';
import {
  dedupeEntityList,
  formatWaktuSyncID,
  type AppDatabaseSchema,
} from './cloudSync';

export const DEFAULT_SERVER_USERNAME = 'RW05GLEMPANG';
export const DEFAULT_SERVER_PASSWORD = 'GLEMPANG1522';
export const SERVER_BOOTSTRAP_SEED = 'RW05GLEMPANG:GLEMPANG1522:kotayasa';
export const BOOTSTRAPPED_ADMIN_EMAIL = 'ar01071997@gmail.com';
export const DEFAULT_SECURITY_PIN = '123456';
export const DEFAULT_RW = '05';
export const DEFAULT_RT = '08';
export const RW05_RT_CODES = ['01', '02', '03', '04', '05', '06', '07', '08'] as const;

export function buildScopeIds(rtRaw: string, rwRaw: string): { rwId: string; rtId: string } {
  const rw = normalizeRWCode(rwRaw, DEFAULT_RW);
  const rtUpper = String(rtRaw || '').trim().toUpperCase();
  const rt = rtUpper === 'SEMUA' ? 'SEMUA' : normalizeRTCode(rtRaw) || DEFAULT_RT;
  return {
    rwId: `rw_${rw}`,
    rtId: rt === 'SEMUA' ? 'SEMUA' : `rt_${rt}`,
  };
}

type EntityBucket =
  | 'warga'
  | 'transactions'
  | 'bantuan'
  | 'pengumuman'
  | 'dokumen'
  | 'adminAccounts'
  | 'laporanBulanan'
  | 'settings';

export interface FirestoreWriteResult {
  ok: boolean;
  pending?: boolean;
  message?: string;
}

interface CachedDocMeta {
  ownerUid: string;
  createdAt: any;
  serverUid?: string;
  rtAdminUid?: string;
  accessUids?: string[];
  rw?: string;
  rt?: string;
  rwId?: string;
  rtId?: string;
  linkedUid?: string;
  localCreated?: boolean;
  serverConfirmed?: boolean;
  nullKeys?: string[];
}

const docMetaCache = new Map<string, CachedDocMeta>();

let activePendingWriteCount = 0;
let latestAsyncWriteError: string | null = null;
const pendingWriteListeners = new Set<() => void>();

function notifyPendingWriteListeners() {
  pendingWriteListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener callback errors
    }
  });
}

export function getPendingServerWriteCount(): number {
  return activePendingWriteCount;
}

export function clearLatestAsyncWriteError(): void {
  latestAsyncWriteError = null;
  notifyPendingWriteListeners();
}

function isOnlineBrowser(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

async function commitTrackedWrite(
  writePromise: Promise<unknown>,
  opType: OperationType,
  path: string,
  onAcked?: () => Promise<void> | void
): Promise<FirestoreWriteResult> {
  activePendingWriteCount++;
  notifyPendingWriteListeners();

  const ackPromise = writePromise.then(
    async () => {
      try {
        if (onAcked) {
          await onAcked();
        }
      } catch (postErr) {
        console.warn(`Post-ACK task warning (${path}):`, postErr);
      } finally {
        activePendingWriteCount = Math.max(0, activePendingWriteCount - 1);
        latestAsyncWriteError = null;
        notifyPendingWriteListeners();
      }
      return { ok: true, pending: false } as FirestoreWriteResult;
    },
    (err: any) => {
      activePendingWriteCount = Math.max(0, activePendingWriteCount - 1);
      const errInfo = reportFirestoreError(err, opType, path);
      const detail = err?.message || errInfo.error || 'Gagal menulis ke Cloud Firestore.';
      latestAsyncWriteError = detail;
      notifyPendingWriteListeners();
      return { ok: false, pending: false, message: JSON.stringify({ ...errInfo, error: detail }) } as FirestoreWriteResult;
    }
  );

  // When offline, do not block UI waiting for server ACK; Firestore persistentLocalCache queues it safely.
  if (!isOnlineBrowser()) {
    return { ok: true, pending: true };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const raceResult = await Promise.race([
    ackPromise,
    new Promise<FirestoreWriteResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({ ok: true, pending: true });
      }, 2500);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return raceResult;
}

export interface AdminIdentityContext {
  uid: string;
  role: 'server' | 'admin';
  rw: string;
  rt: string;
  email: string;
  username: string;
  displayName: string;
  serverUid?: string;
  adminsByRt: Record<string, string[]>;
}

let activeAdminContext: AdminIdentityContext | null = null;

export function getActiveAdminContext(): AdminIdentityContext | null {
  return activeAdminContext;
}

export async function ensureAdminContextReady(): Promise<AdminIdentityContext | null> {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;
  if (activeAdminContext && activeAdminContext.uid === fbUser.uid) {
    return activeAdminContext;
  }
  try {
    return await refreshAdminContext(fbUser.uid);
  } catch {
    return activeAdminContext && activeAdminContext.uid === fbUser.uid ? activeAdminContext : null;
  }
}

export function toValidDocId(raw?: string | null, prefix = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .slice(0, 120);
  if (cleaned.length >= 1) return cleaned;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPlainObject(val: unknown): val is Record<string, any> {
  if (!val || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

export function stripUndefinedDeep<T>(input: T): T {
  if (input instanceof FieldValue || input instanceof Timestamp) {
    return input;
  }
  if (typeof input === 'number') {
    return (Number.isFinite(input) ? input : undefined) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => {
        if (item === undefined || item === null) return false;
        if (typeof item === 'number' && !Number.isFinite(item)) return false;
        return true;
      })
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(input)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return input;
}

export const sanitizeFirestoreData = stripUndefinedDeep;

function toFiniteNumberOrUndefined(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : undefined;
}

function toFiniteNumberOrDefault(val: unknown, fallback: number): number {
  return toFiniteNumberOrUndefined(val) ?? fallback;
}

function toPlainMapOrUndefined(val: unknown): Record<string, any> | undefined {
  if (!isPlainObject(val)) return undefined;
  return stripUndefinedDeep({ ...val });
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof (val as any).toDate === 'function') {
    try {
      return (val as any).toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  if (typeof val === 'string' && val.trim()) return val;
  return new Date().toISOString();
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toServerEmail(username: string): string {
  const u = username.trim();
  if (u.includes('@')) return u.toLowerCase();
  const slug = u.toLowerCase().replace(/[^a-z0-9]/g, '') || 'rw05glempang';
  return `server.${slug}@kotayasa.desa.id`;
}

export function toAdminEmail(username: string): string {
  const u = username.trim();
  if (u.includes('@')) return u.toLowerCase();
  const slug = u.toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin';
  return `admin.${slug}@rt.kotayasa.desa.id`;
}

export function toWargaEmail(noKK: string): string {
  const digits = noKK.replace(/\D/g, '');
  return `warga.${digits}@kk.kotayasa.desa.id`;
}

export function formatFirebaseAuthError(error: any, fallbackMessage: string): string {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');

  if (code === 'auth/operation-not-allowed') {
    return 'Login Email/Password belum diaktifkan pada proyek Firebase (Authentication -> Sign-in method -> Email/Password). Aktifkan terlebih dahulu di Firebase Console.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Domain aplikasi ini belum ditambahkan ke Firebase Authentication -> Settings -> Authorized domains (${firebaseConfig.projectId}).`;
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Username atau password tidak ditemukan / tidak sesuai di Firebase Authentication.';
  }
  if (code === 'auth/weak-password') {
    return 'Password minimal harus 6 karakter untuk disimpan ke Firebase Authentication.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Koneksi internet bermasalah saat menghubungi Firebase Authentication.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup Login Google diblokir oleh browser/WebView. Gunakan login Username & Password Server di bawah ini.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Popup Login Google ditutup sebelum selesai.';
  }
  return msg ? `${fallbackMessage} (${code || msg})` : fallbackMessage;
}

function recordMeta(path: string, data: any, opts?: { serverConfirmed?: boolean }) {
  if (!data || typeof data !== 'object') return;
  const existing = docMetaCache.get(path);
  const nullKeys = Object.entries(data)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  docMetaCache.set(path, {
    ownerUid: String(data.ownerUid || existing?.ownerUid || ''),
    createdAt: data.createdAt ?? existing?.createdAt ?? null,
    serverUid: typeof data.serverUid === 'string' ? data.serverUid : existing?.serverUid,
    rtAdminUid: typeof data.rtAdminUid === 'string' ? data.rtAdminUid : existing?.rtAdminUid,
    accessUids: Array.isArray(data.accessUids) ? data.accessUids : existing?.accessUids,
    rw: typeof data.rw === 'string' ? data.rw : existing?.rw,
    rt: typeof data.rt === 'string' ? data.rt : existing?.rt,
    rwId: typeof data.rwId === 'string' ? data.rwId : existing?.rwId,
    rtId: typeof data.rtId === 'string' ? data.rtId : existing?.rtId,
    linkedUid: typeof data.linkedUid === 'string' ? data.linkedUid : existing?.linkedUid,
    localCreated: Boolean(data.localCreated ?? existing?.localCreated),
    serverConfirmed: Boolean(opts?.serverConfirmed ?? existing?.serverConfirmed),
    nullKeys: nullKeys.length > 0 ? nullKeys : existing?.nullKeys,
  });
}

async function resolveExistingMeta(path: string): Promise<CachedDocMeta | null> {
  const cached = docMetaCache.get(path);
  if (cached && (cached.serverConfirmed || cached.ownerUid || cached.localCreated)) {
    return cached;
  }
  try {
    const [colName, docId] = path.split('/');
    if (!colName || !docId) return null;
    const snap = await getDoc(doc(db, colName, docId));
    if (!snap.exists()) return null;
    const data = snap.data();
    recordMeta(path, { ...data, localCreated: true }, { serverConfirmed: !snap.metadata.fromCache });
    return docMetaCache.get(path) || null;
  } catch {
    return null;
  }
}

function buildEntityUpdatePatch(
  colName: EntityBucket,
  payload: Record<string, any>,
  ctx: AdminIdentityContext | null,
  existing?: CachedDocMeta | null
): Record<string, any> {
  const omitted = new Set<string>(['id', 'ownerUid', 'rw', 'createdAt']);
  if (ctx?.role === 'admin') {
    omitted.add('rt');
  }
  if (colName === 'adminAccounts' && ctx?.role !== 'server') {
    ['username', 'passwordHash', 'rt', 'status', 'authUid'].forEach((k) => omitted.add(k));
  }
  if (colName === 'laporanBulanan' && ctx?.role !== 'server') {
    ['rt', 'statusVerifikasi'].forEach((k) => omitted.add(k));
  }
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (omitted.has(k) || v === undefined) continue;
    patch[k] = v;
  }
  // Keep rwId/rtId aligned with immutable existing.rw/existing.rt when Admin updates legacy docs
  if (existing?.rw && existing.rw !== payload.rw) {
    patch.rwId = `rw_${existing.rw}`;
  }
  if (ctx?.role === 'admin' && existing?.rt && existing.rt !== payload.rt) {
    patch.rtId = existing.rt === 'SEMUA' ? 'SEMUA' : `rt_${existing.rt}`;
  }
  // Purge legacy null optional fields on update
  if (Array.isArray(existing?.nullKeys)) {
    for (const nk of existing.nullKeys) {
      if (!omitted.has(nk) && !(nk in patch)) {
        patch[nk] = deleteField();
      }
    }
  }
  patch.updatedAt = serverTimestamp();
  return patch;
}

function computeScopeMetadata(rtRaw: string, rwRaw: string, ctx?: AdminIdentityContext | null) {
  const currentUid = auth.currentUser?.uid || ctx?.uid || '';
  const rw = normalizeRWCode(rwRaw, ctx?.rw || DEFAULT_RW);
  const rt =
    rtRaw.toUpperCase() === 'SEMUA'
      ? 'SEMUA'
      : normalizeRTCode(rtRaw) || (ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);

  const uids: string[] = [];
  if (currentUid) uids.push(currentUid);

  const effectiveServerUid =
    ctx?.serverUid || (ctx?.role === 'server' ? ctx.uid : undefined);
  if (effectiveServerUid && !uids.includes(effectiveServerUid)) {
    uids.push(effectiveServerUid);
  }

  let rtAdminUid: string | undefined =
    ctx?.role === 'admin' && (ctx.rt === rt || rt === 'SEMUA') ? ctx.uid : undefined;

  if (ctx?.adminsByRt) {
    if (rt === 'SEMUA') {
      Object.values(ctx.adminsByRt)
        .flat()
        .forEach((uid) => {
          if (uid && !uids.includes(uid)) uids.push(uid);
        });
    } else {
      const assigned = ctx.adminsByRt[rt] || [];
      if (!rtAdminUid && assigned[0]) rtAdminUid = assigned[0];
      assigned.forEach((uid) => {
        if (uid && !uids.includes(uid)) uids.push(uid);
      });
    }
  }

  return {
    rw,
    rt,
    currentUid,
    serverUid: effectiveServerUid,
    rtAdminUid,
    accessUids: uids.slice(0, 15),
  };
}

function mergeScopedOwnership(
  existing: CachedDocMeta | null,
  scope: ReturnType<typeof computeScopeMetadata>,
  fallbackOwnerUid: string
) {
  // Prioritize active/assigned UIDs first so 15-entry cap never evicts active devices
  const mergedUids = Array.from(
    new Set([
      ...scope.accessUids,
      existing?.ownerUid || '',
      fallbackOwnerUid,
      ...(existing?.accessUids || []),
    ])
  )
    .filter(Boolean)
    .slice(0, 15);

  return {
    ownerUid: existing?.ownerUid || fallbackOwnerUid,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    accessUids: mergedUids.length > 0 ? mergedUids : [fallbackOwnerUid],
    serverUid: scope.serverUid || existing?.serverUid,
    rtAdminUid: scope.rtAdminUid || existing?.rtAdminUid,
  };
}

function extractRTFromScope(
  scope?: string,
  fallbackRT = DEFAULT_RT,
  allowSemua = false
): string {
  if (!scope || typeof scope !== 'string') return fallbackRT;
  const cleaned = scope.trim();
  if (!cleaned) return fallbackRT;
  if (allowSemua && /^semua(\s+rt)?$/i.test(cleaned)) {
    return 'SEMUA';
  }
  const rtMatch = cleaned.match(/RT\s*0*([0-9]+)/i);
  if (rtMatch) {
    return rtMatch[1].padStart(2, '0').slice(0, 10);
  }
  const numMatch = cleaned.match(/^0*([0-9]+)$/);
  if (numMatch) {
    return numMatch[1].padStart(2, '0').slice(0, 10);
  }
  return fallbackRT;
}

function resolveScopedRtRw(
  rawRt?: string | null,
  rawRw?: string | null,
  rtScopeStr?: string | null,
  ctx?: AdminIdentityContext | null,
  allowSemua = false
): { rt: string; rw: string } {
  if (ctx?.role === 'admin' && ctx.rt && ctx.rt !== 'SEMUA') {
    return {
      rt: normalizeRTCode(ctx.rt) || DEFAULT_RT,
      rw: normalizeRWCode(ctx.rw, DEFAULT_RW),
    };
  }
  const rw = normalizeRWCode(rawRw, ctx?.rw || DEFAULT_RW);
  const fromRt = rawRt ? extractRTFromScope(rawRt, '', allowSemua) : '';
  const fromScope = rtScopeStr ? extractRTFromScope(rtScopeStr, '', allowSemua) : '';
  const fallback =
    ctx?.rt && (ctx.rt !== 'SEMUA' || allowSemua) ? normalizeRTCode(ctx.rt) : DEFAULT_RT;
  return {
    rt: fromRt || fromScope || fallback || DEFAULT_RT,
    rw,
  };
}

// ==========================================
// 1. ROLE / REGISTRY / MANIFEST HELPERS
// ==========================================

const AUTH_HINT_STORAGE_KEY = 'kaswarga_auth_hint_v1';

export function saveAuthSessionHint(uid: string, user: AuthUser): void {
  if (typeof window === 'undefined' || !uid || !user) return;
  try {
    const safeUser: AuthUser = {
      role: user.role,
      username: user.username,
      nama: user.nama,
      rtScope: user.rtScope,
      noKK: user.noKK,
      wargaId: user.wargaId,
      isPinAuthenticated: Boolean(user.isPinAuthenticated),
    };
    window.sessionStorage.setItem(AUTH_HINT_STORAGE_KEY, JSON.stringify({ uid, user: safeUser }));
  } catch {
    // ignore storage errors
  }
}

export function readAuthSessionHint(uid: string): AuthUser | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_HINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid === uid && parsed.user && parsed.user.role) {
      return parsed.user as AuthUser;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function clearAuthSessionHint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(AUTH_HINT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

const inFlightAdminContext = new Map<string, Promise<AdminIdentityContext | null>>();

function isTargetIdCollisionError(error: unknown): boolean {
  const code = String((error as any)?.code || '');
  const msg = String((error as any)?.message || error || '');
  return code === 'already-exists' || /Target ID already exists/i.test(msg);
}

export function refreshAdminContext(uid: string): Promise<AdminIdentityContext | null> {
  const existingPromise = inFlightAdminContext.get(uid);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<AdminIdentityContext | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== uid) return null;

    const adminRef = doc(db, 'admins', uid);
    let adminSnap;
    try {
      adminSnap = isOnlineBrowser()
        ? await getDocFromServer(adminRef).catch(async (err) => {
            if (isTargetIdCollisionError(err)) {
              await new Promise((r) => setTimeout(r, 250));
              return getDocFromServer(adminRef);
            }
            return getDoc(adminRef);
          })
        : await getDoc(adminRef);
    } catch (error) {
      if (isTargetIdCollisionError(error)) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          adminSnap = await getDocFromServer(adminRef);
        } catch (retryErr) {
          handleFirestoreError(retryErr, OperationType.GET, `admins/${uid}`);
        }
      } else {
        handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
      }
    }

    if (!adminSnap.exists()) {
      // Allow Google bootstrapped super admin even if /admins/{uid} hasn't been created yet
      if (
        currentUser.emailVerified &&
        currentUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
      ) {
        const ctx: AdminIdentityContext = {
          uid,
          role: 'server',
          rw: DEFAULT_RW,
          rt: 'SEMUA',
          email: currentUser.email,
          username: DEFAULT_SERVER_USERNAME,
          displayName: currentUser.displayName || 'Super Admin Server RW 05',
          serverUid: uid,
          adminsByRt: {},
        };
        activeAdminContext = ctx;
        return ctx;
      }
      return null;
    }

    const adminData = adminSnap.data();
    if (adminData.status === 'nonaktif') {
      return null;
    }

    const rw = normalizeRWCode(adminData.rw, DEFAULT_RW);
    const role: 'server' | 'admin' = adminData.role === 'server' ? 'server' : 'admin';
    const rt = role === 'server' ? 'SEMUA' : normalizeRTCode(adminData.rt) || DEFAULT_RT;

    let serverUid: string | undefined = role === 'server' ? uid : undefined;
    let adminsByRt: Record<string, string[]> = {};

    const [regSnap, lockSnap] = await Promise.all([
      getDoc(doc(db, 'rtRegistry', `rw_${rw}`)).catch(() => null),
      !serverUid ? getDoc(doc(db, 'systemMeta', 'serverLock')).catch(() => null) : Promise.resolve(null),
    ]);

    if (regSnap && regSnap.exists()) {
      const reg = regSnap.data();
      if (typeof reg.serverUid === 'string' && reg.serverUid) {
        serverUid = reg.serverUid;
      }
      if (reg.adminsByRt && typeof reg.adminsByRt === 'object') {
        adminsByRt = reg.adminsByRt;
      }
    }

    if (!serverUid && lockSnap && lockSnap.exists()) {
      const lockData = lockSnap.data();
      if (typeof lockData.serverUid === 'string' && lockData.serverUid) {
        serverUid = lockData.serverUid;
      }
    }

    if (role === 'admin' && rt !== 'SEMUA') {
      const list = Array.isArray(adminsByRt[rt]) ? adminsByRt[rt] : [];
      if (!list.includes(uid)) {
        adminsByRt = { ...adminsByRt, [rt]: [...list, uid] };
      }
    }

    const ctx: AdminIdentityContext = {
      uid,
      role,
      rw,
      rt,
      email: String(adminData.email || currentUser.email || ''),
      username: String(adminData.username || currentUser.email || 'Admin'),
      displayName: String(adminData.displayName || adminData.username || 'Admin'),
      serverUid,
      adminsByRt,
    };
    activeAdminContext = ctx;
    return ctx;
  })().finally(() => {
    inFlightAdminContext.delete(uid);
  });

  inFlightAdminContext.set(uid, task);
  return task;
}

async function upsertRtRegistry(params: {
  rw: string;
  ownerUid: string;
  serverUid?: string;
  addRt?: string;
  addAdminUid?: string;
}) {
  const rw = normalizeRWCode(params.rw, DEFAULT_RW);
  const { rwId } = buildScopeIds(DEFAULT_RT, rw);
  const regId = rwId;
  const regRef = doc(db, 'rtRegistry', regId);

  let existingSnapExists = false;
  let existing: any = null;
  try {
    const snap = await getDoc(regRef);
    existingSnapExists = snap.exists();
    if (existingSnapExists) existing = snap.data();
  } catch (err) {
    console.warn('upsertRtRegistry read warning:', err);
  }

  const adminsByRt: Record<string, string[]> = { ...(existing?.adminsByRt || {}) };
  const rtSet = new Set<string>(
    Array.isArray(existing?.registeredRts) ? existing.registeredRts : [DEFAULT_RT]
  );

  if (params.addRt && params.addRt !== 'SEMUA') {
    const normRt = extractRTFromScope(params.addRt, '');
    if (normRt) {
      rtSet.add(normRt);
      if (params.addAdminUid) {
        const list = Array.isArray(adminsByRt[normRt]) ? adminsByRt[normRt] : [];
        if (!list.includes(params.addAdminUid)) {
          adminsByRt[normRt] = [...list, params.addAdminUid].slice(0, 10);
        }
      }
    }
  }

  const serverUid = params.serverUid || existing?.serverUid;

  try {
    if (existingSnapExists) {
      const updatePatch = stripUndefinedDeep({
        rwId,
        serverUid,
        adminsByRt,
        registeredRts: Array.from(rtSet).slice(0, 100),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(regRef, updatePatch);
    } else {
      const createPayload = stripUndefinedDeep({
        id: regId,
        rw,
        rwId,
        serverUid,
        adminsByRt,
        registeredRts: Array.from(rtSet).slice(0, 100),
        ownerUid: params.ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(regRef, createPayload);
    }
  } catch (error) {
    reportFirestoreError(error, OperationType.WRITE, `rtRegistry/${regId}`);
  }
}

const manifestLockMap = new Map<string, Promise<void>>();

async function appendDocIdsToManifest(
  rwRaw: string,
  rtRaw: string,
  entries: Partial<Record<EntityBucket, string[]>>
) {
  const ctx = activeAdminContext;
  const uid = auth.currentUser?.uid || ctx?.uid;
  if (!uid || !isOnlineBrowser()) return;

  const rw = normalizeRWCode(rwRaw, ctx?.rw || DEFAULT_RW);
  const rt =
    rtRaw.toUpperCase() === 'SEMUA'
      ? ctx?.rt && ctx.rt !== 'SEMUA'
        ? ctx.rt
        : DEFAULT_RT
      : extractRTFromScope(rtRaw, DEFAULT_RT);

  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scopeId = `rt_${rt}_rw_${rw}`;
  const prevLock = manifestLockMap.get(scopeId) || Promise.resolve();

  const nextLock = prevLock
    .catch(() => {})
    .then(async () => {
      const manifestRef = doc(db, 'rtManifest', scopeId);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(manifestRef);
          const existing = snap.exists() ? snap.data() : null;
          const nextDocIds: Record<string, string[]> = { ...(existing?.docIds || {}) };
          let changed = !existing || existing.rwId !== rwId || existing.rtId !== rtId;

          for (const [bucket, ids] of Object.entries(entries)) {
            if (!ids || ids.length === 0) continue;
            const prevList = Array.isArray(nextDocIds[bucket]) ? nextDocIds[bucket] : [];
            const merged = Array.from(new Set([...prevList, ...ids]));
            if (merged.length !== prevList.length) {
              nextDocIds[bucket] = merged;
              changed = true;
            }
          }

          if (!changed) return;

          if (existing) {
            const updatePatch = stripUndefinedDeep({
              rwId,
              rtId,
              docIds: nextDocIds,
              serverUid: ctx?.serverUid || existing.serverUid,
              updatedAt: serverTimestamp(),
            });
            tx.update(manifestRef, updatePatch);
          } else {
            const createPayload = stripUndefinedDeep({
              id: scopeId,
              rw,
              rt,
              rwId,
              rtId,
              docIds: nextDocIds,
              ownerUid: uid,
              serverUid: ctx?.serverUid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            tx.set(manifestRef, createPayload);
          }
        });
      } catch (err) {
        console.warn('appendDocIdsToManifest warning:', err);
      }
    });

  manifestLockMap.set(scopeId, nextLock);
  await nextLock;
}

async function commitDocAccessPatches(
  updates: Array<{ ref: ReturnType<typeof doc>; path: string; patch: Record<string, any> }>
): Promise<number> {
  if (updates.length === 0) return 0;
  let applied = 0;

  for (let i = 0; i < updates.length; i += 35) {
    const chunk = updates.slice(i, i + 35);
    try {
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.update(item.ref, item.patch);
      }
      await batch.commit();
      applied += chunk.length;
    } catch {
      // Isolate per-doc failures so 1 invalid/locked document never blocks the rest
      const results = await Promise.allSettled(
        chunk.map((item) => updateDoc(item.ref, item.patch))
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          applied++;
        } else {
          console.warn(`ACL patch skipped (${chunk[idx].path}):`, r.reason);
        }
      });
    }
  }

  return applied;
}

const CLAIM_ABLE_COLLECTIONS: EntityBucket[] = [
  'warga',
  'transactions',
  'bantuan',
  'pengumuman',
  'dokumen',
  'adminAccounts',
  'laporanBulanan',
  'settings',
];

const VALID_DOC_ID_RE = /^[a-zA-Z0-9_\-]+$/;

function isNonEmptyStrClient(val: unknown, maxLen: number): val is string {
  return typeof val === 'string' && val.length >= 1 && val.length <= maxLen;
}

function isPatchableEntityDoc(
  colName: EntityBucket,
  id: string,
  data: any,
  ctx: AdminIdentityContext
): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.id !== id || !VALID_DOC_ID_RE.test(id) || id.length > 128) return false;
  if (typeof data.ownerUid !== 'string' || !VALID_DOC_ID_RE.test(data.ownerUid) || data.ownerUid.length > 128) {
    return false;
  }
  if (data.createdAt == null) return false;

  const rawRw = typeof data.rw === 'string' ? data.rw : '';
  const rawRt = typeof data.rt === 'string' ? data.rt : '';
  if (!isNonEmptyStrClient(rawRw, 10) || !isNonEmptyStrClient(rawRt, 10)) return false;

  // Enforce exact rw match against immutable existing().rw unless bootstrapped server email
  const isBootstrappedEmail =
    ctx.role === 'server' && ctx.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
  if (!isBootstrappedEmail && rawRw !== ctx.rw) {
    return false;
  }

  if (ctx.role === 'admin') {
    // Firestore isAssignedAdmin requires exact adminDoc().rw == existing().rw && adminDoc().rt == existing().rt && rt != 'SEMUA'
    if (rawRt === 'SEMUA' || rawRt !== ctx.rt || rawRw !== ctx.rw) return false;
    if (colName === 'adminAccounts' && data.authUid !== ctx.uid) return false;
  }

  // Validate required collection fields before patching so rules never reject malformed legacy docs
  switch (colName) {
    case 'warga':
      return (
        isNonEmptyStrClient(data.nama, 160) &&
        (data.jenisKelamin === 'Laki-laki' || data.jenisKelamin === 'Perempuan') &&
        (data.statusIuran === 'Sudah' || data.statusIuran === 'Belum')
      );
    case 'transactions':
      return (
        isNonEmptyStrClient(data.tanggal, 32) &&
        isNonEmptyStrClient(data.kategori, 120) &&
        typeof data.nominal === 'number' &&
        Number.isFinite(data.nominal) &&
        (data.tipe === 'masuk' || data.tipe === 'keluar' || data.tipe === 'kematian')
      );
    case 'bantuan':
      return (
        isNonEmptyStrClient(data.jenisBantuan, 160) &&
        isNonEmptyStrClient(data.namaPenerima, 160) &&
        ['Sudah Disalurkan', 'Proses Verifikasi', 'Baru Diusulkan', 'Ditolak'].includes(data.status)
      );
    case 'pengumuman':
      return (
        isNonEmptyStrClient(data.judul, 200) &&
        isNonEmptyStrClient(data.isi, 4000) &&
        isNonEmptyStrClient(data.tanggal, 32) &&
        ['Kegiatan', 'Iuran', 'Keamanan', 'Sosial', 'Umum'].includes(data.kategori)
      );
    case 'dokumen':
      return (
        isNonEmptyStrClient(data.judul, 200) &&
        isNonEmptyStrClient(data.namaFile, 200) &&
        isNonEmptyStrClient(data.kategori, 80)
      );
    case 'adminAccounts':
      return (
        isNonEmptyStrClient(data.username, 80) &&
        isNonEmptyStrClient(data.passwordHash, 128) &&
        isNonEmptyStrClient(data.nama, 160) &&
        (data.status === 'aktif' || data.status === 'nonaktif')
      );
    case 'laporanBulanan':
      return (
        isNonEmptyStrClient(data.bulanTahun, 64) &&
        ['Diterima', 'Menunggu Verifikasi', 'Perlu Klarifikasi'].includes(data.statusVerifikasi)
      );
    case 'settings':
      return typeof data.tahunAktif === 'number' && Number.isFinite(data.tahunAktif);
    default:
      return false;
  }
}

function buildAclSyncPatch(params: {
  colName: EntityBucket;
  data: any;
  ctx: AdminIdentityContext;
  effectiveServerUid?: string;
  adminsByRt: Record<string, string[]>;
  includeRtAdminUid: boolean;
}): Record<string, any> | null {
  const { colName, data, ctx, effectiveServerUid, adminsByRt, includeRtAdminUid } = params;
  const rawRw = String(data.rw);
  const rawRt = String(data.rt);
  const normalizedRt =
    rawRt === 'SEMUA' ? 'SEMUA' : extractRTFromScope(rawRt, DEFAULT_RT, true);

  // Only server may normalize mismatched `rt` (e.g. '8' -> '08'); admin RT keeps exact `rawRt`
  const canNormalizeRt = ctx.role === 'server' && normalizedRt !== rawRt;
  const targetRt = canNormalizeRt ? normalizedRt : rawRt;

  // rwId MUST always derive from immutable existing `rw` so isValidRwScope(incoming()) passes
  const expectedRwId = `rw_${rawRw}`;
  const expectedRtId = targetRt === 'SEMUA' ? 'SEMUA' : `rt_${targetRt}`;

  const scopeRtForAdmins =
    normalizedRt === 'SEMUA' ? 'SEMUA' : extractRTFromScope(targetRt, DEFAULT_RT, true);
  const assignedRtUids =
    scopeRtForAdmins === 'SEMUA'
      ? Object.values(adminsByRt || {}).flat()
      : Array.isArray(adminsByRt?.[scopeRtForAdmins])
      ? adminsByRt[scopeRtForAdmins]
      : [];

  const desiredUids = [
    ctx.uid,
    ...(effectiveServerUid ? [effectiveServerUid] : []),
    ...assignedRtUids,
  ].filter(Boolean);

  const currentAccessUids: string[] = Array.isArray(data.accessUids) ? data.accessUids : [];
  const missingUid = desiredUids.some((u) => !currentAccessUids.includes(u));
  const needsServerUid = Boolean(effectiveServerUid && data.serverUid !== effectiveServerUid);
  const needsRtUid =
    includeRtAdminUid &&
    ctx.role === 'admin' &&
    colName !== 'adminAccounts' &&
    colName !== 'settings' &&
    data.rtAdminUid !== ctx.uid;
  const needsScopeIds = data.rwId !== expectedRwId || data.rtId !== expectedRtId || canNormalizeRt;

  if (!missingUid && !needsServerUid && !needsRtUid && !needsScopeIds) {
    return null;
  }

  const nextUids = Array.from(
    new Set([
      ...desiredUids,
      ...(typeof data.ownerUid === 'string' ? [data.ownerUid] : []),
      ...currentAccessUids,
    ])
  )
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .slice(0, 15);

  if (nextUids.length === 0) return null;

  const patch: Record<string, any> = {
    rwId: expectedRwId,
    rtId: expectedRtId,
    accessUids: nextUids,
    updatedAt: serverTimestamp(),
  };

  if (canNormalizeRt) {
    patch.rt = targetRt;
  }
  if (effectiveServerUid) {
    patch.serverUid = effectiveServerUid;
  }
  if (includeRtAdminUid && ctx.role === 'admin' && colName !== 'adminAccounts' && colName !== 'settings') {
    patch.rtAdminUid = ctx.uid;
  }

  return patch;
}

let claimInFlightPromise: Promise<number> | null = null;
let lastClaimCompletedAt = 0;
const CLAIM_COOLDOWN_MS = 30000;

export async function claimAndSyncManifestDocs(options?: { force?: boolean }): Promise<number> {
  const ctx = await ensureAdminContextReady();
  if (!ctx || !auth.currentUser) return 0;

  if (!options?.force) {
    if (claimInFlightPromise) return claimInFlightPromise;
    if (Date.now() - lastClaimCompletedAt < CLAIM_COOLDOWN_MS) return 0;
  }

  const promise = (async () => {
    let updatedCount = 0;
    try {
      const regRef = doc(db, 'rtRegistry', `rw_${ctx.rw}`);
      const regSnap = await getDoc(regRef).catch(() => null);
      const regData = regSnap && regSnap.exists() ? regSnap.data() : null;

      if (ctx.role === 'server' && regData && regData.serverUid !== ctx.uid) {
        await updateDoc(regRef, {
          serverUid: ctx.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else if (ctx.role === 'admin' && ctx.rt !== 'SEMUA') {
        const regAdmins = regData?.adminsByRt?.[ctx.rt];
        if (!regData || !Array.isArray(regAdmins) || !regAdmins.includes(ctx.uid)) {
          await upsertRtRegistry({
            rw: ctx.rw,
            ownerUid: ctx.uid,
            serverUid: ctx.serverUid,
            addRt: ctx.rt,
            addAdminUid: ctx.uid,
          });
        }
      }

      const effectiveAdminsByRt: Record<string, string[]> = {
        ...(regData?.adminsByRt || ctx.adminsByRt || {}),
      };
      const effectiveServerUid =
        (typeof regData?.serverUid === 'string' && regData.serverUid) || ctx.serverUid;

      const rtsToCheck: string[] =
        ctx.role === 'server'
          ? Array.from(
              new Set([
                ...RW05_RT_CODES,
                ...(Array.isArray(regData?.registeredRts) ? regData.registeredRts : []),
                ...Object.keys(effectiveAdminsByRt),
                DEFAULT_RT,
              ])
            )
          : [ctx.rt];

      const updates: Array<{
        ref: ReturnType<typeof doc>;
        path: string;
        patch: Record<string, any>;
      }> = [];
      const seenPaths = new Set<string>();

      const evaluateDocForClaim = (colName: EntityBucket, id: string, data: any) => {
        const docPath = `${colName}/${id}`;
        if (seenPaths.has(docPath)) return;
        seenPaths.add(docPath);
        recordMeta(docPath, { ...data, localCreated: true });

        if (!isPatchableEntityDoc(colName, id, data, ctx)) return;

        const patch = buildAclSyncPatch({
          colName,
          data,
          ctx,
          effectiveServerUid,
          adminsByRt: effectiveAdminsByRt,
          includeRtAdminUid: true,
        });

        if (patch) {
          updates.push({ ref: doc(db, colName, id), path: docPath, patch });
        }
      };

      // 1. Read every doc listed in rtManifest for the assigned RW/RT scope (in parallel per RT)
      await Promise.all(
        rtsToCheck
          .filter((rtCode) => Boolean(rtCode && rtCode !== 'SEMUA'))
          .map(async (rtCode) => {
            const scopeId = `rt_${rtCode}_rw_${ctx.rw}`;
            const manifestSnap = await getDoc(doc(db, 'rtManifest', scopeId)).catch(() => null);
            if (!manifestSnap || !manifestSnap.exists()) return;

            const docIdsMap: Record<string, string[]> = manifestSnap.data().docIds || {};
            const fetches: Promise<void>[] = [];

            for (const [colNameRaw, ids] of Object.entries(docIdsMap)) {
              const colName = colNameRaw as EntityBucket;
              if (!Array.isArray(ids) || !CLAIM_ABLE_COLLECTIONS.includes(colName)) continue;
              for (const id of ids) {
                if (!id) continue;
                fetches.push(
                  getDoc(doc(db, colName, id))
                    .then((snap) => {
                      if (snap.exists()) evaluateDocForClaim(colName, id, snap.data());
                    })
                    .catch(() => {})
                );
              }
            }
            await Promise.all(fetches);
          })
      );

      // 2. Orphan repair: catch docs owned/managed by this UID that may have missed rtManifest or accessUids
      const orphanEntries = new Map<string, Partial<Record<EntityBucket, string[]>>>();
      const recordOrphanManifest = (rtCode: string, colName: EntityBucket, id: string) => {
        if (!rtCode || rtCode === 'SEMUA') return;
        const bucket = orphanEntries.get(rtCode) || {};
        const list = bucket[colName] || [];
        if (!list.includes(id)) list.push(id);
        bucket[colName] = list;
        orphanEntries.set(rtCode, bucket);
      };

      await Promise.all(
        CLAIM_ABLE_COLLECTIONS.map(async (colName) => {
          const queries = [
            query(collection(db, colName), where('ownerUid', '==', ctx.uid)),
            query(collection(db, colName), where('accessUids', 'array-contains', ctx.uid)),
          ];
          for (const qRef of queries) {
            try {
              const snap = await getDocs(qRef);
              snap.forEach((docSnap) => {
                const d = docSnap.data();
                evaluateDocForClaim(colName, docSnap.id, d);
                const dRw = normalizeRWCode(d.rw, ctx.rw);
                const dRt = extractRTFromScope(d.rt, '', true);
                if (dRw === ctx.rw && dRt && dRt !== 'SEMUA') {
                  recordOrphanManifest(dRt, colName, docSnap.id);
                }
              });
            } catch {
              // non-fatal per collection
            }
          }
        })
      );

      updatedCount = await commitDocAccessPatches(updates);

      for (const [rtCode, bucket] of orphanEntries.entries()) {
        await appendDocIdsToManifest(ctx.rw, rtCode, bucket);
      }
      lastClaimCompletedAt = Date.now();
    } catch (err) {
      console.warn('claimAndSyncManifestDocs warning:', err);
    }
    return updatedCount;
  })();

  claimInFlightPromise = promise;
  void promise.finally(() => {
    if (claimInFlightPromise === promise) {
      claimInFlightPromise = null;
    }
  });
  return promise;
}

const reconciledPathsThisSession = new Set<string>();

async function reconcileLoadedDocsWithManifestAndAcls(
  colName: EntityBucket,
  rawDocs: Array<{ id: string; data: Record<string, any> }>
) {
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser || rawDocs.length === 0) return;

  const byRt = new Map<string, string[]>();
  const aclPatches: Array<{
    ref: ReturnType<typeof doc>;
    path: string;
    patch: Record<string, any>;
  }> = [];

  for (const item of rawDocs) {
    const { id, data } = item;
    const docPath = `${colName}/${id}`;
    const rw = normalizeRWCode(data.rw, ctx.rw);
    if (rw !== ctx.rw) continue;

    const rt = data.rt === 'SEMUA' ? 'SEMUA' : extractRTFromScope(data.rt, DEFAULT_RT, true);
    if (rt && rt !== 'SEMUA') {
      const list = byRt.get(rt) || [];
      list.push(id);
      byRt.set(rt, list);
    }

    if (!isPatchableEntityDoc(colName, id, data, ctx)) continue;

    const reconcileKey = `${docPath}:${ctx.uid}:${ctx.serverUid || ''}:${data.rwId || ''}:${data.rtId || ''}:${data.serverUid || ''}:${Array.isArray(data.accessUids) ? data.accessUids.length : 0}`;
    if (reconciledPathsThisSession.has(reconcileKey)) continue;
    reconciledPathsThisSession.add(reconcileKey);

    const patch = buildAclSyncPatch({
      colName,
      data,
      ctx,
      effectiveServerUid: ctx.serverUid,
      adminsByRt: ctx.adminsByRt || {},
      includeRtAdminUid: false,
    });

    if (patch) {
      aclPatches.push({ ref: doc(db, colName, id), path: docPath, patch });
    }
  }

  for (const [rtCode, ids] of byRt.entries()) {
    const manifestKey = `manifest:${colName}:${rtCode}:${ids.length}:${ids[0] || ''}`;
    if (!reconciledPathsThisSession.has(manifestKey)) {
      reconciledPathsThisSession.add(manifestKey);
      await appendDocIdsToManifest(ctx.rw, rtCode, { [colName]: ids });
    }
  }

  if (aclPatches.length > 0) {
    await commitDocAccessPatches(aclPatches);
  }
}

// ==========================================
// 2. FIREBASE AUTHENTICATION & REGISTRATION
// ==========================================

export async function loginWithGoogleServer(): Promise<{
  ok: boolean;
  user?: AuthUser;
  message?: string;
}> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const fbUser = cred.user;
    const email = (fbUser.email || '').toLowerCase();

    const adminRef = doc(db, 'admins', fbUser.uid);
    const existingSnap = await getDoc(adminRef).catch(() => null);

    if (!existingSnap || !existingSnap.exists()) {
      if (email === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified) {
        const { rwId, rtId } = buildScopeIds('SEMUA', DEFAULT_RW);
        await setDoc(adminRef, {
          uid: fbUser.uid,
          email,
          displayName: fbUser.displayName || 'Super Admin Server RW 05',
          username: DEFAULT_SERVER_USERNAME,
          role: 'server',
          rt: 'SEMUA',
          rw: DEFAULT_RW,
          rtId,
          rwId,
          rtScope: 'Semua RT se-RW 05 Glempang',
          status: 'aktif',
          ownerUid: fbUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await upsertRtRegistry({
          rw: DEFAULT_RW,
          ownerUid: fbUser.uid,
          serverUid: fbUser.uid,
        });
      } else {
        await signOut(auth);
        return {
          ok: false,
          message: `Akun Google (${fbUser.email}) belum terdaftar sebagai Server Pusat. Gunakan akun Pengelola Server (${DEFAULT_SERVER_USERNAME}) atau akun Google pemilik terdaftar.`,
        };
      }
    }

    const ctx = await refreshAdminContext(fbUser.uid);
    if (!ctx) {
      await signOut(auth);
      return { ok: false, message: 'Akses admin Google tidak aktif atau ditolak.' };
    }

    void claimAndSyncManifestDocs().catch(() => {});

    const loggedUser: AuthUser = {
      role: ctx.role,
      username: ctx.username,
      nama: ctx.displayName,
      rtScope:
        ctx.role === 'server' ? 'Semua RT se-RW 05 Glempang' : `RT ${ctx.rt} RW ${ctx.rw}`,
      isPinAuthenticated: true,
    };
    saveAuthSessionHint(fbUser.uid, loggedUser);

    return {
      ok: true,
      user: loggedUser,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatFirebaseAuthError(err, 'Gagal login dengan Google.'),
    };
  }
}

export async function loginWithFirebase(params: {
  role: 'server' | 'admin' | 'warga';
  username: string;
  password: string;
}): Promise<{ ok: boolean; user?: AuthUser; message?: string }> {
  const { role, username, password } = params;
  const u = username.trim();
  const p = password.trim();

  try {
    if (role === 'server') {
      const email = toServerEmail(u);
      const isDefaultServerCreds =
        u.toUpperCase() === DEFAULT_SERVER_USERNAME && p === DEFAULT_SERVER_PASSWORD;

      let fbUser: FirebaseUser;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, p);
        fbUser = cred.user;
      } catch (err: any) {
        const code = String(err?.code || '');
        if (
          isDefaultServerCreds &&
          (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
        ) {
          try {
            const cred = await createUserWithEmailAndPassword(auth, email, p);
            fbUser = cred.user;
          } catch (createErr: any) {
            return {
              ok: false,
              message: formatFirebaseAuthError(
                createErr,
                'Gagal masuk sebagai Server Pusat.'
              ),
            };
          }
        } else {
          return {
            ok: false,
            message: formatFirebaseAuthError(
              err,
              'Username atau password Server tidak valid.'
            ),
          };
        }
      }

      const adminRef = doc(db, 'admins', fbUser.uid);
      const adminSnap = await getDoc(adminRef).catch(() => null);

      if (!adminSnap || !adminSnap.exists()) {
        if (!isDefaultServerCreds && email !== BOOTSTRAPPED_ADMIN_EMAIL) {
          await signOut(auth);
          return {
            ok: false,
            message: 'Akun ini tidak terdaftar sebagai pengelola Server Pusat.',
          };
        }

        const lockRef = doc(db, 'systemMeta', 'serverLock');
        const lockSnap = await getDoc(lockRef).catch(() => null);

        if (!lockSnap || !lockSnap.exists()) {
          const digest = await sha256Hex(SERVER_BOOTSTRAP_SEED);
          const { rwId, rtId } = buildScopeIds('SEMUA', DEFAULT_RW);
          const batch = writeBatch(db);
          batch.set(lockRef, {
            id: 'serverLock',
            serverUid: fbUser.uid,
            rw: DEFAULT_RW,
            rwId,
            bootstrapDigest: digest,
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || email,
            displayName: 'Super Admin Server RW 05 Glempang',
            username: DEFAULT_SERVER_USERNAME,
            role: 'server',
            rt: 'SEMUA',
            rw: DEFAULT_RW,
            rtId,
            rwId,
            rtScope: 'Semua RT se-RW 05 Glempang',
            status: 'aktif',
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'rtRegistry', `rw_${DEFAULT_RW}`), {
            id: `rw_${DEFAULT_RW}`,
            rw: DEFAULT_RW,
            rwId,
            serverUid: fbUser.uid,
            adminsByRt: {},
            registeredRts: [DEFAULT_RT],
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } else {
          // Server lock exists under another uid -> bootstrapped admin email only
          const { rwId, rtId } = buildScopeIds('SEMUA', DEFAULT_RW);
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || email,
            displayName: 'Super Admin Server RW 05 Glempang',
            username: DEFAULT_SERVER_USERNAME,
            role: 'server',
            rt: 'SEMUA',
            rw: DEFAULT_RW,
            rtId,
            rwId,
            rtScope: 'Semua RT se-RW 05 Glempang',
            status: 'aktif',
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const ctx = await refreshAdminContext(fbUser.uid);
      if (!ctx || ctx.role !== 'server') {
        await signOut(auth);
        return { ok: false, message: 'Akses Server Pusat ditolak atau belum aktif.' };
      }

      void claimAndSyncManifestDocs().catch(() => {});

      const serverUser: AuthUser = {
        role: 'server',
        username: ctx.username,
        nama: ctx.displayName,
        rtScope: 'Semua RT se-RW 05 Glempang',
        isPinAuthenticated: false,
      };
      saveAuthSessionHint(fbUser.uid, serverUser);

      return {
        ok: true,
        user: serverUser,
      };
    }

    if (role === 'admin') {
      const email = toAdminEmail(u);
      const isDefaultAdminCreds = u.toLowerCase() === 'admin' && p === 'rt08rw05';

      let fbUser: FirebaseUser;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, p);
        fbUser = cred.user;
      } catch (err: any) {
        const code = String(err?.code || '');
        if (
          isDefaultAdminCreds &&
          (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
        ) {
          try {
            const cred = await createUserWithEmailAndPassword(auth, email, p);
            fbUser = cred.user;
          } catch (createErr: any) {
            return {
              ok: false,
              message: formatFirebaseAuthError(
                createErr,
                'Gagal masuk sebagai Admin RT.'
              ),
            };
          }
        } else {
          return {
            ok: false,
            message: formatFirebaseAuthError(
              err,
              `Akun Admin "${u}" tidak ditemukan atau password salah.`
            ),
          };
        }
      }

      const adminRef = doc(db, 'admins', fbUser.uid);
      const adminSnap = await getDoc(adminRef).catch(() => null);

      if (!adminSnap || !adminSnap.exists()) {
        if (isDefaultAdminCreds) {
          const pinDigest = await sha256Hex(DEFAULT_SECURITY_PIN);
          const { rwId, rtId } = buildScopeIds(DEFAULT_RT, DEFAULT_RW);
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || email,
            displayName: 'Bpk. Suwardi (Ketua RT 08)',
            username: 'Admin',
            role: 'admin',
            rt: DEFAULT_RT,
            rw: DEFAULT_RW,
            rtId,
            rwId,
            rtScope: `RT ${DEFAULT_RT} RW ${DEFAULT_RW}`,
            status: 'aktif',
            pinDigest,
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await upsertRtRegistry({
            rw: DEFAULT_RW,
            ownerUid: fbUser.uid,
            addRt: DEFAULT_RT,
            addAdminUid: fbUser.uid,
          });
          const defaultAcc: AdminRTAccount = {
            id: 'adm_rt08',
            username: 'Admin',
            passwordHash: 'rt08rw05',
            nama: 'Bpk. Suwardi (Ketua RT 08)',
            rt: DEFAULT_RT,
            rw: DEFAULT_RW,
            kontak: '0812-3456-7890',
            jabatan: 'Ketua RT 08 RW 05',
            status: 'aktif',
            terakhirLogin: formatWaktuSyncID(),
            terakhirSinkronisasi: `Tersinkron ${formatWaktuSyncID()}`,
          };
          await refreshAdminContext(fbUser.uid);
          await saveAdminAccountDoc(defaultAcc, fbUser.uid);
        } else {
          await signOut(auth);
          return {
            ok: false,
            message:
              'Akun Firebase terdaftar tetapi belum diotorisasi sebagai Pengurus RT. Gunakan tombol Daftarkan & Sinkronkan Akun dengan PIN Pengurus.',
          };
        }
      }

      const ctx = await refreshAdminContext(fbUser.uid);
      if (!ctx) {
        await signOut(auth);
        return {
          ok: false,
          message: 'Akun Admin RT Anda berstatus nonaktif di Server Pusat.',
        };
      }

      void claimAndSyncManifestDocs().catch(() => {});

      // Update last login timestamp on own adminAccounts record if present in background
      const nowLabel = formatWaktuSyncID();
      void (async () => {
        try {
          const ownAccSnap = await getDocs(
            query(collection(db, 'adminAccounts'), where('accessUids', 'array-contains', fbUser.uid))
          );
          for (const docSnap of ownAccSnap.docs) {
            const d = docSnap.data();
            if (d.authUid === fbUser.uid) {
              await updateDoc(docSnap.ref, {
                terakhirLogin: nowLabel,
                terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }
        } catch {
          // non-fatal
        }
      })();

      const adminUser: AuthUser = {
        role: ctx.role,
        username: ctx.username,
        nama: ctx.displayName,
        rtScope: `RT ${ctx.rt} RW ${ctx.rw}`,
        isPinAuthenticated: false,
      };
      saveAuthSessionHint(fbUser.uid, adminUser);

      return {
        ok: true,
        user: adminUser,
      };
    }

    // WARGA (KK) LOGIN
    const noKKDigits = p.replace(/\D/g, '');
    if (noKKDigits.length < 6) {
      return {
        ok: false,
        message: 'Nomor Kartu Keluarga (Password) minimal 6 digit angka (standar 16 digit).',
      };
    }

    const wargaEmail = toWargaEmail(noKKDigits);
    let fbUser: FirebaseUser;
    try {
      const cred = await signInWithEmailAndPassword(auth, wargaEmail, noKKDigits);
      fbUser = cred.user;
    } catch (err: any) {
      return {
        ok: false,
        message: formatFirebaseAuthError(
          err,
          `Data warga dengan No KK ${noKKDigits} belum terdaftar/sinkron di Firebase. Pastikan Admin RT sudah memasukkan data KK Anda dan sinkron ke cloud.`
        ),
      };
    }

    const q = query(collection(db, 'warga'), where('linkedUid', '==', fbUser.uid));
    let wargaSnap;
    try {
      wargaSnap = await getDocs(q);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'warga');
    }

    if (wargaSnap.empty) {
      await signOut(auth);
      return {
        ok: false,
        message: 'Profil KK Warga belum tertaut di Cloud Firestore. Hubungi Admin RT Anda.',
      };
    }

    const matchedDoc = wargaSnap.docs[0].data() as Warga & { rt: string; rw: string };
    const enteredName = normalizePersonName(u);
    const storedHeadName = normalizePersonName(matchedDoc.nama);
    const headMemberName = Array.isArray(matchedDoc.anggotaKeluarga)
      ? normalizePersonName(
          matchedDoc.anggotaKeluarga.find((m) => m?.hubungan === 'Kepala Keluarga')?.nama
        )
      : '';
    if (
      enteredName &&
      storedHeadName &&
      enteredName !== storedHeadName &&
      (!headMemberName || enteredName !== headMemberName)
    ) {
      await signOut(auth);
      return {
        ok: false,
        message: `Nama Kepala Keluarga "${u}" tidak cocok dengan data No KK tersebut.`,
      };
    }

    const rt = normalizeRTCode(matchedDoc.rt) || DEFAULT_RT;
    const rw = normalizeRWCode(matchedDoc.rw, DEFAULT_RW);

    const wargaUser: AuthUser = {
      role: 'warga',
      username: matchedDoc.nama,
      nama: matchedDoc.nama,
      noKK: matchedDoc.noKK,
      wargaId: matchedDoc.id,
      rtScope: `RT ${rt} RW ${rw}`,
      isPinAuthenticated: false,
    };
    saveAuthSessionHint(fbUser.uid, wargaUser);

    return {
      ok: true,
      user: wargaUser,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatFirebaseAuthError(err, 'Gagal terhubung ke layanan Firebase.'),
    };
  }
}

export async function registerAndSyncAdminWithFirebase(params: {
  account: AdminRTAccount;
  securityPin: string;
  legacyData?: AppDatabaseSchema | null;
}): Promise<{
  ok: boolean;
  message?: string;
  migrationOk?: boolean;
  account?: AdminRTAccount;
  user?: AuthUser;
}> {
  const { account, securityPin, legacyData } = params;
  const username = account.username.trim();
  const password = account.passwordHash.trim();
  const pin = securityPin.trim();

  if (!username || password.length < 6) {
    return {
      ok: false,
      message: 'Username dan password (minimal 6 karakter) wajib diisi.',
    };
  }
  if (!/^\d{6}$/.test(pin)) {
    return {
      ok: false,
      message: 'PIN Keamanan Pengurus 6 digit wajib diisi (contoh awal: 123456).',
    };
  }

  const email = toAdminEmail(username);
  const rt = normalizeRTCode(account.rt) || DEFAULT_RT;
  const rw = normalizeRWCode(account.rw, DEFAULT_RW);

  try {
    let fbUser: FirebaseUser;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      fbUser = cred.user;
    } catch (err: any) {
      if (String(err?.code || '') === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        fbUser = cred.user;
      } else {
        return {
          ok: false,
          message: formatFirebaseAuthError(err, 'Gagal mendaftarkan akun Admin ke Firebase Auth.'),
        };
      }
    }

    const adminRef = doc(db, 'admins', fbUser.uid);
    const existingAdminSnap = await getDoc(adminRef).catch(() => null);
    if (!existingAdminSnap || !existingAdminSnap.exists()) {
      const pinDigest = await sha256Hex(pin);
      const { rwId, rtId } = buildScopeIds(rt, rw);
      await setDoc(adminRef, {
        uid: fbUser.uid,
        email: fbUser.email || email,
        displayName: account.nama,
        username,
        role: 'admin',
        rt,
        rw,
        rtId,
        rwId,
        rtScope: `RT ${rt} RW ${rw}`,
        status: 'aktif',
        pinDigest,
        ownerUid: fbUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await upsertRtRegistry({
      rw,
      ownerUid: fbUser.uid,
      addRt: rt,
      addAdminUid: fbUser.uid,
    });

    await refreshAdminContext(fbUser.uid);

    const nowLabel = formatWaktuSyncID();
    const savedAccount: AdminRTAccount = {
      ...account,
      id: toValidDocId(account.id, 'adm'),
      username,
      passwordHash: password,
      rt,
      rw,
      status: 'aktif',
      terakhirLogin: nowLabel,
      terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
      updatedAt: new Date().toISOString(),
    };

    await saveAdminAccountDoc(savedAccount, fbUser.uid);

    let migrationOk = true;
    const hasLegacyRecords = Boolean(
      legacyData &&
        ((legacyData.wargaList?.length || 0) > 0 ||
          (legacyData.transactions?.length || 0) > 0 ||
          (legacyData.bantuanList?.length || 0) > 0 ||
          (legacyData.pengumumanList?.length || 0) > 0 ||
          (legacyData.dokumenList?.length || 0) > 0 ||
          (legacyData.laporanBulananRT?.length || 0) > 0)
    );
    if (legacyData && hasLegacyRecords) {
      const migRes = await migrateMissingSnapshotToFirestore(legacyData, null, false);
      migrationOk = migRes.ok;
    }

    void claimAndSyncManifestDocs().catch(() => {});

    const regUser: AuthUser = {
      role: 'admin',
      username: savedAccount.username,
      nama: savedAccount.nama,
      rtScope: `RT ${rt} RW ${rw}`,
      isPinAuthenticated: false,
    };
    saveAuthSessionHint(fbUser.uid, regUser);

    return {
      ok: true,
      migrationOk,
      account: savedAccount,
      user: regUser,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: formatFirebaseAuthError(
        err,
        'Gagal memverifikasi PIN Pengurus atau menyimpan akun Admin ke Firestore.'
      ),
    };
  }
}

export async function resolveCurrentFirebaseUser(
  fbUser: FirebaseUser | null
): Promise<AuthUser | null> {
  if (!fbUser) {
    activeAdminContext = null;
    clearAuthSessionHint();
    return null;
  }

  // 1. Check /admins/{uid}
  const ctx = await refreshAdminContext(fbUser.uid);
  if (ctx) {
    // Claim RT/RW docs asynchronously in background so boot & login never stall
    void claimAndSyncManifestDocs().catch(() => {});
    const resolved: AuthUser = {
      role: ctx.role,
      username: ctx.username,
      nama: ctx.displayName,
      rtScope:
        ctx.role === 'server' ? 'Semua RT se-RW 05 Glempang' : `RT ${ctx.rt} RW ${ctx.rw}`,
      isPinAuthenticated: false,
    };
    saveAuthSessionHint(fbUser.uid, resolved);
    return resolved;
  }

  // 2. Check /wargaProfiles/{uid} + /warga
  try {
    const profSnap = await getDoc(doc(db, 'wargaProfiles', fbUser.uid));
    if (profSnap.exists()) {
      const p = profSnap.data();
      const resolvedWarga: AuthUser = {
        role: 'warga',
        username: String(p.nama || 'Warga'),
        nama: String(p.nama || 'Warga'),
        noKK: String(p.noKK || ''),
        wargaId: String(p.wargaId || ''),
        rtScope: `RT ${normalizeRTCode(p.rt) || DEFAULT_RT} RW ${normalizeRWCode(p.rw, DEFAULT_RW)}`,
        isPinAuthenticated: false,
      };
      saveAuthSessionHint(fbUser.uid, resolvedWarga);
      return resolvedWarga;
    }

    const q = query(collection(db, 'warga'), where('linkedUid', '==', fbUser.uid));
    const wSnap = await getDocs(q);
    if (!wSnap.empty) {
      const w = wSnap.docs[0].data() as Warga;
      const resolvedWarga: AuthUser = {
        role: 'warga',
        username: w.nama,
        nama: w.nama,
        noKK: w.noKK,
        wargaId: w.id,
        rtScope: `RT ${normalizeRTCode(w.rt) || DEFAULT_RT} RW ${normalizeRWCode(w.rw, DEFAULT_RW)}`,
        isPinAuthenticated: false,
      };
      saveAuthSessionHint(fbUser.uid, resolvedWarga);
      return resolvedWarga;
    }
  } catch {
    // ignore unresolved profile
  }

  clearAuthSessionHint();
  return null;
}

export async function logoutFromFirebase(): Promise<void> {
  if (activeSubscriptionCleanup) {
    activeSubscriptionCleanup();
    activeSubscriptionCleanup = null;
  }
  activeAdminContext = null;
  activePendingWriteCount = 0;
  latestAsyncWriteError = null;
  claimInFlightPromise = null;
  lastClaimCompletedAt = 0;
  clearAuthSessionHint();
  docMetaCache.clear();
  reconciledPathsThisSession.clear();
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}

// ==========================================
// 3. PROVISIONING SECONDARY AUTH FOR ADMIN RT & WARGA
// ==========================================

export async function provisionAdminAuthAccount(
  account: AdminRTAccount,
  oldPassword?: string
): Promise<{ authUid?: string; error?: string }> {
  const ctx = await ensureAdminContextReady();
  if (!ctx || !auth.currentUser) return { error: 'Harus login sebagai Server Pusat.' };

  const username = account.username.trim();
  const password = account.passwordHash.trim();
  if (!username || password.length < 6) {
    return { error: 'Password Admin RT minimal 6 karakter untuk Firebase Auth.' };
  }

  const email = toAdminEmail(username);
  const rt = normalizeRTCode(account.rt) || DEFAULT_RT;
  const rw = normalizeRWCode(account.rw, ctx.rw || DEFAULT_RW);

  try {
    const secAuth = await getSecondaryAuth();
    let targetUid = '';

    try {
      const created = await createUserWithEmailAndPassword(secAuth, email, password);
      targetUid = created.user.uid;
    } catch (err: any) {
      if (String(err?.code || '') === 'auth/email-already-in-use') {
        const loginPass = oldPassword && oldPassword.trim().length >= 6 ? oldPassword.trim() : password;
        try {
          const signed = await signInWithEmailAndPassword(secAuth, email, loginPass);
          targetUid = signed.user.uid;
          if (loginPass !== password) {
            await updatePassword(signed.user, password).catch(() => {});
          }
        } catch {
          // Try with new password just in case
          const signed2 = await signInWithEmailAndPassword(secAuth, email, password).catch(() => null);
          if (signed2) targetUid = signed2.user.uid;
        }
      } else {
        return { error: formatFirebaseAuthError(err, 'Gagal membuat akun Auth Admin RT.') };
      }
    } finally {
      await signOut(secAuth).catch(() => {});
    }

    if (targetUid) {
      const adminRef = doc(db, 'admins', targetUid);
      const existingSnap = await getDoc(adminRef).catch(() => null);
      const { rwId, rtId } = buildScopeIds(rt, rw);
      try {
        if (existingSnap && existingSnap.exists()) {
          await updateDoc(adminRef, {
            email,
            displayName: account.nama,
            username,
            role: 'admin',
            rt,
            rtId,
            rwId,
            rtScope: `RT ${rt} RW ${rw}`,
            status: account.status === 'nonaktif' ? 'nonaktif' : 'aktif',
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(adminRef, {
            uid: targetUid,
            email,
            displayName: account.nama,
            username,
            role: 'admin',
            rt,
            rw,
            rtId,
            rwId,
            rtScope: `RT ${rt} RW ${rw}`,
            status: account.status === 'nonaktif' ? 'nonaktif' : 'aktif',
            ownerUid: ctx.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (writeErr: any) {
        reportFirestoreError(writeErr, OperationType.WRITE, `admins/${targetUid}`);
        return { error: formatFirebaseAuthError(writeErr, 'Gagal menyimpan otorisasi admin RT di Firestore.') };
      }

      await upsertRtRegistry({
        rw,
        ownerUid: ctx.uid,
        serverUid: ctx.serverUid,
        addRt: rt,
        addAdminUid: targetUid,
      });

      await refreshAdminContext(ctx.uid);
    }

    return { authUid: targetUid || undefined };
  } catch (err: any) {
    return { error: formatFirebaseAuthError(err, 'Gagal memproses akun Admin RT.') };
  }
}

let wargaProvisioningActive = false;
const failedProvisionAttemptIds = new Set<string>();

export async function provisionWargaAuthAccounts(
  wargaList: Array<Warga & { linkedUid?: string }>
): Promise<number> {
  const ctx = await ensureAdminContextReady();
  if (!ctx || !auth.currentUser || wargaProvisioningActive) return 0;

  const candidates = wargaList.filter((w) => {
    const digits = String(w.noKK || '').replace(/\D/g, '');
    const wId = toValidDocId(w.id, 'w');
    return digits.length >= 6 && !w.linkedUid && !failedProvisionAttemptIds.has(wId);
  });

  if (candidates.length === 0) return 0;
  wargaProvisioningActive = true;
  let provisionedCount = 0;

  try {
    const secAuth = await getSecondaryAuth();

    for (const w of candidates) {
      const noKKDigits = String(w.noKK || '').replace(/\D/g, '');
      const email = toWargaEmail(noKKDigits);
      const wargaId = toValidDocId(w.id, 'w');
      let wargaUid = '';

      try {
        const created = await createUserWithEmailAndPassword(secAuth, email, noKKDigits);
        wargaUid = created.user.uid;
      } catch (err: any) {
        const code = String(err?.code || '');
        if (code === 'auth/email-already-in-use') {
          const signed = await signInWithEmailAndPassword(secAuth, email, noKKDigits).catch(
            () => null
          );
          if (signed) wargaUid = signed.user.uid;
        } else if (code === 'auth/operation-not-allowed' || code === 'auth/too-many-requests') {
          break;
        }
      }

      if (!wargaUid) {
        failedProvisionAttemptIds.add(wargaId);
        continue;
      }

      const rt = normalizeRTCode(w.rt) || DEFAULT_RT;
      const rw = normalizeRWCode(w.rw, ctx.rw || DEFAULT_RW);
      const { rwId, rtId } = buildScopeIds(rt, rw);

      try {
        const profileRef = doc(db, 'wargaProfiles', wargaUid);
        const existingProfile = await getDoc(profileRef).catch(() => null);
        if (existingProfile && existingProfile.exists()) {
          const pData = existingProfile.data();
          const needsProfileUpdate =
            pData.wargaId !== wargaId ||
            pData.noKK !== w.noKK ||
            pData.nama !== w.nama ||
            pData.rt !== rt ||
            pData.rw !== rw ||
            pData.rtId !== rtId ||
            pData.rwId !== rwId ||
            (ctx.serverUid && pData.serverUid !== ctx.serverUid);
          if (needsProfileUpdate && pData.rw === rw) {
            await updateDoc(
              profileRef,
              stripUndefinedDeep({
                wargaId,
                noKK: w.noKK,
                nama: w.nama,
                rt,
                rw,
                rtId,
                rwId,
                ...(ctx.serverUid ? { serverUid: ctx.serverUid } : {}),
                updatedAt: serverTimestamp(),
              })
            );
          }
        } else {
          await setDoc(
            profileRef,
            stripUndefinedDeep({
              uid: wargaUid,
              wargaId,
              noKK: w.noKK,
              nama: w.nama,
              rt,
              rw,
              rtId,
              rwId,
              ownerUid: ctx.uid,
              ...(ctx.serverUid ? { serverUid: ctx.serverUid } : {}),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        }

        const wargaRef = doc(db, 'warga', wargaId);
        await updateDoc(wargaRef, {
          linkedUid: wargaUid,
          updatedAt: serverTimestamp(),
        });
        recordMeta(`warga/${wargaId}`, { linkedUid: wargaUid, rt, rw, rwId, rtId });
        provisionedCount++;
      } catch (linkErr) {
        failedProvisionAttemptIds.add(wargaId);
        console.warn(`provisionWargaAuthAccounts skipped (${wargaId}):`, linkErr);
      }

      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    await signOut(secAuth).catch(() => {});
  } catch (err) {
    console.warn('provisionWargaAuthAccounts warning:', err);
  } finally {
    wargaProvisioningActive = false;
  }

  return provisionedCount;
}

// ==========================================
// 4. SANITIZED FIRESTORE PAYLOAD BUILDERS
// ==========================================

export function buildWargaFirestorePayload(
  w: Warga & { linkedUid?: string },
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(w.id, 'w');
  const { rt, rw } = resolveScopedRtRw(w.rt, w.rw, null, ctx, false);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const anggotaKeluarga = Array.isArray(w.anggotaKeluarga)
    ? w.anggotaKeluarga
        .filter((a) => isPlainObject(a))
        .slice(0, 30)
        .map((a) => stripUndefinedDeep({ ...a }))
    : undefined;

  const riwayatPerubahanKK = Array.isArray(w.riwayatPerubahanKK)
    ? w.riwayatPerubahanKK
        .filter((r) => isPlainObject(r))
        .slice(0, 50)
        .map((r) => stripUndefinedDeep({ ...r }))
    : undefined;

  return stripUndefinedDeep({
    id,
    no: toFiniteNumberOrUndefined(w.no),
    nama: String(w.nama || 'Warga').trim().slice(0, 160) || 'Warga',
    noKK: w.noKK ? String(w.noKK).slice(0, 32) : undefined,
    nik: w.nik ? String(w.nik).slice(0, 32) : undefined,
    noRumah: String(w.noRumah || '-').slice(0, 32),
    rt,
    rw,
    rtId,
    rwId,
    alamat: w.alamat ? String(w.alamat).slice(0, 300) : undefined,
    kodePos: w.kodePos ? String(w.kodePos).slice(0, 12) : undefined,
    tanggalDikeluarkan: w.tanggalDikeluarkan ? String(w.tanggalDikeluarkan).slice(0, 32) : undefined,
    jenisKelamin: w.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    jumlahJiwa: toFiniteNumberOrDefault(w.jumlahJiwa, anggotaKeluarga?.length || 1),
    statusIuran: w.statusIuran === 'Sudah' ? 'Sudah' : 'Belum',
    anggotaKeluarga,
    telepon: w.telepon ? String(w.telepon).slice(0, 32) : undefined,
    pin: w.pin ? String(w.pin).slice(0, 12) : undefined,
    pinAttempts: toFiniteNumberOrUndefined(w.pinAttempts),
    pinLockedUntil: toFiniteNumberOrUndefined(w.pinLockedUntil),
    riwayatIuran: toPlainMapOrUndefined(w.riwayatIuran),
    riwayatKematian: toPlainMapOrUndefined(w.riwayatKematian),
    statusIuranPerTahun: toPlainMapOrUndefined(w.statusIuranPerTahun),
    riwayatIuranPerTahun: toPlainMapOrUndefined(w.riwayatIuranPerTahun),
    riwayatKematianPerTahun: toPlainMapOrUndefined(w.riwayatKematianPerTahun),
    iuranUmumTerbayar: toFiniteNumberOrUndefined(w.iuranUmumTerbayar),
    iuranKematianTerbayar: toFiniteNumberOrUndefined(w.iuranKematianTerbayar),
    pilihanSkema:
      w.pilihanSkema === 'bulanan' || w.pilihanSkema === 'tahunan' ? w.pilihanSkema : undefined,
    riwayatPerubahanKK,
    linkedUid: w.linkedUid || existing?.linkedUid,
    ...meta,
  });
}

export function buildTransactionFirestorePayload(
  tx: Transaction,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(tx.id, 'tx');
  const { rt, rw } = resolveScopedRtRw(null, null, tx.rtScope, ctx, false);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  return stripUndefinedDeep({
    id,
    tanggal: String(tx.tanggal || new Date().toISOString().split('T')[0]).slice(0, 32) || new Date().toISOString().split('T')[0],
    kategori: String(tx.kategori || 'Kas Umum').slice(0, 120) || 'Kas Umum',
    keterangan: String(tx.keterangan || '-').slice(0, 500),
    nominal: toFiniteNumberOrDefault(tx.nominal, 0),
    tipe: tx.tipe === 'keluar' || tx.tipe === 'kematian' ? tx.tipe : 'masuk',
    residentId: tx.residentId ? String(tx.residentId).slice(0, 128) : undefined,
    namaWarga: tx.namaWarga ? String(tx.namaWarga).slice(0, 160) : undefined,
    nomorRumah: tx.nomorRumah ? String(tx.nomorRumah).slice(0, 32) : undefined,
    noKK: tx.noKK ? String(tx.noKK).slice(0, 32) : undefined,
    isSaldoAwal: typeof tx.isSaldoAwal === 'boolean' ? tx.isSaldoAwal : undefined,
    tahun: toFiniteNumberOrUndefined(tx.tahun),
    rt,
    rw,
    rtId,
    rwId,
    rtScope: String(tx.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
    ...meta,
  });
}

export function buildBantuanFirestorePayload(
  b: BantuanPemerintah,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(b.id, 'b');
  const { rt, rw } = resolveScopedRtRw(null, null, b.rtScope, ctx, false);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const validStatus =
    b.status === 'Sudah Disalurkan' ||
    b.status === 'Proses Verifikasi' ||
    b.status === 'Baru Diusulkan' ||
    b.status === 'Ditolak'
      ? b.status
      : 'Baru Diusulkan';

  return stripUndefinedDeep({
    id,
    jenisBantuan: String(b.jenisBantuan || 'Bantuan Sosial').slice(0, 160) || 'Bantuan Sosial',
    namaPenerima: String(b.namaPenerima || 'Warga').slice(0, 160) || 'Warga',
    noKK: b.noKK ? String(b.noKK).slice(0, 32) : undefined,
    nik: b.nik ? String(b.nik).slice(0, 32) : undefined,
    nominalAtauBarang: b.nominalAtauBarang ? String(b.nominalAtauBarang).slice(0, 200) : undefined,
    tanggal: b.tanggal ? String(b.tanggal).slice(0, 32) : undefined,
    status: validStatus,
    sumberDana: b.sumberDana ? String(b.sumberDana).slice(0, 160) : undefined,
    keterangan: b.keterangan ? String(b.keterangan).slice(0, 400) : undefined,
    rt,
    rw,
    rtId,
    rwId,
    rtScope: String(b.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
    ...meta,
  });
}

export function buildPengumumanFirestorePayload(
  p: PengumumanRT,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(p.id, 'p');
  const { rt, rw } = resolveScopedRtRw(
    null,
    null,
    p.rtScope,
    ctx,
    ctx?.role === 'server'
  );
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const validKategori =
    p.kategori === 'Kegiatan' ||
    p.kategori === 'Iuran' ||
    p.kategori === 'Keamanan' ||
    p.kategori === 'Sosial' ||
    p.kategori === 'Umum'
      ? p.kategori
      : 'Umum';

  return stripUndefinedDeep({
    id,
    judul: String(p.judul || 'Pengumuman RT').slice(0, 200) || 'Pengumuman RT',
    isi: String(p.isi || '-').slice(0, 4000) || '-',
    kategori: validKategori,
    tanggal: String(p.tanggal || new Date().toISOString().split('T')[0]).slice(0, 32) || new Date().toISOString().split('T')[0],
    tanggalBerakhir: p.tanggalBerakhir ? String(p.tanggalBerakhir).slice(0, 32) : undefined,
    penulis: p.penulis ? String(p.penulis).slice(0, 120) : undefined,
    namaPengurus: p.namaPengurus ? String(p.namaPengurus).slice(0, 120) : undefined,
    jabatanPengurus: p.jabatanPengurus ? String(p.jabatanPengurus).slice(0, 120) : undefined,
    penting: typeof p.penting === 'boolean' ? p.penting : undefined,
    tentang: p.tentang ? String(p.tentang).slice(0, 200) : undefined,
    hariTanggalAcara: p.hariTanggalAcara ? String(p.hariTanggalAcara).slice(0, 120) : undefined,
    waktuAcara: p.waktuAcara ? String(p.waktuAcara).slice(0, 80) : undefined,
    tempatAcara: p.tempatAcara ? String(p.tempatAcara).slice(0, 200) : undefined,
    keteranganTambahan: p.keteranganTambahan
      ? String(p.keteranganTambahan).slice(0, 500)
      : undefined,
    rt,
    rw,
    rtId,
    rwId,
    rtScope: String(p.rtScope || (rt === 'SEMUA' ? 'Semua RT' : `RT ${rt} RW ${rw}`)).slice(0, 64),
    ...meta,
  });
}

export function buildDokumenFirestorePayload(
  d: DokumenPdfWarga,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(d.id, 'doc');
  const { rt, rw } = resolveScopedRtRw(null, null, d.rtScope, ctx, false);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  return stripUndefinedDeep({
    id,
    judul: String(d.judul || 'Dokumen RT').slice(0, 200) || 'Dokumen RT',
    namaFile: String(d.namaFile || 'dokumen.pdf').slice(0, 200) || 'dokumen.pdf',
    ukuranKb: toFiniteNumberOrUndefined(d.ukuranKb),
    tanggalUpload: d.tanggalUpload ? String(d.tanggalUpload).slice(0, 32) : undefined,
    kategori: String(d.kategori || 'Arsip RT').slice(0, 80) || 'Arsip RT',
    keterangan: d.keterangan ? String(d.keterangan).slice(0, 300) : undefined,
    dataBase64: d.dataBase64 ? String(d.dataBase64).slice(0, 850000) : undefined,
    rt,
    rw,
    rtId,
    rwId,
    rtScope: String(d.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
    ...meta,
  });
}

export function buildAdminAccountFirestorePayload(
  acc: AdminRTAccount & { authUid?: string },
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null,
  fallbackAuthUid?: string
) {
  const uid = auth.currentUser?.uid || ctx?.uid || fallbackAuthUid || 'system';
  const id = toValidDocId(acc.id, 'adm');
  const rt =
    ctx?.role === 'admin' && ctx.rt !== 'SEMUA'
      ? ctx.rt
      : extractRTFromScope(acc.rt, DEFAULT_RT);
  const rw = normalizeRWCode(acc.rw, ctx?.rw || DEFAULT_RW);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const resolvedAuthUid =
    acc.authUid || fallbackAuthUid || (ctx?.role === 'admin' ? auth.currentUser?.uid || ctx.uid : undefined);
  if (resolvedAuthUid && !meta.accessUids.includes(resolvedAuthUid)) {
    meta.accessUids = [resolvedAuthUid, ...meta.accessUids].slice(0, 15);
  }

  return stripUndefinedDeep({
    id,
    username: String(acc.username || 'Admin').slice(0, 80) || 'Admin',
    passwordHash: String(acc.passwordHash || 'rt08rw05').slice(0, 128) || 'rt08rw05',
    nama: String(acc.nama || `Admin RT ${rt}`).slice(0, 160) || `Admin RT ${rt}`,
    rt,
    rw,
    rtId,
    rwId,
    kontak: acc.kontak ? String(acc.kontak).slice(0, 40) : undefined,
    jabatan: acc.jabatan ? String(acc.jabatan).slice(0, 120) : undefined,
    status: acc.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    terakhirLogin: acc.terakhirLogin ? String(acc.terakhirLogin).slice(0, 64) : undefined,
    terakhirSinkronisasi: acc.terakhirSinkronisasi
      ? String(acc.terakhirSinkronisasi).slice(0, 64)
      : undefined,
    authUid: resolvedAuthUid,
    ...meta,
  });
}

export function buildLaporanFirestorePayload(
  lap: PembaruanBulananRT,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(lap.id, 'lap');
  const { rt, rw } = resolveScopedRtRw(lap.rt, lap.rw, null, ctx, false);
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const validStatus =
    lap.statusVerifikasi === 'Diterima' ||
    lap.statusVerifikasi === 'Menunggu Verifikasi' ||
    lap.statusVerifikasi === 'Perlu Klarifikasi'
      ? lap.statusVerifikasi
      : 'Menunggu Verifikasi';

  return stripUndefinedDeep({
    id,
    rt,
    rw,
    rtId,
    rwId,
    namaAdminPengirim: lap.namaAdminPengirim ? String(lap.namaAdminPengirim).slice(0, 160) : undefined,
    tanggalKirim: lap.tanggalKirim ? String(lap.tanggalKirim).slice(0, 32) : undefined,
    bulanTahun: String(lap.bulanTahun || '-').slice(0, 64) || '-',
    tahun: toFiniteNumberOrUndefined(lap.tahun),
    totalKK: toFiniteNumberOrUndefined(lap.totalKK),
    totalJiwa: toFiniteNumberOrUndefined(lap.totalJiwa),
    totalLunasIuran: toFiniteNumberOrUndefined(lap.totalLunasIuran),
    totalBelumLunas: toFiniteNumberOrUndefined(lap.totalBelumLunas),
    totalKasMasukBulanIni: toFiniteNumberOrUndefined(lap.totalKasMasukBulanIni),
    totalKasKeluarBulanIni: toFiniteNumberOrUndefined(lap.totalKasKeluarBulanIni),
    saldoKasUmumBerjalan: toFiniteNumberOrUndefined(lap.saldoKasUmumBerjalan),
    saldoKasKematianBerjalan: toFiniteNumberOrUndefined(lap.saldoKasKematianBerjalan),
    totalPenerimaBansos: toFiniteNumberOrUndefined(lap.totalPenerimaBansos),
    catatanKhusus: lap.catatanKhusus ? String(lap.catatanKhusus).slice(0, 500) : undefined,
    statusVerifikasi: validStatus,
    ...meta,
  });
}

export function buildSettingsFirestorePayload(
  pengaturanKas: PengaturanKas,
  tahunAktif: number,
  settingId: string,
  rt: string,
  rw: string,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const { updatedAt: _dropStringUpdatedAt, ...cleanSettings } = pengaturanKas;
  return stripUndefinedDeep({
    id: settingId,
    rw,
    rt,
    rtId,
    rwId,
    tahunAktif: toFiniteNumberOrDefault(tahunAktif, toFiniteNumberOrDefault(pengaturanKas.tahunAktif, 2026)),
    nominalJimpitanTahunan: toFiniteNumberOrUndefined(cleanSettings.nominalJimpitanTahunan),
    nominalJimpitanBulanan: toFiniteNumberOrUndefined(cleanSettings.nominalJimpitanBulanan),
    nominalKematianTahunan: toFiniteNumberOrUndefined(cleanSettings.nominalKematianTahunan),
    nominalKematianBulanan: toFiniteNumberOrUndefined(cleanSettings.nominalKematianBulanan),
    saldoAwalKasUmum: toFiniteNumberOrUndefined(cleanSettings.saldoAwalKasUmum),
    saldoAwalKasKematian: toFiniteNumberOrUndefined(cleanSettings.saldoAwalKasKematian),
    keteranganSaldoAwal: cleanSettings.keteranganSaldoAwal
      ? String(cleanSettings.keteranganSaldoAwal).slice(0, 300)
      : undefined,
    tanggalSaldoAwal: cleanSettings.tanggalSaldoAwal
      ? String(cleanSettings.tanggalSaldoAwal).slice(0, 32)
      : undefined,
    kontakKetuaRT: toPlainMapOrUndefined(cleanSettings.kontakKetuaRT),
    kontakBendahara: toPlainMapOrUndefined(cleanSettings.kontakBendahara),
    saldoBerlanjutPerTahun: toPlainMapOrUndefined(cleanSettings.saldoBerlanjutPerTahun),
    profilRT: toPlainMapOrUndefined(cleanSettings.profilRT),
    ...meta,
  });
}

// ==========================================
// 5. DIRECT FIRESTORE CRUD & PUBLIC SUMMARY SYNC
// ==========================================

async function saveScopedEntityDoc(
  colName: EntityBucket,
  id: string,
  payload: Record<string, any>,
  existing: CachedDocMeta | null,
  onAcked?: () => Promise<void> | void
): Promise<FirestoreWriteResult> {
  const path = `${colName}/${id}`;
  const docRef = doc(db, colName, id);
  const isUpdate = Boolean(existing && (existing.serverConfirmed || existing.ownerUid || existing.localCreated));
  const prevMeta = docMetaCache.get(path);

  // Optimistically cache metadata so offline follow-up edits update cleanly instead of re-creating
  recordMeta(path, { ...payload, localCreated: true });

  const recoverWithServerState = async (err: any) => {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    if (
      isOnlineBrowser() &&
      (code === 'not-found' ||
        code === 'permission-denied' ||
        /missing or insufficient permissions/i.test(msg))
    ) {
      const serverSnap = await getDocFromServer(docRef).catch(() => null);
      if (serverSnap && !serverSnap.exists()) {
        const currentUid = auth.currentUser?.uid || activeAdminContext?.uid || payload.ownerUid;
        const createPayload = {
          ...payload,
          ownerUid: currentUid,
          accessUids: Array.from(
            new Set([
              currentUid,
              ...(Array.isArray(payload.accessUids) ? payload.accessUids : []),
            ])
          ).slice(0, 15),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, createPayload);
        recordMeta(path, { ...createPayload, localCreated: true }, { serverConfirmed: true });
        return true;
      }
      if (serverSnap && serverSnap.exists()) {
        const serverData = serverSnap.data();
        recordMeta(path, { ...serverData, localCreated: true }, { serverConfirmed: true });
        const refreshedMeta = docMetaCache.get(path) || null;
        const refreshedPatch = buildEntityUpdatePatch(
          colName,
          payload,
          activeAdminContext,
          refreshedMeta
        );
        await updateDoc(docRef, refreshedPatch);
        recordMeta(
          path,
          { ...serverData, ...refreshedPatch, localCreated: true },
          { serverConfirmed: true }
        );
        return true;
      }
    }
    return false;
  };

  const executeWrite = async () => {
    if (!isUpdate) {
      try {
        await setDoc(docRef, payload);
        recordMeta(path, { ...payload, localCreated: true }, { serverConfirmed: isOnlineBrowser() });
        return;
      } catch (err) {
        try {
          if (await recoverWithServerState(err)) return;
        } catch (retryErr) {
          if (prevMeta) docMetaCache.set(path, prevMeta);
          else docMetaCache.delete(path);
          throw retryErr;
        }
        if (prevMeta) docMetaCache.set(path, prevMeta);
        else docMetaCache.delete(path);
        throw err;
      }
    }

    try {
      await updateDoc(docRef, buildEntityUpdatePatch(colName, payload, activeAdminContext, existing));
      recordMeta(path, { ...payload, localCreated: true }, { serverConfirmed: isOnlineBrowser() });
    } catch (err: any) {
      try {
        if (await recoverWithServerState(err)) return;
      } catch (retryErr) {
        if (prevMeta) docMetaCache.set(path, prevMeta);
        else docMetaCache.delete(path);
        throw retryErr;
      }

      if (prevMeta) docMetaCache.set(path, prevMeta);
      else docMetaCache.delete(path);
      throw err;
    }
  };

  return commitTrackedWrite(
    executeWrite(),
    isUpdate ? OperationType.UPDATE : OperationType.CREATE,
    path,
    onAcked
  );
}

export async function saveWargaDoc(w: Warga): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(w.id, 'w');
  const path = `warga/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildWargaFirestorePayload({ ...w, id }, existing, ctx);

  return saveScopedEntityDoc('warga', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { warga: [id] });
    await upsertRtRegistry({ rw: payload.rw, ownerUid: payload.ownerUid, addRt: payload.rt });
    if (!payload.linkedUid) {
      provisionWargaAuthAccounts([{ ...w, id }]).catch(() => {});
    }
  });
}

export async function deleteWargaDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'w');
  const path = `warga/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'warga', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function updateWargaSelfDoc(
  wargaId: string,
  patch: { pin?: string; telepon?: string }
): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(wargaId, 'w');
  const path = `warga/${id}`;
  const updateBody: Record<string, any> = { updatedAt: serverTimestamp() };
  if (typeof patch.pin === 'string' && patch.pin.trim()) {
    updateBody.pin = patch.pin.trim().slice(0, 12);
  }
  if (typeof patch.telepon === 'string') {
    updateBody.telepon = patch.telepon.trim().slice(0, 32);
  }
  return commitTrackedWrite(
    updateDoc(doc(db, 'warga', id), updateBody),
    OperationType.UPDATE,
    path
  );
}

export async function bulkSaveWargaAndBantuanDocs(
  wargaList: Warga[],
  bantuanList: BantuanPemerintah[]
): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  try {
    await Promise.all([
      ...wargaList.map((w) => resolveExistingMeta(`warga/${toValidDocId(w.id, 'w')}`)),
      ...bantuanList.map((b) => resolveExistingMeta(`bantuan/${toValidDocId(b.id, 'b')}`)),
    ]);

    const manifestBucketsByRt = new Map<string, { warga: string[]; bantuan: string[] }>();
    const rw = ctx?.rw || DEFAULT_RW;
    const writes: PendingBatchWrite[] = [];

    for (const w of wargaList) {
      const id = toValidDocId(w.id, 'w');
      const path = `warga/${id}`;
      const existing = docMetaCache.get(path) || null;
      if (ctx?.role === 'admin' && ctx.rt !== 'SEMUA') {
        const wRt = normalizeRTCode(w.rt);
        if (wRt && wRt !== ctx.rt) continue;
        if (existing?.rw && existing.rw !== ctx.rw) continue;
        if (existing?.rt && existing.rt !== ctx.rt) continue;
      }

      const payload = buildWargaFirestorePayload({ ...w, id }, existing, ctx);
      const isUpdate = Boolean(existing && (existing.serverConfirmed || existing.ownerUid || existing.localCreated));
      writes.push({ colName: 'warga', id, payload, rt: payload.rt, isUpdate });

      const entry = manifestBucketsByRt.get(payload.rt) || { warga: [], bantuan: [] };
      entry.warga.push(id);
      manifestBucketsByRt.set(payload.rt, entry);
    }

    for (const b of bantuanList) {
      const id = toValidDocId(b.id, 'b');
      const path = `bantuan/${id}`;
      const existing = docMetaCache.get(path) || null;
      if (ctx?.role === 'admin' && ctx.rt !== 'SEMUA') {
        const bRt = extractRTFromScope(b.rtScope, '', true);
        if (bRt && bRt !== 'SEMUA' && bRt !== ctx.rt) continue;
        if (existing?.rw && existing.rw !== ctx.rw) continue;
        if (existing?.rt && existing.rt !== ctx.rt) continue;
      }

      const payload = buildBantuanFirestorePayload({ ...b, id }, existing, ctx);
      const isUpdate = Boolean(existing && (existing.serverConfirmed || existing.ownerUid || existing.localCreated));
      writes.push({ colName: 'bantuan', id, payload, rt: payload.rt, isUpdate });

      const entry = manifestBucketsByRt.get(payload.rt) || { warga: [], bantuan: [] };
      entry.bantuan.push(id);
      manifestBucketsByRt.set(payload.rt, entry);
    }

    if (writes.length === 0) return { ok: true, pending: false };

    const bulkTask = (async () => {
      const res = await executeResilientWrites(writes, 30);
      if (res.failed.length > 0) {
        const first = res.failed[0];
        throw new Error(first.error || `Gagal menyimpan ${res.failed.length} dokumen warga/bantuan.`);
      }
    })();

    return await commitTrackedWrite(
      bulkTask,
      OperationType.WRITE,
      'warga',
      async () => {
        for (const [rtCode, bucket] of manifestBucketsByRt.entries()) {
          await appendDocIdsToManifest(rw, rtCode, bucket);
          await upsertRtRegistry({
            rw,
            ownerUid: auth.currentUser?.uid || ctx?.uid || 'system',
            serverUid: ctx?.serverUid,
            addRt: rtCode,
          });
        }
        provisionWargaAuthAccounts(wargaList).catch(() => {});
      }
    );
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, 'warga');
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveTransactionDoc(tx: Transaction): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(tx.id, 'tx');
  const path = `transactions/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildTransactionFirestorePayload({ ...tx, id }, existing, ctx);

  return saveScopedEntityDoc('transactions', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { transactions: [id] });
  });
}

export async function deleteTransactionDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'tx');
  const path = `transactions/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'transactions', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function saveBantuanDoc(b: BantuanPemerintah): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(b.id, 'b');
  const path = `bantuan/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildBantuanFirestorePayload({ ...b, id }, existing, ctx);

  return saveScopedEntityDoc('bantuan', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { bantuan: [id] });
  });
}

export async function deleteBantuanDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'b');
  const path = `bantuan/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'bantuan', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function savePengumumanDoc(p: PengumumanRT): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(p.id, 'p');
  const path = `pengumuman/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildPengumumanFirestorePayload({ ...p, id }, existing, ctx);

  return saveScopedEntityDoc('pengumuman', id, payload, existing, async () => {
    if (payload.rt !== 'SEMUA') {
      await appendDocIdsToManifest(payload.rw, payload.rt, { pengumuman: [id] });
    }
  });
}

export async function deletePengumumanDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'p');
  const path = `pengumuman/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'pengumuman', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function saveDokumenDoc(d: DokumenPdfWarga): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(d.id, 'doc');
  const path = `dokumen/${id}`;
  if (d.dataBase64 && d.dataBase64.length > 850000) {
    return {
      ok: false,
      message: 'Ukuran file PDF melebihi batas dokumen Firestore (~850 KB). Kompres file PDF terlebih dahulu.',
    };
  }
  const existing = await resolveExistingMeta(path);
  const payload = buildDokumenFirestorePayload({ ...d, id }, existing, ctx);

  return saveScopedEntityDoc('dokumen', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { dokumen: [id] });
  });
}

export async function deleteDokumenDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'doc');
  const path = `dokumen/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'dokumen', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function saveAdminAccountDoc(
  acc: AdminRTAccount,
  authUidOverride?: string
): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(acc.id, 'adm');
  const path = `adminAccounts/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildAdminAccountFirestorePayload(
    { ...acc, id },
    existing,
    ctx,
    authUidOverride
  );

  return saveScopedEntityDoc('adminAccounts', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { adminAccounts: [id] });
    await upsertRtRegistry({
      rw: payload.rw,
      ownerUid: payload.ownerUid,
      serverUid: ctx?.serverUid,
      addRt: payload.rt,
      addAdminUid: payload.authUid,
    });
  });
}

export async function deleteAdminAccountDoc(idRaw: string): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'adm');
  const path = `adminAccounts/${id}`;
  return commitTrackedWrite(
    deleteDoc(doc(db, 'adminAccounts', id)),
    OperationType.DELETE,
    path,
    () => {
      docMetaCache.delete(path);
    }
  );
}

export async function saveLaporanDoc(
  lap: PembaruanBulananRT
): Promise<FirestoreWriteResult> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const ctx = await ensureAdminContextReady();
  const id = toValidDocId(lap.id, 'lap');
  const path = `laporanBulanan/${id}`;
  const existing = await resolveExistingMeta(path);
  const payload = buildLaporanFirestorePayload({ ...lap, id }, existing, ctx);

  return saveScopedEntityDoc('laporanBulanan', id, payload, existing, async () => {
    await appendDocIdsToManifest(payload.rw, payload.rt, { laporanBulanan: [id] });
  });
}

export async function saveSettingsDoc(
  pengaturanKas: PengaturanKas,
  tahunAktif: number
): Promise<FirestoreWriteResult> {
  const ctx = await ensureAdminContextReady();
  if (!auth.currentUser || !ctx) {
    return { ok: false, message: 'Belum login ke Firebase.' };
  }
  const rw =
    ctx.role === 'admin'
      ? ctx.rw || DEFAULT_RW
      : normalizeRWCode(pengaturanKas.profilRT?.namaRW, ctx.rw || DEFAULT_RW);
  const rt =
    ctx.role === 'server'
      ? 'SEMUA'
      : ctx.rt && ctx.rt !== 'SEMUA'
      ? ctx.rt
      : extractRTFromScope(pengaturanKas.profilRT?.namaRT, DEFAULT_RT);
  const settingId = ctx.role === 'server' ? `rw_${rw}` : `rw_${rw}_rt_${rt}`;
  const path = `settings/${settingId}`;

  const existing = await resolveExistingMeta(path);
  const payload = buildSettingsFirestorePayload(
    pengaturanKas,
    tahunAktif,
    settingId,
    rt,
    rw,
    existing,
    ctx
  );

  return saveScopedEntityDoc('settings', settingId, payload, existing, async () => {
    if (rt !== 'SEMUA') {
      await appendDocIdsToManifest(rw, rt, { settings: [settingId] });
    }
  });
}

export async function syncRtPublicSummary(params: {
  rt: string;
  rw: string;
  tahunAktif: number;
  pengaturanKas: PengaturanKas;
  transactions: Transaction[];
  pengumumanList: PengumumanRT[];
  wargaList: Warga[];
}): Promise<void> {
  const ctx = await ensureAdminContextReady();
  if (!ctx || !auth.currentUser) return;
  const rt =
    ctx.role === 'admin' && ctx.rt !== 'SEMUA'
      ? ctx.rt
      : extractRTFromScope(params.rt, DEFAULT_RT);
  const rw =
    ctx.role === 'admin' ? ctx.rw || DEFAULT_RW : normalizeRWCode(params.rw, ctx.rw || DEFAULT_RW);
  if (rt === 'SEMUA') return;

  const { rwId, rtId } = buildScopeIds(rt, rw);
  const scopeId = `rt_${rt}_rw_${rw}`;
  const path = `rtPublicSummaries/${scopeId}`;
  const existing = await resolveExistingMeta(path);

  const rtTransactions = params.transactions
    .filter((t) => getTransactionRTCode(t, params.wargaList, rt) === rt)
    .slice(0, 2000)
    .map((t) => {
      const resolvedResidentId = resolveTransactionResidentId(t, params.wargaList, rt);
      const { noKK: _stripNoKK, ...publicTx } = t;
      return stripUndefinedDeep({
        ...publicTx,
        ...(resolvedResidentId ? { residentId: resolvedResidentId } : {}),
      });
    });

  const rtPengumuman = params.pengumumanList
    .filter((p) => {
      const pRt = extractRTFromScope(p.rtScope, '', true);
      return !pRt || pRt === rt || pRt === 'SEMUA';
    })
    .slice(0, 200)
    .map((p) => stripUndefinedDeep(p));

  const payload = stripUndefinedDeep({
    id: scopeId,
    rw,
    rt,
    rtId,
    rwId,
    tahunAktif: toFiniteNumberOrDefault(params.tahunAktif, 2026),
    pengaturanKas: stripUndefinedDeep({
      ...params.pengaturanKas,
      updatedAt: new Date().toISOString(),
    }),
    transactions: rtTransactions,
    pengumuman: rtPengumuman,
    ownerUid: existing?.ownerUid || ctx.uid,
    serverUid: ctx.serverUid || existing?.serverUid,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updateSummaryPatch = stripUndefinedDeep({
    rwId,
    rtId,
    tahunAktif: payload.tahunAktif,
    pengaturanKas: payload.pengaturanKas,
    transactions: payload.transactions,
    pengumuman: payload.pengumuman,
    serverUid: payload.serverUid,
    updatedAt: serverTimestamp(),
  });

  const ref = doc(db, 'rtPublicSummaries', scopeId);
  const isUpdate = Boolean(existing && (existing.ownerUid || existing.localCreated || existing.serverConfirmed));
  recordMeta(path, { ...payload, localCreated: true });

  try {
    if (isUpdate) {
      await updateDoc(ref, updateSummaryPatch);
    } else {
      await setDoc(ref, payload);
    }
    recordMeta(path, { ...payload, localCreated: true }, { serverConfirmed: isOnlineBrowser() });
  } catch (err: any) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    if (
      isOnlineBrowser() &&
      (code === 'not-found' ||
        code === 'permission-denied' ||
        /missing or insufficient permissions/i.test(msg))
    ) {
      try {
        const serverSnap = await getDocFromServer(ref);
        if (serverSnap.exists()) {
          const sData = serverSnap.data();
          const actualRw = String(sData.rw || rw);
          const actualRt = String(sData.rt || rt);
          await updateDoc(ref, {
            ...updateSummaryPatch,
            rwId: `rw_${actualRw}`,
            rtId: actualRt === 'SEMUA' ? 'SEMUA' : `rt_${actualRt}`,
          });
          recordMeta(path, { ...sData, ...updateSummaryPatch, localCreated: true }, { serverConfirmed: true });
          return;
        } else {
          await setDoc(ref, payload);
          recordMeta(path, { ...payload, localCreated: true }, { serverConfirmed: true });
          return;
        }
      } catch (retryErr) {
        console.warn('syncRtPublicSummary retry warning:', retryErr);
        return;
      }
    }
    console.warn('syncRtPublicSummary warning:', err);
  }
}

// ==========================================
// 6. MIGRATION (CLOUD SQL 50 KK & LEGACY JSON -> FIRESTORE)
// ==========================================

export interface MigrationResult {
  ok: boolean;
  migratedWarga: number;
  migratedTx: number;
  migratedOther: number;
  skippedOversized: number;
  failedCount: number;
  message?: string;
}

interface PendingBatchWrite {
  colName: EntityBucket;
  id: string;
  payload: Record<string, any>;
  rt: string;
  isUpdate?: boolean;
}

async function executeResilientWrites(
  writes: PendingBatchWrite[],
  chunkSize = 25
): Promise<{ succeeded: PendingBatchWrite[]; failed: Array<{ item: PendingBatchWrite; error: string }> }> {
  const succeeded: PendingBatchWrite[] = [];
  const failed: Array<{ item: PendingBatchWrite; error: string }> = [];

  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    try {
      const batch = writeBatch(db);
      for (const w of chunk) {
        const ref = doc(db, w.colName, w.id);
        const existing = docMetaCache.get(`${w.colName}/${w.id}`) || null;
        if (w.isUpdate) {
          batch.update(ref, buildEntityUpdatePatch(w.colName, w.payload, activeAdminContext, existing));
        } else {
          batch.set(ref, w.payload);
        }
      }
      await batch.commit();
      chunk.forEach((w) =>
        recordMeta(`${w.colName}/${w.id}`, { ...w.payload, localCreated: true }, { serverConfirmed: isOnlineBrowser() })
      );
      succeeded.push(...chunk);
    } catch {
      const settled = await Promise.allSettled(
        chunk.map(async (w) => {
          const path = `${w.colName}/${w.id}`;
          const ref = doc(db, w.colName, w.id);
          const existing = docMetaCache.get(path) || null;
          try {
            if (!w.isUpdate) {
              return await setDoc(ref, w.payload);
            }
            return await updateDoc(ref, buildEntityUpdatePatch(w.colName, w.payload, activeAdminContext, existing));
          } catch (err: any) {
            if (isOnlineBrowser()) {
              const serverSnap = await getDocFromServer(ref).catch(() => null);
              if (serverSnap && !serverSnap.exists()) {
                const currentUid = auth.currentUser?.uid || activeAdminContext?.uid || w.payload.ownerUid;
                return setDoc(ref, {
                  ...w.payload,
                  ownerUid: currentUid,
                  accessUids: Array.from(
                    new Set([
                      currentUid,
                      ...(Array.isArray(w.payload.accessUids) ? w.payload.accessUids : []),
                    ])
                  ).slice(0, 15),
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
              if (serverSnap && serverSnap.exists()) {
                const sData = serverSnap.data();
                recordMeta(path, { ...sData, localCreated: true }, { serverConfirmed: true });
                return updateDoc(
                  ref,
                  buildEntityUpdatePatch(w.colName, w.payload, activeAdminContext, docMetaCache.get(path) || null)
                );
              }
            }
            throw err;
          }
        })
      );
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          const w = chunk[idx];
          recordMeta(`${w.colName}/${w.id}`, { ...w.payload, localCreated: true }, { serverConfirmed: isOnlineBrowser() });
          succeeded.push(w);
        } else {
          const msg = res.reason?.message || String(res.reason || 'Unknown write error');
          failed.push({ item: chunk[idx], error: msg });
        }
      });
    }
  }

  return { succeeded, failed };
}

function normKeyStr(v?: string | null): string {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normDigits(v?: string | null): string {
  return String(v || '').replace(/\D/g, '');
}

function txFingerprint(t: Transaction): string {
  return [
    String(t.tanggal || '').trim(),
    String(t.tipe || '').trim(),
    Number(t.nominal) || 0,
    normKeyStr(t.kategori),
    normDigits(t.noKK) || normKeyStr(t.namaWarga),
    normKeyStr(t.keterangan),
  ].join('|');
}

function bantuanFingerprint(b: BantuanPemerintah): string {
  return [
    normKeyStr(b.jenisBantuan),
    normKeyStr(b.namaPenerima),
    normDigits(b.noKK),
    String(b.tanggal || '').trim(),
  ].join('|');
}

function pengumumanFingerprint(p: PengumumanRT): string {
  return [normKeyStr(p.judul), String(p.tanggal || '').trim(), normKeyStr(p.isi).slice(0, 80)].join(
    '|'
  );
}

function dokumenFingerprint(d: DokumenPdfWarga): string {
  return [normKeyStr(d.judul), normKeyStr(d.namaFile), Number(d.ukuranKb) || 0].join('|');
}

function laporanFingerprint(l: PembaruanBulananRT): string {
  return [
    normalizeRTCode(l.rt),
    normalizeRWCode(l.rw, DEFAULT_RW),
    normKeyStr(l.bulanTahun),
    Number(l.tahun) || 0,
  ].join('|');
}

export function computeMissingMigrationItems(
  snapshot: Partial<AppDatabaseSchema>,
  existing?: Partial<AppDatabaseSchema> | null
) {
  const exWarga = existing?.wargaList || [];
  const exTx = existing?.transactions || [];
  const exBantuan = existing?.bantuanList || [];
  const exPengumuman = existing?.pengumumanList || [];
  const exDokumen = existing?.dokumenList || [];
  const exLaporan = existing?.laporanBulananRT || [];
  const exAdmins = existing?.adminAccounts || [];

  const exWargaIds = new Set(exWarga.map((w) => toValidDocId(w.id, 'w')));
  const exWargaKKs = new Set(exWarga.map((w) => normDigits(w.noKK)).filter((k) => k.length >= 6));
  const exWargaNames = new Set(
    exWarga.map((w) => `${normKeyStr(w.nama)}|${normKeyStr(w.noRumah)}|${normalizeRTCode(w.rt)}`)
  );

  const exTxIds = new Set(exTx.map((t) => toValidDocId(t.id, 'tx')));
  const exTxFingerprints = new Set(exTx.map(txFingerprint));

  const exBantuanIds = new Set(exBantuan.map((b) => toValidDocId(b.id, 'b')));
  const exBantuanFingerprints = new Set(exBantuan.map(bantuanFingerprint));

  const exPengumumanIds = new Set(exPengumuman.map((p) => toValidDocId(p.id, 'p')));
  const exPengumumanFingerprints = new Set(exPengumuman.map(pengumumanFingerprint));

  const exDokumenIds = new Set(exDokumen.map((d) => toValidDocId(d.id, 'doc')));
  const exDokumenFingerprints = new Set(exDokumen.map(dokumenFingerprint));

  const exLaporanIds = new Set(exLaporan.map((l) => toValidDocId(l.id, 'lap')));
  const exLaporanFingerprints = new Set(exLaporan.map(laporanFingerprint));

  const exAdminIds = new Set(exAdmins.map((a) => toValidDocId(a.id, 'adm')));
  const exAdminUsers = new Set(exAdmins.map((a) => normKeyStr(a.username)));

  const wargaList = (Array.isArray(snapshot.wargaList) ? snapshot.wargaList : []).filter((w) => {
    const id = toValidDocId(w.id, 'w');
    const kk = normDigits(w.noKK);
    const nameKey = `${normKeyStr(w.nama)}|${normKeyStr(w.noRumah)}|${normalizeRTCode(w.rt)}`;
    return !exWargaIds.has(id) && (!kk || !exWargaKKs.has(kk)) && !exWargaNames.has(nameKey);
  });

  const transactions = (Array.isArray(snapshot.transactions) ? snapshot.transactions : []).filter(
    (t) => !exTxIds.has(toValidDocId(t.id, 'tx')) && !exTxFingerprints.has(txFingerprint(t))
  );

  const bantuanList = (Array.isArray(snapshot.bantuanList) ? snapshot.bantuanList : []).filter(
    (b) =>
      !exBantuanIds.has(toValidDocId(b.id, 'b')) && !exBantuanFingerprints.has(bantuanFingerprint(b))
  );

  const pengumumanList = (
    Array.isArray(snapshot.pengumumanList) ? snapshot.pengumumanList : []
  ).filter(
    (p) =>
      !exPengumumanIds.has(toValidDocId(p.id, 'p')) &&
      !exPengumumanFingerprints.has(pengumumanFingerprint(p))
  );

  const dokumenList = (Array.isArray(snapshot.dokumenList) ? snapshot.dokumenList : []).filter(
    (d) =>
      !exDokumenIds.has(toValidDocId(d.id, 'doc')) && !exDokumenFingerprints.has(dokumenFingerprint(d))
  );

  const laporanBulananRT = (
    Array.isArray(snapshot.laporanBulananRT) ? snapshot.laporanBulananRT : []
  ).filter(
    (l) =>
      !exLaporanIds.has(toValidDocId(l.id, 'lap')) &&
      !exLaporanFingerprints.has(laporanFingerprint(l))
  );

  const adminAccounts = (Array.isArray(snapshot.adminAccounts) ? snapshot.adminAccounts : []).filter(
    (a) => !exAdminIds.has(toValidDocId(a.id, 'adm')) && !exAdminUsers.has(normKeyStr(a.username))
  );

  return {
    wargaList,
    transactions,
    bantuanList,
    pengumumanList,
    dokumenList,
    laporanBulananRT,
    adminAccounts,
  };
}

async function writeSnapshotToFirestoreInternal(
  snapshot: Partial<AppDatabaseSchema>,
  options: {
    skipExisting?: Partial<AppDatabaseSchema> | null;
    overwriteSettings?: boolean;
  }
): Promise<MigrationResult> {
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser) {
    return {
      ok: false,
      migratedWarga: 0,
      migratedTx: 0,
      migratedOther: 0,
      skippedOversized: 0,
      failedCount: 0,
      message: 'Harus login Admin/Server.',
    };
  }

  const missing = options.skipExisting
    ? computeMissingMigrationItems(snapshot, options.skipExisting)
    : {
        wargaList: Array.isArray(snapshot.wargaList) ? snapshot.wargaList : [],
        transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
        bantuanList: Array.isArray(snapshot.bantuanList) ? snapshot.bantuanList : [],
        pengumumanList: Array.isArray(snapshot.pengumumanList) ? snapshot.pengumumanList : [],
        dokumenList: Array.isArray(snapshot.dokumenList) ? snapshot.dokumenList : [],
        laporanBulananRT: Array.isArray(snapshot.laporanBulananRT) ? snapshot.laporanBulananRT : [],
        adminAccounts: Array.isArray(snapshot.adminAccounts) ? snapshot.adminAccounts : [],
      };

  const tahunAktif = toFiniteNumberOrDefault(
    snapshot.tahunAktif,
    toFiniteNumberOrDefault(snapshot.pengaturanKas?.tahunAktif, 2026)
  );

  const standardWrites: PendingBatchWrite[] = [];
  const dokumenWrites: PendingBatchWrite[] = [];
  let skippedOversized = 0;

  for (const w of missing.wargaList) {
    const id = toValidDocId(w.id, 'w');
    const existing = await resolveExistingMeta(`warga/${id}`);
    const payload = buildWargaFirestorePayload({ ...w, id }, existing, ctx);
    standardWrites.push({
      colName: 'warga',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  for (const t of missing.transactions) {
    const id = toValidDocId(t.id, 'tx');
    const existing = await resolveExistingMeta(`transactions/${id}`);
    const payload = buildTransactionFirestorePayload({ ...t, id }, existing, ctx);
    standardWrites.push({
      colName: 'transactions',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  for (const b of missing.bantuanList) {
    const id = toValidDocId(b.id, 'b');
    const existing = await resolveExistingMeta(`bantuan/${id}`);
    const payload = buildBantuanFirestorePayload({ ...b, id }, existing, ctx);
    standardWrites.push({
      colName: 'bantuan',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  for (const p of missing.pengumumanList) {
    const id = toValidDocId(p.id, 'p');
    const existing = await resolveExistingMeta(`pengumuman/${id}`);
    const payload = buildPengumumanFirestorePayload({ ...p, id }, existing, ctx);
    standardWrites.push({
      colName: 'pengumuman',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  for (const d of missing.dokumenList) {
    if (d.dataBase64 && d.dataBase64.length > 850000) {
      skippedOversized++;
      continue;
    }
    const id = toValidDocId(d.id, 'doc');
    const existing = await resolveExistingMeta(`dokumen/${id}`);
    const payload = buildDokumenFirestorePayload({ ...d, id }, existing, ctx);
    dokumenWrites.push({
      colName: 'dokumen',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  for (const lap of missing.laporanBulananRT) {
    const id = toValidDocId(lap.id, 'lap');
    const existing = await resolveExistingMeta(`laporanBulanan/${id}`);
    const payload = buildLaporanFirestorePayload({ ...lap, id }, existing, ctx);
    standardWrites.push({
      colName: 'laporanBulanan',
      id,
      payload,
      rt: payload.rt,
      isUpdate: Boolean(existing && (existing.ownerUid || existing.localCreated)),
    });
  }

  const stdResult = await executeResilientWrites(standardWrites, 30);
  // Write PDFs 1-by-1 so payload size never approaches Firestore 10MB batch limit
  const docResult = await executeResilientWrites(dokumenWrites, 1);

  const allSucceeded = [...stdResult.succeeded, ...docResult.succeeded];
  const allFailed = [...stdResult.failed, ...docResult.failed];

  let settingsFailedMsg = '';
  if (snapshot.pengaturanKas && options.overwriteSettings) {
    const setRes = await saveSettingsDoc(snapshot.pengaturanKas, tahunAktif);
    if (!setRes.ok) {
      settingsFailedMsg = setRes.message || 'Gagal menyimpan pengaturan kas.';
    }
  }

  for (const acc of missing.adminAccounts) {
    if (ctx.role === 'server') {
      const prov = await provisionAdminAuthAccount(acc).catch(() => ({ authUid: undefined }));
      await saveAdminAccountDoc(acc, prov.authUid);
    } else if (acc.username.trim().toLowerCase() === ctx.username.trim().toLowerCase()) {
      await saveAdminAccountDoc(acc, ctx.uid);
    }
  }

  const manifestByRt = new Map<string, Partial<Record<EntityBucket, string[]>>>();
  for (const w of allSucceeded) {
    if (w.rt === 'SEMUA') continue;
    const bucket = manifestByRt.get(w.rt) || {};
    const list = bucket[w.colName] || [];
    list.push(w.id);
    bucket[w.colName] = list;
    manifestByRt.set(w.rt, bucket);
  }

  for (const [rtCode, bucket] of manifestByRt.entries()) {
    await appendDocIdsToManifest(ctx.rw, rtCode, bucket);
    await upsertRtRegistry({
      rw: ctx.rw,
      ownerUid: ctx.uid,
      serverUid: ctx.serverUid,
      addRt: rtCode,
      addAdminUid: ctx.role === 'admin' ? ctx.uid : undefined,
    });
  }

  if (snapshot.pengaturanKas && (options.overwriteSettings || allSucceeded.length > 0)) {
    const rts = Array.from(manifestByRt.keys());
    for (const rtCode of rts.length > 0 ? rts : [ctx.rt === 'SEMUA' ? DEFAULT_RT : ctx.rt]) {
      await syncRtPublicSummary({
        rt: rtCode,
        rw: ctx.rw,
        tahunAktif,
        pengaturanKas: snapshot.pengaturanKas,
        transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
        pengumumanList: Array.isArray(snapshot.pengumumanList) ? snapshot.pengumumanList : [],
        wargaList: Array.isArray(snapshot.wargaList) ? snapshot.wargaList : [],
      });
    }
  }

  if (missing.wargaList.length > 0) {
    provisionWargaAuthAccounts(missing.wargaList).catch(() => {});
  }

  const migratedWarga = allSucceeded.filter((s) => s.colName === 'warga').length;
  const migratedTx = allSucceeded.filter((s) => s.colName === 'transactions').length;
  const migratedOther = allSucceeded.length - migratedWarga - migratedTx;
  const failedCount = allFailed.length + (settingsFailedMsg ? 1 : 0);

  return {
    ok: failedCount === 0,
    migratedWarga,
    migratedTx,
    migratedOther,
    skippedOversized,
    failedCount,
    message:
      failedCount > 0
        ? settingsFailedMsg || `${failedCount} data gagal dimigrasikan (${allFailed[0]?.error || ''})`
        : undefined,
  };
}

export async function migrateMissingSnapshotToFirestore(
  snapshot: Partial<AppDatabaseSchema>,
  existingState?: Partial<AppDatabaseSchema> | null,
  hasExistingRemoteSettings = true
): Promise<MigrationResult> {
  return writeSnapshotToFirestoreInternal(snapshot, {
    skipExisting: existingState || undefined,
    overwriteSettings: !hasExistingRemoteSettings,
  });
}

export async function migrateSnapshotToFirestore(
  snapshot: Partial<AppDatabaseSchema>
): Promise<MigrationResult> {
  return writeSnapshotToFirestoreInternal(snapshot, {
    skipExisting: null,
    overwriteSettings: true,
  });
}

export async function fetchCloudSqlMigrationSnapshot(): Promise<AppDatabaseSchema | null> {
  try {
    const res = await fetch(`/api/migration/cloudsql-snapshot?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (json?.available && json?.data) {
      return json.data as AppDatabaseSchema;
    }
    return null;
  } catch {
    return null;
  }
}

export async function hardResetFirestoreData(params: {
  wargaIds: string[];
  txIds: string[];
  bantuanIds: string[];
  pengumumanIds: string[];
  dokumenIds: string[];
  laporanIds: string[];
  resetSettings: PengaturanKas;
  tahunAktif: number;
}): Promise<boolean> {
  if (!auth.currentUser || !activeAdminContext) return false;
  try {
    let batch = writeBatch(db);
    let ops = 0;

    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    const queueDeletes = async (colName: string, ids: string[]) => {
      for (const id of ids) {
        const cleanId = toValidDocId(id, colName);
        batch.delete(doc(db, colName, cleanId));
        docMetaCache.delete(`${colName}/${cleanId}`);
        ops++;
        if (ops >= 350) await flush();
      }
    };

    await queueDeletes('warga', params.wargaIds);
    await queueDeletes('transactions', params.txIds);
    await queueDeletes('bantuan', params.bantuanIds);
    await queueDeletes('pengumuman', params.pengumumanIds);
    await queueDeletes('dokumen', params.dokumenIds);
    await queueDeletes('laporanBulanan', params.laporanIds);
    await flush();

    await saveSettingsDoc(params.resetSettings, params.tahunAktif);
    return true;
  } catch (err) {
    console.error('hardResetFirestoreData error:', err);
    return false;
  }
}

// ==========================================
// 7. REAL-TIME FIRESTORE ONSNAPSHOT SUBSCRIPTION
// ==========================================

export interface FirestoreRealtimeSnapshot {
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengumumanList: PengumumanRT[];
  dokumenList: DokumenPdfWarga[];
  adminAccounts: AdminRTAccount[];
  laporanBulananRT: PembaruanBulananRT[];
  pengaturanKas?: PengaturanKas;
  tahunAktif?: number;
}

let activeSubscriptionCleanup: (() => void) | null = null;

export function subscribeFirestoreState(
  user: AuthUser,
  onUpdate: (partial: Partial<FirestoreRealtimeSnapshot>, isFirstReady: boolean) => void,
  onStatusChange?: (
    connected: boolean,
    errMsg?: string | null,
    phase?: 'connecting' | 'pending' | 'synced' | 'error'
  ) => void
): () => void {
  // Prevent duplicate listeners on rapid re-renders / auth refreshes / multi-device reconnects
  if (activeSubscriptionCleanup) {
    activeSubscriptionCleanup();
    activeSubscriptionCleanup = null;
  }

  const fbUser = auth.currentUser;
  if (!fbUser) {
    onStatusChange?.(false, 'Sesi Firebase belum aktif.', 'error');
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];
  let disposed = false;
  let firstReadyEmitted = false;
  let lastListenerError: string | null = null;

  const readyFlags = new Set<string>();
  const pendingSnapshotsByKey = new Map<string, boolean>();
  const fromCacheSnapshotsByKey = new Map<string, boolean>();
  const expectedKeys =
    user.role === 'warga'
      ? ['warga', 'rtPublicSummary']
      : [
          'warga',
          'transactions',
          'bantuan',
          'pengumuman',
          'dokumen',
          'adminAccounts',
          'laporanBulanan',
          'settings',
        ];

  const computeAndNotifyStatus = () => {
    if (disposed) return;
    const online = isOnlineBrowser();
    const allListenersReady = expectedKeys.every((k) => readyFlags.has(k));
    const hasPendingSnap = Array.from(pendingSnapshotsByKey.values()).some(Boolean);
    const anyFromCache =
      fromCacheSnapshotsByKey.size === 0 ||
      expectedKeys.some((k) => fromCacheSnapshotsByKey.get(k) !== false);
    const hasPendingWrites = hasPendingSnap || activePendingWriteCount > 0;
    const err = latestAsyncWriteError || lastListenerError;

    if (err) {
      onStatusChange?.(online, err, 'error');
      return;
    }
    if (!online) {
      onStatusChange?.(
        false,
        hasPendingWrites
          ? 'Perangkat offline. Perubahan tersimpan lokal & akan tersinkronisasi otomatis saat kembali online.'
          : 'Perangkat sedang offline. Menampilkan data cache lokal.',
        hasPendingWrites ? 'pending' : 'error'
      );
      return;
    }
    if (hasPendingWrites) {
      onStatusChange?.(true, null, 'pending');
      return;
    }
    if (allListenersReady && !anyFromCache) {
      onStatusChange?.(true, null, 'synced');
    } else {
      onStatusChange?.(true, null, 'connecting');
    }
  };

  computeAndNotifyStatus();

  const onPendingWriteUpdate = () => computeAndNotifyStatus();
  pendingWriteListeners.add(onPendingWriteUpdate);

  // Safety fallback so UI never stalls in connecting state on degraded connections
  const readinessFailsafeTimer = setTimeout(() => {
    if (disposed || firstReadyEmitted) return;
    firstReadyEmitted = true;
    onUpdate({}, true);
  }, 3500);

  const handleOnline = () => {
    lastListenerError = null;
    computeAndNotifyStatus();
    void ensureFirestoreNetworkOnline(true)
      .then(() => {
        if (user.role !== 'warga') {
          return claimAndSyncManifestDocs({ force: true });
        }
        return 0;
      })
      .catch(() => {});
  };
  const handleOffline = () => computeAndNotifyStatus();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Track Firestore local-cache <-> server catchup in realtime
  unsubs.push(
    onSnapshotsInSync(db, () => {
      computeAndNotifyStatus();
    })
  );

  const markReady = (
    key: string,
    metadata: { hasPendingWrites: boolean; fromCache: boolean },
    partial: Partial<FirestoreRealtimeSnapshot>,
    emitDataUpdate = true
  ) => {
    if (disposed) return;
    readyFlags.add(key);
    pendingSnapshotsByKey.set(key, metadata.hasPendingWrites);
    fromCacheSnapshotsByKey.set(key, metadata.fromCache);
    const allListenersReady = expectedKeys.every((k) => readyFlags.has(k));
    const isFirstReady = allListenersReady && !firstReadyEmitted;
    if (isFirstReady) {
      firstReadyEmitted = true;
      clearTimeout(readinessFailsafeTimer);
    }
    computeAndNotifyStatus();
    if (emitDataUpdate || isFirstReady) {
      onUpdate(partial, isFirstReady);
    }
  };

  const cleanup = () => {
    disposed = true;
    clearTimeout(readinessFailsafeTimer);
    pendingWriteListeners.delete(onPendingWriteUpdate);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // ignore unsubscribe error
      }
    });
    if (activeSubscriptionCleanup === cleanup) {
      activeSubscriptionCleanup = null;
    }
  };
  activeSubscriptionCleanup = cleanup;

  if (user.role === 'warga') {
    const qWarga = query(collection(db, 'warga'), where('linkedUid', '==', fbUser.uid));
    let summaryUnsub: Unsubscribe | null = null;
    let activeScopeId = '';

    unsubs.push(
      onSnapshot(
        qWarga,
        { includeMetadataChanges: true },
        (snap) => {
          lastListenerError = null;
          const alreadyReady = readyFlags.has('warga');
          const hasChanges = !alreadyReady || snap.docChanges().length > 0;
          const list: Warga[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            recordMeta(`warga/${docSnap.id}`, d, { serverConfirmed: !snap.metadata.fromCache });
            list.push({
              ...(d as unknown as Warga),
              id: docSnap.id,
              updatedAt: tsToIso(d.updatedAt),
            });
          });
          markReady(
            'warga',
            { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache },
            { wargaList: list },
            hasChanges
          );

          const first = list[0];
          const rt = first ? getWargaRTCode(first, DEFAULT_RT) : extractRTFromScope(user.rtScope);
          const rw = normalizeRWCode(first?.rw, DEFAULT_RW);
          const scopeId = `rt_${rt}_rw_${rw}`;

          if (scopeId !== activeScopeId) {
            activeScopeId = scopeId;
            if (summaryUnsub) summaryUnsub();
            summaryUnsub = onSnapshot(
              doc(db, 'rtPublicSummaries', scopeId),
              { includeMetadataChanges: true },
              (sumSnap) => {
                lastListenerError = null;
                if (sumSnap.exists()) {
                  const s = sumSnap.data();
                  markReady(
                    'rtPublicSummary',
                    { hasPendingWrites: sumSnap.metadata.hasPendingWrites, fromCache: sumSnap.metadata.fromCache },
                    {
                      tahunAktif: Number(s.tahunAktif) || 2026,
                      pengaturanKas: s.pengaturanKas as PengaturanKas | undefined,
                      transactions: Array.isArray(s.transactions) ? s.transactions : [],
                      pengumumanList: Array.isArray(s.pengumuman) ? s.pengumuman : [],
                    }
                  );
                } else {
                  markReady(
                    'rtPublicSummary',
                    { hasPendingWrites: sumSnap.metadata.hasPendingWrites, fromCache: sumSnap.metadata.fromCache },
                    {}
                  );
                }
              },
              (err) => {
                reportFirestoreError(err, OperationType.GET, `rtPublicSummaries/${scopeId}`);
                lastListenerError = err.message;
                readyFlags.add('rtPublicSummary');
                computeAndNotifyStatus();
              }
            );
          }
        },
        (err) => {
          reportFirestoreError(err, OperationType.GET, 'warga');
          lastListenerError = err.message;
          computeAndNotifyStatus();
        }
      )
    );

    unsubs.push(() => {
      if (summaryUnsub) summaryUnsub();
    });
    return cleanup;
  }

  // ADMIN RT or SERVER PUSAT: Wait for admin context readiness before attaching Watch listeners so auth & listeners never race
  void (async () => {
    await ensureAdminContextReady().catch(() => null);
    if (disposed) return;

    void claimAndSyncManifestDocs().catch(() => {});

    const isDocInScope = (colName: EntityBucket, d: Record<string, any>): boolean => {
      const ctx = activeAdminContext;
      if (!ctx) return true;
      const dRw = normalizeRWCode(d.rw, ctx.rw);
      if (dRw !== ctx.rw) return false;
      if (ctx.role === 'server' || ctx.rt === 'SEMUA') return true;
      const dRt = d.rt === 'SEMUA' ? 'SEMUA' : extractRTFromScope(d.rt, DEFAULT_RT, true);
      if (colName === 'pengumuman' && dRt === 'SEMUA') return true;
      return dRt === ctx.rt;
    };

    const setupScopedListener = <T extends { id: string; updatedAt?: string }>(
      colName: EntityBucket,
      key: keyof FirestoreRealtimeSnapshot,
      altMatch?: (a: T, b: T) => boolean
    ) => {
      let currentUnsub: Unsubscribe | null = null;
      let retryCount = 0;

      const attach = () => {
        if (disposed) return;
        const qCol = query(
          collection(db, colName),
          where('accessUids', 'array-contains', fbUser.uid)
        );
        currentUnsub = onSnapshot(
          qCol,
          { includeMetadataChanges: true },
          (snap) => {
            lastListenerError = null;
            retryCount = 0;
            const alreadyReady = readyFlags.has(colName);
            const hasChanges = !alreadyReady || snap.docChanges().length > 0;
            const items: T[] = [];
            const rawForReconcile: Array<{ id: string; data: Record<string, any> }> = [];
            snap.forEach((docSnap) => {
              const d = docSnap.data();
              recordMeta(`${colName}/${docSnap.id}`, d, { serverConfirmed: !snap.metadata.fromCache });
              if (!isDocInScope(colName, d)) return;
              rawForReconcile.push({ id: docSnap.id, data: d });
              items.push({
                ...(d as unknown as T),
                id: docSnap.id,
                updatedAt: tsToIso(d.updatedAt),
              });
            });
            const deduped = dedupeEntityList(items, [], altMatch);
            markReady(
              colName,
              { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache },
              { [key]: deduped } as any,
              hasChanges
            );

            if (rawForReconcile.length > 0) {
              reconcileLoadedDocsWithManifestAndAcls(colName, rawForReconcile).catch(() => {});
            }
          },
          (err) => {
            if (isTargetIdCollisionError(err) && retryCount < 2 && !disposed) {
              retryCount++;
              if (currentUnsub) {
                try {
                  currentUnsub();
                } catch {
                  // ignore
                }
                currentUnsub = null;
              }
              setTimeout(() => attach(), 300 * retryCount);
              return;
            }
            reportFirestoreError(err, OperationType.GET, colName);
            lastListenerError = `Gagal menyinkronkan ${colName}: ${err.message}`;
            readyFlags.add(colName);
            computeAndNotifyStatus();
          }
        );
      };

      attach();
      unsubs.push(() => {
        if (currentUnsub) {
          try {
            currentUnsub();
          } catch {
            // ignore
          }
          currentUnsub = null;
        }
      });
    };

    setupScopedListener<Warga>('warga', 'wargaList', (a, b) =>
      Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
    );
    setupScopedListener<Transaction>('transactions', 'transactions');
    setupScopedListener<BantuanPemerintah>('bantuan', 'bantuanList');
    setupScopedListener<PengumumanRT>('pengumuman', 'pengumumanList');
    setupScopedListener<DokumenPdfWarga>('dokumen', 'dokumenList');
    setupScopedListener<AdminRTAccount>('adminAccounts', 'adminAccounts', (a, b) =>
      a.username.toLowerCase() === b.username.toLowerCase()
    );
    setupScopedListener<PembaruanBulananRT>('laporanBulanan', 'laporanBulananRT');

    // Settings listener (array-contains + direct fallback getDoc for rt/rw settings)
    let settingsUnsub: Unsubscribe | null = null;
    let settingsRetry = 0;
    const attachSettings = () => {
      if (disposed) return;
      settingsUnsub = onSnapshot(
        query(collection(db, 'settings'), where('accessUids', 'array-contains', fbUser.uid)),
        { includeMetadataChanges: true },
        async (snap) => {
          lastListenerError = null;
          settingsRetry = 0;
          const docs = snap.docs.map((d) => {
            const data = d.data();
            recordMeta(`settings/${d.id}`, data, { serverConfirmed: !snap.metadata.fromCache });
            return data;
          });

          let chosen =
            docs.find((d) =>
              activeAdminContext?.role === 'server'
                ? d.id === `rw_${activeAdminContext.rw}`
                : d.rt === activeAdminContext?.rt && d.rw === activeAdminContext?.rw
            ) || docs[0];

          if (!chosen && activeAdminContext && activeAdminContext.rt !== 'SEMUA') {
            const rtSettingSnap = await getDoc(
              doc(db, 'settings', `rw_${activeAdminContext.rw}_rt_${activeAdminContext.rt}`)
            ).catch(() => null);
            if (rtSettingSnap && rtSettingSnap.exists()) {
              chosen = rtSettingSnap.data();
              recordMeta(`settings/${rtSettingSnap.id}`, chosen);
            }
          }

          if (!chosen && activeAdminContext) {
            const globalSnap = await getDoc(doc(db, 'settings', `rw_${activeAdminContext.rw}`)).catch(
              () => null
            );
            if (globalSnap && globalSnap.exists()) {
              chosen = globalSnap.data();
              recordMeta(`settings/${globalSnap.id}`, chosen);
            }
          }

          if (chosen) {
            const {
              accessUids: _a,
              ownerUid: _o,
              serverUid: _s,
              rtAdminUid: _r,
              createdAt: _c,
              id: _id,
              rt: _rt,
              rw: _rw,
              rtId: _rtId,
              rwId: _rwId,
              ...rest
            } = chosen;
            markReady(
              'settings',
              { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache },
              {
                tahunAktif: Number(chosen.tahunAktif) || 2026,
                pengaturanKas: {
                  ...(rest as PengaturanKas),
                  updatedAt: tsToIso(chosen.updatedAt),
                },
              }
            );
          } else {
            markReady(
              'settings',
              { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache },
              {}
            );
          }
        },
        (err) => {
          if (isTargetIdCollisionError(err) && settingsRetry < 2 && !disposed) {
            settingsRetry++;
            if (settingsUnsub) {
              try {
                settingsUnsub();
              } catch {
                // ignore
              }
              settingsUnsub = null;
            }
            setTimeout(() => attachSettings(), 300 * settingsRetry);
            return;
          }
          reportFirestoreError(err, OperationType.GET, 'settings');
          lastListenerError = `Gagal menyinkronkan settings: ${err.message}`;
          readyFlags.add('settings');
          computeAndNotifyStatus();
        }
      );
    };
    attachSettings();
    unsubs.push(() => {
      if (settingsUnsub) {
        try {
          settingsUnsub();
        } catch {
          // ignore
        }
        settingsUnsub = null;
      }
    });

    // Watch rtManifest for this Admin RT in real time so any cross-account doc added by Server RW or peer RT Admin is claimed immediately
  const scopedRt =
    activeAdminContext?.role === 'admin' && activeAdminContext.rt !== 'SEMUA'
      ? activeAdminContext.rt
      : user.role === 'admin'
      ? extractRTFromScope(user.rtScope, DEFAULT_RT)
      : '';
  const scopedRw = activeAdminContext?.rw || DEFAULT_RW;
  if (scopedRt && scopedRt !== 'SEMUA') {
    unsubs.push(
      onSnapshot(
        doc(db, 'rtManifest', `rt_${scopedRt}_rw_${scopedRw}`),
        async (manifestSnap) => {
          if (!manifestSnap.exists()) return;
          const ctx = await ensureAdminContextReady();
          if (!ctx || ctx.role !== 'admin') return;
          const docIdsMap: Record<string, string[]> = manifestSnap.data().docIds || {};
          const missingPatches: Array<{
            ref: ReturnType<typeof doc>;
            path: string;
            patch: Record<string, any>;
          }> = [];
          const fetches: Promise<void>[] = [];

          for (const [colNameRaw, ids] of Object.entries(docIdsMap)) {
            const colName = colNameRaw as EntityBucket;
            if (!Array.isArray(ids) || !CLAIM_ABLE_COLLECTIONS.includes(colName)) continue;
            for (const id of ids) {
              if (!id) continue;
              const docPath = `${colName}/${id}`;
              const cached = docMetaCache.get(docPath);
              if (cached?.accessUids?.includes(ctx.uid)) continue;
              fetches.push(
                getDocFromServer(doc(db, colName, id))
                  .then((snap) => {
                    if (!snap.exists()) return;
                    const data = snap.data();
                    recordMeta(docPath, { ...data, localCreated: true }, { serverConfirmed: true });
                    if (!isPatchableEntityDoc(colName, id, data, ctx)) return;
                    const patch = buildAclSyncPatch({
                      colName,
                      data,
                      ctx,
                      effectiveServerUid: ctx.serverUid,
                      adminsByRt: ctx.adminsByRt || {},
                      includeRtAdminUid: true,
                    });
                    if (patch) {
                      missingPatches.push({ ref: doc(db, colName, id), path: docPath, patch });
                    }
                  })
                  .catch(() => {})
              );
            }
          }
          if (fetches.length > 0) {
            await Promise.all(fetches);
            if (missingPatches.length > 0) {
              await commitDocAccessPatches(missingPatches);
            }
          }
        },
        () => {
          // ignore if rtManifest not yet initialized
        }
      )
    );
  }

  // Watch rtRegistry & systemMeta/serverLock changes -> only run background claim when serverUid or scoped RT admins actually change
  const rw = activeAdminContext?.rw || DEFAULT_RW;
  let lastRegSig = '';
  unsubs.push(
    onSnapshot(
      doc(db, 'rtRegistry', `rw_${rw}`),
      (regSnap) => {
        if (!regSnap.exists() || !activeAdminContext) return;
        const reg = regSnap.data();
        const nextServerUid =
          typeof reg.serverUid === 'string' && reg.serverUid
            ? reg.serverUid
            : activeAdminContext.serverUid;
        const nextAdminsByRt =
          reg.adminsByRt && typeof reg.adminsByRt === 'object'
            ? reg.adminsByRt
            : activeAdminContext.adminsByRt;

        const relevantScopeAdmins =
          activeAdminContext.role === 'server'
            ? nextAdminsByRt
            : nextAdminsByRt?.[activeAdminContext.rt] || [];
        const sig = `${nextServerUid || ''}|${JSON.stringify(relevantScopeAdmins)}`;

        activeAdminContext = {
          ...activeAdminContext,
          serverUid: nextServerUid,
          adminsByRt: nextAdminsByRt,
        };

        if (lastRegSig && sig !== lastRegSig) {
          reconciledPathsThisSession.clear();
          void claimAndSyncManifestDocs({ force: true }).catch(() => {});
        }
        lastRegSig = sig;
      },
      () => {
        // ignore if rtRegistry not created yet
      }
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'systemMeta', 'serverLock'),
      (lockSnap) => {
        if (!lockSnap.exists()) return;
        const lock = lockSnap.data();
        if (
          activeAdminContext &&
          typeof lock.serverUid === 'string' &&
          lock.serverUid &&
          activeAdminContext.serverUid !== lock.serverUid
        ) {
          activeAdminContext = {
            ...activeAdminContext,
            serverUid: lock.serverUid,
          };
          reconciledPathsThisSession.clear();
          void claimAndSyncManifestDocs({ force: true }).catch(() => {});
        }
      },
      () => {
        // ignore if serverLock doesn't exist yet
      }
    )
  );
  })();

  return cleanup;
}

export { testFirestoreConnection };
