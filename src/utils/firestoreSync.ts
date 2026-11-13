import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, db } from '../firebase';
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
import type { AppDatabaseSchema, DeletedIdsMap } from './cloudSync';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return (cleaned || 'doc_' + Date.now()).slice(0, 128);
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Timestamp);
}

function deepCleanFirestoreValue(val: any): any {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => deepCleanFirestoreValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof val === 'object') {
    if (val instanceof Timestamp || typeof val?.toDate === 'function') {
      return val;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const cleaned = deepCleanFirestoreValue(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return undefined;
}

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return deepCleanFirestoreValue(obj) || {};
}

function tsToIso(val: any, isPendingWrite = false): string | undefined {
  if (!val) return isPendingWrite ? new Date().toISOString() : undefined;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return isPendingWrite ? new Date().toISOString() : undefined;
}

export async function checkIsCloudAdmin(user: User): Promise<boolean> {
  if (!user.emailVerified) return false;
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    const adminPath = `admins/${user.uid}`;
    try {
      const ref = doc(db, 'admins', user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          email: user.email,
          displayName: (user.displayName || 'Pengelola Server').slice(0, 120),
          role: 'server',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
    return true;
  }

  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export interface KnownDocMeta {
  ownerUid: string;
  createdAt: any;
  hash: string;
  hasPendingWrites?: boolean;
  existingKeys?: string[];
  docId?: string;
}

export interface CloudSnapshotHandlers {
  onSettings: (settings: PengaturanKas | null, tahunAktif?: number, meta?: KnownDocMeta) => void;
  onWarga: (items: Warga[], metas: Map<string, KnownDocMeta>) => void;
  onTransactions: (items: Transaction[], metas: Map<string, KnownDocMeta>) => void;
  onBantuan: (items: BantuanPemerintah[], metas: Map<string, KnownDocMeta>) => void;
  onPengumuman: (items: PengumumanRT[], metas: Map<string, KnownDocMeta>) => void;
  onDokumen: (items: DokumenPdfWarga[], metas: Map<string, KnownDocMeta>) => void;
  onAdminAccounts: (items: AdminRTAccount[], metas: Map<string, KnownDocMeta>) => void;
  onLaporanBulanan: (items: PembaruanBulananRT[], metas: Map<string, KnownDocMeta>) => void;
  onInitialReady?: () => void;
  onError: (err: Error) => void;
}

function stableHash(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Date.now());
  }
}

export function subscribeFirestoreCollections(
  user: User,
  isAdmin: boolean,
  handlers: CloudSnapshotHandlers
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const requiredCols = isAdmin
    ? [
        'settings',
        'warga',
        'transactions',
        'pengumuman',
        'bantuan',
        'dokumen',
        'adminAccounts',
        'laporanBulanan',
      ]
    : ['settings', 'warga', 'transactions', 'pengumuman'];
  const loadedCols = new Set<string>();
  let initialReadyFired = false;

  const markCollectionLoaded = (colKey: string) => {
    loadedCols.add(colKey);
    if (!initialReadyFired && requiredCols.every((c) => loadedCols.has(c))) {
      initialReadyFired = true;
      handlers.onInitialReady?.();
    }
  };

  // 1. Settings
  unsubs.push(
    onSnapshot(
      doc(db, 'settings', 'kas'),
      (snap) => {
        if (!snap.exists()) {
          handlers.onSettings(null);
          markCollectionLoaded('settings');
          return;
        }
        const d = snap.data() as any;
        const { ownerUid, updatedAt, tahunAktif, ...rest } = d;
        const settings: PengaturanKas = {
          ...(rest as PengaturanKas),
          tahunAktif: typeof tahunAktif === 'number' ? tahunAktif : 2026,
          updatedAt: tsToIso(updatedAt, snap.metadata.hasPendingWrites),
        };
        const normalizedForHash = sanitizeSettingsForFirestore(
          settings,
          settings.tahunAktif,
          ownerUid || user.uid
        );
        const { ownerUid: _omitted, ...noOwner } = normalizedForHash;
        handlers.onSettings(settings, settings.tahunAktif, {
          ownerUid: ownerUid || user.uid,
          createdAt: updatedAt,
          hash: stableHash(noOwner),
          hasPendingWrites: snap.metadata.hasPendingWrites,
          existingKeys: Object.keys(d),
          docId: snap.id,
        });
        markCollectionLoaded('settings');
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, 'settings/kas');
        } catch (wrapped) {
          handlers.onError(wrapped as Error);
        }
      }
    )
  );

  // 2. Warga (Admin gets all; verified resident gets linkedUid)
  const wargaRef = isAdmin
    ? collection(db, 'warga')
    : query(collection(db, 'warga'), where('linkedUid', '==', user.uid));
  unsubs.push(
    onSnapshot(
      wargaRef,
      (snap) => {
        const metas = new Map<string, KnownDocMeta>();
        const list: Warga[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          const { ownerUid, createdAt, updatedAt, linkedUid, ...rest } = d;
          const item: Warga = {
            ...(rest as Warga),
            id: d.id || docSnap.id,
            updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
          };
          metas.set(docSnap.id, {
            ownerUid: ownerUid || user.uid,
            createdAt,
            hash: stableHash(sanitizeWargaForFirestore(item, ownerUid || user.uid)),
            hasPendingWrites: docSnap.metadata.hasPendingWrites,
            existingKeys: Object.keys(d),
            docId: docSnap.id,
          });
          return item;
        });
        handlers.onWarga(list, metas);
        markCollectionLoaded('warga');
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'warga');
        } catch (wrapped) {
          handlers.onError(wrapped as Error);
        }
      }
    )
  );

  // 3. Transactions (Admin gets all; non-admin scoped to ownerUid)
  const txRef = isAdmin
    ? collection(db, 'transactions')
    : query(collection(db, 'transactions'), where('ownerUid', '==', user.uid));
  unsubs.push(
    onSnapshot(
      txRef,
      (snap) => {
        const metas = new Map<string, KnownDocMeta>();
        const list: Transaction[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          const { ownerUid, createdAt, updatedAt, ...rest } = d;
          const item: Transaction = {
            ...(rest as Transaction),
            id: d.id || docSnap.id,
            updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
          };
          metas.set(docSnap.id, {
            ownerUid: ownerUid || user.uid,
            createdAt,
            hash: stableHash(sanitizeTransactionForFirestore(item, ownerUid || user.uid)),
            hasPendingWrites: docSnap.metadata.hasPendingWrites,
            existingKeys: Object.keys(d),
            docId: docSnap.id,
          });
          return item;
        });
        handlers.onTransactions(list, metas);
        markCollectionLoaded('transactions');
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        } catch (wrapped) {
          handlers.onError(wrapped as Error);
        }
      }
    )
  );

  // 4. Pengumuman (Admin gets all; non-admin scoped to ownerUid)
  const pengumumanRef = isAdmin
    ? collection(db, 'pengumuman')
    : query(collection(db, 'pengumuman'), where('ownerUid', '==', user.uid));
  unsubs.push(
    onSnapshot(
      pengumumanRef,
      (snap) => {
        const metas = new Map<string, KnownDocMeta>();
        const list: PengumumanRT[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          const { ownerUid, createdAt, updatedAt, ...rest } = d;
          const item: PengumumanRT = {
            ...(rest as PengumumanRT),
            id: d.id || docSnap.id,
            updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
          };
          metas.set(docSnap.id, {
            ownerUid: ownerUid || user.uid,
            createdAt,
            hash: stableHash(sanitizePengumumanForFirestore(item, ownerUid || user.uid)),
            hasPendingWrites: docSnap.metadata.hasPendingWrites,
            existingKeys: Object.keys(d),
            docId: docSnap.id,
          });
          return item;
        });
        handlers.onPengumuman(list, metas);
        markCollectionLoaded('pengumuman');
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'pengumuman');
        } catch (wrapped) {
          handlers.onError(wrapped as Error);
        }
      }
    )
  );

  // 5-8. Admin-only collections
  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'bantuan'),
        (snap) => {
          const metas = new Map<string, KnownDocMeta>();
          const list: BantuanPemerintah[] = snap.docs.map((docSnap) => {
            const d = docSnap.data() as any;
            const { ownerUid, createdAt, updatedAt, ...rest } = d;
            const item: BantuanPemerintah = {
              ...(rest as BantuanPemerintah),
              id: d.id || docSnap.id,
              updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
            };
            metas.set(docSnap.id, {
              ownerUid: ownerUid || user.uid,
              createdAt,
              hash: stableHash(sanitizeBantuanForFirestore(item, ownerUid || user.uid)),
              hasPendingWrites: docSnap.metadata.hasPendingWrites,
              existingKeys: Object.keys(d),
              docId: docSnap.id,
            });
            return item;
          });
          handlers.onBantuan(list, metas);
          markCollectionLoaded('bantuan');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'bantuan');
          } catch (wrapped) {
            handlers.onError(wrapped as Error);
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'dokumen'),
        (snap) => {
          const metas = new Map<string, KnownDocMeta>();
          const list: DokumenPdfWarga[] = snap.docs.map((docSnap) => {
            const d = docSnap.data() as any;
            const { ownerUid, createdAt, updatedAt, ...rest } = d;
            const item: DokumenPdfWarga = {
              ...(rest as DokumenPdfWarga),
              id: d.id || docSnap.id,
              updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
            };
            metas.set(docSnap.id, {
              ownerUid: ownerUid || user.uid,
              createdAt,
              hash: stableHash(sanitizeDokumenForFirestore(item, ownerUid || user.uid)),
              hasPendingWrites: docSnap.metadata.hasPendingWrites,
              existingKeys: Object.keys(d),
              docId: docSnap.id,
            });
            return item;
          });
          handlers.onDokumen(list, metas);
          markCollectionLoaded('dokumen');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'dokumen');
          } catch (wrapped) {
            handlers.onError(wrapped as Error);
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'adminAccounts'),
        (snap) => {
          const metas = new Map<string, KnownDocMeta>();
          const list: AdminRTAccount[] = snap.docs.map((docSnap) => {
            const d = docSnap.data() as any;
            const { ownerUid, createdAt, updatedAt, ...rest } = d;
            const item: AdminRTAccount = {
              ...(rest as AdminRTAccount),
              id: d.id || docSnap.id,
              updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
            };
            metas.set(docSnap.id, {
              ownerUid: ownerUid || user.uid,
              createdAt,
              hash: stableHash(sanitizeAdminRTForFirestore(item, ownerUid || user.uid)),
              hasPendingWrites: docSnap.metadata.hasPendingWrites,
              existingKeys: Object.keys(d),
              docId: docSnap.id,
            });
            return item;
          });
          handlers.onAdminAccounts(list, metas);
          markCollectionLoaded('adminAccounts');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'adminAccounts');
          } catch (wrapped) {
            handlers.onError(wrapped as Error);
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'laporanBulanan'),
        (snap) => {
          const metas = new Map<string, KnownDocMeta>();
          const list: PembaruanBulananRT[] = snap.docs.map((docSnap) => {
            const d = docSnap.data() as any;
            const { ownerUid, createdAt, updatedAt, ...rest } = d;
            const item: PembaruanBulananRT = {
              ...(rest as PembaruanBulananRT),
              id: d.id || docSnap.id,
              updatedAt: tsToIso(updatedAt, docSnap.metadata.hasPendingWrites),
            };
            metas.set(docSnap.id, {
              ownerUid: ownerUid || user.uid,
              createdAt,
              hash: stableHash(sanitizeLaporanForFirestore(item, ownerUid || user.uid)),
              hasPendingWrites: docSnap.metadata.hasPendingWrites,
              existingKeys: Object.keys(d),
              docId: docSnap.id,
            });
            return item;
          });
          handlers.onLaporanBulanan(list, metas);
          markCollectionLoaded('laporanBulanan');
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'laporanBulanan');
          } catch (wrapped) {
            handlers.onError(wrapped as Error);
          }
        }
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

