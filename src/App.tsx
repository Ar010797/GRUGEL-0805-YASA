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
  checkServerHealth,
  fetchPublicBootstrapInfo,
  verifySavedSession,
  logoutFromServer,
  getAuthToken,
  clearAuthToken,
  readLegacyLocalCacheForMigration,
  clearLegacyLocalCache,
  migrateLegacyLocalDataToServer,
  fetchServerSnapshotWithStatus,
  saveAppData,
  clearAppData,
  saveSingleWargaToServer,
  bulkImportWargaOnServer,
  deleteWargaFromServer,
  updateWargaSelfOnServer,
  saveTransactionOnServer,
  savePengumumanOnServer,
  deletePengumumanOnServer,
  saveBantuanOnServer,
  deleteBantuanOnServer,
  saveDokumenOnServer,
  deleteDokumenOnServer,
  saveLaporanOnServer,
  saveSettingsOnServer,
  syncAdminAccountToServer,
  formatWaktuSyncID,
  checkServerRevision,
  flushSaveAppDataKeepalive,
  mergeDatabaseStates,
  subscribeServerStream,
  EMPTY_DELETED_IDS,
  type DeletedIdsMap,
  type AppDatabaseSchema,
} from './utils/cloudSync';
import {
  EXCEL_DOWNLOAD_EVENT,
  ExcelDownloadNotificationDetail,
  shareOrSaveExcelFile,
  triggerServerExcelDownload,
} from './utils/excelWargaImport';

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

const ACTIVE_SESSION_KEY = 'kaswarga_active_session_v1';

