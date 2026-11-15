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
  doc,
  FieldValue,
  getDoc,
  getDocs,
  onSnapshot,
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
  getWargaRTCode,
  getTransactionRTCode,
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

type EntityBucket =
  | 'warga'
  | 'transactions'
  | 'bantuan'
  | 'pengumuman'
  | 'dokumen'
  | 'adminAccounts'
  | 'laporanBulanan'
  | 'settings';

interface CachedDocMeta {
  ownerUid: string;
  createdAt: any;
  serverUid?: string;
  rtAdminUid?: string;
  accessUids?: string[];
  rw?: string;
  rt?: string;
  linkedUid?: string;
}

const docMetaCache = new Map<string, CachedDocMeta>();

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

function recordMeta(path: string, data: any) {
  if (!data || typeof data !== 'object') return;
  docMetaCache.set(path, {
    ownerUid: String(data.ownerUid || ''),
    createdAt: data.createdAt,
    serverUid: typeof data.serverUid === 'string' ? data.serverUid : undefined,
    rtAdminUid: typeof data.rtAdminUid === 'string' ? data.rtAdminUid : undefined,
    accessUids: Array.isArray(data.accessUids) ? data.accessUids : undefined,
    rw: typeof data.rw === 'string' ? data.rw : undefined,
    rt: typeof data.rt === 'string' ? data.rt : undefined,
    linkedUid: typeof data.linkedUid === 'string' ? data.linkedUid : undefined,
  });
}