function sanitizeWargaForFirestore(w: Warga, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(w.id);
  const safeAnggota = Array.isArray(w.anggotaKeluarga)
    ? w.anggotaKeluarga.filter((x) => isPlainObject(x)).slice(0, 30)
    : undefined;
  const safeRiwayatKK = Array.isArray(w.riwayatPerubahanKK)
    ? w.riwayatPerubahanKK.filter((x) => isPlainObject(x)).slice(0, 50)
    : undefined;

  return stripUndefined({
    id,
    no: typeof w.no === 'number' && Number.isFinite(w.no) ? w.no : 0,
    nama: String(w.nama || 'Warga').slice(0, 160),
    noKK: String(w.noKK || '').slice(0, 32),
    nik: w.nik ? String(w.nik).slice(0, 32) : undefined,
    noRumah: String(w.noRumah || '').slice(0, 32),
    rt: String(w.rt || '08').slice(0, 10),
    rw: w.rw ? String(w.rw).slice(0, 10) : undefined,
    alamat: w.alamat ? String(w.alamat).slice(0, 300) : undefined,
    kodePos: w.kodePos ? String(w.kodePos).slice(0, 12) : undefined,
    tanggalDikeluarkan: w.tanggalDikeluarkan ? String(w.tanggalDikeluarkan).slice(0, 32) : undefined,
    jenisKelamin: w.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    jumlahJiwa:
      typeof w.jumlahJiwa === 'number' && Number.isFinite(w.jumlahJiwa)
        ? w.jumlahJiwa
        : safeAnggota?.length || 1,
    statusIuran: w.statusIuran === 'Sudah' ? 'Sudah' : 'Belum',
    anggotaKeluarga: safeAnggota,
    telepon: w.telepon ? String(w.telepon).slice(0, 32) : undefined,
    pin: w.pin ? String(w.pin).slice(0, 12) : undefined,
    pinAttempts: typeof w.pinAttempts === 'number' ? w.pinAttempts : undefined,
    pinLockedUntil: typeof w.pinLockedUntil === 'number' ? w.pinLockedUntil : undefined,
    riwayatIuran: isPlainObject(w.riwayatIuran) ? w.riwayatIuran : undefined,
    riwayatKematian: isPlainObject(w.riwayatKematian) ? w.riwayatKematian : undefined,
    statusIuranPerTahun: isPlainObject(w.statusIuranPerTahun) ? w.statusIuranPerTahun : undefined,
    riwayatIuranPerTahun: isPlainObject(w.riwayatIuranPerTahun) ? w.riwayatIuranPerTahun : undefined,
    riwayatKematianPerTahun: isPlainObject(w.riwayatKematianPerTahun)
      ? w.riwayatKematianPerTahun
      : undefined,
    iuranUmumTerbayar: typeof w.iuranUmumTerbayar === 'number' ? w.iuranUmumTerbayar : undefined,
    iuranKematianTerbayar:
      typeof w.iuranKematianTerbayar === 'number' ? w.iuranKematianTerbayar : undefined,
    pilihanSkema: w.pilihanSkema === 'bulanan' || w.pilihanSkema === 'tahunan' ? w.pilihanSkema : undefined,
    riwayatPerubahanKK: safeRiwayatKK,
    ownerUid,
  });
}