function readSavedSession(): AuthUser | null {
  try {
    if (!getAuthToken()) return null;
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (
      parsed &&
      (parsed.role === 'server' || parsed.role === 'admin' || parsed.role === 'warga') &&
      typeof parsed.username === 'string' &&
      parsed.username.trim().length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveActiveSession(user: AuthUser | null) {
  try {
    if (user) {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  // Authentication State (Role: 'server' | 'admin' | 'warga') - ALWAYS starts null on fresh install
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => readSavedSession());

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => !readSavedSession());
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

  // Central SQL Server Sync Notification indicator
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');
  const [serverConnected, setServerConnected] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [dataLoadedReady, setDataLoadedReady] = useState<boolean>(false);
  const [serverAdminAccounts, setServerAdminAccounts] = useState<AdminRTAccount[]>([]);
  const [adminSyncBusy, setAdminSyncBusy] = useState<boolean>(false);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Navigation active tab
  const [currentView, setCurrentView] = useState<string>(() => {
    const saved = readSavedSession();
    if (saved?.role === 'server') return 'server-kontrol';
    if (saved?.role === 'warga') return 'dasbor-warga';
    return 'beranda';
  });

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

  // Real-time Bidirectional Sync Refs (Central SQL + REST API + Live SSE + Polling)
  const isLoadedRef = useRef(false);
  const deletedIdsRef = useRef<DeletedIdsMap>({ ...EMPTY_DELETED_IDS });
  const lastServerHashRef = useRef<string>('');
  const lastServerRevisionRef = useRef<number>(0);

  const computeStateHash = (s: {
    tahunAktif: number;
    pengaturanKas: PengaturanKas;
    wargaList: Warga[];
    transactions: Transaction[];
    bantuanList: BantuanPemerintah[];
    pengumumanList: PengumumanRT[];
    dokumenList: DokumenPdfWarga[];
    adminAccounts: AdminRTAccount[];
    laporanBulananRT: PembaruanBulananRT[];
  }): string => {
    try {
      return JSON.stringify({
        tahunAktif: s.tahunAktif,
        pengaturanKas: s.pengaturanKas,
        wargaList: s.wargaList,
        transactions: s.transactions,
        bantuanList: s.bantuanList,
        pengumumanList: s.pengumumanList,
        dokumenList: s.dokumenList,
        adminAccounts: s.adminAccounts,
        laporanBulananRT: s.laporanBulananRT,
      });
    } catch {
      return String(Date.now());
    }
  };

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
    deletedIds: deletedIdsRef.current,
  });

  const latestStateRef = useRef<AppDatabaseSchema>(buildCurrentSchema());
  latestStateRef.current = buildCurrentSchema();

  const recordDeletedId = (bucket: keyof DeletedIdsMap, id: string) => {
    if (!id) return;
    const current = deletedIdsRef.current[bucket] || [];
    if (!current.includes(id)) {
      deletedIdsRef.current = {
        ...deletedIdsRef.current,
        [bucket]: [...current, id].slice(-2000),
      };
    }
  };

  const applyMergedStateToReact = (
    nextState: AppDatabaseSchema,
    source: 'init' | 'sse' | 'refresh',
    isReset = false
  ) => {
    if (nextState.deletedIds) {
      deletedIdsRef.current = {
        warga: Array.from(new Set([...deletedIdsRef.current.warga, ...(nextState.deletedIds.warga || [])])),
        transactions: Array.from(new Set([...deletedIdsRef.current.transactions, ...(nextState.deletedIds.transactions || [])])),
        bantuan: Array.from(new Set([...deletedIdsRef.current.bantuan, ...(nextState.deletedIds.bantuan || [])])),
        pengumuman: Array.from(new Set([...deletedIdsRef.current.pengumuman, ...(nextState.deletedIds.pengumuman || [])])),
        dokumen: Array.from(new Set([...deletedIdsRef.current.dokumen, ...(nextState.deletedIds.dokumen || [])])),
        adminAccounts: Array.from(new Set([...deletedIdsRef.current.adminAccounts, ...(nextState.deletedIds.adminAccounts || [])])),
        laporanBulananRT: Array.from(new Set([...deletedIdsRef.current.laporanBulananRT, ...(nextState.deletedIds.laporanBulananRT || [])])),
      };
    }

    const currentHash = computeStateHash(latestStateRef.current);
    const nextHash = computeStateHash(nextState);

    if (typeof nextState.revision === 'number' && nextState.revision > lastServerRevisionRef.current) {
      lastServerRevisionRef.current = nextState.revision;
    }

    if (source === 'init' || source === 'sse' || source === 'refresh') {
      lastServerHashRef.current = nextHash;
    }

    if (!isReset && currentHash === nextHash) {
      return;
    }

    latestStateRef.current = nextState;

    if (nextState.tahunAktif) setTahunAktif(nextState.tahunAktif);
    if (nextState.pengaturanKas) setPengaturanKas(nextState.pengaturanKas);
    setWargaList(Array.isArray(nextState.wargaList) ? nextState.wargaList : []);
    setTransactions(Array.isArray(nextState.transactions) ? nextState.transactions : []);
    setBantuanList(Array.isArray(nextState.bantuanList) ? nextState.bantuanList : []);
    setPengumumanList(Array.isArray(nextState.pengumumanList) ? nextState.pengumumanList : []);
    setDokumenList(Array.isArray(nextState.dokumenList) ? nextState.dokumenList : []);
    if (Array.isArray(nextState.adminAccounts)) {
      setAdminAccounts(nextState.adminAccounts);
    }
    setLaporanBulananRT(Array.isArray(nextState.laporanBulananRT) ? nextState.laporanBulananRT : []);
    if (
      currentUser?.role === 'warga' &&
      Array.isArray(nextState.wargaList) &&
      nextState.wargaList[0]?.pin
    ) {
      setCurrentPin(nextState.wargaList[0].pin);
    }
  };

  // Bootstrap public settings, health status, and verify active session token on mount
  useEffect(() => {
    let active = true;
    async function bootstrapPublicAndVerifyAuth() {
      const [health, pub] = await Promise.all([checkServerHealth(), fetchPublicBootstrapInfo()]);
      if (!active) return;
      setServerConnected(health.connected);
      if (!health.connected && health.message) {
        setCloudError(health.message);
      }
      if (pub) {
        if (pub.tahunAktif) setTahunAktif(pub.tahunAktif);
        if (pub.pengaturanKas) setPengaturanKas(pub.pengaturanKas);
      }

      if (getAuthToken()) {
        const sessionRes = await verifySavedSession();
        if (!active) return;
        if (sessionRes.unauthorized) {
          saveActiveSession(null);
          clearAuthToken();
          setCurrentUser(null);
          setIsLoginModalOpen(true);
        } else if (sessionRes.ok && sessionRes.user) {
          saveActiveSession(sessionRes.user);
          setCurrentUser(sessionRes.user);
          setIsLoginModalOpen(false);
        }
      }
    }
    bootstrapPublicAndVerifyAuth();

    const healthCheckInterval = setInterval(async () => {
      if (!active) return;
      const health = await checkServerHealth();
      if (!active) return;
      setServerConnected(health.connected);
      if (health.connected) {
        setCloudError((prev) =>
          prev && (prev.includes('server') || prev.includes('koneksi')) ? null : prev
        );
      }
    }, 15000);

    return () => {
      active = false;
      clearInterval(healthCheckInterval);
    };
  }, []);

  // Load Central SQL Data + Legacy HP Admin Migration + Live SSE Subscription + 2.5s Revision Polling
  useEffect(() => {
    if (!currentUser || !getAuthToken()) {
      isLoadedRef.current = false;
      setDataLoadedReady(false);
      setSseConnected(false);
      return;
    }

    let active = true;
    isLoadedRef.current = false;
    setDataLoadedReady(false);

    async function initAuthenticatedData() {
      try {
        const snapRes = await fetchServerSnapshotWithStatus();
        if (!active) return;

        if (snapRes.status === 401 || snapRes.status === 403) {
          saveActiveSession(null);
          clearAuthToken();
          setCurrentUser(null);
          setIsLoginModalOpen(true);
          return;
        }

        if (!snapRes.ok || !snapRes.data) {
          setServerConnected(false);
          setSyncStatus('offline');
          setCloudError(snapRes.message || 'Gagal mengambil data dari Database Server Pusat.');
          return;
        }

        setServerConnected(true);
        setSyncStatus('synced');
        setCloudError(null);

        let workingData = snapRes.data;
        if (typeof workingData.revision === 'number') {
          lastServerRevisionRef.current = workingData.revision;
        }
        setServerAdminAccounts(
          Array.isArray(workingData.adminAccounts) ? workingData.adminAccounts : []
        );
        applyMergedStateToReact(workingData, 'init', true);

        // If logged in as Admin/Server and there is legacy pre-migration data in localStorage, migrate it safely to SQL once!
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'server')) {
          const legacyLocal = readLegacyLocalCacheForMigration();
          const hasLegacyRecords = Boolean(
            legacyLocal &&
              ((Array.isArray(legacyLocal.wargaList) && legacyLocal.wargaList.length > 0) ||
                (Array.isArray(legacyLocal.transactions) && legacyLocal.transactions.length > 0) ||
                (Array.isArray(legacyLocal.bantuanList) && legacyLocal.bantuanList.length > 0) ||
                (Array.isArray(legacyLocal.pengumumanList) && legacyLocal.pengumumanList.length > 0) ||
                (Array.isArray(legacyLocal.dokumenList) && legacyLocal.dokumenList.length > 0))
          );

          if (hasLegacyRecords && legacyLocal) {
            const migRes = await migrateLegacyLocalDataToServer(legacyLocal);
            if (active && migRes.ok && migRes.serverData) {
              workingData = migRes.serverData;
              if (typeof workingData.revision === 'number') {
                lastServerRevisionRef.current = workingData.revision;
              }
              setServerAdminAccounts(
                Array.isArray(workingData.adminAccounts) ? workingData.adminAccounts : []
              );
              applyMergedStateToReact(workingData, 'refresh', true);
              clearLegacyLocalCache();
              setRolloverNotice(
                `Migrasi otomatis selesai! Data warga (${workingData.wargaList.length} KK) dan kas berhasil dipindahkan ke Database Server Pusat.`
              );
              setTimeout(() => setRolloverNotice(null), 7000);
            }
          } else if (legacyLocal) {
            // Empty/redundant cache from old build -> remove so app strictly relies on Central DB
            clearLegacyLocalCache();
          }
        }
      } catch (err: any) {
        if (active) {
          setServerConnected(false);
          setSyncStatus('offline');
          setCloudError(err?.message || 'Gagal memuat data dari database server.');
        }
      } finally {
        if (active) {
          isLoadedRef.current = true;
          setDataLoadedReady(true);
        }
      }
    }

    initAuthenticatedData();

    const handleRefreshFromServer = async () => {
      if (!active || !isLoadedRef.current || !getAuthToken()) return;
      const snapRes = await fetchServerSnapshotWithStatus();
      if (!active) return;
      if (snapRes.status === 401 || snapRes.status === 403) {
        saveActiveSession(null);
        clearAuthToken();
        setCurrentUser(null);
        setIsLoginModalOpen(true);
        return;
      }
      if (!snapRes.ok || !snapRes.data) {
        setServerConnected(false);
        return;
      }
      const remoteData = snapRes.data;
      setServerConnected(true);
      if (typeof remoteData.revision === 'number') {
        lastServerRevisionRef.current = Math.max(lastServerRevisionRef.current, remoteData.revision);
      }
      setServerAdminAccounts(Array.isArray(remoteData.adminAccounts) ? remoteData.adminAccounts : []);
      const isAdminOrServer = currentUser?.role === 'admin' || currentUser?.role === 'server';
      if (isAdminOrServer && computeStateHash(latestStateRef.current) !== lastServerHashRef.current) {
        const merged = mergeDatabaseStates(
          remoteData,
          latestStateRef.current,
          deletedIdsRef.current
        );
        applyMergedStateToReact(merged, 'refresh');
      } else {
        applyMergedStateToReact(remoteData, 'refresh', true);
      }
    };

    const unsubscribeStream = subscribeServerStream(
      (remoteData, isReset) => {
        if (!active || !isLoadedRef.current) return;
        setServerConnected(true);
        if (typeof remoteData.revision === 'number') {
          lastServerRevisionRef.current = remoteData.revision;
        }
        setServerAdminAccounts(Array.isArray(remoteData.adminAccounts) ? remoteData.adminAccounts : []);
        if (isReset) {
          deletedIdsRef.current = { ...EMPTY_DELETED_IDS };
          applyMergedStateToReact(remoteData, 'sse', true);
          return;
        }
        const isAdminOrServer = currentUser?.role === 'admin' || currentUser?.role === 'server';
        if (isAdminOrServer && computeStateHash(latestStateRef.current) !== lastServerHashRef.current) {
          const merged = mergeDatabaseStates(
            remoteData,
            latestStateRef.current,
            deletedIdsRef.current
          );
          applyMergedStateToReact(merged, 'sse');
        } else {
          applyMergedStateToReact(remoteData, 'sse', true);
        }
      },
      (connected) => {
        if (active) setSseConnected(connected);
      }
    );

    const pollInterval = setInterval(async () => {
      if (!active || !isLoadedRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const status = await checkServerRevision(lastServerRevisionRef.current);
      if (!active || !status) return;
      setServerConnected(true);
      if (status.hasData && (status.changed || lastServerRevisionRef.current === 0)) {
        await handleRefreshFromServer();
      }
    }, 2500);

    const flushPendingIfHidden = () => {
      if (!isLoadedRef.current) return;
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'server') return;
      const currentSnapshot = latestStateRef.current;
      if (computeStateHash(currentSnapshot) !== lastServerHashRef.current) {
        flushSaveAppDataKeepalive(currentSnapshot, deletedIdsRef.current);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefreshFromServer();
      } else if (document.visibilityState === 'hidden') {
        flushPendingIfHidden();
      }
    };

    window.addEventListener('focus', handleRefreshFromServer);
    window.addEventListener('pageshow', handleRefreshFromServer);
    window.addEventListener('online', handleRefreshFromServer);
    window.addEventListener('pagehide', flushPendingIfHidden);
    window.addEventListener('beforeunload', flushPendingIfHidden);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      clearInterval(pollInterval);
      unsubscribeStream();
      window.removeEventListener('focus', handleRefreshFromServer);
      window.removeEventListener('pageshow', handleRefreshFromServer);
      window.removeEventListener('online', handleRefreshFromServer);
      window.removeEventListener('pagehide', flushPendingIfHidden);
      window.removeEventListener('beforeunload', flushPendingIfHidden);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [currentUser?.role, currentUser?.username, currentUser?.noKK, currentUser?.wargaId]);

  // Auto-Save for Admin/Server when state changes -> pushes straight to Central SQL Server
  useEffect(() => {
    if (!isLoadedRef.current || !dataLoadedReady) return;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'server')) return;

    const stateToPersist = buildCurrentSchema();
    const currentHash = computeStateHash(stateToPersist);
    if (currentHash === lastServerHashRef.current) {
      setSyncStatus('synced');
      return;
    }

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      const res = await saveAppData(stateToPersist, {
        deletedIds: deletedIdsRef.current,
      });

      if (res.ok) {
        lastServerHashRef.current = currentHash;
        setServerConnected(true);
        setSyncStatus('synced');
        setCloudError(null);
        if (res.serverData) {
          if (typeof res.serverData.revision === 'number') {
            lastServerRevisionRef.current = Math.max(
              lastServerRevisionRef.current,
              res.serverData.revision
            );
          }
          setServerAdminAccounts(
            Array.isArray(res.serverData.adminAccounts) ? res.serverData.adminAccounts : []
          );
          const mergedBack = mergeDatabaseStates(
            res.serverData,
            latestStateRef.current,
            deletedIdsRef.current
          );
          if (computeStateHash(mergedBack) !== computeStateHash(latestStateRef.current)) {
            applyMergedStateToReact(mergedBack, 'sse');
          }
        }
      } else {
        setServerConnected(false);
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal menyinkronkan data ke Database Server Pusat.');
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [
    dataLoadedReady,
    currentUser,
    tahunAktif,
    pengaturanKas,
    wargaList,
    transactions,
    bantuanList,
    pengumumanList,
    dokumenList,
    adminAccounts,
    laporanBulananRT,
  ]);

  // Automatic Background Retry Loop for Admin/Server if a save failed while offline
  useEffect(() => {
    if (!dataLoadedReady) return;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'server')) return;

    const retryInterval = setInterval(async () => {
      if (!isLoadedRef.current) return;
      const snapshot = latestStateRef.current;
      const currentHash = computeStateHash(snapshot);
      const needsServerRetry = currentHash !== lastServerHashRef.current;

      if (!needsServerRetry && syncStatus !== 'offline') return;

      const res = await saveAppData(snapshot, { deletedIds: deletedIdsRef.current });
      if (res.ok) {
        lastServerHashRef.current = computeStateHash(latestStateRef.current);
        setServerConnected(true);
        setSyncStatus('synced');
        setCloudError(null);
        if (res.serverData) {
          if (typeof res.serverData.revision === 'number') {
            lastServerRevisionRef.current = Math.max(
              lastServerRevisionRef.current,
              res.serverData.revision
            );
          }
          setServerAdminAccounts(
            Array.isArray(res.serverData.adminAccounts) ? res.serverData.adminAccounts : []
          );
          const mergedBack = mergeDatabaseStates(
            res.serverData,
            latestStateRef.current,
            deletedIdsRef.current
          );
          if (computeStateHash(mergedBack) !== computeStateHash(latestStateRef.current)) {
            applyMergedStateToReact(mergedBack, 'sse');
          }
        }
      } else {
        setServerConnected(false);
        setSyncStatus('offline');
        if (res.message) setCloudError(res.message);
      }
    }, 4000);

    return () => clearInterval(retryInterval);
  }, [dataLoadedReady, syncStatus, currentUser]);

  const handleForceSyncNow = async () => {
    setCloudSyncBusy(true);
    setCloudError(null);
    try {
      const health = await checkServerHealth();
      setServerConnected(health.connected);
      if (!health.connected) {
        setSyncStatus('offline');
        setCloudError(health.message || 'Tidak dapat terhubung ke Database Server Pusat.');
        return;
      }

      if (!getAuthToken()) {
        const pub = await fetchPublicBootstrapInfo();
        if (pub?.pengaturanKas) setPengaturanKas(pub.pengaturanKas);
        return;
      }

      const snapRes = await fetchServerSnapshotWithStatus();
      if (!snapRes.ok || !snapRes.data) {
        setSyncStatus('offline');
        setCloudError(snapRes.message || 'Gagal menyinkronkan data dari server.');
        return;
      }

      const remoteData = snapRes.data;
      setServerAdminAccounts(Array.isArray(remoteData.adminAccounts) ? remoteData.adminAccounts : []);
      const isAdminOrServer = currentUser?.role === 'admin' || currentUser?.role === 'server';

      if (isAdminOrServer) {
        let working = mergeDatabaseStates(remoteData, latestStateRef.current, deletedIdsRef.current);
        applyMergedStateToReact(working, 'refresh');
        const res = await saveAppData(working, { deletedIds: deletedIdsRef.current });
        if (!res.ok) {
          setSyncStatus('offline');
          setCloudError(res.message || 'Gagal mengirim pembaruan ke server.');
          return;
        }
        if (res.serverData) {
          setServerAdminAccounts(
            Array.isArray(res.serverData.adminAccounts) ? res.serverData.adminAccounts : []
          );
          const mergedAfter = mergeDatabaseStates(res.serverData, working, deletedIdsRef.current);
          applyMergedStateToReact(mergedAfter, 'refresh');
          lastServerHashRef.current = computeStateHash(mergedAfter);
        }
      } else {
        applyMergedStateToReact(remoteData, 'refresh', true);
      }

      setSyncStatus('synced');
      setServerConnected(true);
    } catch (err: any) {
      setServerConnected(false);
      setSyncStatus('offline');
      setCloudError(err?.message || 'Gagal menyinkronkan data.');
    } finally {
      setCloudSyncBusy(false);
    }
  };

  // Explicit Admin Account Registration & Sync to Server
  const handleSyncAdminAccountToServer = async (
    overrideAccount?: AdminRTAccount,
    securityPin?: string
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

      deletedIdsRef.current = {
        ...deletedIdsRef.current,
        adminAccounts: deletedIdsRef.current.adminAccounts.filter(
          (id) =>
            id !== stampedAccount.id &&
            !(stampedAccount.username.toLowerCase() === 'admin' && id === 'adm_rt08')
        ),
      };

      const legacyLocal = readLegacyLocalCacheForMigration();
      const syncDataPayload = legacyLocal
        ? mergeDatabaseStates(currentSnapshot, legacyLocal, deletedIdsRef.current)
        : currentSnapshot;

      const res = await syncAdminAccountToServer({
        account: stampedAccount,
        syncData: syncDataPayload,
        deletedIds: deletedIdsRef.current,
        securityPin,
      });

      if (!res.ok) {
        setCloudError(res.message || 'Gagal menyinkronkan akun admin ke server.');
        return { ok: false, message: res.message };
      }

      clearLegacyLocalCache();

      if (res.serverData) {
        setServerAdminAccounts(
          Array.isArray(res.serverData.adminAccounts) ? res.serverData.adminAccounts : []
        );
        applyMergedStateToReact(res.serverData, 'refresh');
        lastServerHashRef.current = computeStateHash(res.serverData);
        if (typeof res.serverData.revision === 'number') {
          lastServerRevisionRef.current = Math.max(
            lastServerRevisionRef.current,
            res.serverData.revision
          );
        }
      }

      setServerConnected(true);
      setSyncStatus('synced');
      setRolloverNotice(
        `Akun Admin "${stampedAccount.username}" & seluruh data (${(res.serverData?.wargaList || currentSnapshot.wargaList).length} KK) berhasil terdaftar & tersinkron ke Database Server!`
      );
      setTimeout(() => setRolloverNotice(null), 6000);
      return { ok: true, message: res.message, account: res.account || stampedAccount, user: res.user };
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyinkronkan akun admin ke server.';
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
  const handleSwitchTahunAktif = (newYear: number) => {
    if (newYear === tahunAktif) return;

    // Calculate current accumulated balance
    const currentEndSaldoUmum = totalKasUmumMasuk - totalKasUmumKeluar;
    const currentEndSaldoKematian = saldoKasKematianBerjalan;

    // If advancing to a future year, create a transition record without wiping balances
    if (newYear > tahunAktif) {
      const nowIso = new Date().toISOString();
      // Archive warga payment status for the current year, and set up the new year
      setWargaList((prevWarga) =>
        prevWarga.map((w) => {
          const priorHistory = w.riwayatIuranPerTahun || {};
          const currentYearHistory = priorHistory[tahunAktif] || w.riwayatIuran || {};
          const currentYearStatus = (w.statusIuranPerTahun && w.statusIuranPerTahun[tahunAktif]) || w.statusIuran;

          const updatedPerTahun: Record<number, Record<number, boolean>> = {
            ...priorHistory,
            [tahunAktif]: currentYearHistory,
          };

          const updatedStatusPerTahun: Record<number, 'Sudah' | 'Belum'> = {
            ...(w.statusIuranPerTahun || {}),
            [tahunAktif]: currentYearStatus as 'Sudah' | 'Belum',
          };

          // Check if already paid in the new year
          const newYearPaid: 'Sudah' | 'Belum' = updatedStatusPerTahun[newYear] || 'Belum';

          return {
            ...w,
            statusIuran: newYearPaid,
            riwayatIuranPerTahun: updatedPerTahun,
            statusIuranPerTahun: updatedStatusPerTahun,
            riwayatIuran: updatedPerTahun[newYear] || {},
            updatedAt: nowIso,
          };
        })
      );

      // Carry forward the closing balance of the past year into the new year
      setPengaturanKas((prev) => ({
        ...prev,
        tahunAktif: newYear,
        saldoAwalKasUmum: currentEndSaldoUmum,
        saldoAwalKasKematian: currentEndSaldoKematian,
        keteranganSaldoAwal: `Pindahan Saldo Akhir Tahun ${tahunAktif} ke Tahun ${newYear} (Otomatis Berlanjut)`,
        tanggalSaldoAwal: `${newYear}-01-01`,
        updatedAt: nowIso,
      }));

      setRolloverNotice(
        `Pergantian Tahun ${newYear} Berhasil! Saldo kas berlanjut otomatis (Rp ${currentEndSaldoUmum.toLocaleString('id-ID')}). Status iuran tahun ${newYear} siap dicatat.`
      );
    } else {
      // Switching to view past year archives
      setWargaList((prevWarga) =>
        prevWarga.map((w) => {
          const pastStatus = (w.statusIuranPerTahun && w.statusIuranPerTahun[newYear]) || 'Sudah';
          const pastHistory = (w.riwayatIuranPerTahun && w.riwayatIuranPerTahun[newYear]) || {};
          return {
            ...w,
            statusIuran: pastStatus,
            riwayatIuran: pastHistory,
          };
        })
      );

      setRolloverNotice(`Melihat arsip pembukuan tahun ${newYear}.`);
    }

    setTahunAktif(newYear);
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  // Handlers for Government Aid
  const handleAddBantuan = async (b: Omit<BantuanPemerintah, 'id'>) => {
    const nowIso = new Date().toISOString();
    const newItem: BantuanPemerintah = { ...b, id: 'b' + Date.now(), updatedAt: nowIso };
    setBantuanList((prev) => [newItem, ...prev]);
    const res = await saveBantuanOnServer(newItem);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan data bantuan ke server.');
    } else {
      setServerConnected(true);
    }
  };

  const handleUpdateStatusBantuan = async (id: string, newStatus: BantuanPemerintah['status']) => {
    const nowIso = new Date().toISOString();
    const existing = bantuanList.find((item) => item.id === id);
    const updatedItem = existing ? { ...existing, status: newStatus, updatedAt: nowIso } : null;
    setBantuanList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus, updatedAt: nowIso } : item))
    );
    if (updatedItem) {
      const res = await saveBantuanOnServer(updatedItem);
      if (!res.ok) {
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal memperbarui status bantuan di server.');
      } else {
        setServerConnected(true);
      }
    }
  };

  const handleDeleteBantuan = async (id: string) => {
    recordDeletedId('bantuan', id);
    setBantuanList((prev) => prev.filter((b) => b.id !== id));
    const res = await deleteBantuanOnServer(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus data bantuan di server.');
    } else {
      setServerConnected(true);
    }
  };

  // Handlers for PDF Documents
  const handleUploadDokumen = async (doc: Omit<DokumenPdfWarga, 'id'>) => {
    const nowIso = new Date().toISOString();
    const newDoc: DokumenPdfWarga = { ...doc, id: 'doc' + Date.now(), updatedAt: nowIso };
    setDokumenList((prev) => [newDoc, ...prev]);
    const res = await saveDokumenOnServer(newDoc);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan dokumen PDF ke server.');
    } else {
      setServerConnected(true);
    }
  };

  const handleDeleteDokumen = async (id: string) => {
    recordDeletedId('dokumen', id);
    setDokumenList((prev) => prev.filter((d) => d.id !== id));
    const res = await deleteDokumenOnServer(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus dokumen PDF di server.');
    } else {
      setServerConnected(true);
    }
  };

  // Sample data loader for demo
  const handleLoadSample = () => {
    const nowIso = new Date().toISOString();
    setTransactions([
      { id: '1', tanggal: `${tahunAktif}-10-12`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan Periode Aktif', nominal: 250000, tipe: 'masuk', namaWarga: 'Ahmad Fauzi', tahun: tahunAktif, updatedAt: nowIso },
      { id: '2', tanggal: `${tahunAktif}-10-10`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan & Kas Kematian', nominal: 350000, tipe: 'masuk', namaWarga: 'Siti Aminah', tahun: tahunAktif, updatedAt: nowIso },
      { id: '3', tanggal: `${tahunAktif}-10-08`, kategori: 'Kas Kematian', keterangan: 'Pengadaan Kain Mori & Perlengkapan Jenazah', nominal: 200000, tipe: 'keluar', namaWarga: 'Bendahara Kas', tahun: tahunAktif, updatedAt: nowIso },
    ]);
  };

  // Complete Reset: Wipes all residents, transactions, aid records, documents, announcements from central DB
  const handleResetEmpty = async () => {
    const nowIso = new Date().toISOString();
    deletedIdsRef.current = { ...EMPTY_DELETED_IDS };
    const preservedAdmins = latestStateRef.current.adminAccounts;

    // 1. Wipe in-memory states
    setWargaList([]);
    setTransactions([]);
    setBantuanList([]);
    setPengumumanList([]);
    setDokumenList([]);
    setLaporanBulananRT([]);
    setFloatingAnnouncement(null);
    setDismissedNotificationIds([]);
    setPengaturanKas((prev) => ({
      ...prev,
      saldoAwalKasUmum: 0,
      saldoAwalKasKematian: 0,
      keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu',
      tanggalSaldoAwal: `${tahunAktif}-01-01`,
      updatedAt: nowIso,
    }));

    // 2. Wipe persistent backend while preserving Admin accounts
    const ok = await clearAppData(preservedAdmins);
    if (ok) {
      const snap = await fetchServerSnapshotWithStatus();
      if (snap.ok && snap.data) {
        applyMergedStateToReact(snap.data, 'refresh', true);
      }
      setServerConnected(true);
      setSyncStatus('synced');
      setCloudError(null);
      setRolloverNotice('Seluruh data berhasil direset dan dihapus secara tuntas dari database server.');
    } else {
      setSyncStatus('offline');
      setCloudError('Gagal mereset database server. Periksa koneksi internet Anda.');
    }
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  const handleUpdatePengaturan = async (newSetting: Partial<PengaturanKas>) => {
    const nowIso = new Date().toISOString();
    const prev = latestStateRef.current.pengaturanKas || pengaturanKas;
    const merged: PengaturanKas = { ...prev, ...newSetting, updatedAt: nowIso };
    setPengaturanKas(merged);
    saveSettingsOnServer(merged, tahunAktif).then((res) => {
      if (!res.ok) {
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal menyimpan pengaturan ke server.');
      } else {
        setServerConnected(true);
      }
    });

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

      setPengumumanList((prevList) => prevList.map(syncPengumumanItem));
      setFloatingAnnouncement((prevFloat) => (prevFloat ? syncPengumumanItem(prevFloat) : prevFloat));

      if (newKetua) {
        setAdminAccounts((prevAdmins) =>
          prevAdmins.map((acc) => {
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
          })
        );

        setCurrentUser((prevUser) => {
          if (!prevUser || prevUser.role !== 'admin') return prevUser;
          const isPrimaryUser =
            prevUser.username.toLowerCase() === 'admin' ||
            (oldKetua && prevUser.nama.toLowerCase().includes(oldKetua.toLowerCase()));
          if (!isPrimaryUser) return prevUser;
          const nextUser: AuthUser = {
            ...prevUser,
            nama: `${newKetua} (Ketua RT ${newRT})`,
            rtScope: `RT ${newRT} RW ${newRW}`,
          };
          saveActiveSession(nextUser);
          return nextUser;
        });
      }
    }
  };

  const handleSaveSaldoAwal = (
    kasUmum: number,
    kasKematian: number,
    keterangan: string,
    tanggal: string
  ) => {
    const nowIso = new Date().toISOString();
    setPengaturanKas((prev) => ({
      ...prev,
      saldoAwalKasUmum: kasUmum,
      saldoAwalKasKematian: kasKematian,
      keteranganSaldoAwal: keterangan,
      tanggalSaldoAwal: tanggal,
      updatedAt: nowIso,
    }));

    setTransactions((prev) => {
      prev.filter((t) => t.isSaldoAwal).forEach((t) => recordDeletedId('transactions', t.id));
      const nonSaldoAwal = prev.filter((t) => !t.isSaldoAwal);
      const newSaldoTxs: Transaction[] = [];

      if (kasUmum > 0) {
        newSaldoTxs.push({
          id: 'saldo-awal-umum-' + Date.now(),
          tanggal: tanggal || `${tahunAktif}-01-01`,
          kategori: 'Saldo Awal / Pindahan Kas Lalu',
          keterangan: `Saldo Kas Umum Masa Lalu: ${keterangan}`,
          nominal: kasUmum,
          tipe: 'masuk',
          namaWarga: 'Pindahan Kas Masa Lalu',
          isSaldoAwal: true,
          tahun: tahunAktif,
          updatedAt: nowIso,
        });
      }

      if (kasKematian > 0) {
        newSaldoTxs.push({
          id: 'saldo-awal-kematian-' + Date.now(),
          tanggal: tanggal || `${tahunAktif}-01-01`,
          kategori: 'Kas Kematian',
          keterangan: `Saldo Kas Kematian Masa Lalu: ${keterangan}`,
          nominal: kasKematian,
          tipe: 'kematian',
          namaWarga: 'Pindahan Kas Kematian Lalu',
          isSaldoAwal: true,
          tahun: tahunAktif,
          updatedAt: nowIso,
        });
      }

      return [...newSaldoTxs, ...nonSaldoAwal];
    });
  };

  // Add Transaction
  const handleSaveTransaction = async (tx: Omit<Transaction, 'id'>) => {
    const nowIso = new Date().toISOString();
    const newTx: Transaction = {
      ...tx,
      id: Date.now().toString(),
      tahun: tahunAktif,
      updatedAt: nowIso,
    };
    setTransactions((prev) => [newTx, ...prev]);
    const res = await saveTransactionOnServer(newTx);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan transaksi ke server.');
    } else {
      setServerConnected(true);
    }
  };

  // Add Resident
  const handleSaveWarga = async (w: Omit<Warga, 'id' | 'no'>) => {
    const nowIso = new Date().toISOString();
    const newW: Warga = {
      ...w,
      id: Date.now().toString(),
      no: wargaList.length + 1,
      statusIuran: w.statusIuran || 'Belum',
      statusIuranPerTahun: { [tahunAktif]: w.statusIuran || 'Belum' },
      updatedAt: nowIso,
    };
    setWargaList((prev) => [...prev, newW]);
    const res = await saveSingleWargaToServer(newW);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyimpan data warga ke database server.');
    } else {
      setServerConnected(true);
    }
  };

  // Bulk Import Excel: Grouped Warga + Anggota Keluarga + Penerimaan Bantuan in 1 click
  const handleBulkImportWargaBantuan = (
    importedWarga: Omit<Warga, 'id' | 'no'>[],
    importedBantuan: Omit<BantuanPemerintah, 'id'>[],
    options: { mergeExisting: boolean }
  ) => {
    const baseTime = Date.now();
    const nowIso = new Date().toISOString();
    let addedKKCount = 0;
    let updatedKKCount = 0;

    setWargaList((prev) => {
      const updated = [...prev];
      importedWarga.forEach((incoming, idx) => {
        const existingIndex = incoming.noKK
          ? updated.findIndex((w) => w.noKK === incoming.noKK)
          : updated.findIndex((w) => w.nama.toLowerCase() === incoming.nama.toLowerCase());

        if (existingIndex >= 0) {
          if (options.mergeExisting) {
            const existing = updated[existingIndex];
            const nextStatus = incoming.statusIuran || existing.statusIuran || 'Belum';
            updated[existingIndex] = {
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
            updatedKKCount++;
          }
        } else {
          const newWarga: Warga = {
            ...incoming,
            id: `w_${baseTime}_${idx}`,
            no: updated.length + 1,
            statusIuran: incoming.statusIuran || 'Belum',
            statusIuranPerTahun: { [tahunAktif]: incoming.statusIuran || 'Belum' },
            pin: incoming.pin || '123456',
            updatedAt: nowIso,
          };
          updated.push(newWarga);
          addedKKCount++;
        }
      });
      return updated;
    });

    let addedBantuanCount = 0;
    if (importedBantuan.length > 0) {
      setBantuanList((prev) => {
        const nextList = [...prev];
        importedBantuan.forEach((b, idx) => {
          const isDuplicate = nextList.some(
            (existing) =>
              existing.noKK === b.noKK &&
              existing.namaPenerima.toLowerCase() === b.namaPenerima.toLowerCase() &&
              existing.jenisBantuan.toLowerCase() === b.jenisBantuan.toLowerCase() &&
              existing.tanggal === b.tanggal
          );
          if (!isDuplicate) {
            nextList.unshift({
              ...b,
              id: `b_${baseTime}_${idx}`,
              updatedAt: nowIso,
            });
            addedBantuanCount++;
          }
        });
        return nextList;
      });
    }

    // Persist bulk import directly to Central SQL Server
    bulkImportWargaOnServer({
      wargaList: importedWarga,
      bantuanList: importedBantuan,
      mergeExisting: options.mergeExisting,
      tahunAktif,
    }).then(async (bulkRes) => {
      if (!bulkRes.ok) {
        setSyncStatus('offline');
        setCloudError(bulkRes.message || 'Gagal menyinkronkan import Excel ke server.');
      } else {
        setServerConnected(true);
        const snap = await fetchServerSnapshotWithStatus();
        if (snap.ok && snap.data) {
          applyMergedStateToReact(snap.data, 'refresh', true);
        }
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
  const handleToggleWargaStatus = (id: string) => {
    const nowIso = new Date().toISOString();
    let updatedTarget: Warga | null = null;
    setWargaList((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const nextStatus: 'Sudah' | 'Belum' = w.statusIuran === 'Sudah' ? 'Belum' : 'Sudah';
          const perTahun: Record<number, 'Sudah' | 'Belum'> = {
            ...(w.statusIuranPerTahun || {}),
            [tahunAktif]: nextStatus,
          };
          const updated = {
            ...w,
            statusIuran: nextStatus,
            statusIuranPerTahun: perTahun,
            updatedAt: nowIso,
          };
          updatedTarget = updated;
          return updated;
        }
        return w;
      })
    );
    if (updatedTarget) {
      saveSingleWargaToServer(updatedTarget).then((res) => {
        if (!res.ok) {
          setSyncStatus('offline');
          setCloudError(res.message || 'Gagal memperbarui status iuran ke server.');
        } else {
          setServerConnected(true);
        }
      });
    }
  };

  // Delete resident
  const handleDeleteWarga = async (id: string) => {
    recordDeletedId('warga', id);
    setWargaList((prev) => prev.filter((w) => w.id !== id));
    const res = await deleteWargaFromServer(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus data warga di server.');
    } else {
      setServerConnected(true);
    }
  };

  // Upgrade / Perbarui Data KK Warga (Meninggal Dunia, Pisah KK, Pembaruan Berkala)
  // Menjamin 100% data uang kas & catatan iuran tidak hilang dan dialihkan otomatis ke KK / Kepala Keluarga baru
  const handleApplyUpgradeKK = ({
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
    // 1. Hitung total uang kas yang tercatat atas KK ini
    const oldTxs = transactions.filter(
      (t) =>
        (t.noKK && t.noKK === oldWarga.noKK) ||
        (t.namaWarga && t.namaWarga.toLowerCase() === oldWarga.nama.toLowerCase())
    );
    const totalKasDipindahkan = oldTxs.reduce((sum, t) => sum + (t.nominal || 0), 0);

    // 2. Deteksi anggota keluar & masuk
    const oldAnggotaNames = (oldWarga.anggotaKeluarga || []).map((a) => a.nama.trim().toLowerCase());
    const newAnggotaNames = (newKKData.anggotaKeluarga || []).map((a) => a.nama.trim().toLowerCase());

    const anggotaKeluar = (oldWarga.anggotaKeluarga || [])
      .filter((a) => !newAnggotaNames.includes(a.nama.trim().toLowerCase()))
      .map((a) => `${a.nama} (${a.hubungan})`);

    const anggotaMasuk = (newKKData.anggotaKeluarga || [])
      .filter((a) => !oldAnggotaNames.includes(a.nama.trim().toLowerCase()))
      .map((a) => `${a.nama} (${a.hubungan})`);

    // 3. Buat catatan riwayat perubahan KK
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
    // 4. Update data warga target tanpa menghilangkan data kas/iuran (keuangan utuh 100%)
    setWargaList((prev) =>
      prev.map((w) => {
        if (w.id === wargaId) {
          return {
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
        }
        return w;
      })
    );

    // 5. Update seluruh riwayat transaksi kas lama ke data KK & Kepala Keluarga baru
    setTransactions((prev) =>
      prev.map((t) => {
        const matchesKK = t.noKK && t.noKK === oldWarga.noKK;
        const matchesNama =
          t.namaWarga && t.namaWarga.toLowerCase() === oldWarga.nama.toLowerCase();

        if (matchesKK || matchesNama) {
          return {
            ...t,
            noKK: newKKData.noKK,
            namaWarga: newKKData.nama,
            keterangan: t.keterangan.includes('Dialihkan')
              ? t.keterangan
              : `${t.keterangan} (Dialihkan dari KK lama: ${oldWarga.noKK})`,
            updatedAt: nowIso,
          };
        }
        return t;
      })
    );

    // 6. Jika opsional santunan kas kematian dicentang, buat transaksi santunan keluar otomatis
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
        updatedAt: nowIso,
      };
      setTransactions((prev) => [santunanTx, ...prev]);
    }

    // 7. Update data bantuan pemerintah jika ada
    setBantuanList((prev) =>
      prev.map((b) => {
        if (
          b.noKK === oldWarga.noKK ||
          b.namaPenerima.toLowerCase() === oldWarga.nama.toLowerCase()
        ) {
          return {
            ...b,
            namaPenerima: newKKData.nama,
            noKK: newKKData.noKK,
            updatedAt: nowIso,
          };
        }
        return b;
      })
    );

    // 8. Tampilkan pengumuman/notifikasi konfirmasi sukses
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
  };

  // Create Announcement
  const handleSavePengumuman = async (p: Omit<PengumumanRT, 'id'>) => {
    const newP: PengumumanRT = {
      ...p,
      id: 'p' + Date.now(),
      updatedAt: new Date().toISOString(),
    };
    setPengumumanList((prev) => [newP, ...prev]);
    setFloatingAnnouncement(newP);
    const res = await savePengumumanOnServer(newP);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menyinkronkan pengumuman ke server.');
    } else {
      setServerConnected(true);
    }
  };

  // Delete Announcement (Permanently records id as dismissed so it NEVER reappears)
  const handleDeletePengumuman = async (id: string) => {
    recordDeletedId('pengumuman', id);
    setPengumumanList((prev) => prev.filter((p) => p.id !== id));
    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, id])));
    if (floatingAnnouncement?.id === id) {
      setFloatingAnnouncement(null);
    }
    const res = await deletePengumumanOnServer(id);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal menghapus pengumuman dari server.');
    } else {
      setServerConnected(true);
    }
  };

  // Server: Admin RT Accounts Management
  const handleAddAdminAccount = (acc: Omit<AdminRTAccount, 'id'>) => {
    const newAcc: AdminRTAccount = {
      ...acc,
      id: 'adm_' + Date.now(),
      updatedAt: new Date().toISOString(),
    };
    setAdminAccounts((prev) => [newAcc, ...prev]);
  };

  const handleUpdateAdminAccount = (id: string, updated: Partial<AdminRTAccount>) => {
    const nowIso = new Date().toISOString();
    setAdminAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated, updatedAt: nowIso } : a))
    );
  };

  const handleDeleteAdminAccount = (id: string) => {
    recordDeletedId('adminAccounts', id);
    setAdminAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // Server: Update verification status of monthly submission
  const handleUpdateStatusLaporan = async (id: string, status: PembaruanBulananRT['statusVerifikasi']) => {
    const nowIso = new Date().toISOString();
    const existing = laporanBulananRT.find((lap) => lap.id === id);
    const updatedLap = existing ? { ...existing, statusVerifikasi: status, updatedAt: nowIso } : null;
    setLaporanBulananRT((prev) =>
      prev.map((lap) => (lap.id === id ? { ...lap, statusVerifikasi: status, updatedAt: nowIso } : lap))
    );
    if (updatedLap) {
      const res = await saveLaporanOnServer(updatedLap);
      if (!res.ok) {
        setSyncStatus('offline');
        setCloudError(res.message || 'Gagal memperbarui status laporan di server.');
      } else {
        setServerConnected(true);
      }
    }
  };

  // Admin RT: Send monthly update to Server
  const handleKirimLaporanBulanan = async (laporan: PembaruanBulananRT) => {
    const nowIso = new Date().toISOString();
    const nowLabel = formatWaktuSyncID();
    const stamped = { ...laporan, updatedAt: nowIso };
    setLaporanBulananRT((prev) => [stamped, ...prev]);

    if (currentUser?.role === 'admin') {
      setAdminAccounts((prev) =>
        prev.map((acc) =>
          acc.username.toLowerCase() === currentUser.username.toLowerCase()
            ? { ...acc, terakhirSinkronisasi: `Tersinkron ${nowLabel}`, updatedAt: nowIso }
            : acc
        )
      );
    }

    const res = await saveLaporanOnServer(stamped);
    if (!res.ok) {
      setSyncStatus('offline');
      setCloudError(res.message || 'Gagal mengirim laporan bulanan ke server.');
    } else {
      setServerConnected(true);
    }
  };

  // Restore entire database from backup JSON
  const handleRestoreDatabase = (db: AppDatabaseSchema) => {
    const nowIso = new Date().toISOString();
    const stampAll = <T extends { updatedAt?: string }>(list?: T[]): T[] =>
      Array.isArray(list) ? list.map((item) => ({ ...item, updatedAt: item.updatedAt || nowIso })) : [];
    if (db.tahunAktif) setTahunAktif(db.tahunAktif);
    if (db.pengaturanKas) setPengaturanKas({ ...db.pengaturanKas, updatedAt: nowIso });
    if (db.wargaList) setWargaList(stampAll(db.wargaList));
    if (db.transactions) setTransactions(stampAll(db.transactions));
    if (db.bantuanList) setBantuanList(stampAll(db.bantuanList));
    if (db.pengumumanList) setPengumumanList(stampAll(db.pengumumanList));
    if (db.dokumenList) setDokumenList(stampAll(db.dokumenList));
    if (db.adminAccounts) setAdminAccounts(stampAll(db.adminAccounts));
    if (db.laporanBulananRT) setLaporanBulananRT(stampAll(db.laporanBulananRT));
    setRolloverNotice('Database berhasil dipulihkan dari cadangan JSON dan sedang disinkronkan ke Server Pusat!');
    setTimeout(() => setRolloverNotice(null), 4000);
  };

  // Handle Login
  const handleLoginSuccess = (user: AuthUser) => {
    saveActiveSession(user);
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
      const nowIso = new Date().toISOString();
      const nowLabel = formatWaktuSyncID();
      setAdminAccounts((prev) =>
        prev.map((acc) =>
          acc.username.toLowerCase() === user.username.toLowerCase()
            ? { ...acc, terakhirLogin: nowLabel, updatedAt: nowIso }
            : acc
        )
      );
    }
  };

  // Handle Explicit Logout -> invalidates server session & clears sensitive local memory
  const handleLogout = async () => {
    await logoutFromServer();
    saveActiveSession(null);
    clearAuthToken();
    isLoadedRef.current = false;
    lastServerHashRef.current = '';
    lastServerRevisionRef.current = 0;
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
    const pub = await fetchPublicBootstrapInfo();
    if (pub?.pengaturanKas) {
      setPengaturanKas(pub.pengaturanKas);
      setTahunAktif(pub.tahunAktif);
    }
  };

  // Quick switch role helper (only triggered from inside Server control view)
  const handleSwitchToRole = (targetRole: 'server' | 'admin' | 'warga') => {
    if (targetRole === 'server') {
      const nextUser: AuthUser = {
        role: 'server',
        username: 'RW05GLEMPANG',
        nama: 'Super Admin Server RW 05 Glempang',
        rtScope: 'Semua RT se-RW 05 Glempang',
        isPinAuthenticated: true,
      };
      saveActiveSession(nextUser);
      setCurrentUser(nextUser);
      setCurrentView('server-kontrol');
    } else if (targetRole === 'admin') {
      const rtStr = pengaturanKas.profilRT?.namaRT || '08';
      const rwStr = pengaturanKas.profilRT?.namaRW || '05';
      const ketuaStr = pengaturanKas.kontakKetuaRT?.nama?.trim();
      const nextUser: AuthUser = {
        role: 'admin',
        username: 'Admin',
        nama: ketuaStr ? `${ketuaStr} (Ketua RT ${rtStr})` : `Administrator RT ${rtStr} RW ${rwStr}`,
        rtScope: `RT ${rtStr} RW ${rwStr}`,
        isPinAuthenticated: true,
      };
      saveActiveSession(nextUser);
      setCurrentUser(nextUser);
      setCurrentView('beranda');
    } else {
      const sampleWarga = wargaList[0];
      const nextUser: AuthUser = {
        role: 'warga',
        username: sampleWarga?.nama || 'Budi Santoso',
        nama: sampleWarga?.nama || 'Budi Santoso',
        noKK: sampleWarga?.noKK || '3302140508000003',
        wargaId: sampleWarga?.id || 'w3',
        rtScope: sampleWarga ? `RT ${sampleWarga.rt || '08'} RW ${sampleWarga.rw || '05'}` : 'RT 08 RW 05',
        isPinAuthenticated: true,
      };
      saveActiveSession(nextUser);
      setCurrentUser(nextUser);
      setCurrentView('dasbor-warga');
    }
  };

  const isServer = currentUser?.role === 'server';
  const isAdminRT = currentUser?.role === 'admin';
  const isWarga = currentUser?.role === 'warga';

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
    { id: 'data-warga', label: 'Data Warga Desa', icon: <Users size={18} /> },
    { id: 'bantuan-pemerintah', label: 'Bantuan Sosial Desa', icon: <HandHeart size={18} /> },
    { id: 'beranda', label: `Lihat Kas RT ${pengaturanKas.profilRT?.namaRT || '08'}`, icon: <LayoutDashboard size={18} /> },
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
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? isServer
                        ? 'bg-white text-indigo-900 shadow-sm'
                        : 'bg-white text-[#0B5D3F] shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? (isServer ? 'text-indigo-700' : 'text-[#0B5D3F]') : 'text-white/70'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-black text-white uppercase">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          {/* Central SQL & Live Server persistence indicator */}
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
                  ? 'Koneksi Server Terputus'
                  : sseConnected
                  ? 'Server Pusat Live'
                  : 'Server Terhubung'}
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
              title="Akun Admin belum terdaftar ke Server. Klik untuk menyinkronkan akun & data ke Server."
            >
              <CloudUpload size={13} />
              <span>{adminSyncBusy ? 'Menyinkronkan Akun...' : 'Sinkron Akun ke Server'}</span>
            </button>
          )}

          {isAdminRT && dataLoadedReady && isCurrentAdminOnServer && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-400/15 px-2.5 py-1.5 text-[10px] text-emerald-100 border border-emerald-300/20">
              <span className="truncate font-semibold">Database Server: Terhubung</span>
              <button
                type="button"
                onClick={() => handleSyncAdminAccountToServer()}
                disabled={adminSyncBusy}
                className="shrink-0 font-black text-emerald-300 hover:text-white ml-1 cursor-pointer disabled:opacity-50"
                title="Sinkronkan ulang akun & data ke Server"
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
                <h2 className="text-sm font-extrabold text-slate-900">
                  {currentNavItems.find((n) => n.id === currentView)?.label || `Aplikasi ${pengaturanKas.profilRT?.desa || 'Desa Kotayasa'}`}
                </h2>
                {isServer && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                    <Server size={10} /> SERVER PUSAT
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {pengaturanKas.profilRT?.desa || 'Desa Kotayasa'} &bull; {currentUser?.nama} ({currentUser?.rtScope || `RT ${pengaturanKas.profilRT?.namaRT || '08'}`})
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
                  ? 'Server Terputus'
                  : syncStatus === 'saving' || cloudSyncBusy
                  ? 'Menyinkronkan...'
                  : sseConnected
                  ? 'Server Live'
                  : 'Server Terhubung'}
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

        {/* Scrollable Content Container with mobile horizontal safety */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 no-scrollbar">
          <div className="mx-auto max-w-7xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentUser?.role}-${currentView}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
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
                  onSwitchToRTAdmin={() => {
                    handleSwitchToRole('admin');
                  }}
                />
              ) : currentView === 'data-warga' ? (
                <DataWargaView
                  wargaList={wargaList}
                  bantuanList={bantuanList}
                  profilRT={pengaturanKas.profilRT}
                  pengaturanKas={pengaturanKas}
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
                  bantuanList={bantuanList}
                  wargaList={wargaList}
                  pengaturanKas={pengaturanKas}
                  onAddBantuan={handleAddBantuan}
                  onUpdateStatus={handleUpdateStatusBantuan}
                  onDeleteBantuan={handleDeleteBantuan}
                  onOpenImportExcel={() => setIsWargaModalOpen(true)}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'beranda' ? (
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
              ) : currentView === 'status-iuran' ? (
                <StatusIuranView
                  wargaList={wargaList}
                  pengaturanKas={pengaturanKas}
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
                  pengaturanKas={pengaturanKas}
                />
              ) : currentView === 'laporan' ? (
                <LaporanView
                  transactions={transactions}
                  wargaList={wargaList}
                  bantuanList={bantuanList}
                  onBack={() => setCurrentView('server-kontrol')}
                  pengaturanKas={pengaturanKas}
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
                    const res = await updateWargaSelfOnServer({ pin });
                    if (!res.ok) {
                      setSyncStatus('offline');
                      setCloudError(res.message || 'Gagal menyimpan PIN baru ke database server.');
                    } else {
                      setServerConnected(true);
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
          pengaturanKas={pengaturanKas}
        />
      )}

      {/* Resident (Warga) Modal with Bulk Excel Import & Manual KK (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <WargaModal
          isOpen={isWargaModalOpen}
          onClose={() => setIsWargaModalOpen(false)}
          onSave={handleSaveWarga}
          onBulkImport={handleBulkImportWargaBantuan}
          profilRT={pengaturanKas.profilRT}
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