async function resolveExistingMeta(path: string): Promise<CachedDocMeta | null> {
  const cached = docMetaCache.get(path);
  if (cached && cached.ownerUid && cached.createdAt) {
    return cached;
  }
  try {
    const [colName, docId] = path.split('/');
    if (!colName || !docId) return null;
    const snap = await getDoc(doc(db, colName, docId));
    if (!snap.exists()) return null;
    const data = snap.data();
    recordMeta(path, data);
    return docMetaCache.get(path) || null;
  } catch {
    return null;
  }
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

export async function refreshAdminContext(uid: string): Promise<AdminIdentityContext | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== uid) return null;

  const adminRef = doc(db, 'admins', uid);
  let adminSnap;
  try {
    adminSnap = await getDoc(adminRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
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

  try {
    const regSnap = await getDoc(doc(db, 'rtRegistry', `rw_${rw}`));
    if (regSnap.exists()) {
      const reg = regSnap.data();
      if (typeof reg.serverUid === 'string' && reg.serverUid) {
        serverUid = reg.serverUid;
      }
      if (reg.adminsByRt && typeof reg.adminsByRt === 'object') {
        adminsByRt = reg.adminsByRt;
      }
    }
  } catch {
    // non-fatal if registry hasn't been created yet
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
}

async function upsertRtRegistry(params: {
  rw: string;
  ownerUid: string;
  serverUid?: string;
  addRt?: string;
  addAdminUid?: string;
}) {
  const rw = normalizeRWCode(params.rw, DEFAULT_RW);
  const regId = `rw_${rw}`;
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
  if (!uid) return;

  const rw = normalizeRWCode(rwRaw, ctx?.rw || DEFAULT_RW);
  const rt =
    rtRaw.toUpperCase() === 'SEMUA'
      ? ctx?.rt && ctx.rt !== 'SEMUA'
        ? ctx.rt
        : DEFAULT_RT
      : extractRTFromScope(rtRaw, DEFAULT_RT);

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
          let changed = !existing;

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

export async function claimAndSyncManifestDocs(): Promise<number> {
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser) return 0;

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
      recordMeta(docPath, data);

      const docRw = normalizeRWCode(data.rw, ctx.rw);
      const docRt =
        data.rt === 'SEMUA' ? 'SEMUA' : extractRTFromScope(data.rt, DEFAULT_RT, true);

      if (docRw !== ctx.rw) return;
      if (ctx.role === 'admin') {
        if (docRt === 'SEMUA' && colName === 'settings') return;
        if (docRt !== ctx.rt && docRt !== 'SEMUA') return;
        if (colName === 'adminAccounts' && data.authUid !== ctx.uid) return;
      }

      const assignedRtUids =
        docRt === 'SEMUA'
          ? Object.values(effectiveAdminsByRt).flat()
          : Array.isArray(effectiveAdminsByRt[docRt])
          ? effectiveAdminsByRt[docRt]
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
        ctx.role === 'admin' &&
        colName !== 'adminAccounts' &&
        colName !== 'settings' &&
        data.rtAdminUid !== ctx.uid;

      if (missingUid || needsServerUid || needsRtUid) {
        const nextUids = Array.from(
          new Set([
            ...desiredUids,
            ...(typeof data.ownerUid === 'string' ? [data.ownerUid] : []),
            ...currentAccessUids,
          ])
        )
          .filter(Boolean)
          .slice(0, 15);

        const patch: Record<string, any> = {
          accessUids: nextUids,
          updatedAt: serverTimestamp(),
        };
        if (effectiveServerUid) patch.serverUid = effectiveServerUid;
        if (ctx.role === 'admin' && colName !== 'adminAccounts') {
          patch.rtAdminUid = ctx.uid;
        }
        updates.push({ ref: doc(db, colName, id), path: docPath, patch });
      }
    };

    // 1. Read every doc listed in rtManifest for the assigned RW/RT scope
    for (const rtCode of rtsToCheck) {
      if (!rtCode || rtCode === 'SEMUA') continue;
      const scopeId = `rt_${rtCode}_rw_${ctx.rw}`;
      const manifestSnap = await getDoc(doc(db, 'rtManifest', scopeId)).catch(() => null);
      if (!manifestSnap || !manifestSnap.exists()) continue;

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
    }

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

    const ownerField = ctx.role === 'server' ? 'serverUid' : 'rtAdminUid';
    await Promise.all(
      CLAIM_ABLE_COLLECTIONS.map(async (colName) => {
        const queries = [
          query(collection(db, colName), where('ownerUid', '==', ctx.uid)),
          query(collection(db, colName), where(ownerField, '==', ctx.uid)),
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
  } catch (err) {
    console.warn('claimAndSyncManifestDocs warning:', err);
  }
  return updatedCount;
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

    if (reconciledPathsThisSession.has(docPath)) continue;
    reconciledPathsThisSession.add(docPath);

    if (ctx.role === 'admin') {
      if (colName === 'settings' && rt === 'SEMUA') continue;
      if (colName === 'adminAccounts' && data.authUid !== ctx.uid) continue;
      if (rt !== ctx.rt && rt !== 'SEMUA') continue;
    }

    const assignedRtUids =
      rt === 'SEMUA'
        ? Object.values(ctx.adminsByRt || {}).flat()
        : Array.isArray(ctx.adminsByRt?.[rt])
        ? ctx.adminsByRt[rt]
        : [];
    const desiredUids = [
      ctx.uid,
      ...(ctx.serverUid ? [ctx.serverUid] : []),
      ...assignedRtUids,
    ].filter(Boolean);

    const existingUids: string[] = Array.isArray(data.accessUids) ? data.accessUids : [];
    const missing = desiredUids.some((u) => !existingUids.includes(u));
    const needsServer = Boolean(ctx.serverUid && data.serverUid !== ctx.serverUid);

    if (missing || needsServer) {
      const nextUids = Array.from(
        new Set([
          ...desiredUids,
          ...(typeof data.ownerUid === 'string' ? [data.ownerUid] : []),
          ...existingUids,
        ])
      )
        .filter(Boolean)
        .slice(0, 15);
      const patch: Record<string, any> = {
        accessUids: nextUids,
        updatedAt: serverTimestamp(),
      };
      if (ctx.serverUid) patch.serverUid = ctx.serverUid;
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
        await setDoc(adminRef, {
          uid: fbUser.uid,
          email,
          displayName: fbUser.displayName || 'Super Admin Server RW 05',
          username: DEFAULT_SERVER_USERNAME,
          role: 'server',
          rt: 'SEMUA',
          rw: DEFAULT_RW,
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

    await claimAndSyncManifestDocs();

    return {
      ok: true,
      user: {
        role: ctx.role,
        username: ctx.username,
        nama: ctx.displayName,
        rtScope:
          ctx.role === 'server' ? 'Semua RT se-RW 05 Glempang' : `RT ${ctx.rt} RW ${ctx.rw}`,
        isPinAuthenticated: true,
      },
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
          const batch = writeBatch(db);
          batch.set(lockRef, {
            id: 'serverLock',
            serverUid: fbUser.uid,
            rw: DEFAULT_RW,
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
            rtScope: 'Semua RT se-RW 05 Glempang',
            status: 'aktif',
            ownerUid: fbUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'rtRegistry', `rw_${DEFAULT_RW}`), {
            id: `rw_${DEFAULT_RW}`,
            rw: DEFAULT_RW,
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
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || email,
            displayName: 'Super Admin Server RW 05 Glempang',
            username: DEFAULT_SERVER_USERNAME,
            role: 'server',
            rt: 'SEMUA',
            rw: DEFAULT_RW,
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

      await claimAndSyncManifestDocs();

      return {
        ok: true,
        user: {
          role: 'server',
          username: ctx.username,
          nama: ctx.displayName,
          rtScope: 'Semua RT se-RW 05 Glempang',
          isPinAuthenticated: false,
        },
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
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email: fbUser.email || email,
            displayName: 'Bpk. Suwardi (Ketua RT 08)',
            username: 'Admin',
            role: 'admin',
            rt: DEFAULT_RT,
            rw: DEFAULT_RW,
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

      await claimAndSyncManifestDocs();

      // Update last login timestamp on own adminAccounts record if present
      const nowLabel = formatWaktuSyncID();
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

      return {
        ok: true,
        user: {
          role: ctx.role,
          username: ctx.username,
          nama: ctx.displayName,
          rtScope: `RT ${ctx.rt} RW ${ctx.rw}`,
          isPinAuthenticated: false,
        },
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
    const enteredName = u.toLowerCase();
    const storedName = String(matchedDoc.nama || '').trim().toLowerCase();
    if (enteredName && storedName && enteredName !== storedName) {
      await signOut(auth);
      return {
        ok: false,
        message: `Nama Kepala Keluarga "${u}" tidak cocok dengan data No KK tersebut.`,
      };
    }

    const rt = normalizeRTCode(matchedDoc.rt) || DEFAULT_RT;
    const rw = normalizeRWCode(matchedDoc.rw, DEFAULT_RW);

    return {
      ok: true,
      user: {
        role: 'warga',
        username: matchedDoc.nama,
        nama: matchedDoc.nama,
        noKK: matchedDoc.noKK,
        wargaId: matchedDoc.id,
        rtScope: `RT ${rt} RW ${rw}`,
        isPinAuthenticated: false,
      },
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
      await setDoc(adminRef, {
        uid: fbUser.uid,
        email: fbUser.email || email,
        displayName: account.nama,
        username,
        role: 'admin',
        rt,
        rw,
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

    await claimAndSyncManifestDocs();

    return {
      ok: true,
      migrationOk,
      account: savedAccount,
      user: {
        role: 'admin',
        username: savedAccount.username,
        nama: savedAccount.nama,
        rtScope: `RT ${rt} RW ${rw}`,
        isPinAuthenticated: false,
      },
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
    return null;
  }

  // 1. Check /admins/{uid}
  const ctx = await refreshAdminContext(fbUser.uid);
  if (ctx) {
    // Ensure session recovery claims all RT/RW docs for this device immediately
    await claimAndSyncManifestDocs().catch(() => {});
    return {
      role: ctx.role,
      username: ctx.username,
      nama: ctx.displayName,
      rtScope:
        ctx.role === 'server' ? 'Semua RT se-RW 05 Glempang' : `RT ${ctx.rt} RW ${ctx.rw}`,
      isPinAuthenticated: false,
    };
  }

  // 2. Check /wargaProfiles/{uid} + /warga
  try {
    const profSnap = await getDoc(doc(db, 'wargaProfiles', fbUser.uid));
    if (profSnap.exists()) {
      const p = profSnap.data();
      return {
        role: 'warga',
        username: String(p.nama || 'Warga'),
        nama: String(p.nama || 'Warga'),
        noKK: String(p.noKK || ''),
        wargaId: String(p.wargaId || ''),
        rtScope: `RT ${normalizeRTCode(p.rt) || DEFAULT_RT} RW ${normalizeRWCode(p.rw, DEFAULT_RW)}`,
        isPinAuthenticated: false,
      };
    }

    const q = query(collection(db, 'warga'), where('linkedUid', '==', fbUser.uid));
    const wSnap = await getDocs(q);
    if (!wSnap.empty) {
      const w = wSnap.docs[0].data() as Warga;
      return {
        role: 'warga',
        username: w.nama,
        nama: w.nama,
        noKK: w.noKK,
        wargaId: w.id,
        rtScope: `RT ${normalizeRTCode(w.rt) || DEFAULT_RT} RW ${normalizeRWCode(w.rw, DEFAULT_RW)}`,
        isPinAuthenticated: false,
      };
    }
  } catch {
    // ignore unresolved profile
  }

  return null;
}

export async function logoutFromFirebase(): Promise<void> {
  activeAdminContext = null;
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
  const ctx = activeAdminContext;
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
      if (existingSnap && existingSnap.exists()) {
        await updateDoc(adminRef, {
          email,
          displayName: account.nama,
          username,
          role: 'admin',
          rt,
          rtScope: `RT ${rt} RW ${rw}`,
          status: account.status === 'nonaktif' ? 'nonaktif' : 'aktif',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else {
        await setDoc(adminRef, {
          uid: targetUid,
          email,
          displayName: account.nama,
          username,
          role: 'admin',
          rt,
          rw,
          rtScope: `RT ${rt} RW ${rw}`,
          status: account.status === 'nonaktif' ? 'nonaktif' : 'aktif',
          ownerUid: ctx.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
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

export async function provisionWargaAuthAccounts(
  wargaList: Array<Warga & { linkedUid?: string }>
): Promise<number> {
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser || wargaProvisioningActive) return 0;

  const candidates = wargaList.filter((w) => {
    const digits = String(w.noKK || '').replace(/\D/g, '');
    return digits.length >= 6 && !w.linkedUid;
  });

  if (candidates.length === 0) return 0;
  wargaProvisioningActive = true;
  let provisionedCount = 0;

  try {
    const secAuth = await getSecondaryAuth();
    let batch = writeBatch(db);
    let ops = 0;

    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    for (const w of candidates) {
      const noKKDigits = String(w.noKK || '').replace(/\D/g, '');
      const email = toWargaEmail(noKKDigits);
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

      if (!wargaUid) continue;

      const rt = normalizeRTCode(w.rt) || DEFAULT_RT;
      const rw = normalizeRWCode(w.rw, ctx.rw || DEFAULT_RW);
      const wargaId = toValidDocId(w.id, 'w');

      batch.set(doc(db, 'wargaProfiles', wargaUid), {
        uid: wargaUid,
        wargaId,
        noKK: w.noKK,
        nama: w.nama,
        rt,
        rw,
        ownerUid: ctx.uid,
        ...(ctx.serverUid ? { serverUid: ctx.serverUid } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'warga', wargaId), {
        linkedUid: wargaUid,
        updatedAt: serverTimestamp(),
      });
      ops += 2;
      provisionedCount++;

      if (ops >= 40) {
        await flush();
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    await flush();
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
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  return stripUndefinedDeep({
    id,
    tanggal: String(tx.tanggal || new Date().toISOString().split('T')[0]).slice(0, 32) || new Date().toISOString().split('T')[0],
    kategori: String(tx.kategori || 'Kas Umum').slice(0, 120) || 'Kas Umum',
    keterangan: String(tx.keterangan || '-').slice(0, 500),
    nominal: toFiniteNumberOrDefault(tx.nominal, 0),
    tipe: tx.tipe === 'keluar' || tx.tipe === 'kematian' ? tx.tipe : 'masuk',
    namaWarga: tx.namaWarga ? String(tx.namaWarga).slice(0, 160) : undefined,
    nomorRumah: tx.nomorRumah ? String(tx.nomorRumah).slice(0, 32) : undefined,
    noKK: tx.noKK ? String(tx.noKK).slice(0, 32) : undefined,
    isSaldoAwal: typeof tx.isSaldoAwal === 'boolean' ? tx.isSaldoAwal : undefined,
    tahun: toFiniteNumberOrUndefined(tx.tahun),
    rt,
    rw,
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
    rtScope: String(p.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
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
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const resolvedAuthUid = acc.authUid || fallbackAuthUid;
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
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const { updatedAt: _dropStringUpdatedAt, ...cleanSettings } = pengaturanKas;
  return stripUndefinedDeep({
    id: settingId,
    rw,
    rt,
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

export async function saveWargaDoc(w: Warga): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(w.id, 'w');
  const path = `warga/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildWargaFirestorePayload({ ...w, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'warga', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { warga: [id] });
    await upsertRtRegistry({ rw: payload.rw, ownerUid: payload.ownerUid, addRt: payload.rt });

    if (!payload.linkedUid) {
      provisionWargaAuthAccounts([{ ...w, id }]).catch(() => {});
    }
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deleteWargaDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'w');
  const path = `warga/${id}`;
  try {
    await deleteDoc(doc(db, 'warga', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function updateWargaSelfDoc(
  wargaId: string,
  patch: { pin?: string; telepon?: string }
): Promise<{ ok: boolean; message?: string }> {
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
  try {
    await updateDoc(doc(db, 'warga', id), updateBody);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function bulkSaveWargaAndBantuanDocs(
  wargaList: Warga[],
  bantuanList: BantuanPemerintah[]
): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  try {
    let batch = writeBatch(db);
    let ops = 0;
    const manifestBucketsByRt = new Map<string, { warga: string[]; bantuan: string[] }>();
    const rw = activeAdminContext?.rw || DEFAULT_RW;

    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    for (const w of wargaList) {
      const id = toValidDocId(w.id, 'w');
      const path = `warga/${id}`;
      const existing = docMetaCache.get(path) || null;
      const payload = buildWargaFirestorePayload({ ...w, id }, existing, activeAdminContext);
      batch.set(doc(db, 'warga', id), payload);
      ops++;

      const entry = manifestBucketsByRt.get(payload.rt) || { warga: [], bantuan: [] };
      entry.warga.push(id);
      manifestBucketsByRt.set(payload.rt, entry);

      if (ops >= 350) await flush();
    }

    for (const b of bantuanList) {
      const id = toValidDocId(b.id, 'b');
      const path = `bantuan/${id}`;
      const existing = docMetaCache.get(path) || null;
      const payload = buildBantuanFirestorePayload({ ...b, id }, existing, activeAdminContext);
      batch.set(doc(db, 'bantuan', id), payload);
      ops++;

      const entry = manifestBucketsByRt.get(payload.rt) || { warga: [], bantuan: [] };
      entry.bantuan.push(id);
      manifestBucketsByRt.set(payload.rt, entry);

      if (ops >= 350) await flush();
    }

    await flush();

    for (const [rtCode, bucket] of manifestBucketsByRt.entries()) {
      await appendDocIdsToManifest(rw, rtCode, bucket);
      await upsertRtRegistry({
        rw,
        ownerUid: auth.currentUser.uid,
        serverUid: activeAdminContext?.serverUid,
        addRt: rtCode,
      });
    }

    provisionWargaAuthAccounts(wargaList).catch(() => {});
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, 'warga');
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveTransactionDoc(tx: Transaction): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(tx.id, 'tx');
  const path = `transactions/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildTransactionFirestorePayload({ ...tx, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'transactions', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { transactions: [id] });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deleteTransactionDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'tx');
  const path = `transactions/${id}`;
  try {
    await deleteDoc(doc(db, 'transactions', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveBantuanDoc(b: BantuanPemerintah): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(b.id, 'b');
  const path = `bantuan/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildBantuanFirestorePayload({ ...b, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'bantuan', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { bantuan: [id] });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deleteBantuanDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'b');
  const path = `bantuan/${id}`;
  try {
    await deleteDoc(doc(db, 'bantuan', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function savePengumumanDoc(p: PengumumanRT): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(p.id, 'p');
  const path = `pengumuman/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildPengumumanFirestorePayload({ ...p, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'pengumuman', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { pengumuman: [id] });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deletePengumumanDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'p');
  const path = `pengumuman/${id}`;
  try {
    await deleteDoc(doc(db, 'pengumuman', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveDokumenDoc(d: DokumenPdfWarga): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(d.id, 'doc');
  const path = `dokumen/${id}`;
  if (d.dataBase64 && d.dataBase64.length > 850000) {
    return {
      ok: false,
      message: 'Ukuran file PDF melebihi batas dokumen Firestore (~850 KB). Kompres file PDF terlebih dahulu.',
    };
  }
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildDokumenFirestorePayload({ ...d, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'dokumen', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { dokumen: [id] });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deleteDokumenDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'doc');
  const path = `dokumen/${id}`;
  try {
    await deleteDoc(doc(db, 'dokumen', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveAdminAccountDoc(
  acc: AdminRTAccount,
  authUidOverride?: string
): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(acc.id, 'adm');
  const path = `adminAccounts/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildAdminAccountFirestorePayload(
      { ...acc, id },
      existing,
      activeAdminContext,
      authUidOverride
    );
    await setDoc(doc(db, 'adminAccounts', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { adminAccounts: [id] });
    await upsertRtRegistry({
      rw: payload.rw,
      ownerUid: payload.ownerUid,
      serverUid: activeAdminContext?.serverUid,
      addRt: payload.rt,
      addAdminUid: payload.authUid,
    });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function deleteAdminAccountDoc(idRaw: string): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(idRaw, 'adm');
  const path = `adminAccounts/${id}`;
  try {
    await deleteDoc(doc(db, 'adminAccounts', id));
    docMetaCache.delete(path);
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveLaporanDoc(
  lap: PembaruanBulananRT
): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser) return { ok: false, message: 'Belum login ke Firebase.' };
  const id = toValidDocId(lap.id, 'lap');
  const path = `laporanBulanan/${id}`;
  try {
    const existing = await resolveExistingMeta(path);
    const payload = buildLaporanFirestorePayload({ ...lap, id }, existing, activeAdminContext);
    await setDoc(doc(db, 'laporanBulanan', id), payload);
    await appendDocIdsToManifest(payload.rw, payload.rt, { laporanBulanan: [id] });
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
}

export async function saveSettingsDoc(
  pengaturanKas: PengaturanKas,
  tahunAktif: number
): Promise<{ ok: boolean; message?: string }> {
  if (!auth.currentUser || !activeAdminContext) {
    return { ok: false, message: 'Belum login ke Firebase.' };
  }
  const ctx = activeAdminContext;
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

  try {
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
    await setDoc(doc(db, 'settings', settingId), payload);
    if (rt !== 'SEMUA') {
      await appendDocIdsToManifest(rw, rt, { settings: [settingId] });
    }
    return { ok: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (jsonErr: any) {
      return { ok: false, message: jsonErr?.message || err?.message };
    }
  }
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
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser) return;
  const rt =
    ctx.role === 'admin' && ctx.rt !== 'SEMUA'
      ? ctx.rt
      : extractRTFromScope(params.rt, DEFAULT_RT);
  const rw =
    ctx.role === 'admin' ? ctx.rw || DEFAULT_RW : normalizeRWCode(params.rw, ctx.rw || DEFAULT_RW);
  if (rt === 'SEMUA') return;

  const scopeId = `rt_${rt}_rw_${rw}`;
  const path = `rtPublicSummaries/${scopeId}`;
  const existing = await resolveExistingMeta(path);

  const rtTransactions = params.transactions
    .filter((t) => getTransactionRTCode(t, params.wargaList, rt) === rt)
    .slice(0, 2000)
    .map((t) => {
      const { noKK: _stripNoKK, ...publicTx } = t;
      return stripUndefinedDeep(publicTx);
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

  try {
    await setDoc(doc(db, 'rtPublicSummaries', scopeId), payload);
  } catch (err) {
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
        batch.set(doc(db, w.colName, w.id), w.payload);
      }
      await batch.commit();
      succeeded.push(...chunk);
    } catch {
      const settled = await Promise.allSettled(
        chunk.map((w) => setDoc(doc(db, w.colName, w.id), w.payload))
      );
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          succeeded.push(chunk[idx]);
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
    const existing = docMetaCache.get(`warga/${id}`) || null;
    const payload = buildWargaFirestorePayload({ ...w, id }, existing, ctx);
    standardWrites.push({ colName: 'warga', id, payload, rt: payload.rt });
  }

  for (const t of missing.transactions) {
    const id = toValidDocId(t.id, 'tx');
    const existing = docMetaCache.get(`transactions/${id}`) || null;
    const payload = buildTransactionFirestorePayload({ ...t, id }, existing, ctx);
    standardWrites.push({ colName: 'transactions', id, payload, rt: payload.rt });
  }

  for (const b of missing.bantuanList) {
    const id = toValidDocId(b.id, 'b');
    const existing = docMetaCache.get(`bantuan/${id}`) || null;
    const payload = buildBantuanFirestorePayload({ ...b, id }, existing, ctx);
    standardWrites.push({ colName: 'bantuan', id, payload, rt: payload.rt });
  }

  for (const p of missing.pengumumanList) {
    const id = toValidDocId(p.id, 'p');
    const existing = docMetaCache.get(`pengumuman/${id}`) || null;
    const payload = buildPengumumanFirestorePayload({ ...p, id }, existing, ctx);
    standardWrites.push({ colName: 'pengumuman', id, payload, rt: payload.rt });
  }

  for (const d of missing.dokumenList) {
    if (d.dataBase64 && d.dataBase64.length > 850000) {
      skippedOversized++;
      continue;
    }
    const id = toValidDocId(d.id, 'doc');
    const existing = docMetaCache.get(`dokumen/${id}`) || null;
    const payload = buildDokumenFirestorePayload({ ...d, id }, existing, ctx);
    dokumenWrites.push({ colName: 'dokumen', id, payload, rt: payload.rt });
  }

  for (const lap of missing.laporanBulananRT) {
    const id = toValidDocId(lap.id, 'lap');
    const existing = docMetaCache.get(`laporanBulanan/${id}`) || null;
    const payload = buildLaporanFirestorePayload({ ...lap, id }, existing, ctx);
    standardWrites.push({ colName: 'laporanBulanan', id, payload, rt: payload.rt });
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

export function subscribeFirestoreState(
  user: AuthUser,
  onUpdate: (partial: Partial<FirestoreRealtimeSnapshot>, isFirstReady: boolean) => void,
  onStatusChange?: (
    connected: boolean,
    errMsg?: string | null,
    phase?: 'connecting' | 'synced' | 'error'
  ) => void
): () => void {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    onStatusChange?.(false, 'Sesi Firebase belum aktif.', 'error');
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];
  let disposed = false;
  let initialClaimDone = user.role === 'warga';

  onStatusChange?.(true, null, 'connecting');

  const readyFlags = new Set<string>();
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

  let latestPartialAccumulator: Partial<FirestoreRealtimeSnapshot> = {};

  const markReady = (key: string, partial: Partial<FirestoreRealtimeSnapshot>) => {
    if (disposed) return;
    readyFlags.add(key);
    latestPartialAccumulator = { ...latestPartialAccumulator, ...partial };
    const allListenersReady = expectedKeys.every((k) => readyFlags.has(k));
    const isFirstReady = allListenersReady && initialClaimDone;
    if (isFirstReady) {
      onStatusChange?.(true, null, 'synced');
    } else {
      onStatusChange?.(true, null, 'connecting');
    }
    onUpdate(partial, isFirstReady);
  };

  if (user.role === 'warga') {
    const qWarga = query(collection(db, 'warga'), where('linkedUid', '==', fbUser.uid));
    let summaryUnsub: Unsubscribe | null = null;
    let activeScopeId = '';

    unsubs.push(
      onSnapshot(
        qWarga,
        (snap) => {
          const list: Warga[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            recordMeta(`warga/${docSnap.id}`, d);
            list.push({
              ...(d as unknown as Warga),
              id: docSnap.id,
              updatedAt: tsToIso(d.updatedAt),
            });
          });
          markReady('warga', { wargaList: list });

          const first = list[0];
          const rt = first ? getWargaRTCode(first, DEFAULT_RT) : extractRTFromScope(user.rtScope);
          const rw = normalizeRWCode(first?.rw, DEFAULT_RW);
          const scopeId = `rt_${rt}_rw_${rw}`;

          if (scopeId !== activeScopeId) {
            activeScopeId = scopeId;
            if (summaryUnsub) summaryUnsub();
            summaryUnsub = onSnapshot(
              doc(db, 'rtPublicSummaries', scopeId),
              (sumSnap) => {
                if (sumSnap.exists()) {
                  const s = sumSnap.data();
                  markReady('rtPublicSummary', {
                    tahunAktif: Number(s.tahunAktif) || 2026,
                    pengaturanKas: s.pengaturanKas as PengaturanKas | undefined,
                    transactions: Array.isArray(s.transactions) ? s.transactions : [],
                    pengumumanList: Array.isArray(s.pengumuman) ? s.pengumuman : [],
                  });
                } else {
                  markReady('rtPublicSummary', {});
                }
              },
              (err) => {
                reportFirestoreError(err, OperationType.GET, `rtPublicSummaries/${scopeId}`);
                onStatusChange?.(false, err.message, 'error');
                markReady('rtPublicSummary', {});
              }
            );
          }
        },
        (err) => {
          reportFirestoreError(err, OperationType.GET, 'warga');
          onStatusChange?.(false, err.message, 'error');
        }
      )
    );

    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      if (summaryUnsub) summaryUnsub();
    };
  }

  // ADMIN RT or SERVER PUSAT: Ensure activeAdminContext & initial manifest claim before declaring firstReady
  (async () => {
    try {
      if (!activeAdminContext || activeAdminContext.uid !== fbUser.uid) {
        await refreshAdminContext(fbUser.uid);
      }
      await claimAndSyncManifestDocs();
    } catch {
      // non-fatal, listeners stay active
    } finally {
      if (!disposed) {
        initialClaimDone = true;
        const allListenersReady = expectedKeys.every((k) => readyFlags.has(k));
        if (allListenersReady) {
          onStatusChange?.(true, null, 'synced');
          onUpdate({}, true);
        }
      }
    }
  })();

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
    const qCol = query(
      collection(db, colName),
      where('accessUids', 'array-contains', fbUser.uid)
    );
    unsubs.push(
      onSnapshot(
        qCol,
        (snap) => {
          const items: T[] = [];
          const rawForReconcile: Array<{ id: string; data: Record<string, any> }> = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            recordMeta(`${colName}/${docSnap.id}`, d);
            if (!isDocInScope(colName, d)) return;
            rawForReconcile.push({ id: docSnap.id, data: d });
            items.push({
              ...(d as unknown as T),
              id: docSnap.id,
              updatedAt: tsToIso(d.updatedAt),
            });
          });
          const deduped = dedupeEntityList(items, [], altMatch);
          markReady(colName, { [key]: deduped } as any);

          if (rawForReconcile.length > 0) {
            reconcileLoadedDocsWithManifestAndAcls(colName, rawForReconcile).catch(() => {});
          }
        },
        (err) => {
          reportFirestoreError(err, OperationType.GET, colName);
          onStatusChange?.(
            false,
            `Gagal menyinkronkan ${colName}: ${err.message}`,
            'error'
          );
          readyFlags.add(colName);
        }
      )
    );
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
  unsubs.push(
    onSnapshot(
      query(collection(db, 'settings'), where('accessUids', 'array-contains', fbUser.uid)),
      async (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data();
          recordMeta(`settings/${d.id}`, data);
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
            ...rest
          } = chosen;
          markReady('settings', {
            tahunAktif: Number(chosen.tahunAktif) || 2026,
            pengaturanKas: {
              ...(rest as PengaturanKas),
              updatedAt: tsToIso(chosen.updatedAt),
            },
          });
        } else {
          markReady('settings', {});
        }
      },
      (err) => {
        reportFirestoreError(err, OperationType.GET, 'settings');
        onStatusChange?.(false, `Gagal menyinkronkan settings: ${err.message}`, 'error');
        readyFlags.add('settings');
      }
    )
  );

  // Watch rtRegistry changes -> re-claim manifest docs whenever new RT admins or server appear
  const rw = activeAdminContext?.rw || DEFAULT_RW;
  unsubs.push(
    onSnapshot(
      doc(db, 'rtRegistry', `rw_${rw}`),
      async (regSnap) => {
        if (!regSnap.exists()) return;
        const reg = regSnap.data();
        if (activeAdminContext) {
          activeAdminContext = {
            ...activeAdminContext,
            serverUid: typeof reg.serverUid === 'string' ? reg.serverUid : activeAdminContext.serverUid,
            adminsByRt:
              reg.adminsByRt && typeof reg.adminsByRt === 'object'
                ? reg.adminsByRt
                : activeAdminContext.adminsByRt,
          };
          reconciledPathsThisSession.clear();
          await claimAndSyncManifestDocs();
        }
      },
      () => {
        // ignore if rtRegistry not created yet
      }
    )
  );

  return () => {
    disposed = true;
    unsubs.forEach((u) => u());
  };
}

export { testFirestoreConnection };