function sanitizeTransactionForFirestore(t: Transaction, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(t.id);
  return stripUndefined({
    id,
    tanggal: String(t.tanggal || '').slice(0, 32) || new Date().toISOString().split('T')[0],
    kategori: String(t.kategori || 'Iuran Warga').slice(0, 120),
    keterangan: String(t.keterangan || '').slice(0, 500),
    nominal: Number(t.nominal) || 0,
    tipe: t.tipe === 'keluar' || t.tipe === 'kematian' ? t.tipe : 'masuk',
    namaWarga: t.namaWarga ? String(t.namaWarga).slice(0, 160) : undefined,
    nomorRumah: t.nomorRumah ? String(t.nomorRumah).slice(0, 32) : undefined,
    noKK: t.noKK ? String(t.noKK).slice(0, 32) : undefined,
    isSaldoAwal: typeof t.isSaldoAwal === 'boolean' ? t.isSaldoAwal : undefined,
    tahun: typeof t.tahun === 'number' ? t.tahun : undefined,
    rtScope: t.rtScope ? String(t.rtScope).slice(0, 64) : undefined,
    ownerUid,
  });
}

function sanitizeBantuanForFirestore(b: BantuanPemerintah, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(b.id);
  return stripUndefined({
    id,
    jenisBantuan: String(b.jenisBantuan || 'Bantuan').slice(0, 160),
    namaPenerima: String(b.namaPenerima || 'Warga').slice(0, 160),
    noKK: String(b.noKK || '').slice(0, 32),
    nik: b.nik ? String(b.nik).slice(0, 32) : undefined,
    nominalAtauBarang: String(b.nominalAtauBarang || '').slice(0, 200),
    tanggal: String(b.tanggal || '').slice(0, 32),
    status: ['Sudah Disalurkan', 'Proses Verifikasi', 'Baru Diusulkan', 'Ditolak'].includes(b.status)
      ? b.status
      : 'Sudah Disalurkan',
    sumberDana: b.sumberDana ? String(b.sumberDana).slice(0, 160) : undefined,
    keterangan: b.keterangan ? String(b.keterangan).slice(0, 400) : undefined,
    rtScope: b.rtScope ? String(b.rtScope).slice(0, 64) : undefined,
    ownerUid,
  });
}

