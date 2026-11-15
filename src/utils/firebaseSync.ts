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

function stripUndefinedDeep<T>(input: T): T {
  if (input instanceof FieldValue || input instanceof Timestamp) {
    return input;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(input)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return input;
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
  const mergedUids = Array.from(
    new Set([
      ...(existing?.accessUids || []),
      ...scope.accessUids,
      existing?.ownerUid || '',
      fallbackOwnerUid,
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

function extractRTFromScope(scope?: string, fallbackRT = DEFAULT_RT): string {
  const code = normalizeRTCode(scope);
  return code || fallbackRT;
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

  let existing: any = null;
  try {
    const snap = await getDoc(regRef);
    if (snap.exists()) existing = snap.data();
  } catch (err) {
    console.warn('upsertRtRegistry read warning:', err);
  }

  const adminsByRt: Record<string, string[]> = { ...(existing?.adminsByRt || {}) };
  const rtSet = new Set<string>(
    Array.isArray(existing?.registeredRts) ? existing.registeredRts : [DEFAULT_RT]
  );

  if (params.addRt && params.addRt !== 'SEMUA') {
    const normRt = normalizeRTCode(params.addRt);
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

  const payload = stripUndefinedDeep({
    id: regId,
    rw,
    serverUid,
    adminsByRt,
    registeredRts: Array.from(rtSet).slice(0, 100),
    ownerUid: existing?.ownerUid || params.ownerUid,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(regRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rtRegistry/${regId}`);
  }
}

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
      : normalizeRTCode(rtRaw) || DEFAULT_RT;

  const scopeId = `rt_${rt}_rw_${rw}`;
  const manifestRef = doc(db, 'rtManifest', scopeId);

  let existing: any = null;
  try {
    const snap = await getDoc(manifestRef);
    if (snap.exists()) existing = snap.data();
  } catch {
    // ignore read error before create
  }

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

  const payload = stripUndefinedDeep({
    id: scopeId,
    rw,
    rt,
    docIds: nextDocIds,
    ownerUid: existing?.ownerUid || uid,
    serverUid: ctx?.serverUid || existing?.serverUid,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(manifestRef, payload);
  } catch (err) {
    console.warn('appendDocIdsToManifest warning:', err);
  }
}

export async function claimAndSyncManifestDocs(): Promise<number> {
  const ctx = activeAdminContext;
  if (!ctx) return 0;

  let updatedCount = 0;
  try {
    const regRef = doc(db, 'rtRegistry', `rw_${ctx.rw}`);
    const regSnap = await getDoc(regRef);
    const regData = regSnap.exists() ? regSnap.data() : null;

    if (ctx.role === 'server' && regData && regData.serverUid !== ctx.uid) {
      await updateDoc(regRef, {
        serverUid: ctx.uid,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    const rtsToCheck: string[] =
      ctx.role === 'server'
        ? Array.from(
            new Set([
              ...(Array.isArray(regData?.registeredRts) ? regData.registeredRts : []),
              ...Object.keys(regData?.adminsByRt || {}),
              DEFAULT_RT,
            ])
          )
        : [ctx.rt];

    let batch = writeBatch(db);
    let batchOps = 0;

    const commitBatch = async () => {
      if (batchOps > 0) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    };

    for (const rtCode of rtsToCheck) {
      if (!rtCode || rtCode === 'SEMUA') continue;
      const scopeId = `rt_${rtCode}_rw_${ctx.rw}`;
      const manifestSnap = await getDoc(doc(db, 'rtManifest', scopeId)).catch(() => null);
      if (!manifestSnap || !manifestSnap.exists()) continue;

      const docIdsMap: Record<string, string[]> = manifestSnap.data().docIds || {};
      for (const [colName, ids] of Object.entries(docIdsMap)) {
        if (!Array.isArray(ids) || colName === 'rtManifest') continue;
        for (const id of ids) {
          if (!id) continue;
          const ref = doc(db, colName, id);
          const snap = await getDoc(ref).catch(() => null);
          if (!snap || !snap.exists()) continue;
          const data = snap.data();
          recordMeta(`${colName}/${id}`, data);

          const accessUids: string[] = Array.isArray(data.accessUids) ? data.accessUids : [];
          const needsAccess = !accessUids.includes(ctx.uid);
          const needsServerUid = ctx.role === 'server' && data.serverUid !== ctx.uid;
          const needsRtUid =
            ctx.role === 'admin' &&
            colName !== 'adminAccounts' &&
            data.rtAdminUid !== ctx.uid;

          if (needsAccess || needsServerUid || needsRtUid) {
            // Admin RT cannot update other adminAccounts rows unless authUid matches
            if (colName === 'adminAccounts' && ctx.role === 'admin' && data.authUid !== ctx.uid) {
              continue;
            }
            const nextUids = Array.from(new Set([...accessUids, ctx.uid])).slice(0, 15);
            const patch: Record<string, any> = {
              accessUids: nextUids,
              updatedAt: serverTimestamp(),
            };
            if (ctx.role === 'server') patch.serverUid = ctx.uid;
            if (ctx.role === 'admin' && colName !== 'adminAccounts') patch.rtAdminUid = ctx.uid;

            batch.update(ref, patch);
            batchOps++;
            updatedCount++;
            if (batchOps >= 350) await commitBatch();
          }
        }
      }
    }

    await commitBatch();
  } catch (err) {
    console.warn('claimAndSyncManifestDocs warning:', err);
  }
  return updatedCount;
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

    if (legacyData && (legacyData.wargaList?.length || legacyData.transactions?.length)) {
      await migrateSnapshotToFirestore(legacyData);
    }

    await claimAndSyncManifestDocs();

    return {
      ok: true,
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

function buildWargaFirestorePayload(
  w: Warga & { linkedUid?: string },
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(w.id, 'w');
  const rt = normalizeRTCode(w.rt) || (ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);
  const rw = normalizeRWCode(w.rw, ctx?.rw || DEFAULT_RW);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const anggotaKeluarga = Array.isArray(w.anggotaKeluarga)
    ? w.anggotaKeluarga.slice(0, 30).map((a) => stripUndefinedDeep({ ...a }))
    : undefined;

  const riwayatPerubahanKK = Array.isArray(w.riwayatPerubahanKK)
    ? w.riwayatPerubahanKK.slice(0, 50).map((r) => stripUndefinedDeep({ ...r }))
    : undefined;

  return stripUndefinedDeep({
    id,
    no: typeof w.no === 'number' ? w.no : undefined,
    nama: String(w.nama || 'Warga').slice(0, 160),
    noKK: String(w.noKK || '').slice(0, 32),
    nik: w.nik ? String(w.nik).slice(0, 32) : undefined,
    noRumah: String(w.noRumah || '-').slice(0, 32),
    rt,
    rw,
    alamat: w.alamat ? String(w.alamat).slice(0, 300) : undefined,
    kodePos: w.kodePos ? String(w.kodePos).slice(0, 12) : undefined,
    tanggalDikeluarkan: w.tanggalDikeluarkan ? String(w.tanggalDikeluarkan).slice(0, 32) : undefined,
    jenisKelamin: w.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    jumlahJiwa: typeof w.jumlahJiwa === 'number' ? w.jumlahJiwa : anggotaKeluarga?.length || 1,
    statusIuran: w.statusIuran === 'Sudah' ? 'Sudah' : 'Belum',
    anggotaKeluarga,
    telepon: w.telepon ? String(w.telepon).slice(0, 32) : undefined,
    pin: w.pin ? String(w.pin).slice(0, 12) : undefined,
    pinAttempts: typeof w.pinAttempts === 'number' ? w.pinAttempts : undefined,
    pinLockedUntil: typeof w.pinLockedUntil === 'number' ? w.pinLockedUntil : undefined,
    riwayatIuran: w.riwayatIuran,
    riwayatKematian: w.riwayatKematian,
    statusIuranPerTahun: w.statusIuranPerTahun,
    riwayatIuranPerTahun: w.riwayatIuranPerTahun,
    riwayatKematianPerTahun: w.riwayatKematianPerTahun,
    iuranUmumTerbayar: typeof w.iuranUmumTerbayar === 'number' ? w.iuranUmumTerbayar : undefined,
    iuranKematianTerbayar:
      typeof w.iuranKematianTerbayar === 'number' ? w.iuranKematianTerbayar : undefined,
    pilihanSkema:
      w.pilihanSkema === 'bulanan' || w.pilihanSkema === 'tahunan' ? w.pilihanSkema : undefined,
    riwayatPerubahanKK,
    linkedUid: w.linkedUid || existing?.linkedUid,
    ...meta,
  });
}

function buildTransactionFirestorePayload(
  tx: Transaction,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(tx.id, 'tx');
  const rt = extractRTFromScope(tx.rtScope, ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);
  const rw = ctx?.rw || DEFAULT_RW;
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  return stripUndefinedDeep({
    id,
    tanggal: String(tx.tanggal || new Date().toISOString().split('T')[0]).slice(0, 32),
    kategori: String(tx.kategori || 'Kas Umum').slice(0, 120),
    keterangan: String(tx.keterangan || '-').slice(0, 500),
    nominal: Number(tx.nominal) || 0,
    tipe: tx.tipe === 'keluar' || tx.tipe === 'kematian' ? tx.tipe : 'masuk',
    namaWarga: tx.namaWarga ? String(tx.namaWarga).slice(0, 160) : undefined,
    nomorRumah: tx.nomorRumah ? String(tx.nomorRumah).slice(0, 32) : undefined,
    noKK: tx.noKK ? String(tx.noKK).slice(0, 32) : undefined,
    isSaldoAwal: typeof tx.isSaldoAwal === 'boolean' ? tx.isSaldoAwal : undefined,
    tahun: typeof tx.tahun === 'number' ? tx.tahun : undefined,
    rt,
    rw,
    rtScope: String(tx.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
    ...meta,
  });
}

function buildBantuanFirestorePayload(
  b: BantuanPemerintah,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(b.id, 'b');
  const rt = extractRTFromScope(b.rtScope, ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);
  const rw = ctx?.rw || DEFAULT_RW;
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
    jenisBantuan: String(b.jenisBantuan || 'Bantuan Sosial').slice(0, 160),
    namaPenerima: String(b.namaPenerima || 'Warga').slice(0, 160),
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

function buildPengumumanFirestorePayload(
  p: PengumumanRT,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(p.id, 'p');
  const rt = extractRTFromScope(p.rtScope, ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);
  const rw = ctx?.rw || DEFAULT_RW;
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
    judul: String(p.judul || 'Pengumuman RT').slice(0, 200),
    isi: String(p.isi || '-').slice(0, 4000),
    kategori: validKategori,
    tanggal: String(p.tanggal || new Date().toISOString().split('T')[0]).slice(0, 32),
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

function buildDokumenFirestorePayload(
  d: DokumenPdfWarga,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(d.id, 'doc');
  const rt = extractRTFromScope(d.rtScope, ctx?.rt && ctx.rt !== 'SEMUA' ? ctx.rt : DEFAULT_RT);
  const rw = ctx?.rw || DEFAULT_RW;
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  return stripUndefinedDeep({
    id,
    judul: String(d.judul || 'Dokumen RT').slice(0, 200),
    namaFile: String(d.namaFile || 'dokumen.pdf').slice(0, 200),
    ukuranKb: typeof d.ukuranKb === 'number' ? d.ukuranKb : undefined,
    tanggalUpload: d.tanggalUpload ? String(d.tanggalUpload).slice(0, 32) : undefined,
    kategori: String(d.kategori || 'Arsip RT').slice(0, 80),
    keterangan: d.keterangan ? String(d.keterangan).slice(0, 300) : undefined,
    dataBase64: d.dataBase64 ? String(d.dataBase64).slice(0, 850000) : undefined,
    rt,
    rw,
    rtScope: String(d.rtScope || `RT ${rt} RW ${rw}`).slice(0, 64),
    ...meta,
  });
}

function buildAdminAccountFirestorePayload(
  acc: AdminRTAccount & { authUid?: string },
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null,
  fallbackAuthUid?: string
) {
  const uid = auth.currentUser?.uid || ctx?.uid || fallbackAuthUid || 'system';
  const id = toValidDocId(acc.id, 'adm');
  const rt = normalizeRTCode(acc.rt) || DEFAULT_RT;
  const rw = normalizeRWCode(acc.rw, ctx?.rw || DEFAULT_RW);
  const scope = computeScopeMetadata(rt, rw, ctx);
  const meta = mergeScopedOwnership(existing, scope, uid);

  const resolvedAuthUid = acc.authUid || fallbackAuthUid;
  if (resolvedAuthUid && !meta.accessUids.includes(resolvedAuthUid)) {
    meta.accessUids = [...meta.accessUids, resolvedAuthUid].slice(0, 15);
  }

  return stripUndefinedDeep({
    id,
    username: String(acc.username || 'Admin').slice(0, 80),
    passwordHash: String(acc.passwordHash || 'rt08rw05').slice(0, 128),
    nama: String(acc.nama || `Admin RT ${rt}`).slice(0, 160),
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

function buildLaporanFirestorePayload(
  lap: PembaruanBulananRT,
  existing: CachedDocMeta | null,
  ctx: AdminIdentityContext | null
) {
  const uid = auth.currentUser?.uid || ctx?.uid || 'system';
  const id = toValidDocId(lap.id, 'lap');
  const rt = normalizeRTCode(lap.rt) || DEFAULT_RT;
  const rw = normalizeRWCode(lap.rw, ctx?.rw || DEFAULT_RW);
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
    bulanTahun: String(lap.bulanTahun || '-').slice(0, 64),
    tahun: typeof lap.tahun === 'number' ? lap.tahun : undefined,
    totalKK: typeof lap.totalKK === 'number' ? lap.totalKK : undefined,
    totalJiwa: typeof lap.totalJiwa === 'number' ? lap.totalJiwa : undefined,
    totalLunasIuran: typeof lap.totalLunasIuran === 'number' ? lap.totalLunasIuran : undefined,
    totalBelumLunas: typeof lap.totalBelumLunas === 'number' ? lap.totalBelumLunas : undefined,
    totalKasMasukBulanIni:
      typeof lap.totalKasMasukBulanIni === 'number' ? lap.totalKasMasukBulanIni : undefined,
    totalKasKeluarBulanIni:
      typeof lap.totalKasKeluarBulanIni === 'number' ? lap.totalKasKeluarBulanIni : undefined,
    saldoKasUmumBerjalan:
      typeof lap.saldoKasUmumBerjalan === 'number' ? lap.saldoKasUmumBerjalan : undefined,
    saldoKasKematianBerjalan:
      typeof lap.saldoKasKematianBerjalan === 'number' ? lap.saldoKasKematianBerjalan : undefined,
    totalPenerimaBansos:
      typeof lap.totalPenerimaBansos === 'number' ? lap.totalPenerimaBansos : undefined,
    catatanKhusus: lap.catatanKhusus ? String(lap.catatanKhusus).slice(0, 500) : undefined,
    statusVerifikasi: validStatus,
    ...meta,
  });
}

function buildSettingsFirestorePayload(
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
    tahunAktif: Number(tahunAktif) || pengaturanKas.tahunAktif || 2026,
    nominalJimpitanTahunan: cleanSettings.nominalJimpitanTahunan,
    nominalJimpitanBulanan: cleanSettings.nominalJimpitanBulanan,
    nominalKematianTahunan: cleanSettings.nominalKematianTahunan,
    nominalKematianBulanan: cleanSettings.nominalKematianBulanan,
    saldoAwalKasUmum: cleanSettings.saldoAwalKasUmum,
    saldoAwalKasKematian: cleanSettings.saldoAwalKasKematian,
    keteranganSaldoAwal: String(cleanSettings.keteranganSaldoAwal || '').slice(0, 300),
    tanggalSaldoAwal: String(cleanSettings.tanggalSaldoAwal || '').slice(0, 32),
    kontakKetuaRT: cleanSettings.kontakKetuaRT,
    kontakBendahara: cleanSettings.kontakBendahara,
    saldoBerlanjutPerTahun: cleanSettings.saldoBerlanjutPerTahun,
    profilRT: cleanSettings.profilRT,
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
  const rw = normalizeRWCode(pengaturanKas.profilRT?.namaRW, ctx.rw || DEFAULT_RW);
  const rt =
    ctx.role === 'server'
      ? 'SEMUA'
      : normalizeRTCode(pengaturanKas.profilRT?.namaRT) || ctx.rt || DEFAULT_RT;
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
  const rt = normalizeRTCode(params.rt) || DEFAULT_RT;
  const rw = normalizeRWCode(params.rw, ctx.rw || DEFAULT_RW);
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
      const pRt = normalizeRTCode(p.rtScope);
      return !pRt || pRt === rt || String(p.rtScope || '').toUpperCase().includes('SEMUA');
    })
    .slice(0, 200)
    .map((p) => stripUndefinedDeep(p));

  const payload = stripUndefinedDeep({
    id: scopeId,
    rw,
    rt,
    tahunAktif: Number(params.tahunAktif) || 2026,
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

export async function migrateSnapshotToFirestore(
  snapshot: Partial<AppDatabaseSchema>
): Promise<{ ok: boolean; migratedWarga: number; migratedTx: number; message?: string }> {
  const ctx = activeAdminContext;
  if (!ctx || !auth.currentUser) {
    return { ok: false, migratedWarga: 0, migratedTx: 0, message: 'Harus login Admin/Server.' };
  }

  const wargaArr = Array.isArray(snapshot.wargaList) ? snapshot.wargaList : [];
  const txArr = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
  const bantuanArr = Array.isArray(snapshot.bantuanList) ? snapshot.bantuanList : [];
  const pengumumanArr = Array.isArray(snapshot.pengumumanList) ? snapshot.pengumumanList : [];
  const dokumenArr = Array.isArray(snapshot.dokumenList) ? snapshot.dokumenList : [];
  const adminArr = Array.isArray(snapshot.adminAccounts) ? snapshot.adminAccounts : [];
  const laporanArr = Array.isArray(snapshot.laporanBulananRT) ? snapshot.laporanBulananRT : [];
  const tahunAktif = Number(snapshot.tahunAktif) || snapshot.pengaturanKas?.tahunAktif || 2026;

  try {
    let batch = writeBatch(db);
    let ops = 0;
    const manifestByRt = new Map<string, Partial<Record<EntityBucket, string[]>>>();

    const addManifestId = (rt: string, bucket: EntityBucket, id: string) => {
      const m = manifestByRt.get(rt) || {};
      const list = m[bucket] || [];
      list.push(id);
      m[bucket] = list;
      manifestByRt.set(rt, m);
    };

    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    for (const w of wargaArr) {
      const id = toValidDocId(w.id, 'w');
      const existing = docMetaCache.get(`warga/${id}`) || null;
      const payload = buildWargaFirestorePayload({ ...w, id }, existing, ctx);
      batch.set(doc(db, 'warga', id), payload);
      addManifestId(payload.rt, 'warga', id);
      ops++;
      if (ops >= 350) await flush();
    }

    for (const t of txArr) {
      const id = toValidDocId(t.id, 'tx');
      const existing = docMetaCache.get(`transactions/${id}`) || null;
      const payload = buildTransactionFirestorePayload({ ...t, id }, existing, ctx);
      batch.set(doc(db, 'transactions', id), payload);
      addManifestId(payload.rt, 'transactions', id);
      ops++;
      if (ops >= 350) await flush();
    }

    for (const b of bantuanArr) {
      const id = toValidDocId(b.id, 'b');
      const existing = docMetaCache.get(`bantuan/${id}`) || null;
      const payload = buildBantuanFirestorePayload({ ...b, id }, existing, ctx);
      batch.set(doc(db, 'bantuan', id), payload);
      addManifestId(payload.rt, 'bantuan', id);
      ops++;
      if (ops >= 350) await flush();
    }

    for (const p of pengumumanArr) {
      const id = toValidDocId(p.id, 'p');
      const existing = docMetaCache.get(`pengumuman/${id}`) || null;
      const payload = buildPengumumanFirestorePayload({ ...p, id }, existing, ctx);
      batch.set(doc(db, 'pengumuman', id), payload);
      addManifestId(payload.rt, 'pengumuman', id);
      ops++;
      if (ops >= 350) await flush();
    }

    for (const d of dokumenArr) {
      if (d.dataBase64 && d.dataBase64.length > 850000) continue;
      const id = toValidDocId(d.id, 'doc');
      const existing = docMetaCache.get(`dokumen/${id}`) || null;
      const payload = buildDokumenFirestorePayload({ ...d, id }, existing, ctx);
      batch.set(doc(db, 'dokumen', id), payload);
      addManifestId(payload.rt, 'dokumen', id);
      ops++;
      if (ops >= 350) await flush();
    }

    for (const lap of laporanArr) {
      const id = toValidDocId(lap.id, 'lap');
      const existing = docMetaCache.get(`laporanBulanan/${id}`) || null;
      const payload = buildLaporanFirestorePayload({ ...lap, id }, existing, ctx);
      batch.set(doc(db, 'laporanBulanan', id), payload);
      addManifestId(payload.rt, 'laporanBulanan', id);
      ops++;
      if (ops >= 350) await flush();
    }

    await flush();

    if (snapshot.pengaturanKas) {
      await saveSettingsDoc(snapshot.pengaturanKas, tahunAktif);
    }

    for (const acc of adminArr) {
      if (ctx.role === 'server') {
        const prov = await provisionAdminAuthAccount(acc).catch(() => ({ authUid: undefined }));
        await saveAdminAccountDoc(acc, prov.authUid);
      } else if (acc.username.trim().toLowerCase() === ctx.username.trim().toLowerCase()) {
        await saveAdminAccountDoc(acc, ctx.uid);
      }
    }

    for (const [rtCode, bucket] of manifestByRt.entries()) {
      await appendDocIdsToManifest(ctx.rw, rtCode, bucket);
      await upsertRtRegistry({
        rw: ctx.rw,
        ownerUid: ctx.uid,
        serverUid: ctx.serverUid,
        addRt: rtCode,
      });
    }

    if (snapshot.pengaturanKas) {
      const rts = Array.from(manifestByRt.keys());
      for (const rtCode of rts.length > 0 ? rts : [ctx.rt === 'SEMUA' ? DEFAULT_RT : ctx.rt]) {
        await syncRtPublicSummary({
          rt: rtCode,
          rw: ctx.rw,
          tahunAktif,
          pengaturanKas: snapshot.pengaturanKas,
          transactions: txArr,
          pengumumanList: pengumumanArr,
          wargaList: wargaArr,
        });
      }
    }

    provisionWargaAuthAccounts(wargaArr).catch(() => {});

    return {
      ok: true,
      migratedWarga: wargaArr.length,
      migratedTx: txArr.length,
    };
  } catch (err: any) {
    return {
      ok: false,
      migratedWarga: 0,
      migratedTx: 0,
      message: err?.message || 'Gagal memigrasikan data ke Firestore.',
    };
  }
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
  onStatusChange?: (connected: boolean, errMsg?: string | null) => void
): () => void {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    onStatusChange?.(false, 'Sesi Firebase belum aktif.');
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];
  let disposed = false;

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

  const markReady = (key: string, partial: Partial<FirestoreRealtimeSnapshot>) => {
    if (disposed) return;
    readyFlags.add(key);
    onStatusChange?.(true, null);
    const allReady = expectedKeys.every((k) => readyFlags.has(k));
    onUpdate(partial, allReady);
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
                onStatusChange?.(false, err.message);
                markReady('rtPublicSummary', {});
              }
            );
          }
        },
        (err) => {
          onStatusChange?.(false, err.message);
          handleFirestoreError(err, OperationType.GET, 'warga');
        }
      )
    );

    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      if (summaryUnsub) summaryUnsub();
    };
  }

  // ADMIN RT or SERVER PUSAT
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
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            recordMeta(`${colName}/${docSnap.id}`, d);
            items.push({
              ...(d as unknown as T),
              id: docSnap.id,
              updatedAt: tsToIso(d.updatedAt),
            });
          });
          const deduped = dedupeEntityList(items, [], altMatch);
          markReady(colName, { [key]: deduped } as any);
        },
        (err) => {
          onStatusChange?.(false, err.message);
          handleFirestoreError(err, OperationType.GET, colName);
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

  // Settings listener (array-contains + direct fallback getDoc for rw_05 global settings)
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
              : d.rt === activeAdminContext?.rt
          ) || docs[0];

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
        onStatusChange?.(false, err.message);
        handleFirestoreError(err, OperationType.GET, 'settings');
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
