import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  CalendarCheck,
  Users,
  FileText,
  Settings,
  Plus,
  Bell,
  Menu,
  X,
  Sparkles,
  RotateCcw,
  Home,
  CheckCircle2,
  Lock,
  LogOut,
  ShieldCheck,
  User,
  Megaphone,
  Download,
  AlertCircle,
  HandHeart,
  FileArchive,
  KeyRound,
  ShieldAlert,
  Server,
  Send,
  Calendar,
  Database,
  Building,
  FileSpreadsheet,
  Share2,
  CloudUpload,
  Wifi,
  RefreshCw,
} from 'lucide-react';

import { HouseLogo } from './components/HouseLogo';
import { TransactionModal } from './components/TransactionModal';
import { WargaModal } from './components/WargaModal';
import { LoginModal } from './components/LoginModal';
import { PengumumanModal } from './components/PengumumanModal';
import { SaldoAwalModal } from './components/SaldoAwalModal';
import { PinLockModal } from './components/PinLockModal';
import { LupaPasswordModal } from './components/LupaPasswordModal';
import { FloatingNotification } from './components/FloatingNotification';
import { KirimLaporanModal } from './components/KirimLaporanModal';
import { UpgradeKKModal } from './components/UpgradeKKModal';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import {
  AuthUser,
  Transaction,
  Warga,
  AnggotaKeluarga,
  RiwayatPerubahanKK,
  PengumumanRT,
  PengaturanKas,
  BantuanPemerintah,
  DokumenPdfWarga,
  AdminRTAccount,
  PembaruanBulananRT,
} from './types';
import { isPengumumanExpired } from './utils/security';
import {
  readLegacyLocalCacheForMigration,
  clearLegacyLocalCache,
  formatWaktuSyncID,
  mergeDatabaseStates,
  dedupeEntityList,
  type AppDatabaseSchema,
} from './utils/cloudSync';
import {
  resolveCurrentFirebaseUser,
  logoutFromFirebase,
  provisionAdminAuthAccount,
  provisionWargaAuthAccounts,
  claimAndSyncManifestDocs,
  subscribeFirestoreState,
  migrateSnapshotToFirestore,
  fetchCloudSqlMigrationSnapshot,
  hardResetFirestoreData,
  saveWargaDoc,
  deleteWargaDoc,
  updateWargaSelfDoc,
  bulkSaveWargaAndBantuanDocs,
  saveTransactionDoc,
  deleteTransactionDoc,
  saveBantuanDoc,
  deleteBantuanDoc,
  savePengumumanDoc,
  deletePengumumanDoc,
  saveDokumenDoc,
  deleteDokumenDoc,
  saveAdminAccountDoc,
  deleteAdminAccountDoc,
  saveLaporanDoc,
  saveSettingsDoc,
  syncRtPublicSummary,
  testFirestoreConnection,
  toValidDocId,
} from './utils/firebaseSync';
import {
  EXCEL_DOWNLOAD_EVENT,
  ExcelDownloadNotificationDetail,
  shareOrSaveExcelFile,
  triggerServerExcelDownload,
} from './utils/excelWargaImport';
import {
  collectRegisteredRTs,
  buildServerFilteredViewData,
  normalizeRTCode,
} from './utils/rtFilter';

// Views
import { BerandaView } from './views/BerandaView';
import { KasWargaView } from './views/KasWargaView';
import { KasMasukView } from './views/KasMasukView';
import { KasKeluarView } from './views/KasKeluarView';
import { KasKematianView } from './views/KasKematianView';
import { StatusIuranView } from './views/StatusIuranView';
import { DataWargaView } from './views/DataWargaView';
import { LaporanView } from './views/LaporanView';
import { PengaturanView } from './views/PengaturanView';
import { DasborWargaView } from './views/DasborWargaView';
import { PengumumanView } from './views/PengumumanView';
import { BantuanPemerintahView } from './views/BantuanPemerintahView';
import { DokumenPdfWargaView } from './views/DokumenPdfWargaView';
import { KebijakanPrivasiView } from './views/KebijakanPrivasiView';
import { ServerKontrolView } from './views/ServerKontrolView';