function sanitizePengumumanForFirestore(p: PengumumanRT, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(p.id);
  return stripUndefined({
    id,
    judul: String(p.judul || 'Pengumuman').slice(0, 200),
    isi: String(p.isi || '-').slice(0, 4000),
    kategori: ['Kegiatan', 'Iuran', 'Keamanan', 'Sosial', 'Umum'].includes(p.kategori)
      ? p.kategori
      : 'Umum',
    tanggal: String(p.tanggal || '').slice(0, 32) || new Date().toISOString().split('T')[0],
    tanggalBerakhir: p.tanggalBerakhir ? String(p.tanggalBerakhir).slice(0, 32) : undefined,
    penulis: p.penulis ? String(p.penulis).slice(0, 120) : undefined,
    namaPengurus: p.namaPengurus ? String(p.namaPengurus).slice(0, 120) : undefined,
    jabatanPengurus: p.jabatanPengurus ? String(p.jabatanPengurus).slice(0, 120) : undefined,
    penting: typeof p.penting === 'boolean' ? p.penting : undefined,
    tentang: p.tentang ? String(p.tentang).slice(0, 200) : undefined,
    hariTanggalAcara: p.hariTanggalAcara ? String(p.hariTanggalAcara).slice(0, 120) : undefined,
    waktuAcara: p.waktuAcara ? String(p.waktuAcara).slice(0, 80) : undefined,
    tempatAcara: p.tempatAcara ? String(p.tempatAcara).slice(0, 200) : undefined,
    keteranganTambahan: p.keteranganTambahan ? String(p.keteranganTambahan).slice(0, 500) : undefined,
    rtScope: p.rtScope ? String(p.rtScope).slice(0, 64) : undefined,
    ownerUid,
  });
}

function sanitizeDokumenForFirestore(d: DokumenPdfWarga, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(d.id);
  return stripUndefined({
    id,
    judul: String(d.judul || d.namaFile || 'Dokumen').slice(0, 200),
    namaFile: String(d.namaFile || 'dokumen.pdf').slice(0, 200),
    ukuranKb: typeof d.ukuranKb === 'number' ? d.ukuranKb : 0,
    tanggalUpload: d.tanggalUpload ? String(d.tanggalUpload).slice(0, 32) : undefined,
    kategori: String(d.kategori || 'Lainnya').slice(0, 80),
    keterangan: d.keterangan ? String(d.keterangan).slice(0, 300) : undefined,
    dataBase64: d.dataBase64 ? String(d.dataBase64).slice(0, 850000) : undefined,
    rtScope: d.rtScope ? String(d.rtScope).slice(0, 64) : undefined,
    ownerUid,
  });
}

function sanitizeAdminRTForFirestore(a: AdminRTAccount, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(a.id);
  return stripUndefined({
    id,
    username: String(a.username || 'Admin').slice(0, 80),
    passwordHash: String(a.passwordHash || '123456').slice(0, 128),
    nama: String(a.nama || 'Admin RT').slice(0, 160),
    rt: String(a.rt || '08').slice(0, 10),
    rw: String(a.rw || '05').slice(0, 10),
    kontak: String(a.kontak || '').slice(0, 40),
    jabatan: String(a.jabatan || 'Ketua RT').slice(0, 120),
    status: a.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    terakhirLogin: a.terakhirLogin ? String(a.terakhirLogin).slice(0, 64) : undefined,
    terakhirSinkronisasi: a.terakhirSinkronisasi ? String(a.terakhirSinkronisasi).slice(0, 64) : undefined,
    ownerUid,
  });
}