export default function App() {
  // Authentication State (Role: 'server' | 'admin' | 'warga') managed authoritatively by Firebase Auth
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const currentUserRef = useRef<AuthUser | null>(null);
  currentUserRef.current = currentUser;

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isLupaPasswordOpen, setIsLupaPasswordOpen] = useState<boolean>(false);
  const [isKirimLaporanModalOpen, setIsKirimLaporanModalOpen] = useState<boolean>(false);

  // App Lock (6 Digit PIN)
  const [currentPin, setCurrentPin] = useState<string>('123456');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(false);

  // Inactivity Auto-Logout (5 Minutes = 300,000 ms)
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [inactivityNotice, setInactivityNotice] = useState<boolean>(false);

  // Fiscal Year State & Auto-Rollover
  const [tahunAktif, setTahunAktif] = useState<number>(2026);
  const [rolloverNotice, setRolloverNotice] = useState<string | null>(null);

  // Cloud Firestore Sync Notification indicator
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');
  const [serverConnected, setServerConnected] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [dataLoadedReady, setDataLoadedReady] = useState<boolean>(false);
  const [serverAdminAccounts, setServerAdminAccounts] = useState<AdminRTAccount[]>([]);
  const [adminSyncBusy, setAdminSyncBusy] = useState<boolean>(false);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Navigation active tab
  const [currentView, setCurrentView] = useState<string>('beranda');

  // Server RT filter ('SEMUA' or specific RT code e.g. '08', '01')
  const [selectedServerRT, setSelectedServerRT] = useState<string>('SEMUA');

  // Mobile sidebar open state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [txModalType, setTxModalType] = useState<'masuk' | 'keluar' | 'kematian'>('masuk');
  const [isWargaModalOpen, setIsWargaModalOpen] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [upgradeTargetWarga, setUpgradeTargetWarga] = useState<Warga | null>(null);
  const [isPengumumanModalOpen, setIsPengumumanModalOpen] = useState<boolean>(false);
  const [isSaldoAwalModalOpen, setIsSaldoAwalModalOpen] = useState<boolean>(false);

  // Global Excel Download Notification Toast
  const [excelDownloadNotice, setExcelDownloadNotice] =
    useState<ExcelDownloadNotificationDetail | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const handleExcelNotify = (e: Event) => {
      const customEvent = e as CustomEvent<ExcelDownloadNotificationDetail>;
      if (!customEvent?.detail) return;
      setExcelDownloadNotice(customEvent.detail);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        setExcelDownloadNotice(null);
      }, 15000);
    };
    window.addEventListener(EXCEL_DOWNLOAD_EVENT, handleExcelNotify);
    return () => {
      window.removeEventListener(EXCEL_DOWNLOAD_EVENT, handleExcelNotify);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // System Configuration (Jimpitan Tahunan -> Auto Bulanan, Kas Kematian, Kontak RT)
  const [pengaturanKas, setPengaturanKas] = useState<PengaturanKas>({
    nominalJimpitanTahunan: 300000,
    nominalJimpitanBulanan: 25000,
    nominalKematianTahunan: 120000,
    nominalKematianBulanan: 10000,
    saldoAwalKasUmum: 0,
    saldoAwalKasKematian: 0,
    keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu (Pindahan Buku Manual)',
    tanggalSaldoAwal: '2026-01-01',
    kontakKetuaRT: { nama: 'Bpk. Suwardi', telp: '0812-3456-7890' },
    kontakBendahara: { nama: 'Bpk. Bambang S.', telp: '0813-9876-5432' },
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
  });

  // Transactions State (Siap Pakai - Bersih 0 Data)
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Registered Residents (Siap Pakai - Bersih 0 Data)
  const [wargaList, setWargaList] = useState<Warga[]>([]);

  // Announcements from RT (Siap Pakai - Bersih 0 Data)
  const [pengumumanList, setPengumumanList] = useState<PengumumanRT[]>([]);

  // Active announcements (filtered by expiration date)
  const activeAnnouncements = pengumumanList.filter((p) => !isPengumumanExpired(p.tanggalBerakhir));

  // Dismissed notifications memory (Once closed/deleted, never appear again)
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rt_dismissed_notifications_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [floatingAnnouncement, setFloatingAnnouncement] = useState<PengumumanRT | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('rt_dismissed_notifications_v2', JSON.stringify(dismissedNotificationIds));
    } catch (err) {
      console.warn('Gagal menyimpan riwayat dismiss notifikasi:', err);
    }
  }, [dismissedNotificationIds]);

  // Government Aid Data (Siap Pakai - Bersih 0 Data)
  const [bantuanList, setBantuanList] = useState<BantuanPemerintah[]>([]);

  // Document PDF Archive (Siap Pakai - Bersih 0 Data)
  const [dokumenList, setDokumenList] = useState<DokumenPdfWarga[]>([]);

  // Admin RT Accounts (Loaded from Central SQL Server)
  const [adminAccounts, setAdminAccounts] = useState<AdminRTAccount[]>([]);

  // Monthly Submissions sent by RT Admins to the Server
  const [laporanBulananRT, setLaporanBulananRT] = useState<PembaruanBulananRT[]>([]);

  // Firebase Real-time Refs
  const migrationCheckedRef = useRef<boolean>(false);
  const migrationInFlightRef = useRef<boolean>(false);

  const buildCurrentSchema = (): AppDatabaseSchema => ({
    version: 2,
    lastUpdated: new Date().toISOString(),
    tahunAktif,
    pengaturanKas: { ...pengaturanKas, tahunAktif },
    wargaList,
    transactions,
    bantuanList,
    pengumumanList,
    dokumenList,
    adminAccounts,
    laporanBulananRT,
  });

  const latestStateRef = useRef<AppDatabaseSchema>(buildCurrentSchema());
  latestStateRef.current = buildCurrentSchema();

  const triggerPublicSummarySync = async (overrides?: {
    tahunAktif?: number;
    pengaturanKas?: PengaturanKas;
    transactions?: Transaction[];
    pengumumanList?: PengumumanRT[];
    wargaList?: Warga[];
  }) => {
    const snap = latestStateRef.current;
    const user = currentUserRef.current;
    if (!user || (user.role !== 'admin' && user.role !== 'server')) return;

    const effectiveSettings = overrides?.pengaturanKas || snap.pengaturanKas;
    const effectiveTahun = overrides?.tahunAktif || snap.tahunAktif;
    const effectiveTxs = overrides?.transactions || snap.transactions;
    const effectivePengumuman = overrides?.pengumumanList || snap.pengumumanList;
    const effectiveWarga = overrides?.wargaList || snap.wargaList;
    const rw = effectiveSettings?.profilRT?.namaRW || '05';
    const defaultRT =
      normalizeRTCode(effectiveSettings?.profilRT?.namaRT) ||
      normalizeRTCode(user.rtScope) ||
      '08';

    if (user.role === 'server') {
      const rtSet = new Set<string>([defaultRT]);
      effectiveWarga.forEach((w) => {
        const c = normalizeRTCode(w.rt);
        if (c) rtSet.add(c);
      });
      for (const rtCode of rtSet) {
        await syncRtPublicSummary({
          rt: rtCode,
          rw,
          tahunAktif: effectiveTahun,
          pengaturanKas: effectiveSettings,
          transactions: effectiveTxs,
          pengumumanList: effectivePengumuman,
          wargaList: effectiveWarga,
        });
      }
    } else {
      await syncRtPublicSummary({
        rt: defaultRT,
        rw,
        tahunAktif: effectiveTahun,
        pengaturanKas: effectiveSettings,
        transactions: effectiveTxs,
        pengumumanList: effectivePengumuman,
        wargaList: effectiveWarga,
      });
    }
  };

  // 1. Firebase Authentication Session Recovery + Connectivity Probe
  useEffect(() => {
    let active = true;

    try {
      localStorage.removeItem('kaswarga_auth_token_v1');
      localStorage.removeItem('kaswarga_active_session_v1');
      localStorage.removeItem('kaswarga_pending_cloud_sync_v1');
    } catch {
      // ignore storage errors
    }

    testFirestoreConnection().then((diag) => {
      if (!active) return;
      setServerConnected(diag.connected);
      if (!diag.connected && diag.message) {
        setCloudError(diag.message);
      }
    });

    const healthCheckInterval = setInterval(async () => {
      if (!active) return;
      const diag = await testFirestoreConnection();
      if (!active) return;
      setServerConnected(diag.connected);
      if (diag.connected) {
        setCloudError((prev) =>
          prev && (prev.includes('Firestore') || prev.includes('koneksi') || prev.includes('Firebase'))
            ? null
            : prev
        );
      } else if (diag.message) {
        setCloudError(diag.message);
      }
    }, 30000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      if (!fbUser) {
        setCurrentUser(null);
        setIsLoginModalOpen(true);
        setDataLoadedReady(false);
        setSseConnected(false);
        setWargaList([]);
        setTransactions([]);
        setBantuanList([]);
        setPengumumanList([]);
        setDokumenList([]);
        setAdminAccounts([]);
        setServerAdminAccounts([]);
        setLaporanBulananRT([]);
        setAuthReady(true);
        return;
      }

      const resolved = await resolveCurrentFirebaseUser(fbUser);
      if (!active) return;

      if (resolved) {
        const hadUser = Boolean(currentUserRef.current);
        const roleChanged = currentUserRef.current?.role !== resolved.role;
        setCurrentUser(resolved);
        setIsLoginModalOpen(false);
        setServerConnected(true);
        if (!hadUser || roleChanged) {
          setCurrentView(
            resolved.role === 'server'
              ? 'server-kontrol'
              : resolved.role === 'warga'
              ? 'dasbor-warga'
              : 'beranda'
          );
        }
      }
      setAuthReady(true);
    });

    return () => {
      active = false;
      clearInterval(healthCheckInterval);
      unsubscribeAuth();
    };
  }, []);

  // 2. Real-Time Cloud Firestore Subscription + One-Time Cloud SQL (50 KK) & Local Cache Migration
  useEffect(() => {
    if (!currentUser || !auth.currentUser) {
      setDataLoadedReady(false);
      setSseConnected(false);
      migrationCheckedRef.current = false;
      return;
    }

    let active = true;
    setDataLoadedReady(false);
    migrationCheckedRef.current = false;

    const unsubFirestore = subscribeFirestoreState(
      currentUser,
      (partial, isFirstReady) => {
        if (!active) return;

        const nextSnapshot: AppDatabaseSchema = { ...latestStateRef.current };

        if (partial.wargaList !== undefined) {
          const normalizedWarga = dedupeEntityList(
            partial.wargaList,
            [],
            (a, b) => Boolean(a.noKK && b.noKK && a.noKK === b.noKK)
          );
          nextSnapshot.wargaList = normalizedWarga;
          setWargaList(normalizedWarga);
          if (currentUser.role === 'warga' && normalizedWarga[0]?.pin) {
            setCurrentPin(normalizedWarga[0].pin);
          }
        }
        if (partial.transactions !== undefined) {
          const normalizedTx = dedupeEntityList(partial.transactions, []);
          nextSnapshot.transactions = normalizedTx;
          setTransactions(normalizedTx);
        }
        if (partial.bantuanList !== undefined) {
          const normalizedBantuan = dedupeEntityList(partial.bantuanList, []);
          nextSnapshot.bantuanList = normalizedBantuan;
          setBantuanList(normalizedBantuan);
        }
        if (partial.pengumumanList !== undefined) {
          const normalizedPengumuman = dedupeEntityList(partial.pengumumanList, []);
          nextSnapshot.pengumumanList = normalizedPengumuman;
          setPengumumanList(normalizedPengumuman);
        }
        if (partial.dokumenList !== undefined) {
          const normalizedDokumen = dedupeEntityList(partial.dokumenList, []);
          nextSnapshot.dokumenList = normalizedDokumen;
          setDokumenList(normalizedDokumen);
        }
        if (partial.adminAccounts !== undefined) {
          const normalizedAdmins = dedupeEntityList(
            partial.adminAccounts,
            [],
            (a, b) => a.username.toLowerCase() === b.username.toLowerCase()
          );
          nextSnapshot.adminAccounts = normalizedAdmins;
          setAdminAccounts(normalizedAdmins);
          setServerAdminAccounts(normalizedAdmins);
        }
        if (partial.laporanBulananRT !== undefined) {
          const normalizedLap = dedupeEntityList(partial.laporanBulananRT, []);
          nextSnapshot.laporanBulananRT = normalizedLap;
          setLaporanBulananRT(normalizedLap);
        }
        if (partial.tahunAktif !== undefined) {
          nextSnapshot.tahunAktif = partial.tahunAktif;
          setTahunAktif(partial.tahunAktif);
        }
        if (partial.pengaturanKas !== undefined) {
          nextSnapshot.pengaturanKas = partial.pengaturanKas;
          setPengaturanKas(partial.pengaturanKas);
        }

        latestStateRef.current = nextSnapshot;

        if (isFirstReady) {
          setDataLoadedReady(true);
          setSseConnected(true);
          setServerConnected(true);
          setSyncStatus('synced');

          // Auto-migrate existing Cloud SQL (50 KK) / legacy localStorage once when Firestore is empty
          if (
            (currentUser.role === 'admin' || currentUser.role === 'server') &&
            !migrationCheckedRef.current &&
            !migrationInFlightRef.current
          ) {
            migrationCheckedRef.current = true;
            if (nextSnapshot.wargaList.length === 0) {
              migrationInFlightRef.current = true;
              (async () => {
                try {
                  const [cloudSqlSnap, legacySnap] = await Promise.all([
                    fetchCloudSqlMigrationSnapshot(),
                    Promise.resolve(readLegacyLocalCacheForMigration()),
                  ]);
                  if (!active) return;

                  let mergedMig: AppDatabaseSchema | null = null;
                  if (cloudSqlSnap && legacySnap) {
                    mergedMig = mergeDatabaseStates(cloudSqlSnap, legacySnap);
                  } else if (cloudSqlSnap) {
                    mergedMig = cloudSqlSnap;
                  } else if (legacySnap) {
                    mergedMig = legacySnap;
                  }

                  const hasData = Boolean(
                    mergedMig &&
                      ((mergedMig.wargaList?.length || 0) > 0 ||
                        (mergedMig.transactions?.length || 0) > 0 ||
                        (mergedMig.bantuanList?.length || 0) > 0 ||
                        (mergedMig.pengumumanList?.length || 0) > 0 ||
                        (mergedMig.dokumenList?.length || 0) > 0)
                  );

                  if (hasData && mergedMig) {
                    const migRes = await migrateSnapshotToFirestore(mergedMig);
                    if (active && migRes.ok) {
                      clearLegacyLocalCache();
                      setRolloverNotice(
                        `Sinkronisasi awal Cloud Firestore selesai! ${migRes.migratedWarga} KK & ${migRes.migratedTx} transaksi lama berhasil dipindahkan ke Firebase.`
                      );
                      setTimeout(() => setRolloverNotice(null), 8000);
                    }
                  } else if (legacySnap) {
                    clearLegacyLocalCache();
                  }
                } catch (err) {
                  console.warn('Auto-migration warning:', err);
                } finally {
                  migrationInFlightRef.current = false;
                }
              })();
            } else {
              // Firestore already populated; drop old local cache so Firestore stays sole source of truth
              clearLegacyLocalCache();
            }
          }
        }
      },
      (connected, errMsg) => {
        if (!active) return;
        setServerConnected(connected);
        setSseConnected(connected);
        setSyncStatus(connected ? 'synced' : 'offline');
        if (errMsg) setCloudError(errMsg);
        else if (connected) setCloudError(null);
      }
    );

    return () => {
      active = false;
      unsubFirestore();
    };
  }, [currentUser?.role, currentUser?.username, currentUser?.noKK, currentUser?.wargaId]);

  // 3. Background Firebase Auth Provisioning for Warga KK missing linkedUid
  useEffect(() => {
    if (!dataLoadedReady || !currentUser) return;
    if (currentUser.role !== 'admin' && currentUser.role !== 'server') return;

    const needsProvisioning = wargaList.some(
      (w: any) => !w.linkedUid && String(w.noKK || '').replace(/\D/g, '').length >= 6
    );
    if (!needsProvisioning) return;

    const timer = setTimeout(() => {
      provisionWargaAuthAccounts(wargaList).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [dataLoadedReady, currentUser?.role, wargaList]);

  const handleForceSyncNow = async () => {
    setCloudSyncBusy(true);
    setCloudError(null);
    try {
      const diag = await testFirestoreConnection();
      setServerConnected(diag.connected);
      if (!diag.connected) {
        setSyncStatus('offline');
        setSseConnected(false);
        setCloudError(diag.message || 'Tidak dapat terhubung ke Cloud Firestore.');
        return;
      }

      if (auth.currentUser) {
        await claimAndSyncManifestDocs();
        if (
          (currentUserRef.current?.role === 'admin' || currentUserRef.current?.role === 'server') &&
          latestStateRef.current.wargaList.length === 0
        ) {
          const cloudSqlSnap = await fetchCloudSqlMigrationSnapshot();
          if (cloudSqlSnap && cloudSqlSnap.wargaList.length > 0) {
            await migrateSnapshotToFirestore(cloudSqlSnap);
          }
        }
        await triggerPublicSummarySync();
      }

      setSyncStatus('synced');
      setSseConnected(true);
      setServerConnected(true);
    } catch (err: any) {
      setServerConnected(false);
      setSyncStatus('offline');
      setCloudError(err?.message || 'Gagal menyinkronkan Cloud Firestore.');
    } finally {
      setCloudSyncBusy(false);
    }
  };

  // Explicit Admin Account Sync to Cloud Firestore
  const handleSyncAdminAccountToServer = async (
    overrideAccount?: AdminRTAccount
  ): Promise<{ ok: boolean; message?: string; account?: AdminRTAccount; user?: AuthUser }> => {
    setAdminSyncBusy(true);
    setCloudError(null);
    try {
      const currentSnapshot = latestStateRef.current;
      const rtStr = currentSnapshot.pengaturanKas?.profilRT?.namaRT || '08';
      const rwStr = currentSnapshot.pengaturanKas?.profilRT?.namaRW || '05';
      const ketuaNama = currentSnapshot.pengaturanKas?.kontakKetuaRT?.nama?.trim();
      const ketuaTelp = currentSnapshot.pengaturanKas?.kontakKetuaRT?.telp?.trim();
      const nowLabel = formatWaktuSyncID();
      const nowIso = new Date().toISOString();

      let targetAccount: AdminRTAccount | undefined = overrideAccount;

      if (!targetAccount && currentUser?.role === 'admin') {
        const matchedLocal =
          currentSnapshot.adminAccounts.find(
            (a) => a.username.toLowerCase() === currentUser.username.toLowerCase()
          ) ||
          serverAdminAccounts.find(
            (a) => a.username.toLowerCase() === currentUser.username.toLowerCase()
          );

        targetAccount = matchedLocal || {
          id: currentUser.username.toLowerCase() === 'admin' ? 'adm_rt08' : `adm_${Date.now()}`,
          username: currentUser.username,
          passwordHash:
            currentUser.username.toLowerCase() === 'admin' ? 'rt08rw05' : `rt${rtStr}rw${rwStr}`,
          nama: currentUser.nama || (ketuaNama ? `${ketuaNama} (Ketua RT ${rtStr})` : `Admin RT ${rtStr}`),
          rt: rtStr,
          rw: rwStr,
          kontak: ketuaTelp || '0812-3456-7890',
          jabatan: `Ketua RT ${rtStr} RW ${rwStr}`,
          status: 'aktif',
        };
      }

      if (!targetAccount) {
        return { ok: false, message: 'Tidak ada akun Admin RT aktif untuk disinkronkan.' };
      }

      const stampedAccount: AdminRTAccount = {
        ...targetAccount,
        terakhirLogin: targetAccount.terakhirLogin || nowLabel,
        terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
        updatedAt: nowIso,
      };

      const res = await saveAdminAccountDoc(stampedAccount, auth.currentUser?.uid);
      if (!res.ok) {
        setCloudError(res.message || 'Gagal menyinkronkan akun admin ke Cloud Firestore.');
        return { ok: false, message: res.message };
      }

      await claimAndSyncManifestDocs();
      const legacyLocal = readLegacyLocalCacheForMigration();
      if (legacyLocal && (legacyLocal.wargaList?.length || legacyLocal.transactions?.length)) {
        await migrateSnapshotToFirestore(legacyLocal);
        clearLegacyLocalCache();
      }

      setServerConnected(true);
      setSseConnected(true);
      setSyncStatus('synced');
      setRolloverNotice(
        `Akun Admin "${stampedAccount.username}" & seluruh data tersinkron real-time ke Cloud Firestore!`
      );
      setTimeout(() => setRolloverNotice(null), 6000);
      return { ok: true, account: stampedAccount, user: currentUser || undefined };
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyinkronkan akun admin ke Cloud Firestore.';
      setCloudError(msg);
      return { ok: false, message: msg };
    } finally {
      setAdminSyncBusy(false);
    }
  };

  // Inactivity Auto-Logout Timer (5 Minutes) - active only when authenticated
  useEffect(() => {
    if (!currentUser) return;
    const recordActivity = () => setLastActivity(Date.now());
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, recordActivity));

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivity > 5 * 60 * 1000) {
        if (!isPinLocked) {
          setIsPinLocked(true);
          setInactivityNotice(true);
        }
      }
    }, 10000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recordActivity));
      clearInterval(checkInterval);
    };
  }, [lastActivity, isPinLocked, currentUser]);

  // Floating announcement trigger (Checks permanent dismissal so it NEVER reappears once closed/deleted)
  useEffect(() => {
    const unread = activeAnnouncements.find((p) => !dismissedNotificationIds.includes(p.id));
    if (unread && !floatingAnnouncement) {
      setFloatingAnnouncement(unread);
    } else if (floatingAnnouncement && dismissedNotificationIds.includes(floatingAnnouncement.id)) {
      setFloatingAnnouncement(null);
    }
  }, [activeAnnouncements, dismissedNotificationIds, floatingAnnouncement]);

  const handleDismissFloating = (idToDismiss?: string) => {
    const id = idToDismiss || floatingAnnouncement?.id;
    if (id) {
      setDismissedNotificationIds((prev) => Array.from(new Set([...prev, id])));
    }
    setFloatingAnnouncement(null);
  };

  // Continuous Balance Calculation
  const totalKasUmumMasuk = transactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((sum, t) => sum + t.nominal, 0);

  const totalKasUmumKeluar = transactions
    .filter((t) => t.tipe === 'keluar')
    .reduce((sum, t) => sum + t.nominal, 0);

  const saldoKasUmumBerjalan = totalKasUmumMasuk - totalKasKeluarBulanIniTotal();
  function totalKasKeluarBulanIniTotal() {
    return totalKasUmumKeluar;
  }

  const saldoKasKematianBerjalan = transactions
    .filter((t) => t.tipe === 'kematian')
    .reduce((sum, t) => sum + t.nominal, 0);

  // Annual Rollover Handler (Pergantian Tahun Otomatis - Saldo Berlanjut Tanpa Dikosongkan)
  const handleSwitchTahunAktif = async (newYear: number) => {
    if (newYear === tahunAktif) return;

    const currentEndSaldoUmum = totalKasUmumMasuk - totalKasUmumKeluar;
    const currentEndSaldoKematian = saldoKasKematianBerjalan;
    const nowIso = new Date().toISOString();

    if (newYear > tahunAktif) {
      const updatedWarga = latestStateRef.current.wargaList.map((w) => {
        const priorHistory = w.riwayatIuranPerTahun || {};
        const currentYearHistory = priorHistory[tahunAktif] || w.riwayatIuran || {};
        const currentYearStatus =
          (w.statusIuranPerTahun && w.statusIuranPerTahun[tahunAktif]) || w.statusIuran;

        const updatedPerTahun: Record<number, Record<number, boolean>> = {
          ...priorHistory,
          [tahunAktif]: currentYearHistory,
        };

        const updatedStatusPerTahun: Record<number, 'Sudah' | 'Belum'> = {
          ...(w.statusIuranPerTahun || {}),
          [tahunAktif]: currentYearStatus as 'Sudah' | 'Belum',
        };

        const newYearPaid: 'Sudah' | 'Belum' = updatedStatusPerTahun[newYear] || 'Belum';

        return {
          ...w,
          statusIuran: newYearPaid,
          riwayatIuranPerTahun: updatedPerTahun,
          statusIuranPerTahun: updatedStatusPerTahun,
          riwayatIuran: updatedPerTahun[newYear] || {},
          updatedAt: nowIso,
        };
      });

      const nextPengaturan: PengaturanKas = {
        ...latestStateRef.current.pengaturanKas,
        tahunAktif: newYear,
        saldoAwalKasUmum: currentEndSaldoUmum,
        saldoAwalKasKematian: currentEndSaldoKematian,
        keteranganSaldoAwal: `Pindahan Saldo Akhir Tahun ${tahunAktif} ke Tahun ${newYear} (Otomatis Berlanjut)`,
        tanggalSaldoAwal: `${newYear}-01-01`,
        updatedAt: nowIso,
      };

      setWargaList(updatedWarga);
      setPengaturanKas(nextPengaturan);
      setTahunAktif(newYear);
      setRolloverNotice(
        `Pergantian Tahun ${newYear} Berhasil! Saldo kas berlanjut otomatis (Rp ${currentEndSaldoUmum.toLocaleString('id-ID')}). Status iuran tahun ${newYear} siap dicatat.`
      );

      setSyncStatus('saving');
      await Promise.all([
        saveSettingsDoc(nextPengaturan, newYear),
        bulkSaveWargaAndBantuanDocs(updatedWarga, []),
      ]);
      await triggerPublicSummarySync({
        tahunAktif: newYear,
        pengaturanKas: nextPengaturan,
        wargaList: updatedWarga,
      });
      setSyncStatus('synced');
    } else {
      const updatedWargaView = latestStateRef.current.wargaList.map((w) => {
        const pastStatus = (w.statusIuranPerTahun && w.statusIuranPerTahun[newYear]) || 'Sudah';
        const pastHistory = (w.riwayatIuranPerTahun && w.riwayatIuranPerTahun[newYear]) || {};
        return {
          ...w,
          statusIuran: pastStatus,
          riwayatIuran: pastHistory,
        };
      });
      const nextPengaturan: PengaturanKas = {
        ...latestStateRef.current.pengaturanKas,
        tahunAktif: newYear,
        updatedAt: nowIso,
      };
      setWargaList(updatedWargaView);
      setPengaturanKas(nextPengaturan);
      setTahunAktif(newYear);
      setRolloverNotice(`Melihat arsip pembukuan tahun ${newYear}.`);

      await saveSettingsDoc(nextPengaturan, newYear);
      await triggerPublicSummarySync({
        tahunAktif: newYear,
        pengaturanKas: nextPengaturan,
      });
    }

    setTimeout(() => setRolloverNotice(null), 5000);
  };

  // Handlers for Government Aid
  const handleAddBantuan = async (b: Omit<BantuanPemerintah, 'id'>) => {
    const nowIso = new Date().toISOString();
    const newItem: BantuanPemerintah = {
      ...b,
      id: toValidDocId('b_' + Date.now(), 'b'),
      updatedAt: nowIso,
    };
    setBantuanList((prev) => [newItem, ...prev]);
    setSyncStatus('saving');
    const res = await saveBantuanDoc(newItem);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan data bantuan ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  const handleUpdateStatusBantuan = async (id: string, newStatus: BantuanPemerintah['status']) => {
    const nowIso = new Date().toISOString();
    const existing = latestStateRef.current.bantuanList.find((item) => item.id === id);
    const updatedItem = existing ? { ...existing, status: newStatus, updatedAt: nowIso } : null;
    setBantuanList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus, updatedAt: nowIso } : item))
    );
    if (updatedItem) {
      setSyncStatus('saving');
      const res = await saveBantuanDoc(updatedItem);
      if (!res.ok) {
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal memperbarui status bantuan di Cloud Firestore.');
      } else {
        setServerConnected(true);
        setSyncStatus('synced');
      }
    }
  };

  const handleDeleteBantuan = async (id: string) => {
    setBantuanList((prev) => prev.filter((b) => b.id !== id));
    setSyncStatus('saving');
    const res = await deleteBantuanDoc(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus data bantuan di Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  // Handlers for PDF Documents
  const handleUploadDokumen = async (docItem: Omit<DokumenPdfWarga, 'id'>) => {
    const nowIso = new Date().toISOString();
    const newDoc: DokumenPdfWarga = {
      ...docItem,
      id: toValidDocId('doc_' + Date.now(), 'doc'),
      updatedAt: nowIso,
    };
    setDokumenList((prev) => [newDoc, ...prev]);
    setSyncStatus('saving');
    const res = await saveDokumenDoc(newDoc);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan dokumen PDF ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  const handleDeleteDokumen = async (id: string) => {
    setDokumenList((prev) => prev.filter((d) => d.id !== id));
    setSyncStatus('saving');
    const res = await deleteDokumenDoc(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus dokumen PDF di Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  // Sample data loader for demo
  const handleLoadSample = async () => {
    const nowIso = new Date().toISOString();
    const rtStr = pengaturanKas.profilRT?.namaRT || '08';
    const rwStr = pengaturanKas.profilRT?.namaRW || '05';
    const scopeStr = `RT ${rtStr} RW ${rwStr}`;
    const samples: Transaction[] = [
      { id: 'sample_1_' + Date.now(), tanggal: `${tahunAktif}-10-12`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan Periode Aktif', nominal: 250000, tipe: 'masuk', namaWarga: 'Ahmad Fauzi', tahun: tahunAktif, rtScope: scopeStr, updatedAt: nowIso },
      { id: 'sample_2_' + (Date.now() + 1), tanggal: `${tahunAktif}-10-10`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan & Kas Kematian', nominal: 350000, tipe: 'masuk', namaWarga: 'Siti Aminah', tahun: tahunAktif, rtScope: scopeStr, updatedAt: nowIso },
      { id: 'sample_3_' + (Date.now() + 2), tanggal: `${tahunAktif}-10-08`, kategori: 'Kas Kematian', keterangan: 'Pengadaan Kain Mori & Perlengkapan Jenazah', nominal: 200000, tipe: 'keluar', namaWarga: 'Bendahara Kas', tahun: tahunAktif, rtScope: scopeStr, updatedAt: nowIso },
    ];
    setTransactions(samples);
    setSyncStatus('saving');
    await Promise.all(samples.map((tx) => saveTransactionDoc(tx)));
    await triggerPublicSummarySync({ transactions: samples });
    setSyncStatus('synced');
  };

  // Complete Reset: Wipes all residents, transactions, aid records, documents, announcements from Cloud Firestore
  const handleResetEmpty = async () => {
    const nowIso = new Date().toISOString();
    const prevSnapshot = latestStateRef.current;

    const resetSettings: PengaturanKas = {
      ...prevSnapshot.pengaturanKas,
      saldoAwalKasUmum: 0,
      saldoAwalKasKematian: 0,
      keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu',
      tanggalSaldoAwal: `${tahunAktif}-01-01`,
      updatedAt: nowIso,
    };

    setWargaList([]);
    setTransactions([]);
    setBantuanList([]);
    setPengumumanList([]);
    setDokumenList([]);
    setLaporanBulananRT([]);
    setFloatingAnnouncement(null);
    setDismissedNotificationIds([]);
    setPengaturanKas(resetSettings);

    setSyncStatus('saving');
    const ok = await hardResetFirestoreData({
      wargaIds: prevSnapshot.wargaList.map((w) => w.id),
      txIds: prevSnapshot.transactions.map((t) => t.id),
      bantuanIds: prevSnapshot.bantuanList.map((b) => b.id),
      pengumumanIds: prevSnapshot.pengumumanList.map((p) => p.id),
      dokumenIds: prevSnapshot.dokumenList.map((d) => d.id),
      laporanIds: prevSnapshot.laporanBulananRT.map((l) => l.id),
      resetSettings,
      tahunAktif,
    });

    if (ok) {
      await triggerPublicSummarySync({
        pengaturanKas: resetSettings,
        transactions: [],
        pengumumanList: [],
        wargaList: [],
      });
      setServerConnected(true);
      setSyncStatus('synced');
      setCloudError(null);
      setRolloverNotice('Seluruh data berhasil direset dan dihapus tuntas dari Cloud Firestore.');
    } else {
      setSyncStatus('offline');
      setCloudError('Gagal mereset database Cloud Firestore. Periksa koneksi internet Anda.');
    }
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  const handleUpdatePengaturan = async (newSetting: Partial<PengaturanKas>) => {
    const nowIso = new Date().toISOString();
    const prev = latestStateRef.current.pengaturanKas || pengaturanKas;
    const merged: PengaturanKas = { ...prev, ...newSetting, updatedAt: nowIso };
    setPengaturanKas(merged);
    setSyncStatus('saving');

    const res = await saveSettingsDoc(merged, tahunAktif);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyimpan pengaturan ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }

    const oldKetua = (prev.kontakKetuaRT?.nama || '').trim();
    const newKetua = (merged.kontakKetuaRT?.nama || '').trim();
    const oldBendahara = (prev.kontakBendahara?.nama || '').trim();
    const newBendahara = (merged.kontakBendahara?.nama || '').trim();
    const oldRT = (prev.profilRT?.namaRT || '08').trim();
    const newRT = (merged.profilRT?.namaRT || '08').trim();
    const newRW = (merged.profilRT?.namaRW || '05').trim();
    const newKetuaTelp = (merged.kontakKetuaRT?.telp || '').trim();

    const pengurusChanged =
      (newKetua && newKetua !== oldKetua) ||
      (newBendahara && newBendahara !== oldBendahara) ||
      newRT !== oldRT;

    let updatedPengumumanList = latestStateRef.current.pengumumanList;

    if (pengurusChanged) {
      const legacyKetuaPlaceholders = ['bpk. suwardi', 'bapak suwardi', oldKetua.toLowerCase()].filter(Boolean);
      const legacyBendaharaPlaceholders = ['bpk. bambang s.', 'bapak bambang s.', 'bpk. bambang', 'bapak bambang', oldBendahara.toLowerCase()].filter(Boolean);

      const syncPengumumanItem = (p: PengumumanRT): PengumumanRT => {
        const curNama = (p.namaPengurus || '').trim().toLowerCase();
        const curJabatan = (p.jabatanPengurus || '').trim();
        const curJabatanLower = curJabatan.toLowerCase();
        const isBendaharaTarget =
          curJabatanLower.includes('bendahara') ||
          (curNama !== '' && legacyBendaharaPlaceholders.includes(curNama));
        const shouldSyncName =
          !curNama ||
          legacyKetuaPlaceholders.includes(curNama) ||
          legacyBendaharaPlaceholders.includes(curNama);

        const nextNama = shouldSyncName
          ? (isBendaharaTarget ? newBendahara || newKetua : newKetua || p.namaPengurus)
          : p.namaPengurus;

        let nextJabatan = curJabatan;
        if (!curJabatan) {
          nextJabatan = isBendaharaTarget ? `Bendahara RT ${newRT}` : `Ketua RT ${newRT}`;
        } else if (/^ketua\s+rt\b/i.test(curJabatan)) {
          nextJabatan = `Ketua RT ${newRT}`;
        } else if (/^bendahara\s+rt\b/i.test(curJabatan)) {
          nextJabatan = `Bendahara RT ${newRT}`;
        }

        const nextPenulis =
          nextNama && (!p.penulis || p.penulis.startsWith('Pengurus RT') || p.penulis.startsWith('Ketua RT') || p.penulis.startsWith('Bendahara RT') || legacyKetuaPlaceholders.includes(p.penulis.toLowerCase()) || legacyBendaharaPlaceholders.includes(p.penulis.toLowerCase()))
            ? `${nextJabatan} (${nextNama})`
            : p.penulis;

        return {
          ...p,
          namaPengurus: nextNama,
          jabatanPengurus: nextJabatan,
          penulis: nextPenulis,
          updatedAt: nowIso,
        };
      };

      updatedPengumumanList = latestStateRef.current.pengumumanList.map(syncPengumumanItem);
      setPengumumanList(updatedPengumumanList);
      setFloatingAnnouncement((prevFloat) => (prevFloat ? syncPengumumanItem(prevFloat) : prevFloat));
      Promise.all(updatedPengumumanList.map((p) => savePengumumanDoc(p))).catch(() => {});

      if (newKetua) {
        const updatedAdmins = latestStateRef.current.adminAccounts.map((acc) => {
          const isPrimaryAdmin =
            acc.id === 'adm_rt08' ||
            acc.username.toLowerCase() === 'admin' ||
            (oldKetua && acc.nama.toLowerCase().includes(oldKetua.toLowerCase()));
          if (!isPrimaryAdmin) return acc;
          return {
            ...acc,
            nama: `${newKetua} (Ketua RT ${newRT})`,
            rt: newRT,
            rw: newRW,
            kontak: newKetuaTelp || acc.kontak,
            jabatan: `Ketua RT ${newRT} RW ${newRW}`,
            updatedAt: nowIso,
          };
        });
        setAdminAccounts(updatedAdmins);
        updatedAdmins.forEach((acc) => {
          const isPrimaryAdmin =
            acc.id === 'adm_rt08' || acc.username.toLowerCase() === 'admin';
          if (isPrimaryAdmin) {
            saveAdminAccountDoc(acc, (acc as any).authUid).catch(() => {});
          }
        });

        setCurrentUser((prevUser) => {
          if (!prevUser || prevUser.role !== 'admin') return prevUser;
          const isPrimaryUser =
            prevUser.username.toLowerCase() === 'admin' ||
            (oldKetua && prevUser.nama.toLowerCase().includes(oldKetua.toLowerCase()));
          if (!isPrimaryUser) return prevUser;
          return {
            ...prevUser,
            nama: `${newKetua} (Ketua RT ${newRT})`,
            rtScope: `RT ${newRT} RW ${newRW}`,
          };
        });
      }
    }

    await triggerPublicSummarySync({
      pengaturanKas: merged,
      pengumumanList: updatedPengumumanList,
    });
  };

  const handleSaveSaldoAwal = async (
    kasUmum: number,
    kasKematian: number,
    keterangan: string,
    tanggal: string
  ) => {
    const nowIso = new Date().toISOString();
    const nextPengaturan: PengaturanKas = {
      ...latestStateRef.current.pengaturanKas,
      saldoAwalKasUmum: kasUmum,
      saldoAwalKasKematian: kasKematian,
      keteranganSaldoAwal: keterangan,
      tanggalSaldoAwal: tanggal,
      updatedAt: nowIso,
    };

    const currentTxs = latestStateRef.current.transactions;
    const oldSaldoAwal = currentTxs.filter((t) => t.isSaldoAwal);
    const nonSaldoAwal = currentTxs.filter((t) => !t.isSaldoAwal);
    const newSaldoTxs: Transaction[] = [];
    const rtScopeStr = `RT ${nextPengaturan.profilRT?.namaRT || '08'} RW ${nextPengaturan.profilRT?.namaRW || '05'}`;

    if (kasUmum > 0) {
      newSaldoTxs.push({
        id: 'saldo_awal_umum_' + Date.now(),
        tanggal: tanggal || `${tahunAktif}-01-01`,
        kategori: 'Saldo Awal / Pindahan Kas Lalu',
        keterangan: `Saldo Kas Umum Masa Lalu: ${keterangan}`,
        nominal: kasUmum,
        tipe: 'masuk',
        namaWarga: 'Pindahan Kas Masa Lalu',
        isSaldoAwal: true,
        tahun: tahunAktif,
        rtScope: rtScopeStr,
        updatedAt: nowIso,
      });
    }

    if (kasKematian > 0) {
      newSaldoTxs.push({
        id: 'saldo_awal_kematian_' + (Date.now() + 1),
        tanggal: tanggal || `${tahunAktif}-01-01`,
        kategori: 'Kas Kematian',
        keterangan: `Saldo Kas Kematian Masa Lalu: ${keterangan}`,
        nominal: kasKematian,
        tipe: 'kematian',
        namaWarga: 'Pindahan Kas Kematian Lalu',
        isSaldoAwal: true,
        tahun: tahunAktif,
        rtScope: rtScopeStr,
        updatedAt: nowIso,
      });
    }

    const nextTransactions = [...newSaldoTxs, ...nonSaldoAwal];
    setPengaturanKas(nextPengaturan);
    setTransactions(nextTransactions);
    setSyncStatus('saving');

    await saveSettingsDoc(nextPengaturan, tahunAktif);
    await Promise.all([
      ...oldSaldoAwal.map((t) => deleteTransactionDoc(t.id)),
      ...newSaldoTxs.map((t) => saveTransactionDoc(t)),
    ]);
    await triggerPublicSummarySync({
      pengaturanKas: nextPengaturan,
      transactions: nextTransactions,
    });
    setSyncStatus('synced');
  };

  // Add Transaction
  const handleSaveTransaction = async (tx: Omit<Transaction, 'id'>) => {
    const nowIso = new Date().toISOString();
    const resolvedRtScope =
      tx.rtScope ||
      (currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? `RT ${selectedServerRT}`
        : currentUser?.rtScope ||
          `RT ${pengaturanKas.profilRT?.namaRT || '08'} RW ${pengaturanKas.profilRT?.namaRW || '05'}`);
    const newTx: Transaction = {
      ...tx,
      id: toValidDocId('tx_' + Date.now(), 'tx'),
      tahun: tahunAktif,
      rtScope: resolvedRtScope,
      updatedAt: nowIso,
    };
    const nextTransactions = [newTx, ...latestStateRef.current.transactions];
    setTransactions(nextTransactions);
    setSyncStatus('saving');
    const res = await saveTransactionDoc(newTx);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan transaksi ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
      await triggerPublicSummarySync({ transactions: nextTransactions });
    }
  };

  // Add Resident
  const handleSaveWarga = async (w: Omit<Warga, 'id' | 'no'>) => {
    const nowIso = new Date().toISOString();
    const fallbackRT =
      currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? selectedServerRT
        : pengaturanKas.profilRT?.namaRT || '08';
    const newW: Warga = {
      ...w,
      rt: w.rt || fallbackRT,
      id: toValidDocId('w_' + Date.now(), 'w'),
      no: latestStateRef.current.wargaList.length + 1,
      statusIuran: w.statusIuran || 'Belum',
      statusIuranPerTahun: { [tahunAktif]: w.statusIuran || 'Belum' },
      updatedAt: nowIso,
    };
    const nextWarga = [...latestStateRef.current.wargaList, newW];
    setWargaList(nextWarga);
    setSyncStatus('saving');
    const res = await saveWargaDoc(newW);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyimpan data warga ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
      await triggerPublicSummarySync({ wargaList: nextWarga });
    }
  };

  // Bulk Import Excel: Grouped Warga + Anggota Keluarga + Penerimaan Bantuan in 1 click
  const handleBulkImportWargaBantuan = (
    importedWarga: Omit<Warga, 'id' | 'no'>[],
    importedBantuan: Omit<BantuanPemerintah, 'id'>[],
    options: { mergeExisting: boolean }
  ) => {
    const baseTime = Date.now();
    const nonce = Math.random().toString(36).slice(2, 6);
    const nowIso = new Date().toISOString();

    const currentWarga = latestStateRef.current.wargaList || [];
    const updatedWarga = [...currentWarga];
    const changedWargaToSave: Warga[] = [];
    let addedKKCount = 0;
    let updatedKKCount = 0;

    importedWarga.forEach((incoming, idx) => {
      const existingIndex = incoming.noKK
        ? updatedWarga.findIndex((w) => w.noKK === incoming.noKK)
        : updatedWarga.findIndex((w) => w.nama.toLowerCase() === incoming.nama.toLowerCase());

      if (existingIndex >= 0) {
        if (options.mergeExisting) {
          const existing = updatedWarga[existingIndex];
          const nextStatus = incoming.statusIuran || existing.statusIuran || 'Belum';
          const mergedItem: Warga = {
            ...existing,
            nama: incoming.nama || existing.nama,
            noKK: incoming.noKK || existing.noKK,
            nik: incoming.nik || existing.nik,
            noRumah: incoming.noRumah || existing.noRumah,
            rt: incoming.rt || existing.rt,
            rw: incoming.rw || existing.rw,
            alamat: incoming.alamat || existing.alamat,
            kodePos: incoming.kodePos || existing.kodePos,
            jenisKelamin: incoming.jenisKelamin || existing.jenisKelamin,
            anggotaKeluarga:
              incoming.anggotaKeluarga && incoming.anggotaKeluarga.length > 0
                ? incoming.anggotaKeluarga
                : existing.anggotaKeluarga,
            jumlahJiwa:
              incoming.anggotaKeluarga && incoming.anggotaKeluarga.length > 0
                ? incoming.anggotaKeluarga.length
                : existing.jumlahJiwa,
            telepon: incoming.telepon || existing.telepon,
            statusIuran: nextStatus,
            statusIuranPerTahun: {
              ...(existing.statusIuranPerTahun || {}),
              [tahunAktif]: nextStatus,
            },
            updatedAt: nowIso,
          };
          updatedWarga[existingIndex] = mergedItem;
          changedWargaToSave.push(mergedItem);
          updatedKKCount++;
        }
      } else {
        const assignedId = `w_${baseTime}_${idx}_${nonce}`;
        const newWarga: Warga = {
          ...incoming,
          id: assignedId,
          no: updatedWarga.length + 1,
          statusIuran: incoming.statusIuran || 'Belum',
          statusIuranPerTahun: { [tahunAktif]: incoming.statusIuran || 'Belum' },
          pin: incoming.pin || '123456',
          updatedAt: nowIso,
        };
        updatedWarga.push(newWarga);
        changedWargaToSave.push(newWarga);
        addedKKCount++;
      }
    });

    const currentBantuan = latestStateRef.current.bantuanList || [];
    const nextBantuanList = [...currentBantuan];
    const newBantuanToSave: BantuanPemerintah[] = [];
    let addedBantuanCount = 0;

    importedBantuan.forEach((b, idx) => {
      const isDuplicate = nextBantuanList.some(
        (existing) =>
          existing.noKK === b.noKK &&
          existing.namaPenerima.toLowerCase() === b.namaPenerima.toLowerCase() &&
          existing.jenisBantuan.toLowerCase() === b.jenisBantuan.toLowerCase() &&
          existing.tanggal === b.tanggal
      );
      if (!isDuplicate) {
        const assignedBId = `b_${baseTime}_${idx}_${nonce}`;
        const item: BantuanPemerintah = {
          ...b,
          id: assignedBId,
          updatedAt: nowIso,
        };
        nextBantuanList.unshift(item);
        newBantuanToSave.push(item);
        addedBantuanCount++;
      }
    });

    setSyncStatus('saving');
    setWargaList(updatedWarga);
    if (addedBantuanCount > 0) {
      setBantuanList(nextBantuanList);
    }

    bulkSaveWargaAndBantuanDocs(changedWargaToSave, newBantuanToSave)
      .then(async (bulkRes) => {
        if (!bulkRes.ok) {
          setSyncStatus('offline');
          setCloudError(bulkRes.message || 'Gagal menyinkronkan import Excel ke Cloud Firestore.');
        } else {
          setServerConnected(true);
          setSyncStatus('synced');
          await triggerPublicSummarySync({ wargaList: updatedWarga });
        }
      });

    const totalJiwa = importedWarga.reduce(
      (sum, w) => sum + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1),
      0
    );
    setRolloverNotice(
      `Import Excel Berhasil! ${addedKKCount} KK baru ditambahkan${updatedKKCount > 0 ? `, ${updatedKKCount} KK diperbarui` : ''} (${totalJiwa} jiwa)${addedBantuanCount > 0 ? ` beserta ${addedBantuanCount} data penerimaan bantuan` : ''}.`
    );
    setTimeout(() => setRolloverNotice(null), 7000);
  };

  // Toggle resident fee status
  const handleToggleWargaStatus = async (id: string) => {
    const nowIso = new Date().toISOString();
    const target = latestStateRef.current.wargaList.find((w) => w.id === id);
    if (!target) return;

    const nextStatus: 'Sudah' | 'Belum' = target.statusIuran === 'Sudah' ? 'Belum' : 'Sudah';
    const perTahun: Record<number, 'Sudah' | 'Belum'> = {
      ...(target.statusIuranPerTahun || {}),
      [tahunAktif]: nextStatus,
    };
    const updatedTarget: Warga = {
      ...target,
      statusIuran: nextStatus,
      statusIuranPerTahun: perTahun,
      updatedAt: nowIso,
    };

    setWargaList((prev) => prev.map((w) => (w.id === id ? updatedTarget : w)));
    setSyncStatus('saving');
    const res = await saveWargaDoc(updatedTarget);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal memperbarui status iuran ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  // Delete resident
  const handleDeleteWarga = async (id: string) => {
    const nextWarga = latestStateRef.current.wargaList.filter((w) => w.id !== id);
    setWargaList(nextWarga);
    setSyncStatus('saving');
    const res = await deleteWargaDoc(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus data warga di Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
      await triggerPublicSummarySync({ wargaList: nextWarga });
    }
  };

  // Upgrade / Perbarui Data KK Warga (Meninggal Dunia, Pisah KK, Pembaruan Berkala)
  const handleApplyUpgradeKK = async ({
    wargaId,
    oldWarga,
    newKKData,
    alasan,
    keterangan,
    catatSantunanKematian,
    namaMeninggal,
  }: {
    wargaId: string;
    oldWarga: Warga;
    newKKData: {
      nama: string;
      noKK: string;
      rt: string;
      rw: string;
      alamat: string;
      kodePos?: string;
      tanggalDikeluarkan?: string;
      jenisKelamin: 'Laki-laki' | 'Perempuan';
      anggotaKeluarga: AnggotaKeluarga[];
    };
    alasan: 'meninggal' | 'pisah_kk' | 'perubahan_anggota' | 'pembaruan_berkala';
    keterangan: string;
    catatSantunanKematian: boolean;
    namaMeninggal?: string;
  }) => {
    const currentTxs = latestStateRef.current.transactions;
    const oldTxs = currentTxs.filter(
      (t) =>
        (t.noKK && t.noKK === oldWarga.noKK) ||
        (t.namaWarga && t.namaWarga.toLowerCase() === oldWarga.nama.toLowerCase())
    );
    const totalKasDipindahkan = oldTxs.reduce((sum, t) => sum + (t.nominal || 0), 0);

    const oldAnggotaNames = (oldWarga.anggotaKeluarga || []).map((a) => a.nama.trim().toLowerCase());
    const newAnggotaNames = (newKKData.anggotaKeluarga || []).map((a) => a.nama.trim().toLowerCase());

    const anggotaKeluar = (oldWarga.anggotaKeluarga || [])
      .filter((a) => !newAnggotaNames.includes(a.nama.trim().toLowerCase()))
      .map((a) => `${a.nama} (${a.hubungan})`);

    const anggotaMasuk = (newKKData.anggotaKeluarga || [])
      .filter((a) => !oldAnggotaNames.includes(a.nama.trim().toLowerCase()))
      .map((a) => `${a.nama} (${a.hubungan})`);

    const riwayatBaru: RiwayatPerubahanKK = {
      id: 'rw_' + Date.now(),
      tanggal: new Date().toISOString().split('T')[0],
      alasan,
      keterangan: keterangan || 'Pembaruan data KK melalui import Excel / edit langsung',
      noKKLama: oldWarga.noKK,
      noKKBaru: newKKData.noKK,
      kepalaKeluargaLama: oldWarga.nama,
      kepalaKeluargaBaru: newKKData.nama,
      anggotaKeluar: anggotaKeluar.length > 0 ? anggotaKeluar : undefined,
      anggotaMasuk: anggotaMasuk.length > 0 ? anggotaMasuk : undefined,
      totalKasDipindahkan,
    };

    const nowIso = new Date().toISOString();
    let updatedWargaItem: Warga | null = null;
    const nextWargaList = latestStateRef.current.wargaList.map((w) => {
      if (w.id === wargaId) {
        updatedWargaItem = {
          ...w,
          nama: newKKData.nama,
          noKK: newKKData.noKK,
          rt: newKKData.rt || w.rt,
          rw: newKKData.rw || w.rw,
          alamat: newKKData.alamat || w.alamat,
          kodePos: newKKData.kodePos || w.kodePos,
          tanggalDikeluarkan: newKKData.tanggalDikeluarkan || w.tanggalDikeluarkan,
          jenisKelamin: newKKData.jenisKelamin || w.jenisKelamin,
          jumlahJiwa:
            newKKData.anggotaKeluarga.length > 0
              ? newKKData.anggotaKeluarga.length
              : w.jumlahJiwa,
          anggotaKeluarga: newKKData.anggotaKeluarga,
          riwayatPerubahanKK: [riwayatBaru, ...(w.riwayatPerubahanKK || [])],
          updatedAt: nowIso,
        };
        return updatedWargaItem;
      }
      return w;
    });

    const modifiedTxs: Transaction[] = [];
    let nextTxList = currentTxs.map((t) => {
      const matchesKK = t.noKK && t.noKK === oldWarga.noKK;
      const matchesNama =
        t.namaWarga && t.namaWarga.toLowerCase() === oldWarga.nama.toLowerCase();

      if (matchesKK || matchesNama) {
        const nextTx: Transaction = {
          ...t,
          noKK: newKKData.noKK,
          namaWarga: newKKData.nama,
          keterangan: t.keterangan.includes('Dialihkan')
            ? t.keterangan
            : `${t.keterangan} (Dialihkan dari KK lama: ${oldWarga.noKK})`,
          updatedAt: nowIso,
        };
        modifiedTxs.push(nextTx);
        return nextTx;
      }
      return t;
    });

    if (catatSantunanKematian) {
      const santunanTx: Transaction = {
        id: 'santunan_' + Date.now(),
        tanggal: new Date().toISOString().split('T')[0],
        kategori: 'Santunan Kematian',
        keterangan: `Santunan Kas Kematian & Kain Mori (Alm. ${namaMeninggal || 'Anggota KK'}) - KK: ${newKKData.noKK}`,
        nominal: 200000,
        tipe: 'kematian',
        namaWarga: newKKData.nama,
        noKK: newKKData.noKK,
        tahun: tahunAktif,
        rtScope: `RT ${newKKData.rt || oldWarga.rt || '08'} RW ${newKKData.rw || oldWarga.rw || '05'}`,
        updatedAt: nowIso,
      };
      nextTxList = [santunanTx, ...nextTxList];
      modifiedTxs.push(santunanTx);
    }

    const modifiedBantuan: BantuanPemerintah[] = [];
    const nextBantuanList = latestStateRef.current.bantuanList.map((b) => {
      if (
        b.noKK === oldWarga.noKK ||
        b.namaPenerima.toLowerCase() === oldWarga.nama.toLowerCase()
      ) {
        const nextB: BantuanPemerintah = {
          ...b,
          namaPenerima: newKKData.nama,
          noKK: newKKData.noKK,
          updatedAt: nowIso,
        };
        modifiedBantuan.push(nextB);
        return nextB;
      }
      return b;
    });

    setWargaList(nextWargaList);
    setTransactions(nextTxList);
    setBantuanList(nextBantuanList);
    setFloatingAnnouncement({
      id: 'upgrade_' + Date.now(),
      judul: 'Data KK Berhasil Diperbarui',
      isi: `Data KK atas nama ${oldWarga.nama} berhasil diperbarui menjadi ${newKKData.nama} (${newKKData.noKK}). Seluruh riwayat catatan keuangan & kas (${oldTxs.length} transaksi senilai Rp ${totalKasDipindahkan.toLocaleString('id-ID')}) dialihkan utuh tanpa ada yang hilang.`,
      kategori: 'Umum',
      tanggal: new Date().toISOString().split('T')[0],
      tanggalBerakhir: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      penulis: 'Sistem Upgrade KK',
    });
    setIsUpgradeModalOpen(false);
    setUpgradeTargetWarga(null);

    setSyncStatus('saving');
    await Promise.all([
      ...(updatedWargaItem ? [saveWargaDoc(updatedWargaItem)] : []),
      ...modifiedTxs.map((tx) => saveTransactionDoc(tx)),
      ...modifiedBantuan.map((b) => saveBantuanDoc(b)),
    ]);
    await triggerPublicSummarySync({
      wargaList: nextWargaList,
      transactions: nextTxList,
    });
    setSyncStatus('synced');
  };

  // Create Announcement
  const handleSavePengumuman = async (p: Omit<PengumumanRT, 'id'>) => {
    const newP: PengumumanRT = {
      ...p,
      id: toValidDocId('p_' + Date.now(), 'p'),
      updatedAt: new Date().toISOString(),
    };
    const nextList = [newP, ...latestStateRef.current.pengumumanList];
    setPengumumanList(nextList);
    setFloatingAnnouncement(newP);
    setSyncStatus('saving');
    const res = await savePengumumanDoc(newP);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan pengumuman ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
      await triggerPublicSummarySync({ pengumumanList: nextList });
    }
  };

  // Delete Announcement
  const handleDeletePengumuman = async (id: string) => {
    const nextList = latestStateRef.current.pengumumanList.filter((p) => p.id !== id);
    setPengumumanList(nextList);
    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, id])));
    if (floatingAnnouncement?.id === id) {
      setFloatingAnnouncement(null);
    }
    setSyncStatus('saving');
    const res = await deletePengumumanDoc(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus pengumuman dari Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
      await triggerPublicSummarySync({ pengumumanList: nextList });
    }
  };

  // Server: Admin RT Accounts Management (Provisions Firebase Auth + Cloud Firestore)
  const handleAddAdminAccount = async (acc: Omit<AdminRTAccount, 'id'>) => {
    const newAcc: AdminRTAccount = {
      ...acc,
      id: toValidDocId('adm_' + Date.now(), 'adm'),
      updatedAt: new Date().toISOString(),
    };
    setAdminAccounts((prev) => [newAcc, ...prev]);
    setSyncStatus('saving');

    const prov = await provisionAdminAuthAccount(newAcc);
    if (prov.error) {
      setCloudError(prov.error);
    }
    const saveRes = await saveAdminAccountDoc(newAcc, prov.authUid);
    if (!saveRes.ok) {
      setSyncStatus('offline');
      setCloudError(saveRes.message || 'Gagal menyimpan akun Admin RT ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  const handleUpdateAdminAccount = async (id: string, updated: Partial<AdminRTAccount>) => {
    const nowIso = new Date().toISOString();
    const oldAcc = latestStateRef.current.adminAccounts.find((a) => a.id === id);
    if (!oldAcc) return;
    const mergedAcc: AdminRTAccount = { ...oldAcc, ...updated, updatedAt: nowIso };
    setAdminAccounts((prev) => prev.map((a) => (a.id === id ? mergedAcc : a)));
    setSyncStatus('saving');

    const prov = await provisionAdminAuthAccount(mergedAcc, oldAcc.passwordHash);
    if (prov.error) {
      setCloudError(prov.error);
    }
    const saveRes = await saveAdminAccountDoc(
      mergedAcc,
      prov.authUid || (oldAcc as any).authUid
    );
    if (!saveRes.ok) {
      setSyncStatus('offline');
      setCloudError(saveRes.message || 'Gagal memperbarui akun Admin RT di Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  const handleDeleteAdminAccount = async (id: string) => {
    setAdminAccounts((prev) => prev.filter((a) => a.id !== id));
    setSyncStatus('saving');
    const res = await deleteAdminAccountDoc(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus akun Admin RT di Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  // Server: Update verification status of monthly submission
  const handleUpdateStatusLaporan = async (id: string, status: PembaruanBulananRT['statusVerifikasi']) => {
    const nowIso = new Date().toISOString();
    const existing = latestStateRef.current.laporanBulananRT.find((lap) => lap.id === id);
    const updatedLap = existing ? { ...existing, statusVerifikasi: status, updatedAt: nowIso } : null;
    setLaporanBulananRT((prev) =>
      prev.map((lap) => (lap.id === id ? { ...lap, statusVerifikasi: status, updatedAt: nowIso } : lap))
    );
    if (updatedLap) {
      setSyncStatus('saving');
      const res = await saveLaporanDoc(updatedLap);
      if (!res.ok) {
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal memperbarui status laporan di Cloud Firestore.');
      } else {
        setServerConnected(true);
        setSyncStatus('synced');
      }
    }
  };

  // Admin RT: Send monthly update to Server
  const handleKirimLaporanBulanan = async (laporan: PembaruanBulananRT) => {
    const nowIso = new Date().toISOString();
    const nowLabel = formatWaktuSyncID();
    const stamped: PembaruanBulananRT = {
      ...laporan,
      id: toValidDocId(laporan.id || 'lap_' + Date.now(), 'lap'),
      updatedAt: nowIso,
    };
    setLaporanBulananRT((prev) => [stamped, ...prev]);

    let updatedAdminAcc: AdminRTAccount | null = null;
    if (currentUser?.role === 'admin') {
      const nextAdmins = latestStateRef.current.adminAccounts.map((acc) => {
        if (acc.username.toLowerCase() === currentUser.username.toLowerCase()) {
          updatedAdminAcc = {
            ...acc,
            terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
            updatedAt: nowIso,
          };
          return updatedAdminAcc;
        }
        return acc;
      });
      setAdminAccounts(nextAdmins);
    }

    setSyncStatus('saving');
    const res = await saveLaporanDoc(stamped);
    if (updatedAdminAcc) {
      await saveAdminAccountDoc(updatedAdminAcc, auth.currentUser?.uid);
    }
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal mengirim laporan bulanan ke Cloud Firestore.');
    } else {
      setServerConnected(true);
      setSyncStatus('synced');
    }
  };

  // Restore entire database from backup JSON -> writes directly to Cloud Firestore
  const handleRestoreDatabase = async (dbData: AppDatabaseSchema) => {
    const nowIso = new Date().toISOString();
    const stampAll = <T extends { updatedAt?: string }>(list?: T[]): T[] =>
      Array.isArray(list) ? list.map((item) => ({ ...item, updatedAt: item.updatedAt || nowIso })) : [];

    const restored: AppDatabaseSchema = {
      version: 2,
      lastUpdated: nowIso,
      tahunAktif: dbData.tahunAktif || tahunAktif,
      pengaturanKas: dbData.pengaturanKas
        ? { ...dbData.pengaturanKas, updatedAt: nowIso }
        : pengaturanKas,
      wargaList: stampAll(dbData.wargaList),
      transactions: stampAll(dbData.transactions),
      bantuanList: stampAll(dbData.bantuanList),
      pengumumanList: stampAll(dbData.pengumumanList),
      dokumenList: stampAll(dbData.dokumenList),
      adminAccounts: stampAll(dbData.adminAccounts),
      laporanBulananRT: stampAll(dbData.laporanBulananRT),
    };

    setTahunAktif(restored.tahunAktif);
    setPengaturanKas(restored.pengaturanKas);
    setWargaList(restored.wargaList);
    setTransactions(restored.transactions);
    setBantuanList(restored.bantuanList);
    setPengumumanList(restored.pengumumanList);
    setDokumenList(restored.dokumenList);
    setAdminAccounts(restored.adminAccounts);
    setLaporanBulananRT(restored.laporanBulananRT);

    setSyncStatus('saving');
    const migRes = await migrateSnapshotToFirestore(restored);
    if (migRes.ok) {
      setSyncStatus('synced');
      setRolloverNotice(
        `Database berhasil dipulihkan & disinkronkan ke Cloud Firestore (${migRes.migratedWarga} KK, ${migRes.migratedTx} transaksi)!`
      );
    } else {
      setSyncStatus('offline');
      setCloudError(migRes.message || 'Gagal memulihkan cadangan JSON ke Cloud Firestore.');
    }
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  // Handle Login
  const handleLoginSuccess = (user: AuthUser) => {
    setAuthReady(true);
    setCurrentUser(user);
    setIsLoginModalOpen(false);
    setIsPinLocked(false);
    setCloudError(null);
    setServerConnected(true);
    setLastActivity(Date.now());
    if (user.role === 'server') {
      setCurrentView('server-kontrol');
    } else if (user.role === 'warga') {
      setCurrentView('dasbor-warga');
    } else {
      setCurrentView('beranda');
    }
  };

  // Handle Explicit Logout -> signs out of Firebase Auth & clears state
  const handleLogout = async () => {
    await logoutFromFirebase();
    setDataLoadedReady(false);
    setSseConnected(false);
    setCurrentUser(null);
    setWargaList([]);
    setTransactions([]);
    setBantuanList([]);
    setPengumumanList([]);
    setDokumenList([]);
    setAdminAccounts([]);
    setServerAdminAccounts([]);
    setLaporanBulananRT([]);
    setFloatingAnnouncement(null);
    setIsPinLocked(false);
    setIsSidebarOpen(false);
    setCloudError(null);
    setIsLoginModalOpen(true);
  };

  // Quick switch role helper (only triggered from inside Server control view)
  const handleSwitchToRole = (targetRole: 'server' | 'admin' | 'warga', targetRtScope?: string) => {
    if (targetRole === 'server') {
      const nextUser: AuthUser = {
        role: 'server',
        username: 'RW05GLEMPANG',
        nama: 'Super Admin Server RW 05 Glempang',
        rtScope: 'Semua RT se-RW 05 Glempang',
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      setCurrentView('server-kontrol');
    } else if (targetRole === 'admin') {
      const targetRTCode = normalizeRTCode(targetRtScope);
      const matchedAcc = targetRTCode
        ? adminAccounts.find((a) => normalizeRTCode(a.rt) === targetRTCode)
        : undefined;
      const rtStr = matchedAcc?.rt || targetRTCode || pengaturanKas.profilRT?.namaRT || '08';
      const rwStr = matchedAcc?.rw || pengaturanKas.profilRT?.namaRW || '05';
      const ketuaStr = matchedAcc?.nama || pengaturanKas.kontakKetuaRT?.nama?.trim();
      const nextUser: AuthUser = {
        role: 'admin',
        username: matchedAcc?.username || 'Admin',
        nama: matchedAcc
          ? `${matchedAcc.nama} (${matchedAcc.jabatan || `Ketua RT ${rtStr}`})`
          : ketuaStr
          ? `${ketuaStr} (Ketua RT ${rtStr})`
          : `Administrator RT ${rtStr} RW ${rwStr}`,
        rtScope: `RT ${rtStr} RW ${rwStr}`,
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      setCurrentView('beranda');
    } else {
      const sampleWarga = wargaList[0];
      const nextUser: AuthUser = {
        role: 'warga',
        username: sampleWarga?.nama || 'Warga',
        nama: sampleWarga?.nama || 'Warga',
        noKK: sampleWarga?.noKK || '',
        wargaId: sampleWarga?.id || '',
        rtScope: sampleWarga ? `RT ${sampleWarga.rt || '08'} RW ${sampleWarga.rw || '05'}` : 'RT 08 RW 05',
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      setCurrentView('dasbor-warga');
    }
  };

  const isServer = currentUser?.role === 'server';
  const isAdminRT = currentUser?.role === 'admin';
  const isWarga = currentUser?.role === 'warga';

  const serverRegisteredRTs = isServer
    ? collectRegisteredRTs({
        adminAccounts,
        wargaList,
        transactions,
        bantuanList,
        laporanBulananRT,
        pengaturanKas,
      })
    : [];

  const serverViewData = isServer
    ? buildServerFilteredViewData({
        selectedRT: selectedServerRT,
        adminAccounts,
        wargaList,
        transactions,
        bantuanList,
        pengaturanKas,
      })
    : {
        wargaList,
        transactions,
        bantuanList,
        pengaturanKas,
        scopeTitle: '',
      };

  const matchedServerAdmin = isAdminRT
    ? serverAdminAccounts.find(
        (acc) => acc.username.trim().toLowerCase() === (currentUser?.username || '').trim().toLowerCase()
      )
    : undefined;
  const isCurrentAdminOnServer = !isAdminRT || Boolean(matchedServerAdmin);

  interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }

  // Navigation Items per Role
  const serverNavItems: NavItem[] = [
    { id: 'server-kontrol', label: 'Pusat Server & RT', icon: <Server size={18} /> },
    {
      id: 'beranda',
      label: selectedServerRT === 'SEMUA' ? 'Lihat Kas Semua RT' : `Lihat Kas RT ${selectedServerRT}`,
      icon: <LayoutDashboard size={18} />,
    },
    { id: 'kas-warga', label: 'Mutasi Kas RT', icon: <Wallet size={18} /> },
    { id: 'data-warga', label: 'Data Warga Desa', icon: <Users size={18} /> },
    { id: 'bantuan-pemerintah', label: 'Bantuan Sosial Desa', icon: <HandHeart size={18} /> },
    { id: 'status-iuran', label: 'Monitoring Iuran', icon: <CalendarCheck size={18} /> },
    { id: 'pengumuman', label: 'Warta Pengumuman', icon: <Megaphone size={18} /> },
    { id: 'laporan', label: 'Laporan Rekap', icon: <FileText size={18} /> },
    { id: 'pengaturan', label: 'Pengaturan & Backup', icon: <Settings size={18} /> },
    { id: 'kebijakan-privasi', label: 'Kebijakan Privasi', icon: <ShieldCheck size={18} /> },
  ];

  const adminNavItems: NavItem[] = [
    { id: 'beranda', label: 'Beranda Kas', icon: <LayoutDashboard size={18} /> },
    { id: 'kas-warga', label: 'Kas Warga', icon: <Wallet size={18} /> },
    { id: 'kas-masuk', label: 'Kas Masuk', icon: <ArrowUp size={18} strokeWidth={2.5} /> },
    { id: 'kas-keluar', label: 'Kas Keluar', icon: <ArrowDown size={18} strokeWidth={2.5} /> },
    { id: 'kas-kematian', label: 'Kas Kematian (Mori)', icon: <Heart size={18} fill="currentColor" /> },
    { id: 'status-iuran', label: 'Status Iuran', icon: <CalendarCheck size={18} /> },
    { id: 'data-warga', label: 'Data Warga & Excel', icon: <Users size={18} /> },
    { id: 'bantuan-pemerintah', label: 'Bantuan Pemerintah', icon: <HandHeart size={18} />, badge: 'Rahasia' },
    { id: 'dokumen-pdf', label: 'Arsip PDF Warga', icon: <FileArchive size={18} />, badge: 'Admin' },
    { id: 'pengumuman', label: 'Pengumuman & WA', icon: <Megaphone size={18} /> },
    { id: 'laporan', label: 'Laporan & PDF', icon: <FileText size={18} /> },
    { id: 'pengaturan', label: 'Pengaturan & PIN', icon: <Settings size={18} /> },
    { id: 'kebijakan-privasi', label: 'Kebijakan Privasi', icon: <ShieldCheck size={18} /> },
  ];

  const wargaNavItems: NavItem[] = [
    { id: 'dasbor-warga', label: 'Data Keluarga & Iuran', icon: <User size={18} /> },
    { id: 'pengumuman', label: 'Warta Pengumuman', icon: <Megaphone size={18} /> },
    { id: 'laporan', label: 'Laporan Kas RT', icon: <FileText size={18} /> },
    { id: 'pengaturan', label: 'Ubah PIN Akun', icon: <Settings size={18} /> },
    { id: 'kebijakan-privasi', label: 'Kebijakan Privasi', icon: <ShieldCheck size={18} /> },
  ];

  const currentNavItems: NavItem[] = isServer ? serverNavItems : isAdminRT ? adminNavItems : wargaNavItems;

  // Wait briefly for Firebase Auth persistence recovery before showing login screen
  if (!authReady) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#063A27] via-[#0B5D3F] to-[#0F172A] text-white p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 backdrop-blur-xs shadow-lg mb-4">
          <HouseLogo size={46} variant="white" />
        </div>
        <h1 className="text-lg font-extrabold tracking-tight">Aplikasi Desa Kotayasa</h1>
        <p className="mt-1 text-xs text-emerald-200 flex items-center gap-2">
          <RefreshCw size={13} className="animate-spin" />
          Memulihkan sesi Firebase Authentication...
        </p>
      </div>
    );
  }

  // SECURITY GATE: Fresh installs & logged-out users MUST enter via the Login Menu first
  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-[#063A27] via-[#0B5D3F] to-[#0F172A]">
        <LoginModal
          isOpen={true}
          canClose={false}
          onClose={() => {}}
          onLoginSuccess={handleLoginSuccess}
          adminAccounts={adminAccounts}
          pengaturanKas={pengaturanKas}
          currentPin={currentPin}
          onOpenLupaPassword={() => setIsLupaPasswordOpen(true)}
          onRefreshSync={handleForceSyncNow}
          onSyncAdminAccountToServer={handleSyncAdminAccountToServer}
          sseConnected={sseConnected}
          serverConnected={serverConnected}
          serverErrorDetail={cloudError}
        />
        <LupaPasswordModal
          isOpen={isLupaPasswordOpen}
          onClose={() => setIsLupaPasswordOpen(false)}
          pengaturanKas={pengaturanKas}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F4F7F5] text-slate-800 font-sans">
      {/* 6-DIGIT PIN APP LOCK SCREEN */}
      <PinLockModal
        isOpen={isPinLocked}
        currentUser={currentUser}
        currentPin={currentPin}
        onUnlockSuccess={() => {
          setIsPinLocked(false);
          setInactivityNotice(false);
        }}
        pengaturanKas={pengaturanKas}
        onOpenHelp={() => setIsLupaPasswordOpen(true)}
      />

      {/* FLOATING NOTIFICATION BANNER (Auto-dismisses & marks as read) */}
      <FloatingNotification
        announcement={floatingAnnouncement}
        onClose={() => handleDismissFloating()}
        onOpenDetail={(p) => {
          setCurrentView('pengumuman');
          handleDismissFloating(p.id);
        }}
        profilRT={pengaturanKas.profilRT}
        namaKetua={pengaturanKas.kontakKetuaRT?.nama}
        pengaturanKas={pengaturanKas}
      />

      {/* KIRIM LAPORAN BULANAN MODAL (Admin RT -> Server) */}
      <KirimLaporanModal
        isOpen={isKirimLaporanModalOpen}
        onClose={() => setIsKirimLaporanModalOpen(false)}
        onKirim={handleKirimLaporanBulanan}
        adminName={currentUser?.nama || 'Admin RT'}
        rtScope={currentUser?.rtScope || `RT ${pengaturanKas.profilRT?.namaRT || '08'} RW ${pengaturanKas.profilRT?.namaRW || '05'}`}
        wargaList={wargaList}
        transaksiList={transactions}
        bantuanList={bantuanList}
        saldoKasUmum={saldoKasUmumBerjalan}
        saldoKasKematian={saldoKasKematianBerjalan}
        tahunAktif={tahunAktif}
        rw={pengaturanKas.profilRT?.namaRW}
        desa={pengaturanKas.profilRT?.desa}
      />

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col justify-between ${
          isServer
            ? 'bg-gradient-to-b from-[#1E1B4B] via-[#2E1065] to-[#0F172A]'
            : 'bg-gradient-to-b from-[#094A32] via-[#0B5D3F] to-[#073F2B]'
        } p-5 text-white shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto no-scrollbar">
          {/* Header Brand */}
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 p-1.5 backdrop-blur-xs shadow-inner">
                {isServer ? (
                  <Server size={24} className="text-indigo-300" />
                ) : (
                  <HouseLogo size={34} variant="white" />
                )}
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">
                  {isServer ? 'SERVER PUSAT' : `RT ${pengaturanKas.profilRT?.namaRT || '08'} RW ${pengaturanKas.profilRT?.namaRW || '05'}`}
                </h1>
                <p className="text-xs font-semibold text-emerald-200">
                  {pengaturanKas.profilRT?.desa || 'Desa Kotayasa'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 text-emerald-100 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* User Role Card */}
          <div className="mt-4 rounded-2xl bg-white/10 p-3.5 backdrop-blur-xs border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                {isServer ? 'SUPER ADMIN DESA' : isAdminRT ? 'ADMIN RT' : 'WARGA (KK)'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                  isServer
                    ? 'bg-indigo-300 text-indigo-950'
                    : isAdminRT
                    ? 'bg-amber-400 text-slate-900'
                    : 'bg-emerald-300 text-emerald-950'
                }`}
              >
                {isServer ? 'SERVER' : isAdminRT ? 'ADMIN RT' : 'WARGA'}
              </span>
            </div>
            <p className="text-sm font-bold truncate text-white">
              {currentUser?.nama || 'Tamu'}
            </p>
            {currentUser?.rtScope && (
              <p className="text-[10px] text-emerald-200/90 font-medium">
                Scope: {currentUser.rtScope}
              </p>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="mt-5 space-y-1">
            {currentNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setCurrentView(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`relative w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    isActive
                      ? isServer
                        ? 'text-indigo-900'
                        : 'text-[#0B5D3F]'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeSidebarPill"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-white shadow-sm"
                    />
                  )}
                  <div className="relative z-10 flex items-center gap-3">
                    <motion.span
                      animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                      transition={{ duration: 0.25 }}
                      className={isActive ? (isServer ? 'text-indigo-700' : 'text-[#0B5D3F]') : 'text-white/70'}
                    >
                      {item.icon}
                    </motion.span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="relative z-10 rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-black text-white uppercase">
                      {item.badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          {/* Cloud Firestore Real-time persistence indicator */}
          <div className="flex items-center justify-between text-[10px] text-white/80 px-1">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  syncStatus === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : !serverConnected || syncStatus === 'offline'
                    ? 'bg-rose-400'
                    : sseConnected
                    ? 'bg-emerald-400'
                    : 'bg-sky-400'
                }`}
              ></span>
              <span>
                {syncStatus === 'saving'
                  ? 'Menyinkronkan...'
                  : !serverConnected || syncStatus === 'offline'
                  ? 'Firebase Terputus'
                  : sseConnected
                  ? 'Cloud Firestore Live'
                  : 'Firebase Terhubung'}
              </span>
            </span>
            <button
              type="button"
              onClick={handleForceSyncNow}
              disabled={cloudSyncBusy}
              className="rounded-md bg-white/10 hover:bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white cursor-pointer disabled:opacity-50"
              title="Sinkronkan ulang sekarang"
            >
              <RefreshCw size={10} className={cloudSyncBusy ? 'animate-spin' : ''} />
            </button>
          </div>

          {isAdminRT && dataLoadedReady && !isCurrentAdminOnServer && (
            <button
              type="button"
              onClick={() => handleSyncAdminAccountToServer()}
              disabled={adminSyncBusy}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-slate-950 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
              title="Akun Admin belum terdaftar di Cloud Firestore. Klik untuk menyinkronkan akun & data."
            >
              <CloudUpload size={13} />
              <span>{adminSyncBusy ? 'Menyinkronkan Akun...' : 'Sinkron Akun ke Firebase'}</span>
            </button>
          )}

          {isAdminRT && dataLoadedReady && isCurrentAdminOnServer && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-400/15 px-2.5 py-1.5 text-[10px] text-emerald-100 border border-emerald-300/20">
              <span className="truncate font-semibold">Cloud Firestore: Live</span>
              <button
                type="button"
                onClick={() => handleSyncAdminAccountToServer()}
                disabled={adminSyncBusy}
                className="shrink-0 font-black text-emerald-300 hover:text-white ml-1 cursor-pointer disabled:opacity-50"
                title="Sinkronkan ulang akun & data ke Cloud Firestore"
              >
                {adminSyncBusy ? '...' : 'SINKRON'}
              </button>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 text-xs font-bold text-white transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Keluar ke Menu Login</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <motion.h2
                  key={currentView}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm font-extrabold text-slate-900"
                >
                  {currentNavItems.find((n) => n.id === currentView)?.label || `Aplikasi ${pengaturanKas.profilRT?.desa || 'Desa Kotayasa'}`}
                </motion.h2>
                {isServer && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                    <Server size={10} /> SERVER PUSAT
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {pengaturanKas.profilRT?.desa || 'Desa Kotayasa'} &bull; {currentUser?.nama} ({isServer && currentView !== 'server-kontrol' ? (selectedServerRT === 'SEMUA' ? 'Semua RT Terdaftar' : `Filter RT ${selectedServerRT}`) : currentUser?.rtScope || `RT ${pengaturanKas.profilRT?.namaRT || '08'}`})
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* ANNUAL ROLLOVER SELECTOR (Pergantian Tahun Otomatis - Saldo Berlanjut) */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
              <Calendar size={13} className="text-[#0B5D3F] ml-1.5 hidden xs:block" />
              <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">Tahun:</span>
              <select
                value={tahunAktif}
                onChange={(e) => handleSwitchTahunAktif(Number(e.target.value))}
                className="bg-white rounded-lg px-2 py-1 text-xs font-black text-slate-800 border border-slate-200 outline-hidden cursor-pointer shadow-2xs"
                title="Pilih Tahun Pembukuan (Saldo Akhir Tahun Lalu Otomatis Berlanjut)"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026 (Aktif)</option>
                <option value={2027}>2027</option>
                <option value={2028}>2028</option>
              </select>
            </div>

            {/* Admin RT Only: Kirim Pembaruan Bulanan ke Server */}
            {isAdminRT && (
              <button
                onClick={() => setIsKirimLaporanModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Kirim Laporan Rekap Bulanan RT ke Server Desa"
              >
                <Send size={13} />
                <span className="hidden md:inline">Kirim ke Server</span>
                <span className="md:hidden">Kirim</span>
              </button>
            )}

            {/* Lock PIN button */}
            <button
              onClick={() => setIsPinLocked(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              title="Kunci Layar (PIN 6 Digit)"
            >
              <Lock size={13} className="text-[#0B5D3F]" />
              <span className="hidden sm:inline">Kunci PIN</span>
            </button>

            {/* Admin RT only: Catat Kas */}
            {isAdminRT && (
              <button
                onClick={() => {
                  setTxModalType('masuk');
                  setIsTxModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">+ Catat Kas</span>
                <span className="sm:hidden">Kas</span>
              </button>
            )}

            {/* Central Server Connection Status Pill */}
            <button
              type="button"
              onClick={handleForceSyncNow}
              disabled={cloudSyncBusy}
              className={`hidden md:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 ${
                !serverConnected || syncStatus === 'offline'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : syncStatus === 'saving' || cloudSyncBusy
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : sseConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
              }`}
              title="Status koneksi Database Server Pusat (Klik untuk sinkronkan ulang)"
            >
              {!serverConnected || syncStatus === 'offline' ? (
                <AlertCircle size={13} />
              ) : syncStatus === 'saving' || cloudSyncBusy ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : sseConnected ? (
                <Wifi size={13} />
              ) : (
                <Database size={13} />
              )}
              <span>
                {!serverConnected || syncStatus === 'offline'
                  ? 'Firebase Terputus'
                  : syncStatus === 'saving' || cloudSyncBusy
                  ? 'Menyinkronkan...'
                  : sseConnected
                  ? 'Cloud Live'
                  : 'Firebase Siap'}
              </span>
            </button>

            {/* Login / Ganti Akun */}
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 transition-all cursor-pointer"
            >
              <User size={13} className="text-[#0B5D3F]" />
              <span className="hidden sm:inline">Ganti Akun</span>
            </button>
          </div>
        </header>

        {/* Admin Account Not Registered/Synced on Server Warning Banner */}
        {isAdminRT && dataLoadedReady && !isCurrentAdminOnServer && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm border-b border-amber-600/20">
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <AlertCircle size={16} className="shrink-0 mt-0.5 sm:mt-0" />
              <span>
                Akun Admin <strong>{currentUser?.username}</strong> belum terdaftar di Server Pusat. Data di perangkat tetap aman — klik tombol untuk menyinkronkan akun &amp; data agar terbaca di semua aplikasi perangkat lain.
              </span>
            </div>
            <button
              type="button"
              disabled={adminSyncBusy}
              onClick={() => handleSyncAdminAccountToServer()}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60"
            >
              <CloudUpload size={14} />
              <span>{adminSyncBusy ? 'Menyinkronkan...' : 'Sinkronkan Akun ke Server'}</span>
            </button>
          </div>
        )}

        {/* Offline Auto-Retry Banner when local edits are waiting to reach server */}
        {syncStatus === 'offline' && dataLoadedReady && (
          <div className="bg-slate-800 text-amber-200 px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw size={14} className="shrink-0 animate-spin" />
              <span className="truncate">
                Perubahan tersimpan aman di perangkat &amp; otomatis mengirim ulang ke Server saat koneksi stabil...
              </span>
            </div>
            <button
              type="button"
              onClick={handleForceSyncNow}
              disabled={cloudSyncBusy}
              className="shrink-0 rounded-lg bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-extrabold hover:bg-amber-300 cursor-pointer disabled:opacity-60"
            >
              Kirim Sekarang
            </button>
          </div>
        )}

        {/* Visible Sync Error Banner so connection/sync issues are never silent */}
        {cloudError && (
          <div className="bg-rose-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={15} className="shrink-0" />
              <span className="truncate">{cloudError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleForceSyncNow}
                className="rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-[11px] font-bold cursor-pointer"
              >
                Coba Sinkron
              </button>
              <button
                type="button"
                onClick={() => setCloudError(null)}
                className="hover:text-rose-200 cursor-pointer"
                aria-label="Tutup pesan error sinkronisasi"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Rollover / Annual Notification Banner */}
        {rolloverNotice && (
          <div className="bg-emerald-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{rolloverNotice}</span>
            </div>
            <button onClick={() => setRolloverNotice(null)} className="hover:text-emerald-200 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Scrollable Content Container with smooth scroll & mobile horizontal safety */}
        <main className="flex-1 overflow-y-auto smooth-scroll p-3 sm:p-5 lg:p-8 scrollbar-thin">
          <div className="mx-auto max-w-7xl">
            {/* SERVER MULTI-ADMIN RT FILTER BAR */}
            {isServer &&
              currentView !== 'server-kontrol' &&
              currentView !== 'kebijakan-privasi' &&
              currentView !== 'pengaturan' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className="mb-4 rounded-2xl bg-white p-3 border border-indigo-200/80 shadow-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                        <Server size={13} />
                      </span>
                      <span className="text-xs font-extrabold text-slate-800">
                        Filter Wilayah Admin RT: <span className="text-indigo-700">{serverViewData.scopeTitle}</span>
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {serverViewData.wargaList.length} KK &bull; {serverViewData.transactions.length} Transaksi
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto smooth-scroll no-scrollbar pb-0.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setSelectedServerRT('SEMUA')}
                      className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold border transition-all cursor-pointer ${
                        selectedServerRT === 'SEMUA'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                      }`}
                    >
                      Semua Admin RT ({serverRegisteredRTs.length} RT)
                    </motion.button>

                    {serverRegisteredRTs.map((rtInfo) => {
                      const active = selectedServerRT === rtInfo.rt;
                      return (
                        <motion.button
                          key={rtInfo.rt}
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setSelectedServerRT(rtInfo.rt)}
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-[#0B5D3F] text-white border-[#0B5D3F] shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                          }`}
                        >
                          <span>RT {rtInfo.rt}</span>
                          {rtInfo.adminNames[0] && (
                            <span className={`text-[10px] font-medium ${active ? 'text-emerald-100' : 'text-slate-500'}`}>
                              • {rtInfo.adminNames[0]}
                            </span>
                          )}
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                              active ? 'bg-white/20 text-white' : 'bg-white text-[#0B5D3F] border border-slate-200'
                            }`}
                          >
                            {rtInfo.totalKK} KK
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentUser?.role}-${currentView}-${isServer ? selectedServerRT : ''}`}
                initial={{ opacity: 0, y: 12, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.992 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="w-full"
              >
                {/* SERVER (SUPER ADMIN DESA) VIEWS */}
                {isServer ? (
              currentView === 'server-kontrol' ? (
                <ServerKontrolView
                  adminAccounts={adminAccounts}
                  laporanBulananRT={laporanBulananRT}
                  wargaList={wargaList}
                  transactions={transactions}
                  bantuanList={bantuanList}
                  pengaturanKas={pengaturanKas}
                  pengumumanList={pengumumanList}
                  dokumenList={dokumenList}
                  serverConnected={serverConnected}
                  sseConnected={sseConnected}
                  cloudSyncBusy={cloudSyncBusy}
                  cloudError={cloudError}
                  onForceSyncNow={handleForceSyncNow}
                  onAddAdminAccount={handleAddAdminAccount}
                  onUpdateAdminAccount={handleUpdateAdminAccount}
                  onDeleteAdminAccount={handleDeleteAdminAccount}
                  onUpdateStatusLaporan={handleUpdateStatusLaporan}
                  onRestoreDatabase={handleRestoreDatabase}
                  onSwitchToRTAdmin={(rtScope) => {
                    handleSwitchToRole('admin', rtScope);
                  }}
                  onViewRTKas={(rtCode) => {
                    setSelectedServerRT(rtCode || 'SEMUA');
                    setCurrentView('beranda');
                  }}
                />
              ) : currentView === 'data-warga' ? (
                <DataWargaView
                  wargaList={serverViewData.wargaList}
                  bantuanList={serverViewData.bantuanList}
                  profilRT={serverViewData.pengaturanKas.profilRT}
                  pengaturanKas={serverViewData.pengaturanKas}
                  isServer={true}
                  onOpenWargaModal={() => setIsWargaModalOpen(true)}
                  onOpenUpgradeModal={(w) => {
                    setUpgradeTargetWarga(w || null);
                    setIsUpgradeModalOpen(true);
                  }}
                  onDeleteWarga={handleDeleteWarga}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'bantuan-pemerintah' ? (
                <BantuanPemerintahView
                  bantuanList={serverViewData.bantuanList}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onAddBantuan={handleAddBantuan}
                  onUpdateStatus={handleUpdateStatusBantuan}
                  onDeleteBantuan={handleDeleteBantuan}
                  onOpenImportExcel={() => setIsWargaModalOpen(true)}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'beranda' ? (
                <BerandaView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onNavigate={(view) => setCurrentView(view)}
                  onOpenTxModal={(type) => {
                    setTxModalType(type || 'masuk');
                    setIsTxModalOpen(true);
                  }}
                  onOpenWargaModal={() => setIsWargaModalOpen(true)}
                  onOpenPengumumanModal={() => setIsPengumumanModalOpen(true)}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                />
              ) : currentView === 'kas-warga' ? (
                <KasWargaView
                  transactions={serverViewData.transactions}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={(type) => {
                    setTxModalType(type || 'masuk');
                    setIsTxModalOpen(true);
                  }}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-masuk' ? (
                <KasMasukView
                  transactions={serverViewData.transactions}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => {
                    setTxModalType('masuk');
                    setIsTxModalOpen(true);
                  }}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-keluar' ? (
                <KasKeluarView
                  transactions={serverViewData.transactions}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => {
                    setTxModalType('keluar');
                    setIsTxModalOpen(true);
                  }}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-kematian' ? (
                <KasKematianView
                  transactions={serverViewData.transactions}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => {
                    setTxModalType('kematian');
                    setIsTxModalOpen(true);
                  }}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'status-iuran' ? (
                <StatusIuranView
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onToggleStatus={handleToggleWargaStatus}
                  onOpenWargaModal={() => setIsWargaModalOpen(true)}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'pengumuman' ? (
                <PengumumanView
                  pengumumanList={activeAnnouncements}
                  isAdmin={true}
                  onOpenCreateModal={() => setIsPengumumanModalOpen(true)}
                  onDeletePengumuman={handleDeletePengumuman}
                  onBack={() => setCurrentView('server-kontrol')}
                  pengaturanKas={serverViewData.pengaturanKas}
                />
              ) : currentView === 'laporan' ? (
                <LaporanView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  bantuanList={serverViewData.bantuanList}
                  onBack={() => setCurrentView('server-kontrol')}
                  pengaturanKas={serverViewData.pengaturanKas}
                  tahun={tahunAktif}
                />
              ) : currentView === 'pengaturan' ? (
                <PengaturanView
                  pengaturanKas={pengaturanKas}
                  currentUser={currentUser}
                  currentPin={currentPin}
                  onUpdatePin={(pin) => setCurrentPin(pin)}
                  onUpdatePengaturan={handleUpdatePengaturan}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  onOpenPrivacyPolicy={() => setCurrentView('kebijakan-privasi')}
                  onResetEmpty={handleResetEmpty}
                  onLoadSample={handleLoadSample}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : (
                <KebijakanPrivasiView onBack={() => setCurrentView('server-kontrol')} pengaturanKas={pengaturanKas} />
              )
            ) : isWarga ? (
              /* WARGA ROLE VIEWS */
              currentView === 'pengumuman' ? (
                <PengumumanView
                  pengumumanList={activeAnnouncements}
                  isAdmin={false}
                  onOpenCreateModal={() => {}}
                  onDeletePengumuman={() => {}}
                  onBack={() => setCurrentView('dasbor-warga')}
                  pengaturanKas={pengaturanKas}
                />
              ) : currentView === 'laporan' ? (
                <LaporanView
                  transactions={transactions}
                  wargaList={wargaList}
                  onBack={() => setCurrentView('dasbor-warga')}
                  pengaturanKas={pengaturanKas}
                  tahun={tahunAktif}
                />
              ) : currentView === 'pengaturan' ? (
                <PengaturanView
                  pengaturanKas={pengaturanKas}
                  currentUser={currentUser}
                  currentPin={currentPin}
                  onUpdatePin={async (pin) => {
                    setCurrentPin(pin);
                    const targetWargaId = currentUser?.wargaId || wargaList[0]?.id;
                    if (!targetWargaId) return;
                    const res = await updateWargaSelfDoc(targetWargaId, { pin });
                    if (!res.ok) {
                      setSyncStatus('offline');
                      setCloudError(res.message || 'Gagal menyimpan PIN baru ke Cloud Firestore.');
                    } else {
                      setServerConnected(true);
                      setSyncStatus('synced');
                    }
                  }}
                  onUpdatePengaturan={handleUpdatePengaturan}
                  onOpenSaldoAwalModal={() => {}}
                  onOpenPrivacyPolicy={() => setCurrentView('kebijakan-privasi')}
                  onResetEmpty={() => {}}
                  onLoadSample={() => {}}
                  onBack={() => setCurrentView('dasbor-warga')}
                />
              ) : currentView === 'kebijakan-privasi' ? (
                <KebijakanPrivasiView onBack={() => setCurrentView('dasbor-warga')} pengaturanKas={pengaturanKas} />
              ) : (
                <DasborWargaView
                  currentUser={currentUser!}
                  wargaList={wargaList}
                  transactions={transactions}
                  pengumumanList={activeAnnouncements}
                  pengaturanKas={pengaturanKas}
                />
              )
            ) : (
              /* ADMIN RT ROLE VIEWS */
              <>
                {currentView === 'beranda' && (
                  <BerandaView
                    transactions={transactions}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onNavigate={(view) => setCurrentView(view)}
                    onOpenTxModal={(type) => {
                      setTxModalType(type || 'masuk');
                      setIsTxModalOpen(true);
                    }}
                    onOpenWargaModal={() => setIsWargaModalOpen(true)}
                    onOpenPengumumanModal={() => setIsPengumumanModalOpen(true)}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  />
                )}

                {currentView === 'kas-warga' && (
                  <KasWargaView
                    transactions={transactions}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={(type) => {
                      setTxModalType(type || 'masuk');
                      setIsTxModalOpen(true);
                    }}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-masuk' && (
                  <KasMasukView
                    transactions={transactions}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => {
                      setTxModalType('masuk');
                      setIsTxModalOpen(true);
                    }}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-keluar' && (
                  <KasKeluarView
                    transactions={transactions}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => {
                      setTxModalType('keluar');
                      setIsTxModalOpen(true);
                    }}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-kematian' && (
                  <KasKematianView
                    transactions={transactions}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => {
                      setTxModalType('kematian');
                      setIsTxModalOpen(true);
                    }}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'status-iuran' && (
                  <StatusIuranView
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onToggleStatus={handleToggleWargaStatus}
                    onOpenWargaModal={() => setIsWargaModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'data-warga' && (
                  <DataWargaView
                    wargaList={wargaList}
                    bantuanList={bantuanList}
                    profilRT={pengaturanKas.profilRT}
                    pengaturanKas={pengaturanKas}
                    isServer={isServer}
                    onOpenWargaModal={() => setIsWargaModalOpen(true)}
                    onOpenUpgradeModal={(w) => {
                      setUpgradeTargetWarga(w || null);
                      setIsUpgradeModalOpen(true);
                    }}
                    onDeleteWarga={handleDeleteWarga}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'bantuan-pemerintah' && (
                  <BantuanPemerintahView
                    bantuanList={bantuanList}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onAddBantuan={handleAddBantuan}
                    onUpdateStatus={handleUpdateStatusBantuan}
                    onDeleteBantuan={handleDeleteBantuan}
                    onOpenImportExcel={() => setIsWargaModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'dokumen-pdf' && (
                  <DokumenPdfWargaView
                    dokumenList={dokumenList}
                    pengaturanKas={pengaturanKas}
                    onUploadDokumen={handleUploadDokumen}
                    onDeleteDokumen={handleDeleteDokumen}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'pengumuman' && (
                  <PengumumanView
                    pengumumanList={activeAnnouncements}
                    isAdmin={true}
                    onOpenCreateModal={() => setIsPengumumanModalOpen(true)}
                    onDeletePengumuman={handleDeletePengumuman}
                    onBack={() => setCurrentView('beranda')}
                    pengaturanKas={pengaturanKas}
                  />
                )}

                {currentView === 'laporan' && (
                  <LaporanView
                    transactions={transactions}
                    wargaList={wargaList}
                    bantuanList={bantuanList}
                    onBack={() => setCurrentView('beranda')}
                    pengaturanKas={pengaturanKas}
                    tahun={tahunAktif}
                  />
                )}

                {currentView === 'pengaturan' && (
                  <PengaturanView
                    pengaturanKas={pengaturanKas}
                    currentUser={currentUser}
                    currentPin={currentPin}
                    isAdminOnServer={isCurrentAdminOnServer}
                    adminSyncBusy={adminSyncBusy}
                    lastAdminSyncLabel={matchedServerAdmin?.terakhirSinkronisasi}
                    onSyncAdminAccount={() => handleSyncAdminAccountToServer().then(() => undefined)}
                    onUpdatePin={(pin) => setCurrentPin(pin)}
                    onUpdatePengaturan={handleUpdatePengaturan}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                    onOpenPrivacyPolicy={() => setCurrentView('kebijakan-privasi')}
                    onResetEmpty={handleResetEmpty}
                    onLoadSample={handleLoadSample}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kebijakan-privasi' && (
                  <KebijakanPrivasiView onBack={() => setCurrentView('beranda')} pengaturanKas={pengaturanKas} />
                )}
              </>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Login Modal (Switch Account or Logout) */}
      <LoginModal
        isOpen={isLoginModalOpen}
        canClose={Boolean(currentUser)}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        adminAccounts={adminAccounts}
        pengaturanKas={pengaturanKas}
        currentPin={currentPin}
        onOpenLupaPassword={() => setIsLupaPasswordOpen(true)}
        onRefreshSync={handleForceSyncNow}
        onSyncAdminAccountToServer={handleSyncAdminAccountToServer}
        sseConnected={sseConnected}
        serverConnected={serverConnected}
        serverErrorDetail={cloudError}
      />

      {/* Lupa Password Modal */}
      <LupaPasswordModal
        isOpen={isLupaPasswordOpen}
        onClose={() => setIsLupaPasswordOpen(false)}
        pengaturanKas={pengaturanKas}
      />

      {/* Transaction Modal (Admin Only) */}
      {(isAdminRT || isServer) && (
        <TransactionModal
          isOpen={isTxModalOpen}
          onClose={() => setIsTxModalOpen(false)}
          onSave={handleSaveTransaction}
          defaultType={txModalType}
          pengaturanKas={isServer && selectedServerRT !== 'SEMUA' ? serverViewData.pengaturanKas : pengaturanKas}
        />
      )}

      {/* Resident (Warga) Modal with Bulk Excel Import & Manual KK (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <WargaModal
          isOpen={isWargaModalOpen}
          onClose={() => setIsWargaModalOpen(false)}
          onSave={handleSaveWarga}
          onBulkImport={handleBulkImportWargaBantuan}
          profilRT={isServer && selectedServerRT !== 'SEMUA' ? serverViewData.pengaturanKas.profilRT : pengaturanKas.profilRT}
        />
      )}

      {/* Pengumuman Modal (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <PengumumanModal
          isOpen={isPengumumanModalOpen}
          onClose={() => setIsPengumumanModalOpen(false)}
          onSave={handleSavePengumuman}
          pengaturanKas={pengaturanKas}
        />
      )}

      {/* Saldo Masa Lalu Modal (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <SaldoAwalModal
          isOpen={isSaldoAwalModalOpen}
          onClose={() => setIsSaldoAwalModalOpen(false)}
          pengaturanKas={pengaturanKas}
          onSaveSaldoAwal={handleSaveSaldoAwal}
        />
      )}

      {/* Upgrade Data KK Modal (Import Excel / Edit KK Baru, Pindah Kas Utuh, Deteksi Anggota Meninggal/Pisah KK) */}
      {(isAdminRT || isServer) && (
        <UpgradeKKModal
          isOpen={isUpgradeModalOpen}
          onClose={() => {
            setIsUpgradeModalOpen(false);
            setUpgradeTargetWarga(null);
          }}
          wargaList={wargaList}
          transactions={transactions}
          initialTargetWarga={upgradeTargetWarga}
          onApplyUpgrade={handleApplyUpgradeKK}
        />
      )}

      {/* Global Notifikasi Download Template Excel (.xlsx) */}
      <AnimatePresence>
        {excelDownloadNotice && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-[420px] z-[120] pointer-events-auto"
          >
            <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-2xl border-2 border-emerald-500 ring-4 ring-emerald-400/20">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0B5D3F] via-emerald-500 to-teal-400" />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[#0B5D3F]">
                  <FileSpreadsheet size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#0B5D3F]">
                      <CheckCircle2 size={13} />
                      Template Excel (.xlsx) Berhasil Diunduh
                    </span>
                    <button
                      type="button"
                      onClick={() => setExcelDownloadNotice(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                      aria-label="Tutup notifikasi download"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-900 truncate">
                    {excelDownloadNotice.filename}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                    Ukuran {Math.max(1, Math.round(excelDownloadNotice.sizeBytes / 1024))} KB • Tersimpan otomatis di folder{' '}
                    <strong>Download / Unduhan</strong> perangkat Anda ({excelDownloadNotice.timestamp}).
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        shareOrSaveExcelFile(
                          excelDownloadNotice.blob,
                          excelDownloadNotice.filename
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D3F] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
                    >
                      <Share2 size={12} />
                      <span>Simpan / Bagikan (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        triggerServerExcelDownload(excelDownloadNotice.serverUrl)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-[#0B5D3F] hover:bg-emerald-100 active:scale-95 transition-all cursor-pointer"
                    >
                      <Download size={12} />
                      <span>Unduh Ulang (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