function sanitizeLaporanForFirestore(l: PembaruanBulananRT, ownerUid: string): Record<string, any> {
  const id = sanitizeFirestoreId(l.id);
  return stripUndefined({
    id,
    rt: String(l.rt || '08').slice(0, 10),
    rw: String(l.rw || '05').slice(0, 10),
    namaAdminPengirim: String(l.namaAdminPengirim || 'Admin RT').slice(0, 160),
    tanggalKirim: String(l.tanggalKirim || '').slice(0, 32),
    bulanTahun: String(l.bulanTahun || 'Bulan Ini').slice(0, 64),
    tahun: typeof l.tahun === 'number' ? l.tahun : 2026,
    totalKK: typeof l.totalKK === 'number' ? l.totalKK : 0,
    totalJiwa: typeof l.totalJiwa === 'number' ? l.totalJiwa : 0,
    totalLunasIuran: typeof l.totalLunasIuran === 'number' ? l.totalLunasIuran : 0,
    totalBelumLunas: typeof l.totalBelumLunas === 'number' ? l.totalBelumLunas : 0,
    totalKasMasukBulanIni: typeof l.totalKasMasukBulanIni === 'number' ? l.totalKasMasukBulanIni : 0,
    totalKasKeluarBulanIni: typeof l.totalKasKeluarBulanIni === 'number' ? l.totalKasKeluarBulanIni : 0,
    saldoKasUmumBerjalan: typeof l.saldoKasUmumBerjalan === 'number' ? l.saldoKasUmumBerjalan : 0,
    saldoKasKematianBerjalan:
      typeof l.saldoKasKematianBerjalan === 'number' ? l.saldoKasKematianBerjalan : 0,
    totalPenerimaBansos: typeof l.totalPenerimaBansos === 'number' ? l.totalPenerimaBansos : 0,
    catatanKhusus: l.catatanKhusus ? String(l.catatanKhusus).slice(0, 500) : undefined,
    statusVerifikasi: ['Diterima', 'Menunggu Verifikasi', 'Perlu Klarifikasi'].includes(
      l.statusVerifikasi
    )
      ? l.statusVerifikasi
      : 'Menunggu Verifikasi',
    ownerUid,
  });
}

function sanitizeSettingsForFirestore(
  pengaturanKas: PengaturanKas,
  tahunAktif: number,
  ownerUid: string
): Record<string, any> {
  return stripUndefined({
    tahunAktif: Number(tahunAktif) || 2026,
    nominalJimpitanTahunan: Number(pengaturanKas.nominalJimpitanTahunan) || 0,
    nominalJimpitanBulanan: Number(pengaturanKas.nominalJimpitanBulanan) || 0,
    nominalKematianTahunan: Number(pengaturanKas.nominalKematianTahunan) || 0,
    nominalKematianBulanan: Number(pengaturanKas.nominalKematianBulanan) || 0,
    saldoAwalKasUmum: Number(pengaturanKas.saldoAwalKasUmum) || 0,
    saldoAwalKasKematian: Number(pengaturanKas.saldoAwalKasKematian) || 0,
    keteranganSaldoAwal: String(pengaturanKas.keteranganSaldoAwal || '').slice(0, 300),
    tanggalSaldoAwal: String(pengaturanKas.tanggalSaldoAwal || '').slice(0, 32),
    kontakKetuaRT: isPlainObject(pengaturanKas.kontakKetuaRT)
      ? pengaturanKas.kontakKetuaRT
      : { nama: '', telp: '' },
    kontakBendahara: isPlainObject(pengaturanKas.kontakBendahara)
      ? pengaturanKas.kontakBendahara
      : { nama: '', telp: '' },
    saldoBerlanjutPerTahun: isPlainObject(pengaturanKas.saldoBerlanjutPerTahun)
      ? pengaturanKas.saldoBerlanjutPerTahun
      : undefined,
    profilRT: isPlainObject(pengaturanKas.profilRT) ? pengaturanKas.profilRT : undefined,
    ownerUid,
  });
}

export interface KnownMetaRegistry {
  settings?: KnownDocMeta;
  warga: Map<string, KnownDocMeta>;
  transactions: Map<string, KnownDocMeta>;
  bantuan: Map<string, KnownDocMeta>;
  pengumuman: Map<string, KnownDocMeta>;
  dokumen: Map<string, KnownDocMeta>;
  adminAccounts: Map<string, KnownDocMeta>;
  laporanBulanan: Map<string, KnownDocMeta>;
  pendingCreates?: Set<string>;
}

export interface SyncFirestoreResult {
  committed: number;
  deferred: number;
}

interface TrackedWriteOp {
  path: string;
  opType: OperationType;
  colName: string;
  docId: string;
  createPayload?: Record<string, any>;
  updatePayload?: Record<string, any>;
  applyToBatch: (batch: WriteBatch) => void;
  executeSingle: () => Promise<void>;
}

const IMMUTABLE_KEYS = new Set(['id', 'ownerUid', 'createdAt', 'updatedAt']);

function buildUpdatePayload(
  sanitized: Record<string, any>,
  existingKeys?: string[]
): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (IMMUTABLE_KEYS.has(k)) continue;
    payload[k] = v;
  }
  if (Array.isArray(existingKeys)) {
    for (const oldKey of existingKeys) {
      if (IMMUTABLE_KEYS.has(oldKey)) continue;
      if (!(oldKey in sanitized)) {
        payload[oldKey] = deleteField();
      }
    }
  }
  payload.updatedAt = serverTimestamp();
  return payload;
}

// Serialize concurrent syncStateToFirestore calls so overlapping auto-save & manual syncs never race
let syncQueueTail: Promise<any> = Promise.resolve();

/**
 * Commits only changed/new/deleted documents to Firestore in safe chunks (<=350 ops/batch).
 * Preserves immutable fields (`id`, `ownerUid`, `createdAt`) by using `update` for existing docs
 * and isolates individual op failures for clear diagnostics.
 */
export function syncStateToFirestore(
  user: User,
  state: AppDatabaseSchema,
  known: KnownMetaRegistry,
  deletedIds?: Partial<DeletedIdsMap>
): Promise<SyncFirestoreResult> {
  const task = syncQueueTail.then(
    () => runSyncStateToFirestore(user, state, known, deletedIds),
    () => runSyncStateToFirestore(user, state, known, deletedIds)
  );
  syncQueueTail = task.catch(() => {});
  return task;
}

async function runSyncStateToFirestore(
  user: User,
  state: AppDatabaseSchema,
  known: KnownMetaRegistry,
  deletedIds?: Partial<DeletedIdsMap>
): Promise<SyncFirestoreResult> {
  if (!known.pendingCreates) {
    known.pendingCreates = new Set<string>();
  }
  const pendingCreates = known.pendingCreates;
  const ops: TrackedWriteOp[] = [];
  let deferred = 0;

  // 1. Settings
  const settingsOwner = known.settings?.ownerUid || user.uid;
  const settingsPayload = sanitizeSettingsForFirestore(
    state.pengaturanKas,
    state.tahunAktif,
    settingsOwner
  );
  const { ownerUid: _so, ...settingsNoOwner } = settingsPayload;
  const settingsHash = stableHash(settingsNoOwner);

  if (known.settings?.hash !== settingsHash) {
    const settingsRef = doc(db, 'settings', 'kas');
    if (known.settings) {
      if (known.settings.hasPendingWrites) {
        deferred += 1;
      } else {
        const updatePayload = buildUpdatePayload(settingsPayload, known.settings.existingKeys);
        ops.push({
          path: 'settings/kas',
          opType: OperationType.UPDATE,
          colName: 'settings',
          docId: 'kas',
          updatePayload,
          applyToBatch: (batch) => batch.update(settingsRef, updatePayload),
          executeSingle: () => updateDoc(settingsRef, updatePayload),
        });
      }
    } else if (pendingCreates.has('settings/kas')) {
      deferred += 1;
    } else {
      const createPayload = {
        ...settingsPayload,
        updatedAt: serverTimestamp(),
      };
      const updateFallbackPayload = buildUpdatePayload(settingsPayload);
      ops.push({
        path: 'settings/kas',
        opType: OperationType.CREATE,
        colName: 'settings',
        docId: 'kas',
        createPayload,
        updatePayload: updateFallbackPayload,
        applyToBatch: (batch) => batch.set(settingsRef, createPayload),
        executeSingle: () => setDoc(settingsRef, createPayload),
      });
    }
  }

  function queueCollection<T extends { id: string }>(
    colName: string,
    items: T[],
    metaMap: Map<string, KnownDocMeta>,
    sanitizer: (item: T, ownerUid: string) => Record<string, any>,
    deletedList?: string[]
  ) {
    for (const item of items) {
      const docId = sanitizeFirestoreId(item.id);
      const docKey = `${colName}/${docId}`;
      const existingMeta = metaMap.get(docId);
      const ownerUid = existingMeta?.ownerUid || user.uid;
      const sanitized = sanitizer(item, ownerUid);
      const nextHash = stableHash(sanitized);
      const ref = doc(db, colName, docId);

      if (!existingMeta) {
        if (pendingCreates.has(docKey)) {
          deferred += 1;
          continue;
        }
        const createPayload = {
          ...sanitized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const updateFallbackPayload = buildUpdatePayload(sanitized);
        ops.push({
          path: docKey,
          opType: OperationType.CREATE,
          colName,
          docId,
          createPayload,
          updatePayload: updateFallbackPayload,
          applyToBatch: (batch) => batch.set(ref, createPayload),
          executeSingle: () => setDoc(ref, createPayload),
        });
      } else if (existingMeta.hash !== nextHash) {
        if (existingMeta.hasPendingWrites || !existingMeta.createdAt) {
          deferred += 1;
          continue;
        }
        const updatePayload = buildUpdatePayload(sanitized, existingMeta.existingKeys);
        ops.push({
          path: docKey,
          opType: OperationType.UPDATE,
          colName,
          docId,
          updatePayload,
          applyToBatch: (batch) => batch.update(ref, updatePayload),
          executeSingle: () => updateDoc(ref, updatePayload),
        });
      }
    }

    if (deletedList && deletedList.length > 0) {
      for (const delId of deletedList) {
        const docId = sanitizeFirestoreId(delId);
        if (metaMap.has(docId)) {
          const ref = doc(db, colName, docId);
          ops.push({
            path: `${colName}/${docId}`,
            opType: OperationType.DELETE,
            colName,
            docId,
            applyToBatch: (batch) => batch.delete(ref),
            executeSingle: () => deleteDoc(ref),
          });
        }
      }
    }
  }

  queueCollection('warga', state.wargaList, known.warga, sanitizeWargaForFirestore, deletedIds?.warga);
  queueCollection(
    'transactions',
    state.transactions,
    known.transactions,
    sanitizeTransactionForFirestore,
    deletedIds?.transactions
  );
  queueCollection(
    'bantuan',
    state.bantuanList,
    known.bantuan,
    sanitizeBantuanForFirestore,
    deletedIds?.bantuan
  );
  queueCollection(
    'pengumuman',
    state.pengumumanList,
    known.pengumuman,
    sanitizePengumumanForFirestore,
    deletedIds?.pengumuman
  );
  queueCollection(
    'dokumen',
    state.dokumenList,
    known.dokumen,
    sanitizeDokumenForFirestore,
    deletedIds?.dokumen
  );
  queueCollection(
    'adminAccounts',
    state.adminAccounts,
    known.adminAccounts,
    sanitizeAdminRTForFirestore,
    deletedIds?.adminAccounts
  );
  queueCollection(
    'laporanBulanan',
    state.laporanBulananRT,
    known.laporanBulanan,
    sanitizeLaporanForFirestore,
    deletedIds?.laporanBulananRT
  );

  if (ops.length === 0) {
    return { committed: 0, deferred };
  }

  let committed = 0;
  const CHUNK = 350;

  for (let i = 0; i < ops.length; i += CHUNK) {
    const chunk = ops.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const op of chunk) {
      op.applyToBatch(batch);
    }

    try {
      await batch.commit();
      for (const op of chunk) {
        if (op.opType === OperationType.CREATE) {
          pendingCreates.add(op.path);
        }
      }
      committed += chunk.length;
    } catch {
      // Fallback: execute individually to heal create/update races and identify exact failing path
      for (const op of chunk) {
        try {
          if (op.opType === OperationType.CREATE) {
            // Check if document already exists on server (created concurrently or prior to listener settling)
            let existsOnServer = false;
            try {
              const serverSnap = await getDocFromServer(doc(db, op.colName, op.docId));
              existsOnServer = serverSnap.exists();
            } catch {
              existsOnServer = false;
            }
            if (existsOnServer && op.updatePayload) {
              await updateDoc(doc(db, op.colName, op.docId), op.updatePayload);
              committed += 1;
              continue;
            }
          }
          await op.executeSingle();
          if (op.opType === OperationType.CREATE) {
            pendingCreates.add(op.path);
          }
          committed += 1;
        } catch (opErr) {
          handleFirestoreError(opErr, op.opType, op.path);
        }
      }
    }
  }

  return { committed, deferred };
}

