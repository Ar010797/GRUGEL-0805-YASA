import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
import { NotificationCenterModal } from './components/NotificationCenterModal';
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
  AppNotification,
} from './types';
import { isPengumumanExpired } from './utils/security';
import {
  logoutFromServer,
  formatWaktuSyncID,
  downloadBackupJSON,
  fetchServerSnapshot,
  type AppDatabaseSchema,
  type ServerWriteResult,
} from './utils/cloudSync';
import {
  assertRtWriteAllowed,
  DEFAULT_PENGATURAN_KAS,
  filterStoreForUser,
  formatRtId,
  getSavedAuthSession,
  isSuperAdminUser,
  mergeAccountsWithSeeds,
  mergeModuleLists,
  mqttSync,
  readUserReadNotifIds,
  saveAuthSession,
  writeUserReadNotifIds,
  type MqttDatabaseStore,
  type MqttModuleTopic,
} from './utils/mqttSync';
import { showBrowserLocalNotification } from './utils/pushClient';

const toValidDocId = (raw: string, prefix = 'doc'): string => {
  const clean = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean || `${prefix}_${Date.now()}`;
};
import {
  EXCEL_DOWNLOAD_EVENT,
  ExcelDownloadNotificationDetail,
  shareOrSaveExcelFile,
} from './utils/excelWargaImport';
import {
  collectRegisteredRTs,
  buildServerFilteredViewData,
  getKasKematianBalanceSummary,
  normalizeRTCode,
  normalizeRWCode,
  getWargaRTCode,
  doesTransactionBelongToWarga,
  getBantuanRTCode,
  getTransactionRTCode,
  hasWargaCashDiff,
  reconcileWargaCashFromTransactions,
  resolveTransactionResidentId,
} from './utils/rtFilter';

// Eager primary dashboard views for instant first paint; lazy-load secondary views
import { BerandaView } from './views/BerandaView';
import { DasborWargaView } from './views/DasborWargaView';

const KasWargaView = lazy(() => import('./views/KasWargaView').then((m) => ({ default: m.KasWargaView })));
const KasMasukView = lazy(() => import('./views/KasMasukView').then((m) => ({ default: m.KasMasukView })));
const KasKeluarView = lazy(() => import('./views/KasKeluarView').then((m) => ({ default: m.KasKeluarView })));
const KasKematianView = lazy(() => import('./views/KasKematianView').then((m) => ({ default: m.KasKematianView })));
const StatusIuranView = lazy(() => import('./views/StatusIuranView').then((m) => ({ default: m.StatusIuranView })));
const DataWargaView = lazy(() => import('./views/DataWargaView').then((m) => ({ default: m.DataWargaView })));
const LaporanView = lazy(() => import('./views/LaporanView').then((m) => ({ default: m.LaporanView })));
const PengaturanView = lazy(() => import('./views/PengaturanView').then((m) => ({ default: m.PengaturanView })));
const PengumumanView = lazy(() => import('./views/PengumumanView').then((m) => ({ default: m.PengumumanView })));
const BantuanPemerintahView = lazy(() => import('./views/BantuanPemerintahView').then((m) => ({ default: m.BantuanPemerintahView })));
const DokumenPdfWargaView = lazy(() => import('./views/DokumenPdfWargaView').then((m) => ({ default: m.DokumenPdfWargaView })));
const KebijakanPrivasiView = lazy(() => import('./views/KebijakanPrivasiView').then((m) => ({ default: m.KebijakanPrivasiView })));
const ServerKontrolView = lazy(() => import('./views/ServerKontrolView').then((m) => ({ default: m.ServerKontrolView })));

const ViewSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-24 rounded-3xl bg-white/80 border border-slate-200/70" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-28 rounded-2xl bg-white/80 border border-slate-200/70" />
      <div className="h-28 rounded-2xl bg-white/80 border border-slate-200/70" />
      <div className="h-28 rounded-2xl bg-white/80 border border-slate-200/70" />
    </div>
    <div className="h-64 rounded-3xl bg-white/80 border border-slate-200/70" />
  </div>
);

export default function App() {
  // Authentication State (Role: 'server' | 'admin' | 'warga')
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const currentUserRef = useRef<AuthUser | null>(null);
  currentUserRef.current = currentUser;
  const txSubmitLockRef = useRef<boolean>(false);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isLupaPasswordOpen, setIsLupaPasswordOpen] = useState<boolean>(false);
  const [isKirimLaporanModalOpen, setIsKirimLaporanModalOpen] = useState<boolean>(false);

  // Notification Center State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  // App Lock (6 Digit PIN)
  const [currentPin, setCurrentPin] = useState<string>('123456');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(false);

  // Inactivity Auto-Logout (5 Minutes = 300,000 ms)
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [inactivityNotice, setInactivityNotice] = useState<boolean>(false);

  // Fiscal Year State & Auto-Rollover
  const [tahunAktif, setTahunAktif] = useState<number>(2026);
  const [rolloverNotice, setRolloverNotice] = useState<string | null>(null);

  // Cloud MQTT WSS Sync indicator ('connecting' | 'pending' | 'success' | 'synced' | 'error')
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'pending' | 'success' | 'synced' | 'error'>('connecting');
  const [serverConnected, setServerConnected] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [dataLoadedReady, setDataLoadedReady] = useState<boolean>(false);
  const [serverAdminAccounts, setServerAdminAccounts] = useState<AdminRTAccount[]>([]);
  const [adminSyncBusy, setAdminSyncBusy] = useState<boolean>(false);
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [hasPendingLocalMigration] = useState<boolean>(false);
  const [pendingOpsCount, setPendingOpsCount] = useState<number>(0);

  const successFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const lastSeenNotifIdRef = useRef<string | null>(null);

  const getPendingServerWriteCount = () => pendingOpsCount;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (successFlashTimerRef.current) clearTimeout(successFlashTimerRef.current);
    };
  }, []);

  const flashWriteSuccess = () => {
    if (!isMountedRef.current) return;
    if (successFlashTimerRef.current) {
      clearTimeout(successFlashTimerRef.current);
    }
    setServerConnected(true);
    setCloudError(null);
    setSyncStatus('success');
    successFlashTimerRef.current = setTimeout(() => {
      successFlashTimerRef.current = null;
      if (!isMountedRef.current) return;
      const st = mqttSync.getStatus();
      setSyncStatus(
        st.connectionState === 'connected'
          ? 'synced'
          : st.connectionState === 'syncing'
          ? 'pending'
          : 'error'
      );
    }, 2500);
  };

  // Navigation active tab
  const [currentView, setCurrentView] = useState<string>('beranda');

  // Server RT filter ('SEMUA' or specific RT code e.g. '08', '01')
  const [selectedServerRT, setSelectedServerRT] = useState<string>('SEMUA');

  // Mobile sidebar open state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [txModalType, setTxModalType] = useState<'masuk' | 'keluar' | 'kematian'>('masuk');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isWargaModalOpen, setIsWargaModalOpen] = useState<boolean>(false);
  const [editingWarga, setEditingWarga] = useState<Warga | null>(null);
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

  // System Configuration
  const [pengaturanKas, setPengaturanKas] = useState<PengaturanKas>(DEFAULT_PENGATURAN_KAS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wargaList, setWargaList] = useState<Warga[]>([]);
  const [pengumumanList, setPengumumanList] = useState<PengumumanRT[]>([]);
  const activeAnnouncements = pengumumanList.filter((p) => !isPengumumanExpired(p.tanggalBerakhir));

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

  const [bantuanList, setBantuanList] = useState<BantuanPemerintah[]>([]);
  const [dokumenList, setDokumenList] = useState<DokumenPdfWarga[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminRTAccount[]>([]);
  const [laporanBulananRT, setLaporanBulananRT] = useState<PembaruanBulananRT[]>([]);

  const buildCurrentSchema = (): AppDatabaseSchema => ({
    version: 3,
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

  const applyScopedStoreToUI = (fullStore: MqttDatabaseStore, user: AuthUser | null) => {
    if (!isMountedRef.current) return;
    const scoped = filterStoreForUser(fullStore, user);
    setWargaList(scoped.wargaList);
    setTransactions(scoped.transactions);
    setBantuanList(scoped.bantuanList);
    setPengumumanList(scoped.pengumumanList);
    setDokumenList(scoped.dokumenList);
    setAdminAccounts(scoped.adminAccounts);
    setServerAdminAccounts(fullStore.accounts);
    setLaporanBulananRT(scoped.laporanBulananRT);
    setPengaturanKas(scoped.pengaturanKas);
    setTahunAktif(scoped.tahunAktif);
    setNotifications(scoped.notifications);
    setUnreadCount(scoped.unreadCount);

    const newestNotif = scoped.notifications[0];
    if (
      newestNotif &&
      newestNotif.id !== lastSeenNotifIdRef.current &&
      lastSeenNotifIdRef.current !== null &&
      newestNotif.createdBy !== user?.username &&
      !newestNotif.isRead
    ) {
      showBrowserLocalNotification(newestNotif.title, newestNotif.body);
    }
    if (newestNotif) {
      lastSeenNotifIdRef.current = newestNotif.id;
    }

    if (user?.role === 'warga' && scoped.wargaList[0]?.pin) {
      setCurrentPin(scoped.wargaList[0].pin);
    }
    setDataLoadedReady(true);
  };

  // 1. Bootstrap Session & Connect MQTT WSS Cloud Sync automatically
  useEffect(() => {
    mqttSync.start();

    const saved = getSavedAuthSession();
    if (saved) {
      setCurrentUser(saved);
      setIsLoginModalOpen(false);
      setCurrentView(
        saved.role === 'server'
          ? 'server-kontrol'
          : saved.role === 'warga'
          ? 'dasbor-warga'
          : 'beranda'
      );
    } else {
      setCurrentUser(null);
      setIsLoginModalOpen(true);
    }
    setAuthReady(true);

    const unsubStore = mqttSync.subscribeStore((store) => {
      applyScopedStoreToUI(store, currentUserRef.current);
    });

    const unsubStatus = mqttSync.subscribeStatus((st) => {
      if (!isMountedRef.current) return;
      setPendingOpsCount(st.pendingTopics);
      if (st.connectionState === 'connected') {
        setServerConnected(true);
        setSseConnected(true);
        setCloudError(null);
        setSyncStatus((prev) => (prev === 'success' ? prev : 'synced'));
      } else if (st.connectionState === 'syncing') {
        setServerConnected(true);
        setSseConnected(false);
        setCloudError(null);
        setSyncStatus('pending');
      } else {
        setServerConnected(false);
        setSseConnected(false);
        setSyncStatus('error');
        if (st.error) setCloudError(st.error);
      }
    });

    return () => {
      unsubStore();
      unsubStatus();
    };
  }, []);

  // Re-apply strict RT scope whenever currentUser changes
  useEffect(() => {
    applyScopedStoreToUI(mqttSync.getStore(), currentUser);
  }, [currentUser?.role, currentUser?.username, currentUser?.rtScope, currentUser?.rtId, currentUser?.noKK, currentUser?.wargaId]);

  // 2. Safe reconciliation for pre-existing transactions -> Warga cash/iuran state
  const lastTxWargaBackfillSigRef = useRef<string>('');
  useEffect(() => {
    if (!dataLoadedReady || !currentUser) return;
    if (currentUser.role !== 'admin' && currentUser.role !== 'server') return;
    if (wargaList.length === 0 || transactions.length === 0) return;

    const sig = `${tahunAktif}:${wargaList.length}:${transactions.length}:${transactions[0]?.id || ''}`;
    if (lastTxWargaBackfillSigRef.current === sig) return;
    lastTxWargaBackfillSigRef.current = sig;

    const assignedAdminRT =
      currentUser.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const nowIso = new Date().toISOString();
    const changedIds = new Set<string>();
    const reconciledMap = new Map<string, Warga>();

    wargaList.forEach((w) => {
      if (
        currentUser.role === 'admin' &&
        assignedAdminRT &&
        assignedAdminRT !== 'SEMUA' &&
        getWargaRTCode(w, assignedAdminRT) !== assignedAdminRT
      ) {
        return;
      }
      const reconciled = reconcileWargaCashFromTransactions({
        warga: w,
        transactions,
        tahunAktif,
        pengaturanKas,
        allWarga: wargaList,
        nowIso,
        forceClearIfZero: false,
      });
      const hasAnyTxPayment =
        (reconciled.iuranUmumTerbayar || 0) > 0 || (reconciled.iuranKematianTerbayar || 0) > 0;
      if (hasAnyTxPayment && hasWargaCashDiff(w, reconciled, tahunAktif)) {
        changedIds.add(w.id);
        reconciledMap.set(w.id, reconciled);
      }
    });

    if (changedIds.size === 0) return;

    void mqttSync.mutate((draft) => {
      draft.warga = draft.warga.map((w) => reconciledMap.get(w.id) || w);
      return ['warga'];
    });
  }, [dataLoadedReady, currentUser?.role, tahunAktif, wargaList.length, transactions.length]);

  const handleForceSyncNow = async () => {
    setCloudSyncBusy(true);
    setCloudError(null);
    try {
      const ok = await mqttSync.forceSyncNow();
      if (ok) {
        flashWriteSuccess();
      }
    } catch (err: any) {
      setCloudError(err?.message || 'Gagal menyinkronkan ke cloud broker MQTT.');
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const handleSyncAdminAccountToServer = async (
    overrideAccount?: AdminRTAccount
  ): Promise<{ ok: boolean; message?: string; account?: AdminRTAccount; user?: AuthUser }> => {
    setAdminSyncBusy(true);
    try {
      await mqttSync.forceSyncNow();
      flashWriteSuccess();
      const target =
        overrideAccount ||
        mqttSync
          .getStore()
          .accounts.find(
            (a) => a.username.toLowerCase() === (currentUser?.username || '').toLowerCase()
          );
      return { ok: true, account: target, user: currentUser || undefined };
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

  const saldoKasKematianBerjalan = getKasKematianBalanceSummary(transactions).saldoKematian;

  // Annual Rollover Handler (Pergantian Tahun Otomatis - Saldo Berlanjut Tanpa Dikosongkan)
  const handleSwitchTahunAktif = async (newYear: number) => {
    if (newYear === tahunAktif) return;
    const perm = assertRtWriteAllowed(currentUser);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const prevTahun = tahunAktif;
    const prevPengaturan = latestStateRef.current.pengaturanKas;
    const prevWarga = latestStateRef.current.wargaList;
    const currentEndSaldoUmum = totalKasUmumMasuk - totalKasUmumKeluar;
    const currentEndSaldoKematian = saldoKasKematianBerjalan;
    const actorName = currentUser?.username || 'system';
    const assignedRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';

    if (newYear > prevTahun) {
      const nextPengaturan: PengaturanKas = {
        ...prevPengaturan,
        tahunAktif: newYear,
        saldoAwalKasUmum: currentEndSaldoUmum,
        saldoAwalKasKematian: currentEndSaldoKematian,
        keteranganSaldoAwal: `Pindahan Saldo Akhir Tahun ${prevTahun} ke Tahun ${newYear} (Otomatis Berlanjut)`,
        tanggalSaldoAwal: `${newYear}-01-01`,
      };

      const res = await mqttSync.mutate(
        (draft, nowIso) => {
          draft.warga = draft.warga.map((w) => {
            if (
              currentUser?.role === 'admin' &&
              assignedRT &&
              assignedRT !== 'SEMUA' &&
              getWargaRTCode(w, assignedRT) !== assignedRT
            ) {
              return w;
            }
            const priorHistory = w.riwayatIuranPerTahun || {};
            const currentYearHistory = priorHistory[prevTahun] || w.riwayatIuran || {};
            const currentYearStatus =
              (w.statusIuranPerTahun && w.statusIuranPerTahun[prevTahun]) || w.statusIuran;

            const updatedPerTahun: Record<number, Record<number, boolean>> = {
              ...priorHistory,
              [prevTahun]: currentYearHistory,
            };
            const updatedStatusPerTahun: Record<number, 'Sudah' | 'Belum'> = {
              ...(w.statusIuranPerTahun || {}),
              [prevTahun]: currentYearStatus as 'Sudah' | 'Belum',
            };
            const newYearPaid: 'Sudah' | 'Belum' = updatedStatusPerTahun[newYear] || 'Belum';

            return {
              ...w,
              statusIuran: newYearPaid,
              riwayatIuranPerTahun: updatedPerTahun,
              statusIuranPerTahun: updatedStatusPerTahun,
              riwayatIuran: updatedPerTahun[newYear] || {},
              updatedAt: nowIso,
              updatedBy: actorName,
            };
          });

          draft.settings = {
            pengaturanKas: { ...nextPengaturan, updatedAt: nowIso, updatedBy: actorName },
            tahunAktif: newYear,
            updatedAt: nowIso,
            updatedBy: actorName,
          };

          return ['settings', 'warga'];
        },
        {
          user: currentUser,
          action: 'ROLLOVER_TAHUN',
          entityType: 'settings',
          entityId: `tahun_${newYear}`,
          rtScope: currentUser?.rtScope || 'SEMUA',
          summary: `Pergantian tahun aktif dari ${prevTahun} ke ${newYear}.`,
        }
      );

      if (res.synced) {
        flashWriteSuccess();
      }
      setRolloverNotice(
        `Pergantian Tahun ${newYear} Berhasil! Saldo kas berlanjut otomatis (Rp ${currentEndSaldoUmum.toLocaleString('id-ID')}). Status iuran tahun ${newYear} siap dicatat.`
      );
    } else {
      const res = await mqttSync.mutate((draft, nowIso) => {
        draft.settings = {
          pengaturanKas: {
            ...draft.settings.pengaturanKas,
            tahunAktif: newYear,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
          tahunAktif: newYear,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        return ['settings'];
      });

      const updatedWargaView = prevWarga.map((w) => {
        const pastStatus = (w.statusIuranPerTahun && w.statusIuranPerTahun[newYear]) || 'Sudah';
        const pastHistory = (w.riwayatIuranPerTahun && w.riwayatIuranPerTahun[newYear]) || {};
        return {
          ...w,
          statusIuran: pastStatus,
          riwayatIuran: pastHistory,
        };
      });
      setWargaList(updatedWargaView);
      if (res.synced) {
        flashWriteSuccess();
      }
      setRolloverNotice(`Melihat arsip pembukuan tahun ${newYear}.`);
    }

    setTimeout(() => setRolloverNotice(null), 5000);
  };

  // Helper: reconcile affected warga dues within an atomic MQTT draft mutation
  const reconcileAffectedWargaInDraft = (
    draft: MqttDatabaseStore,
    affectedTxs: Transaction[],
    forceClearIfZero: boolean,
    nowIso: string
  ): boolean => {
    if (draft.warga.length === 0 || affectedTxs.length === 0) return false;
    const activeYear = draft.settings?.tahunAktif || tahunAktif;
    const activeSettings = draft.settings?.pengaturanKas || pengaturanKas;
    const actorName = currentUserRef.current?.username || 'system';

    const matchedIds = new Set<string>();
    for (const tx of affectedTxs) {
      if (!tx || tx.isSaldoAwal) continue;
      if (tx.residentId) matchedIds.add(tx.residentId);
      for (const w of draft.warga) {
        if (doesTransactionBelongToWarga(tx, w, draft.warga)) {
          matchedIds.add(w.id);
        }
      }
    }

    if (matchedIds.size === 0) return false;

    const scopedAdminRT =
      currentUserRef.current?.role === 'admin'
        ? normalizeRTCode(currentUserRef.current.rtScope)
        : '';

    let anyChanged = false;
    draft.warga = draft.warga.map((w) => {
      if (!matchedIds.has(w.id)) return w;
      if (
        currentUserRef.current?.role === 'admin' &&
        scopedAdminRT &&
        scopedAdminRT !== 'SEMUA' &&
        getWargaRTCode(w, scopedAdminRT) !== scopedAdminRT
      ) {
        return w;
      }
      const reconciled = reconcileWargaCashFromTransactions({
        warga: w,
        transactions: draft.transactions,
        tahunAktif: activeYear,
        pengaturanKas: activeSettings,
        allWarga: draft.warga,
        nowIso,
        forceClearIfZero,
      });
      if (hasWargaCashDiff(w, reconciled, activeYear)) {
        anyChanged = true;
        return { ...reconciled, updatedBy: actorName };
      }
      return w;
    });

    return anyChanged;
  };

  // Handlers for Government Aid
  const handleAddBantuan = async (b: Omit<BantuanPemerintah, 'id'>) => {
    const resolvedRt =
      normalizeRTCode(b.rtScope) ||
      (currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '') ||
      (currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? normalizeRTCode(selectedServerRT)
        : '') ||
      normalizeRTCode(pengaturanKas.profilRT?.namaRT) ||
      '08';
    const perm = assertRtWriteAllowed(currentUser, resolvedRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const newId = toValidDocId('b_' + Date.now(), 'b');
    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const newItem: BantuanPemerintah = {
          ...b,
          id: newId,
          rtScope: b.rtScope || `RT ${resolvedRt} RW ${pengaturanKas.profilRT?.namaRW || '05'}`,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        draft.bantuan = [newItem, ...draft.bantuan];
        return ['bantuan'];
      },
      {
        user: currentUser,
        action: 'ADD_BANTUAN',
        entityType: 'bantuan',
        entityId: newId,
        rtScope: `RT ${resolvedRt}`,
        summary: `Menambah penerima bantuan ${b.jenisBantuan} untuk ${b.namaPenerima} (RT ${resolvedRt})`,
        notification: {
          title: `Data Bantuan Baru (RT ${resolvedRt})`,
          body: `Penerima bantuan ${b.jenisBantuan}: ${b.namaPenerima} telah dicatat pada RT ${resolvedRt}.`,
          category: 'bantuan',
          entityType: 'bantuan',
          entityId: newId,
          targetRts: [resolvedRt],
          targetRoles: ['server', 'admin'],
          createdBy: actorName,
        },
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleUpdateStatusBantuan = async (id: string, newStatus: BantuanPemerintah['status']) => {
    const fullStore = mqttSync.getStore();
    const existing = fullStore.bantuan.find((item) => item.id === id);
    if (!existing) return;
    const itemRt = getBantuanRTCode(existing, fullStore.warga, '');
    const perm = assertRtWriteAllowed(currentUser, itemRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.bantuan = draft.bantuan.map((item) =>
          item.id === id
            ? { ...item, status: newStatus, updatedAt: nowIso, updatedBy: actorName }
            : item
        );
        return ['bantuan'];
      },
      {
        user: currentUser,
        action: 'UPDATE_BANTUAN_STATUS',
        entityType: 'bantuan',
        entityId: id,
        rtScope: existing.rtScope || (itemRt ? `RT ${itemRt}` : undefined),
        summary: `Memperbarui status bantuan ${existing.namaPenerima} menjadi ${newStatus}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleDeleteBantuan = async (id: string) => {
    const fullStore = mqttSync.getStore();
    const existing = fullStore.bantuan.find((item) => item.id === id);
    if (!existing) return;
    const itemRt = getBantuanRTCode(existing, fullStore.warga, '');
    const perm = assertRtWriteAllowed(currentUser, itemRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.bantuan = draft.bantuan.filter((b) => b.id !== id);
        mqttSync.addTombstone(draft, 'bantuan', id, nowIso, actorName);
        return ['bantuan', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_BANTUAN',
        entityType: 'bantuan',
        entityId: id,
        rtScope: existing.rtScope || (itemRt ? `RT ${itemRt}` : undefined),
        summary: `Menghapus data bantuan ${existing.namaPenerima} (${existing.jenisBantuan})`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Handlers for PDF Documents
  const handleUploadDokumen = async (docItem: Omit<DokumenPdfWarga, 'id'>) => {
    const resolvedRt =
      normalizeRTCode(docItem.rtScope) ||
      (currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '') ||
      normalizeRTCode(pengaturanKas.profilRT?.namaRT) ||
      '08';
    const perm = assertRtWriteAllowed(currentUser, resolvedRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const newId = toValidDocId('doc_' + Date.now(), 'doc');
    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const newDoc: DokumenPdfWarga = {
          ...docItem,
          id: newId,
          rtScope: docItem.rtScope || `RT ${resolvedRt} RW ${pengaturanKas.profilRT?.namaRW || '05'}`,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        draft.dokumen = [newDoc, ...draft.dokumen];
        return ['dokumen'];
      },
      {
        user: currentUser,
        action: 'UPLOAD_DOKUMEN',
        entityType: 'dokumen',
        entityId: newId,
        rtScope: `RT ${resolvedRt}`,
        summary: `Mengunggah dokumen arsip PDF: ${docItem.judul}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleDeleteDokumen = async (id: string) => {
    const fullStore = mqttSync.getStore();
    const existing = fullStore.dokumen.find((d) => d.id === id);
    if (!existing) return;
    const perm = assertRtWriteAllowed(currentUser, normalizeRTCode(existing.rtScope || ''));
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.dokumen = draft.dokumen.filter((d) => d.id !== id);
        mqttSync.addTombstone(draft, 'dokumen', id, nowIso, actorName);
        return ['dokumen', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_DOKUMEN',
        entityType: 'dokumen',
        entityId: id,
        rtScope: existing.rtScope,
        summary: `Menghapus dokumen arsip PDF: ${existing.judul}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Sample data loader for demo
  const handleLoadSample = async () => {
    const rtStr =
      currentUser?.role === 'admin'
        ? normalizeRTCode(currentUser.rtScope) || '08'
        : currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? normalizeRTCode(selectedServerRT) || '08'
        : pengaturanKas.profilRT?.namaRT || '08';
    const perm = assertRtWriteAllowed(currentUser, rtStr);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }
    const rwStr = pengaturanKas.profilRT?.namaRW || '05';
    const scopeStr = `RT ${rtStr} RW ${rwStr}`;
    const actorName = currentUser?.username || 'system';
    const base = Date.now();

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const samples: Transaction[] = [
          {
            id: `sample_1_${base}`,
            tanggal: `${tahunAktif}-10-12`,
            kategori: 'Iuran Warga',
            keterangan: 'Iuran Jimpitan Periode Aktif',
            nominal: 250000,
            tipe: 'masuk',
            namaWarga: 'Ahmad Fauzi',
            tahun: tahunAktif,
            rtScope: scopeStr,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
          {
            id: `sample_2_${base + 1}`,
            tanggal: `${tahunAktif}-10-10`,
            kategori: 'Iuran Warga',
            keterangan: 'Iuran Jimpitan & Kas Kematian',
            nominal: 350000,
            tipe: 'masuk',
            namaWarga: 'Siti Aminah',
            tahun: tahunAktif,
            rtScope: scopeStr,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
          {
            id: `sample_3_${base + 2}`,
            tanggal: `${tahunAktif}-10-08`,
            kategori: 'Kas Kematian',
            keterangan: 'Pengadaan Kain Mori & Perlengkapan Jenazah',
            nominal: 200000,
            tipe: 'keluar',
            namaWarga: 'Bendahara Kas',
            tahun: tahunAktif,
            rtScope: scopeStr,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
        ];
        draft.transactions = [...samples, ...draft.transactions];
        return ['transactions'];
      },
      {
        user: currentUser,
        action: 'LOAD_SAMPLE_TX',
        entityType: 'transactions',
        entityId: `sample_${base}`,
        rtScope: scopeStr,
        summary: `Menambahkan 3 transaksi contoh untuk ${scopeStr}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Complete Reset (Super Admin RW Only)
  const handleResetEmpty = async () => {
    if (!isSuperAdminUser(currentUser)) {
      setSyncStatus('error');
      setCloudError('Reset total database hanya diperbolehkan untuk Super Admin RW 05.');
      return;
    }

    const actorName = currentUser?.username || 'adminrw05';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.warga.forEach((w) => mqttSync.addTombstone(draft, 'warga', w.id, nowIso, actorName));
        draft.transactions.forEach((t) =>
          mqttSync.addTombstone(draft, 'transactions', t.id, nowIso, actorName)
        );
        draft.bantuan.forEach((b) =>
          mqttSync.addTombstone(draft, 'bantuan', b.id, nowIso, actorName)
        );
        draft.pengumuman.forEach((p) =>
          mqttSync.addTombstone(draft, 'pengumuman', p.id, nowIso, actorName)
        );
        draft.dokumen.forEach((d) =>
          mqttSync.addTombstone(draft, 'dokumen', d.id, nowIso, actorName)
        );
        draft.laporan.forEach((l) =>
          mqttSync.addTombstone(draft, 'laporan', l.id, nowIso, actorName)
        );

        draft.warga = [];
        draft.transactions = [];
        draft.bantuan = [];
        draft.pengumuman = [];
        draft.dokumen = [];
        draft.laporan = [];
        draft.notifications = [];
        draft.settings = {
          pengaturanKas: {
            ...draft.settings.pengaturanKas,
            saldoAwalKasUmum: 0,
            saldoAwalKasKematian: 0,
            keteranganSaldoAwal: 'Sisa Kas RT Periode Lalu',
            tanggalSaldoAwal: `${tahunAktif}-01-01`,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
          tahunAktif,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        return [
          'warga',
          'transactions',
          'bantuan',
          'pengumuman',
          'dokumen',
          'laporan',
          'notifications',
          'settings',
          'tombstones',
        ];
      },
      {
        user: currentUser,
        action: 'RESET_ALL_DATA',
        entityType: 'system',
        entityId: 'reset_all',
        rtScope: 'SEMUA',
        summary: 'Melakukan reset bersih seluruh data operasional RW 05.',
      }
    );

    setFloatingAnnouncement(null);
    setDismissedNotificationIds([]);
    if (res.synced) {
      flashWriteSuccess();
      setRolloverNotice('Seluruh data berhasil direset secara bersih dan disinkronkan ke cloud.');
    } else {
      setRolloverNotice('Data direset lokal dan akan otomatis tersinkron ke cloud saat online.');
    }
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  const handleUpdatePengaturan = async (newSetting: Partial<PengaturanKas>) => {
    const perm = assertRtWriteAllowed(currentUser);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const prev = latestStateRef.current.pengaturanKas || pengaturanKas;
    const oldKetua = (prev.kontakKetuaRT?.nama || '').trim();
    const newKetua = (newSetting.kontakKetuaRT?.nama ?? prev.kontakKetuaRT?.nama ?? '').trim();
    const oldBendahara = (prev.kontakBendahara?.nama || '').trim();
    const newBendahara = (newSetting.kontakBendahara?.nama ?? prev.kontakBendahara?.nama ?? '').trim();
    const oldRT = (prev.profilRT?.namaRT || '08').trim();
    const newRT = (newSetting.profilRT?.namaRT ?? prev.profilRT?.namaRT ?? '08').trim();
    const newRW = (newSetting.profilRT?.namaRW ?? prev.profilRT?.namaRW ?? '05').trim();
    const newKetuaTelp = (newSetting.kontakKetuaRT?.telp ?? prev.kontakKetuaRT?.telp ?? '').trim();
    const actorName = currentUser?.username || 'system';
    const isSuper = isSuperAdminUser(currentUser);
    const myRT = normalizeRTCode(currentUser?.rtScope);

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const merged: PengaturanKas = {
          ...draft.settings.pengaturanKas,
          ...newSetting,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        draft.settings = {
          pengaturanKas: merged,
          tahunAktif: merged.tahunAktif || draft.settings.tahunAktif,
          updatedAt: nowIso,
          updatedBy: actorName,
        };

        const touched: MqttModuleTopic[] = ['settings'];
        const pengurusChanged =
          (newKetua && newKetua !== oldKetua) ||
          (newBendahara && newBendahara !== oldBendahara) ||
          newRT !== oldRT;

        if (pengurusChanged) {
          const legacyKetuaPlaceholders = ['bpk. suwardi', 'bapak suwardi', oldKetua.toLowerCase()].filter(Boolean);
          const legacyBendaharaPlaceholders = ['bpk. bambang s.', 'bapak bambang s.', 'bpk. bambang', 'bapak bambang', oldBendahara.toLowerCase()].filter(Boolean);

          const canEditAnnouncement = (p: PengumumanRT): boolean => {
            if (isSuper) return true;
            const scopeStr = (p.rtScope || '').trim();
            const targets = Array.isArray(p.targetRts) ? p.targetRts : [];
            if (targets.includes('SEMUA') || /^semua(\s+rt)?$/i.test(scopeStr)) return false;
            if (targets.length > 0 && myRT) {
              return targets.length === 1 && normalizeRTCode(targets[0]) === myRT;
            }
            return normalizeRTCode(scopeStr) === myRT;
          };

          let pengChanged = false;
          draft.pengumuman = draft.pengumuman.map((p) => {
            if (!canEditAnnouncement(p)) return p;
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
              nextNama &&
              (!p.penulis ||
                p.penulis.startsWith('Pengurus RT') ||
                p.penulis.startsWith('Ketua RT') ||
                p.penulis.startsWith('Bendahara RT') ||
                legacyKetuaPlaceholders.includes(p.penulis.toLowerCase()) ||
                legacyBendaharaPlaceholders.includes(p.penulis.toLowerCase()))
                ? `${nextJabatan} (${nextNama})`
                : p.penulis;

            if (
              nextNama === p.namaPengurus &&
              nextJabatan === p.jabatanPengurus &&
              nextPenulis === p.penulis
            ) {
              return p;
            }
            pengChanged = true;
            return {
              ...p,
              namaPengurus: nextNama,
              jabatanPengurus: nextJabatan,
              penulis: nextPenulis,
              updatedAt: nowIso,
              updatedBy: actorName,
            };
          });
          if (pengChanged) touched.push('pengumuman');

          if (newKetua) {
            const myUsernameLower = actorName.trim().toLowerCase();
            let accChanged = false;
            draft.accounts = draft.accounts.map((acc) => {
              const isTarget = isSuper
                ? acc.id === 'acc_admin_rt08' ||
                  acc.username.toLowerCase() === 'adminrt08' ||
                  Boolean(oldKetua && acc.nama.toLowerCase().includes(oldKetua.toLowerCase()))
                : Boolean(myUsernameLower) && acc.username.trim().toLowerCase() === myUsernameLower;
              if (!isTarget) return acc;
              accChanged = true;
              const accRt = isSuper ? newRT : acc.rt;
              return {
                ...acc,
                nama: `${newKetua} (Ketua RT ${accRt})`,
                rt: accRt,
                rtId: formatRtId(accRt),
                rw: newRW,
                kontak: newKetuaTelp || acc.kontak,
                jabatan: `Ketua RT ${accRt} RW ${newRW}`,
                updatedAt: nowIso,
                updatedBy: actorName,
              };
            });
            if (accChanged) touched.push('accounts');
          }
        }

        return touched;
      },
      {
        user: currentUser,
        action: 'UPDATE_PENGATURAN',
        entityType: 'settings',
        entityId: 'pengaturan_kas',
        rtScope: currentUser?.rtScope || 'SEMUA',
        summary: `Memperbarui pengaturan kas dan profil pengurus wilayah`,
      }
    );

    if (newKetua && currentUser?.role === 'admin') {
      const updatedUser: AuthUser = {
        ...currentUser,
        nama: `${newKetua} (Ketua RT ${newRT})`,
        rtScope: `RT ${myRT || newRT} RW ${newRW}`,
      };
      setCurrentUser(updatedUser);
      saveAuthSession(updatedUser);
    }

    if (res.synced) flashWriteSuccess();
  };

  const handleSaveSaldoAwal = async (
    kasUmum: number,
    kasKematian: number,
    keterangan: string,
    tanggal: string
  ) => {
    const scopedAdminRT =
      currentUser?.role === 'admin'
        ? normalizeRTCode(currentUser.rtScope)
        : currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? normalizeRTCode(selectedServerRT)
        : '';
    const rtCodeForSaldo = scopedAdminRT || pengaturanKas.profilRT?.namaRT || '08';
    const perm = assertRtWriteAllowed(currentUser, rtCodeForSaldo);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const rwCodeForSaldo = pengaturanKas.profilRT?.namaRW || '05';
    const rtScopeStr = `RT ${rtCodeForSaldo} RW ${rwCodeForSaldo}`;
    const actorName = currentUser?.username || 'system';
    const baseTime = Date.now();

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.settings = {
          pengaturanKas: {
            ...draft.settings.pengaturanKas,
            saldoAwalKasUmum: kasUmum,
            saldoAwalKasKematian: kasKematian,
            keteranganSaldoAwal: keterangan,
            tanggalSaldoAwal: tanggal,
            updatedAt: nowIso,
            updatedBy: actorName,
          },
          tahunAktif: draft.settings.tahunAktif || tahunAktif,
          updatedAt: nowIso,
          updatedBy: actorName,
        };

        const isAllRTReset = isSuperAdminUser(currentUser) && selectedServerRT === 'SEMUA';
        const remainingTxs = draft.transactions.filter((t) => {
          if (!t.isSaldoAwal) return true;
          if (isAllRTReset) {
            mqttSync.addTombstone(draft, 'transactions', t.id, nowIso, actorName);
            return false;
          }
          const tRt = getTransactionRTCode(t, draft.warga, rtCodeForSaldo);
          if (tRt === rtCodeForSaldo) {
            mqttSync.addTombstone(draft, 'transactions', t.id, nowIso, actorName);
            return false;
          }
          return true;
        });

        const newSaldoTxs: Transaction[] = [];
        if (kasUmum > 0) {
          newSaldoTxs.push({
            id: `saldo_awal_umum_${rtCodeForSaldo}_${baseTime}`,
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
            updatedBy: actorName,
          });
        }
        if (kasKematian > 0) {
          newSaldoTxs.push({
            id: `saldo_awal_kematian_${rtCodeForSaldo}_${baseTime + 1}`,
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
            updatedBy: actorName,
          });
        }

        draft.transactions = [...newSaldoTxs, ...remainingTxs];
        return ['settings', 'transactions', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'SAVE_SALDO_AWAL',
        entityType: 'settings',
        entityId: `saldo_${rtCodeForSaldo}`,
        rtScope: rtScopeStr,
        summary: `Menyimpan saldo awal Kas Umum Rp ${kasUmum.toLocaleString('id-ID')} & Kas Kematian Rp ${kasKematian.toLocaleString('id-ID')} (${rtScopeStr})`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Add Transaction or Paired Kas Warga + Kas Kematian Batch (with double-submit guard)
  const handleSaveTransaction = async (
    txInput: Omit<Transaction, 'id'> | Omit<Transaction, 'id'>[]
  ) => {
    if (txSubmitLockRef.current) return;
    txSubmitLockRef.current = true;
    try {
      const inputs = Array.isArray(txInput) ? txInput : [txInput];
      if (inputs.length === 0) return;

      const actorName = currentUser?.username || 'system';
      const defaultRt =
        currentUser?.role === 'admin'
          ? normalizeRTCode(currentUser.rtScope) || '08'
          : currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
          ? normalizeRTCode(selectedServerRT) || '08'
          : normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08';
      const rwStr = pengaturanKas.profilRT?.namaRW || '05';

      for (const tx of inputs) {
        const txRt = normalizeRTCode(tx.rtScope) || defaultRt;
        const perm = assertRtWriteAllowed(currentUser, txRt);
        if (!perm.ok) {
          setCloudError(perm.message);
          return;
        }
      }

      const baseTime = Date.now();
      const fullStore = mqttSync.getStore();
      const newTxs: Transaction[] = inputs.map((tx, idx) => {
        const resolvedRt = normalizeRTCode(tx.rtScope) || defaultRt;
        const resolvedRtScope = tx.rtScope || `RT ${resolvedRt} RW ${rwStr}`;
        const tempTx: Transaction = {
          ...tx,
          id: toValidDocId(
            `tx_${baseTime + idx}_${Math.random().toString(36).slice(2, 6)}`,
            'tx'
          ),
          tahun: tahunAktif,
          rtScope: resolvedRtScope,
          updatedAt: new Date().toISOString(),
          updatedBy: actorName,
        };
        const resolvedResidentId =
          tempTx.residentId ||
          resolveTransactionResidentId(tempTx, fullStore.warga, resolvedRtScope);
        return resolvedResidentId ? { ...tempTx, residentId: resolvedResidentId } : tempTx;
      });

      const targetRts = Array.from(
        new Set(newTxs.map((t) => normalizeRTCode(t.rtScope) || defaultRt))
      );
      const totalNominal = newTxs.reduce((s, t) => s + (t.nominal || 0), 0);

      const res = await mqttSync.mutate(
        (draft, nowIso) => {
          const stampedNewTxs = newTxs.map((t) => ({ ...t, updatedAt: nowIso }));
          draft.transactions = [...stampedNewTxs, ...draft.transactions];
          const wargaChanged = reconcileAffectedWargaInDraft(draft, stampedNewTxs, false, nowIso);
          return wargaChanged ? ['transactions', 'warga'] : ['transactions'];
        },
        {
          user: currentUser,
          action: 'ADD_TRANSACTION',
          entityType: 'transactions',
          entityId: newTxs[0].id,
          rtScope: newTxs[0].rtScope,
          summary: `Mencatat transaksi ${newTxs[0].kategori} (${newTxs[0].namaWarga || 'Kas'}) sebesar Rp ${totalNominal.toLocaleString('id-ID')}`,
          notification: {
            title: `Transaksi Kas Baru (${newTxs[0].rtScope || 'RT'})`,
            body: `${newTxs[0].kategori} - ${newTxs[0].namaWarga || newTxs[0].keterangan} senilai Rp ${totalNominal.toLocaleString('id-ID')}.`,
            category: 'kas',
            entityType: 'transactions',
            entityId: newTxs[0].id,
            targetRts,
            targetRoles: ['server', 'admin'],
            createdBy: actorName,
          },
        }
      );
      if (res.synced) flashWriteSuccess();
    } finally {
      txSubmitLockRef.current = false;
    }
  };

  const handleOpenNewTransaction = (type: 'masuk' | 'keluar' | 'kematian' = 'masuk') => {
    setEditingTransaction(null);
    setTxModalType(type);
    setIsTxModalOpen(true);
  };

  const handleOpenEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setTxModalType(tx.tipe);
    setIsTxModalOpen(true);
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    if (txSubmitLockRef.current) return;
    txSubmitLockRef.current = true;
    try {
      const fullStore = mqttSync.getStore();
      const oldTx = fullStore.transactions.find((t) => t.id === updatedTx.id);
      const oldRt = oldTx ? getTransactionRTCode(oldTx, fullStore.warga, '') : '';
      const permOld = assertRtWriteAllowed(currentUser, oldRt);
      if (!permOld.ok) {
        setCloudError(permOld.message);
        return;
      }

      const defaultRt =
        currentUser?.role === 'admin'
          ? normalizeRTCode(currentUser.rtScope) || '08'
          : currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
          ? normalizeRTCode(selectedServerRT) || '08'
          : oldRt || normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08';
      const rwStr = pengaturanKas.profilRT?.namaRW || '05';
      const resolvedRtScope = updatedTx.rtScope || `RT ${defaultRt} RW ${rwStr}`;
      const newRt = normalizeRTCode(resolvedRtScope);
      const permNew = assertRtWriteAllowed(currentUser, newRt);
      if (!permNew.ok) {
        setCloudError(permNew.message);
        return;
      }

      const actorName = currentUser?.username || 'system';
      const resolvedResidentId =
        updatedTx.residentId ||
        resolveTransactionResidentId(updatedTx, fullStore.warga, resolvedRtScope);

      const res = await mqttSync.mutate(
        (draft, nowIso) => {
          const stampedTx: Transaction = {
            ...updatedTx,
            tahun: updatedTx.tahun ?? tahunAktif,
            rtScope: resolvedRtScope,
            ...(resolvedResidentId ? { residentId: resolvedResidentId } : {}),
            updatedAt: nowIso,
            updatedBy: actorName,
          };
          draft.transactions = draft.transactions.map((t) =>
            t.id === stampedTx.id ? stampedTx : t
          );
          const affected = oldTx ? [oldTx, stampedTx] : [stampedTx];
          const wargaChanged = reconcileAffectedWargaInDraft(draft, affected, true, nowIso);
          return wargaChanged ? ['transactions', 'warga'] : ['transactions'];
        },
        {
          user: currentUser,
          action: 'UPDATE_TRANSACTION',
          entityType: 'transactions',
          entityId: updatedTx.id,
          rtScope: resolvedRtScope,
          summary: `Memperbarui transaksi ${updatedTx.kategori} (${updatedTx.namaWarga || 'Kas'}) menjadi Rp ${(updatedTx.nominal || 0).toLocaleString('id-ID')}`,
        }
      );
      if (res.synced) flashWriteSuccess();
    } finally {
      txSubmitLockRef.current = false;
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const fullStore = mqttSync.getStore();
    const deletedTx = fullStore.transactions.find((t) => t.id === id);
    if (!deletedTx) return;
    const txRt = getTransactionRTCode(deletedTx, fullStore.warga, '');
    const perm = assertRtWriteAllowed(currentUser, txRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.transactions = draft.transactions.filter((t) => t.id !== id);
        mqttSync.addTombstone(draft, 'transactions', id, nowIso, actorName);
        const wargaChanged = reconcileAffectedWargaInDraft(draft, [deletedTx], true, nowIso);
        return wargaChanged
          ? ['transactions', 'warga', 'tombstones']
          : ['transactions', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_TRANSACTION',
        entityType: 'transactions',
        entityId: id,
        rtScope: deletedTx.rtScope || (txRt ? `RT ${txRt}` : undefined),
        summary: `Menghapus transaksi ${deletedTx.kategori} (${deletedTx.namaWarga || 'Kas'}) senilai Rp ${(deletedTx.nominal || 0).toLocaleString('id-ID')}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleOpenNewWarga = () => {
    setEditingWarga(null);
    setIsWargaModalOpen(true);
  };

  const handleOpenEditWarga = (target: Warga) => {
    const targetRT = getWargaRTCode(target, '');
    const perm = assertRtWriteAllowed(currentUser, targetRT);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }
    setEditingWarga(target);
    setIsWargaModalOpen(true);
  };

  // Add Resident
  const handleSaveWarga = async (w: Omit<Warga, 'id' | 'no'>): Promise<ServerWriteResult> => {
    const assignedAdminRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const fallbackRT =
      currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? selectedServerRT
        : assignedAdminRT || pengaturanKas.profilRT?.namaRT || '08';
    const effectiveRT =
      currentUser?.role === 'admin' && assignedAdminRT
        ? assignedAdminRT
        : normalizeRTCode(w.rt) || fallbackRT;

    const perm = assertRtWriteAllowed(currentUser, effectiveRT);
    if (!perm.ok) {
      setCloudError(perm.message);
      return {
        ok: false,
        terminal: true,
        errorCode: 'permission-denied',
        message: perm.message,
      };
    }

    const newId = toValidDocId('w_' + Date.now(), 'w');
    const actorName = currentUser?.username || 'system';
    let createdWarga: Warga | undefined;

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const newW: Warga = {
          ...w,
          rt: effectiveRT,
          rw: normalizeRWCode(w.rw, pengaturanKas.profilRT?.namaRW || '05'),
          id: newId,
          no: draft.warga.length + 1,
          statusIuran: w.statusIuran || 'Belum',
          statusIuranPerTahun: { [tahunAktif]: w.statusIuran || 'Belum' },
          pin: w.pin || '123456',
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        createdWarga = newW;
        draft.warga = [...draft.warga, newW];
        return ['warga'];
      },
      {
        user: currentUser,
        action: 'ADD_WARGA',
        entityType: 'warga',
        entityId: newId,
        rtScope: `RT ${effectiveRT}`,
        summary: `Menambah data warga/KK ${w.nama} di RT ${effectiveRT}`,
        notification: {
          title: `Warga Baru Terdaftar (RT ${effectiveRT})`,
          body: `Data KK atas nama ${w.nama} (${w.jumlahJiwa || 1} jiwa) berhasil ditambahkan di RT ${effectiveRT}.`,
          category: 'warga',
          entityType: 'warga',
          entityId: newId,
          targetRts: [effectiveRT],
          targetRoles: ['server', 'admin'],
          createdBy: actorName,
        },
      }
    );

    if (res.synced) {
      flashWriteSuccess();
      setRolloverNotice(`Data warga & KK "${w.nama}" berhasil ditambahkan dan tersinkron ke cloud.`);
    } else {
      setRolloverNotice(`Data warga & KK "${w.nama}" disimpan lokal dan menunggu sinkronisasi otomatis.`);
    }
    setTimeout(() => setRolloverNotice(null), 6000);

    return { ok: true, pending: !res.synced, warga: createdWarga };
  };

  // Update Resident / Kepala Keluarga / Susunan Anggota KK
  const handleUpdateWarga = async (updatedWarga: Warga): Promise<ServerWriteResult> => {
    const fullStore = mqttSync.getStore();
    const oldWarga = fullStore.warga.find((w) => w.id === updatedWarga.id);
    if (!oldWarga) {
      return {
        ok: false,
        terminal: true,
        errorCode: 'not-found',
        message: 'Data warga yang akan diubah tidak ditemukan.',
      };
    }

    const assignedAdminRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const oldRT = getWargaRTCode(oldWarga, assignedAdminRT || pengaturanKas.profilRT?.namaRT || '08');
    const perm = assertRtWriteAllowed(currentUser, oldRT);
    if (!perm.ok) {
      setCloudError(perm.message);
      return {
        ok: false,
        terminal: true,
        errorCode: 'permission-denied',
        message: perm.message,
      };
    }

    const effectiveRT =
      currentUser?.role === 'server'
        ? normalizeRTCode(updatedWarga.rt) || oldRT
        : oldRT;
    const effectiveRW =
      currentUser?.role === 'server'
        ? updatedWarga.rw || oldWarga.rw || pengaturanKas.profilRT?.namaRW || '05'
        : oldWarga.rw || pengaturanKas.profilRT?.namaRW || '05';

    const cleanedMembers = Array.isArray(updatedWarga.anggotaKeluarga)
      ? updatedWarga.anggotaKeluarga
      : oldWarga.anggotaKeluarga || [];
    const actorName = currentUser?.username || 'system';
    let savedWarga: Warga | undefined;

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const finalWarga: Warga = {
          ...oldWarga,
          ...updatedWarga,
          id: oldWarga.id,
          no: oldWarga.no,
          rt: effectiveRT,
          rw: effectiveRW,
          jumlahJiwa:
            cleanedMembers.length > 0
              ? cleanedMembers.length
              : updatedWarga.jumlahJiwa || oldWarga.jumlahJiwa || 1,
          anggotaKeluarga: cleanedMembers,
          statusIuran: updatedWarga.statusIuran || oldWarga.statusIuran || 'Belum',
          statusIuranPerTahun: {
            ...(oldWarga.statusIuranPerTahun || {}),
            [tahunAktif]: updatedWarga.statusIuran || oldWarga.statusIuran || 'Belum',
          },
          pin: updatedWarga.pin || oldWarga.pin || '123456',
          riwayatPerubahanKK: oldWarga.riwayatPerubahanKK,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        savedWarga = finalWarga;

        const oldNamaLower = String(oldWarga.nama || '').trim().toLowerCase();
        const oldNoKK = String(oldWarga.noKK || '').trim();
        const scopeChanged =
          oldNamaLower !== String(finalWarga.nama || '').trim().toLowerCase() ||
          oldNoKK !== String(finalWarga.noKK || '').trim() ||
          oldRT !== effectiveRT ||
          (oldWarga.rw || '05') !== effectiveRW;

        const touched: MqttModuleTopic[] = ['warga'];
        draft.warga = draft.warga.map((w) => (w.id === finalWarga.id ? finalWarga : w));

        if (scopeChanged) {
          let txTouched = false;
          const allBeforeWarga = draft.warga;
          draft.transactions = draft.transactions.map((t) => {
            const matchesId = Boolean(t.residentId && t.residentId === finalWarga.id);
            const matchesKK = Boolean(oldNoKK && t.noKK && t.noKK === oldNoKK);
            const txNamaLower = String(t.namaWarga || '').trim().toLowerCase();
            const txSameScope =
              (!t.residentId || t.residentId === finalWarga.id) &&
              (!oldNoKK || !t.noKK || t.noKK === oldNoKK) &&
              getTransactionRTCode(t, allBeforeWarga, oldRT) === oldRT;
            const matchesHeadName = Boolean(oldNamaLower && txNamaLower === oldNamaLower && txSameScope);

            if (matchesId || matchesKK || matchesHeadName) {
              txTouched = true;
              const nextNamaWarga =
                matchesHeadName || (!t.namaWarga && matchesKK) ? finalWarga.nama : t.namaWarga;
              const nextRtScope =
                oldRT !== effectiveRT || (oldWarga.rw || '05') !== effectiveRW || !t.rtScope
                  ? `RT ${effectiveRT} RW ${effectiveRW}`
                  : t.rtScope;
              return {
                ...t,
                residentId: finalWarga.id,
                noKK: finalWarga.noKK,
                namaWarga: nextNamaWarga,
                rtScope: nextRtScope,
                updatedAt: nowIso,
                updatedBy: actorName,
              };
            }
            return t;
          });
          if (txTouched) touched.push('transactions');

          let bantuanTouched = false;
          draft.bantuan = draft.bantuan.map((b) => {
            const matchesKK = Boolean(oldNoKK && b.noKK && b.noKK === oldNoKK);
            const bNamaLower = String(b.namaPenerima || '').trim().toLowerCase();
            const bantuanSameScope =
              (!oldNoKK || !b.noKK || b.noKK === oldNoKK) &&
              (!b.rtScope || normalizeRTCode(b.rtScope) === oldRT);
            const matchesHeadName = Boolean(oldNamaLower && bNamaLower === oldNamaLower && bantuanSameScope);

            if (matchesKK || matchesHeadName) {
              bantuanTouched = true;
              return {
                ...b,
                noKK: finalWarga.noKK,
                namaPenerima: matchesHeadName ? finalWarga.nama : b.namaPenerima,
                rtScope:
                  oldRT !== effectiveRT || (oldWarga.rw || '05') !== effectiveRW || !b.rtScope
                    ? `RT ${effectiveRT} RW ${effectiveRW}`
                    : b.rtScope,
                updatedAt: nowIso,
                updatedBy: actorName,
              };
            }
            return b;
          });
          if (bantuanTouched) touched.push('bantuan');
        }

        return touched;
      },
      {
        user: currentUser,
        action: 'UPDATE_WARGA',
        entityType: 'warga',
        entityId: oldWarga.id,
        rtScope: `RT ${effectiveRT}`,
        summary: `Memperbarui data KK/warga ${updatedWarga.nama} (${cleanedMembers.length || updatedWarga.jumlahJiwa || 1} jiwa) di RT ${effectiveRT}`,
      }
    );

    if (res.synced) {
      flashWriteSuccess();
      setRolloverNotice(
        `Data warga & KK "${savedWarga?.nama || updatedWarga.nama}" (${savedWarga?.jumlahJiwa || 1} jiwa) berhasil diperbarui dan tersinkron ke cloud.`
      );
    } else {
      setRolloverNotice(
        `Pembaruan data warga "${savedWarga?.nama || updatedWarga.nama}" disimpan lokal dan menunggu sinkronisasi otomatis.`
      );
    }
    setTimeout(() => setRolloverNotice(null), 6000);

    return { ok: true, pending: !res.synced, warga: savedWarga };
  };

  // Bulk Import Excel: Grouped Warga + Anggota Keluarga + Penerimaan Bantuan in 1 click
  const handleBulkImportWargaBantuan = (
    importedWarga: Omit<Warga, 'id' | 'no'>[],
    importedBantuan: Omit<BantuanPemerintah, 'id'>[],
    options: { mergeExisting: boolean }
  ) => {
    const baseTime = Date.now();
    const nonce = Math.random().toString(36).slice(2, 6);
    const actorName = currentUser?.username || 'system';
    const assignedAdminRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const rtScopeRwMatch =
      currentUser?.role === 'admin'
        ? currentUser.rtScope?.match(/RW[\s.\-:_]*0*([0-9]+)/i)?.[1]
        : '';
    const assignedAdminRW =
      (rtScopeRwMatch ? normalizeRWCode(rtScopeRwMatch) : '') ||
      normalizeRWCode(pengaturanKas.profilRT?.namaRW) ||
      '05';
    const rawFallbackRT =
      currentUser?.role === 'server' && selectedServerRT !== 'SEMUA'
        ? normalizeRTCode(selectedServerRT)
        : assignedAdminRT || normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08';
    const fallbackRT = rawFallbackRT && rawFallbackRT !== 'SEMUA' ? rawFallbackRT : '08';

    let addedKKCount = 0;
    let updatedKKCount = 0;
    let addedBantuanCount = 0;

    const totalJiwa = importedWarga.reduce(
      (sum, w) => sum + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1),
      0
    );

    void mqttSync
      .mutate(
        (draft, nowIso) => {
          const updatedWarga = [...draft.warga];

          importedWarga.forEach((incoming, idx) => {
            const candidateRt = normalizeRTCode(incoming.rt);
            const scopedRt =
              currentUser?.role === 'admin' && assignedAdminRT && assignedAdminRT !== 'SEMUA'
                ? assignedAdminRT
                : candidateRt && candidateRt !== 'SEMUA'
                ? candidateRt
                : fallbackRT;
            const scopedRw =
              currentUser?.role === 'admin'
                ? assignedAdminRW
                : normalizeRWCode(incoming.rw) || assignedAdminRW || '05';

            const existingIndex = incoming.noKK
              ? updatedWarga.findIndex((w) => w.noKK === incoming.noKK)
              : updatedWarga.findIndex(
                  (w) =>
                    w.nama.toLowerCase() === incoming.nama.toLowerCase() &&
                    getWargaRTCode(w, scopedRt) === scopedRt
                );

            if (existingIndex >= 0) {
              if (!options.mergeExisting) return;
              const existing = updatedWarga[existingIndex];
              const existingRt = normalizeRTCode(existing.rt);
              if (
                currentUser?.role === 'admin' &&
                assignedAdminRT &&
                assignedAdminRT !== 'SEMUA' &&
                existingRt &&
                existingRt !== assignedAdminRT
              ) {
                return;
              }
              const mergedRt =
                currentUser?.role === 'admin' && assignedAdminRT && assignedAdminRT !== 'SEMUA'
                  ? assignedAdminRT
                  : candidateRt && candidateRt !== 'SEMUA'
                  ? candidateRt
                  : existingRt && existingRt !== 'SEMUA'
                  ? existingRt
                  : fallbackRT;
              const mergedRw =
                currentUser?.role === 'admin'
                  ? assignedAdminRW
                  : normalizeRWCode(incoming.rw) || normalizeRWCode(existing.rw) || scopedRw;
              const nextStatus = incoming.statusIuran || existing.statusIuran || 'Belum';
              updatedWarga[existingIndex] = {
                ...existing,
                nama: incoming.nama || existing.nama,
                noKK: incoming.noKK || existing.noKK,
                nik: incoming.nik || existing.nik,
                noRumah: incoming.noRumah || existing.noRumah,
                rt: mergedRt,
                rw: mergedRw,
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
                updatedBy: actorName,
              };
              updatedKKCount++;
            } else {
              const assignedId = toValidDocId(`w_${baseTime}_${idx}_${nonce}`, 'w');
              const newWarga: Warga = {
                ...incoming,
                id: assignedId,
                rt: scopedRt,
                rw: scopedRw,
                no: updatedWarga.length + 1,
                statusIuran: incoming.statusIuran || 'Belum',
                statusIuranPerTahun: { [tahunAktif]: incoming.statusIuran || 'Belum' },
                pin: incoming.pin || '123456',
                updatedAt: nowIso,
                updatedBy: actorName,
              };
              updatedWarga.push(newWarga);
              addedKKCount++;
            }
          });

          const nextBantuanList = [...draft.bantuan];
          importedBantuan.forEach((b, idx) => {
            const isDuplicate = nextBantuanList.some(
              (existing) =>
                existing.noKK === b.noKK &&
                existing.namaPenerima.toLowerCase() === b.namaPenerima.toLowerCase() &&
                existing.jenisBantuan.toLowerCase() === b.jenisBantuan.toLowerCase() &&
                existing.tanggal === b.tanggal
            );
            if (!isDuplicate) {
              const assignedBId = toValidDocId(`b_${baseTime}_${idx}_${nonce}`, 'b');
              const parsedBantuanRt = normalizeRTCode(b.rtScope);
              const safeBantuanRt =
                currentUser?.role === 'admin' && assignedAdminRT && assignedAdminRT !== 'SEMUA'
                  ? assignedAdminRT
                  : parsedBantuanRt && parsedBantuanRt !== 'SEMUA'
                  ? parsedBantuanRt
                  : fallbackRT;
              const item: BantuanPemerintah = {
                ...b,
                id: assignedBId,
                rtScope: `RT ${safeBantuanRt} RW ${assignedAdminRW}`,
                updatedAt: nowIso,
                updatedBy: actorName,
              };
              nextBantuanList.unshift(item);
              addedBantuanCount++;
            }
          });

          draft.warga = updatedWarga;
          draft.bantuan = nextBantuanList;
          const touched: MqttModuleTopic[] = [];
          if (addedKKCount > 0 || updatedKKCount > 0) touched.push('warga');
          if (addedBantuanCount > 0) touched.push('bantuan');
          return touched;
        },
        {
          user: currentUser,
          action: 'BULK_IMPORT_EXCEL',
          entityType: 'warga',
          entityId: `bulk_${baseTime}`,
          rtScope: currentUser?.rtScope || `RT ${fallbackRT}`,
          summary: `Import Excel: ${importedWarga.length} KK (${totalJiwa} jiwa) dan ${importedBantuan.length} bantuan`,
        }
      )
      .then((res) => {
        if (!isMountedRef.current) return;
        if (addedKKCount === 0 && updatedKKCount === 0 && addedBantuanCount === 0) {
          setRolloverNotice(
            'Tidak ada data baru untuk diimpor (seluruh KK & bantuan pada file sudah ada).'
          );
          setTimeout(() => setRolloverNotice(null), 5000);
          return;
        }
        if (res.synced) {
          flashWriteSuccess();
          setRolloverNotice(
            `Import Excel Berhasil & Tersinkron! ${addedKKCount} KK baru ditambahkan${updatedKKCount > 0 ? `, ${updatedKKCount} KK diperbarui` : ''} (${totalJiwa} jiwa)${addedBantuanCount > 0 ? ` beserta ${addedBantuanCount} data penerimaan bantuan` : ''}.`
          );
        } else {
          setRolloverNotice(
            `Data import Excel (${addedKKCount + updatedKKCount} KK) disimpan lokal dan menunggu koneksi untuk tersinkron otomatis ke cloud.`
          );
        }
        setTimeout(() => setRolloverNotice(null), 7000);
      });
  };

  // Toggle resident fee status
  const handleToggleWargaStatus = async (id: string) => {
    const fullStore = mqttSync.getStore();
    const target = fullStore.warga.find((w) => w.id === id);
    if (!target) return;
    const targetRt = getWargaRTCode(target, '');
    const perm = assertRtWriteAllowed(currentUser, targetRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const nextStatus: 'Sudah' | 'Belum' = target.statusIuran === 'Sudah' ? 'Belum' : 'Sudah';
    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.warga = draft.warga.map((w) => {
          if (w.id !== id) return w;
          return {
            ...w,
            statusIuran: nextStatus,
            statusIuranPerTahun: {
              ...(w.statusIuranPerTahun || {}),
              [tahunAktif]: nextStatus,
            },
            updatedAt: nowIso,
            updatedBy: actorName,
          };
        });
        return ['warga'];
      },
      {
        user: currentUser,
        action: 'TOGGLE_IURAN_STATUS',
        entityType: 'warga',
        entityId: id,
        rtScope: `RT ${targetRt}`,
        summary: `Mengubah status iuran ${target.nama} menjadi ${nextStatus}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Delete resident
  const handleDeleteWarga = async (id: string): Promise<ServerWriteResult> => {
    const fullStore = mqttSync.getStore();
    const target = fullStore.warga.find((w) => w.id === id);
    const targetRt = target ? getWargaRTCode(target, '') : '';
    const perm = assertRtWriteAllowed(currentUser, targetRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return {
        ok: false,
        terminal: true,
        errorCode: 'permission-denied',
        message: perm.message,
      };
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.warga = draft.warga.filter((w) => w.id !== id);
        mqttSync.addTombstone(draft, 'warga', id, nowIso, actorName);
        return ['warga', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_WARGA',
        entityType: 'warga',
        entityId: id,
        rtScope: targetRt ? `RT ${targetRt}` : undefined,
        summary: `Menghapus data warga/KK ${target?.nama || id}`,
      }
    );

    if (res.synced) {
      flashWriteSuccess();
      setRolloverNotice(`Data warga "${target?.nama || id}" berhasil dihapus dan tersinkron.`);
    } else {
      setRolloverNotice(
        `Penghapusan data warga "${target?.nama || id}" disimpan lokal dan menunggu koneksi cloud.`
      );
    }
    setTimeout(() => setRolloverNotice(null), 6000);

    return { ok: true, pending: !res.synced };
  };

  // Upgrade / Perbarui Data KK Warga (Atomic Relink Kas, Bantuan & Optional Santunan Kematian)
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
  }): Promise<ServerWriteResult> => {
    const fullStore = mqttSync.getStore();
    const existingWarga = fullStore.warga.find((w) => w.id === wargaId) || oldWarga;
    if (!existingWarga) {
      return {
        ok: false,
        terminal: true,
        errorCode: 'not-found',
        message: 'Data Kartu Keluarga yang dipilih tidak ditemukan.',
      };
    }

    const assignedAdminRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const oldRT = getWargaRTCode(
      existingWarga,
      assignedAdminRT || pengaturanKas.profilRT?.namaRT || '08'
    );
    const perm = assertRtWriteAllowed(currentUser, oldRT);
    if (!perm.ok) {
      setCloudError(perm.message);
      return {
        ok: false,
        terminal: true,
        errorCode: 'permission-denied',
        message: perm.message,
      };
    }

    const effectiveRT =
      currentUser?.role === 'server'
        ? normalizeRTCode(newKKData.rt) || oldRT
        : oldRT;
    const effectiveRW =
      currentUser?.role === 'server'
        ? newKKData.rw || existingWarga.rw || pengaturanKas.profilRT?.namaRW || '05'
        : existingWarga.rw || pengaturanKas.profilRT?.namaRW || '05';

    const oldNamaSafe = String(existingWarga.nama || '').trim();
    const oldNamaLower = oldNamaSafe.toLowerCase();
    const oldNoKKSafe = String(existingWarga.noKK || '').trim();

    const oldTxs = fullStore.transactions.filter((t) => {
      if (t.residentId && t.residentId === wargaId) return true;
      if (oldNoKKSafe && t.noKK && t.noKK === oldNoKKSafe) return true;
      const txSameScope =
        (!t.residentId || t.residentId === wargaId) &&
        (!oldNoKKSafe || !t.noKK || t.noKK === oldNoKKSafe) &&
        getTransactionRTCode(t, fullStore.warga, oldRT) === oldRT;
      return Boolean(
        oldNamaLower &&
          t.namaWarga &&
          String(t.namaWarga).trim().toLowerCase() === oldNamaLower &&
          txSameScope
      );
    });
    const totalKasDipindahkan = oldTxs.reduce((sum, t) => sum + (t.nominal || 0), 0);

    const oldAnggotaNames = (existingWarga.anggotaKeluarga || [])
      .map((a) => String(a.nama || '').trim().toLowerCase())
      .filter(Boolean);
    const newAnggotaNames = (newKKData.anggotaKeluarga || [])
      .map((a) => String(a.nama || '').trim().toLowerCase())
      .filter(Boolean);

    const anggotaKeluar = (existingWarga.anggotaKeluarga || [])
      .filter((a) => {
        const nm = String(a.nama || '').trim().toLowerCase();
        return nm && !newAnggotaNames.includes(nm);
      })
      .map((a) => `${a.nama} (${a.hubungan})`);

    const anggotaMasuk = (newKKData.anggotaKeluarga || [])
      .filter((a) => {
        const nm = String(a.nama || '').trim().toLowerCase();
        return nm && !oldAnggotaNames.includes(nm);
      })
      .map((a) => `${a.nama} (${a.hubungan})`);

    const riwayatBaru: RiwayatPerubahanKK = {
      id: 'rw_' + Date.now(),
      tanggal: new Date().toISOString().split('T')[0],
      alasan,
      keterangan: keterangan || 'Pembaruan data KK melalui fitur Upgrade KK',
      noKKLama: oldNoKKSafe,
      noKKBaru: newKKData.noKK,
      kepalaKeluargaLama: oldNamaSafe,
      kepalaKeluargaBaru: newKKData.nama,
      anggotaKeluar: anggotaKeluar.length > 0 ? anggotaKeluar : undefined,
      anggotaMasuk: anggotaMasuk.length > 0 ? anggotaMasuk : undefined,
      totalKasDipindahkan,
    };

    const newHeadMember = newKKData.anggotaKeluarga.find(
      (m) => m.hubungan === 'Kepala Keluarga'
    );
    const actorName = currentUser?.username || 'system';
    let savedWargaItem: Warga | undefined;

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const updatedWargaItem: Warga = {
          ...existingWarga,
          nama: newKKData.nama,
          noKK: newKKData.noKK,
          nik:
            newHeadMember?.nik && newHeadMember.nik.length === 16
              ? newHeadMember.nik
              : existingWarga.nik,
          rt: effectiveRT,
          rw: effectiveRW,
          alamat: newKKData.alamat || existingWarga.alamat,
          kodePos: newKKData.kodePos || existingWarga.kodePos,
          tanggalDikeluarkan: newKKData.tanggalDikeluarkan || existingWarga.tanggalDikeluarkan,
          jenisKelamin: newKKData.jenisKelamin || existingWarga.jenisKelamin,
          jumlahJiwa:
            newKKData.anggotaKeluarga.length > 0
              ? newKKData.anggotaKeluarga.length
              : existingWarga.jumlahJiwa,
          anggotaKeluarga: newKKData.anggotaKeluarga,
          riwayatPerubahanKK: [riwayatBaru, ...(existingWarga.riwayatPerubahanKK || [])],
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        savedWargaItem = updatedWargaItem;

        const allBeforeWarga = draft.warga;
        draft.warga = draft.warga.map((w) => (w.id === wargaId ? updatedWargaItem : w));

        let txChanged = false;
        draft.transactions = draft.transactions.map((t) => {
          const matchesId = Boolean(t.residentId && t.residentId === wargaId);
          const matchesKK = Boolean(oldNoKKSafe && t.noKK && t.noKK === oldNoKKSafe);
          const txNamaLower = String(t.namaWarga || '').trim().toLowerCase();
          const txSameScope =
            (!t.residentId || t.residentId === wargaId) &&
            (!oldNoKKSafe || !t.noKK || t.noKK === oldNoKKSafe) &&
            getTransactionRTCode(t, allBeforeWarga, oldRT) === oldRT;
          const matchesHeadName = Boolean(oldNamaLower && txNamaLower === oldNamaLower && txSameScope);

          if (matchesId || matchesKK || matchesHeadName) {
            txChanged = true;
            const baseKet = String(t.keterangan || '');
            const nextKet =
              oldNoKKSafe && oldNoKKSafe !== newKKData.noKK && !baseKet.includes('Dialihkan')
                ? `${baseKet ? baseKet + ' ' : ''}(Dialihkan dari KK lama: ${oldNoKKSafe})`
                : baseKet;
            return {
              ...t,
              residentId: wargaId,
              noKK: newKKData.noKK,
              namaWarga: matchesHeadName || !t.namaWarga ? newKKData.nama : t.namaWarga,
              rtScope: `RT ${effectiveRT} RW ${effectiveRW}`,
              keterangan: nextKet,
              updatedAt: nowIso,
              updatedBy: actorName,
            };
          }
          return t;
        });

        if (catatSantunanKematian) {
          txChanged = true;
          const santunanTx: Transaction = {
            id: toValidDocId(`tx_santunan_${Date.now()}`, 'tx'),
            tanggal: new Date().toISOString().split('T')[0],
            kategori: 'Santunan Kematian',
            keterangan: `Santunan duka warga${namaMeninggal ? ` (Alm/Almh. ${namaMeninggal})` : ''} - KK ${newKKData.nama}`,
            nominal: 200000,
            tipe: 'keluar',
            namaWarga: newKKData.nama,
            noKK: newKKData.noKK,
            residentId: wargaId,
            tahun: tahunAktif,
            rtScope: `RT ${effectiveRT} RW ${effectiveRW}`,
            updatedAt: nowIso,
            updatedBy: actorName,
          };
          draft.transactions = [santunanTx, ...draft.transactions];
        }

        let bantuanChanged = false;
        draft.bantuan = draft.bantuan.map((b) => {
          const matchesKK = Boolean(oldNoKKSafe && b.noKK && b.noKK === oldNoKKSafe);
          const bNamaLower = String(b.namaPenerima || '').trim().toLowerCase();
          const bantuanSameScope =
            (!oldNoKKSafe || !b.noKK || b.noKK === oldNoKKSafe) &&
            (!b.rtScope || normalizeRTCode(b.rtScope) === oldRT);
          const matchesHeadName = Boolean(oldNamaLower && bNamaLower === oldNamaLower && bantuanSameScope);

          if (matchesKK || matchesHeadName) {
            bantuanChanged = true;
            return {
              ...b,
              namaPenerima: matchesHeadName ? newKKData.nama : b.namaPenerima,
              noKK: newKKData.noKK,
              rtScope: `RT ${effectiveRT} RW ${effectiveRW}`,
              updatedAt: nowIso,
              updatedBy: actorName,
            };
          }
          return b;
        });

        const touched: MqttModuleTopic[] = ['warga'];
        if (txChanged) touched.push('transactions');
        if (bantuanChanged) touched.push('bantuan');
        return touched;
      },
      {
        user: currentUser,
        action: 'UPGRADE_KK',
        entityType: 'warga',
        entityId: wargaId,
        rtScope: `RT ${effectiveRT}`,
        summary: `Upgrade KK ${oldNamaSafe} -> ${newKKData.nama} (alasan: ${alasan}, ${oldTxs.length} transaksi dialihkan)`,
        notification: {
          title: `Pembaruan / Upgrade KK (RT ${effectiveRT})`,
          body: `Data KK ${oldNamaSafe} telah diperbarui ke ${newKKData.nama} dengan ${oldTxs.length} riwayat kas dipindahkan utuh.`,
          category: 'warga',
          entityType: 'warga',
          entityId: wargaId,
          targetRts: [effectiveRT],
          targetRoles: ['server', 'admin'],
          createdBy: actorName,
        },
      }
    );

    if (res.synced) flashWriteSuccess();

    setFloatingAnnouncement({
      id: 'upgrade_' + Date.now(),
      judul: res.synced ? 'Data KK Berhasil Diperbarui' : 'Upgrade KK Menunggu Sinkronisasi',
      isi: res.synced
        ? `Data KK atas nama ${oldNamaSafe} berhasil diperbarui menjadi ${newKKData.nama} (${newKKData.noKK}) dan tersinkron real-time. Seluruh riwayat kas (${oldTxs.length} transaksi senilai Rp ${totalKasDipindahkan.toLocaleString('id-ID')}) dialihkan utuh.`
        : `Perubahan KK ${oldNamaSafe} -> ${newKKData.nama} (${newKKData.noKK}) disimpan lokal dan akan tersinkron otomatis ke cloud.`,
      kategori: 'Umum',
      tanggal: new Date().toISOString().split('T')[0],
      tanggalBerakhir: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      penulis: 'Sistem Upgrade KK',
    });

    setIsUpgradeModalOpen(false);
    setUpgradeTargetWarga(null);
    return { ok: true, pending: !res.synced, warga: savedWargaItem };
  };

  // Create Announcement (Strict RT targeting + Cloud MQTT notification)
  const handleSavePengumuman = async (p: Omit<PengumumanRT, 'id'>) => {
    const perm = assertRtWriteAllowed(currentUser);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const assignedRT =
      currentUser?.role === 'admin' ? normalizeRTCode(currentUser.rtScope) : '';
    const rawTargets = Array.isArray(p.targetRts) ? p.targetRts : [];
    const normalizedTargets =
      currentUser?.role === 'admin' && assignedRT
        ? [assignedRT]
        : rawTargets.length > 0
        ? rawTargets.map((r) =>
            String(r).toUpperCase() === 'SEMUA' || String(r).toUpperCase() === 'ALL'
              ? 'SEMUA'
              : normalizeRTCode(r) || r
          )
        : ['SEMUA'];

    const newId = toValidDocId('p_' + Date.now(), 'p');
    const actorName = currentUser?.username || 'system';
    const resolvedRtScope =
      currentUser?.role === 'admin' && assignedRT
        ? `RT ${assignedRT} RW ${pengaturanKas.profilRT?.namaRW || '05'}`
        : normalizedTargets.includes('SEMUA')
        ? 'Semua RT RW 05'
        : normalizedTargets.map((rt) => `RT ${rt}`).join(', ');

    let createdPengumuman: PengumumanRT | undefined;
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const newP: PengumumanRT = {
          ...p,
          id: newId,
          targetRts: normalizedTargets,
          rtScope: resolvedRtScope,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        createdPengumuman = newP;
        draft.pengumuman = [newP, ...draft.pengumuman];
        return ['pengumuman'];
      },
      {
        user: currentUser,
        action: 'CREATE_PENGUMUMAN',
        entityType: 'pengumuman',
        entityId: newId,
        rtScope: resolvedRtScope,
        summary: `Menerbitkan pengumuman "${p.judul}" untuk target: ${normalizedTargets.join(', ')}`,
        notification: {
          title: `Warta Pengumuman: ${p.judul}`,
          body: p.isi,
          category: 'pengumuman',
          entityType: 'pengumuman',
          entityId: newId,
          targetRts: normalizedTargets,
          targetRoles: ['server', 'admin', 'warga'],
          createdBy: actorName,
        },
      }
    );

    if (createdPengumuman) {
      setFloatingAnnouncement(createdPengumuman);
    }
    if (res.synced) flashWriteSuccess();
  };

  // Delete Announcement
  const handleDeletePengumuman = async (id: string) => {
    const fullStore = mqttSync.getStore();
    const target = fullStore.pengumuman.find((p) => p.id === id);
    if (!target) return;
    if (!isSuperAdminUser(currentUser)) {
      const targetRt =
        Array.isArray(target.targetRts) && target.targetRts.length === 1
          ? normalizeRTCode(target.targetRts[0])
          : normalizeRTCode(target.rtScope || '');
      const isGlobal =
        (Array.isArray(target.targetRts) && target.targetRts.includes('SEMUA')) ||
        /semua/i.test(target.rtScope || '');
      if (isGlobal) {
        setCloudError('Hanya Super Admin RW 05 yang dapat menghapus pengumuman tingkat RW.');
        return;
      }
      const perm = assertRtWriteAllowed(currentUser, targetRt);
      if (!perm.ok) {
        setCloudError(perm.message);
        return;
      }
    }

    const actorName = currentUser?.username || 'system';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.pengumuman = draft.pengumuman.filter((p) => p.id !== id);
        mqttSync.addTombstone(draft, 'pengumuman', id, nowIso, actorName);
        return ['pengumuman', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_PENGUMUMAN',
        entityType: 'pengumuman',
        entityId: id,
        rtScope: target.rtScope,
        summary: `Menghapus pengumuman: ${target.judul}`,
      }
    );

    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, id])));
    if (floatingAnnouncement?.id === id) {
      setFloatingAnnouncement(null);
    }
    if (res.synced) flashWriteSuccess();
  };

  // Super Admin RW 05: Admin RT Accounts Management (Synced via MQTT)
  const handleAddAdminAccount = async (acc: Omit<AdminRTAccount, 'id'>) => {
    if (!isSuperAdminUser(currentUser)) {
      setCloudError('Hanya Super Admin RW 05 yang dapat menambah akun Admin RT.');
      return;
    }
    const newId = toValidDocId('adm_' + Date.now(), 'adm');
    const actorName = currentUser?.username || 'adminrw05';
    const rtCode = normalizeRTCode(acc.rt) || '08';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const newAcc: AdminRTAccount = {
          ...acc,
          id: newId,
          rt: acc.role === 'super_admin' ? 'ALL' : rtCode,
          rw: normalizeRWCode(acc.rw, '05'),
          role: acc.role || (rtCode === 'ALL' ? 'super_admin' : 'admin_rt'),
          rtId: formatRtId(acc.role === 'super_admin' ? 'ALL' : rtCode),
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        draft.accounts = [newAcc, ...draft.accounts];
        return ['accounts'];
      },
      {
        user: currentUser,
        action: 'ADD_ADMIN_ACCOUNT',
        entityType: 'accounts',
        entityId: newId,
        rtScope: `RT ${rtCode}`,
        summary: `Menambahkan akun Admin RT ${rtCode}: ${acc.username}`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleUpdateAdminAccount = async (id: string, updated: Partial<AdminRTAccount>) => {
    if (!isSuperAdminUser(currentUser)) {
      setCloudError('Hanya Super Admin RW 05 yang dapat mengubah akun pengurus.');
      return;
    }
    const actorName = currentUser?.username || 'adminrw05';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.accounts = draft.accounts.map((a) => {
          if (a.id !== id) return a;
          const nextRt = updated.rt !== undefined ? updated.rt : a.rt;
          const isSuper =
            updated.role === 'super_admin' ||
            a.role === 'super_admin' ||
            String(nextRt).toUpperCase() === 'ALL';
          const normalizedRt = isSuper ? 'ALL' : normalizeRTCode(nextRt) || a.rt;
          return {
            ...a,
            ...updated,
            rt: normalizedRt,
            role: isSuper ? 'super_admin' : 'admin_rt',
            rtId: isSuper ? 'ALL' : formatRtId(normalizedRt),
            updatedAt: nowIso,
            updatedBy: actorName,
          };
        });
        return ['accounts'];
      },
      {
        user: currentUser,
        action: 'UPDATE_ADMIN_ACCOUNT',
        entityType: 'accounts',
        entityId: id,
        summary: `Memperbarui akun pengurus (${id})`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  const handleDeleteAdminAccount = async (id: string) => {
    if (!isSuperAdminUser(currentUser)) {
      setCloudError('Hanya Super Admin RW 05 yang dapat menghapus akun Admin RT.');
      return;
    }
    const actorName = currentUser?.username || 'adminrw05';
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.accounts = draft.accounts.filter((a) => a.id !== id);
        mqttSync.addTombstone(draft, 'accounts', id, nowIso, actorName);
        return ['accounts', 'tombstones'];
      },
      {
        user: currentUser,
        action: 'DELETE_ADMIN_ACCOUNT',
        entityType: 'accounts',
        entityId: id,
        summary: `Menghapus akun pengurus (${id})`,
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Server: Update verification status of monthly submission
  const handleUpdateStatusLaporan = async (
    id: string,
    status: PembaruanBulananRT['statusVerifikasi']
  ) => {
    if (!isSuperAdminUser(currentUser)) {
      setCloudError('Hanya Super Admin RW 05 yang dapat memverifikasi laporan bulanan RT.');
      return;
    }
    const existing = mqttSync.getStore().laporan.find((lap) => lap.id === id);
    if (!existing) return;
    const actorName = currentUser?.username || 'adminrw05';
    const targetRt = normalizeRTCode(existing.rt);
    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.laporan = draft.laporan.map((lap) =>
          lap.id === id
            ? { ...lap, statusVerifikasi: status, updatedAt: nowIso, updatedBy: actorName }
            : lap
        );
        return ['laporan'];
      },
      {
        user: currentUser,
        action: 'VERIFY_LAPORAN_RT',
        entityType: 'laporan',
        entityId: id,
        rtScope: `RT ${targetRt}`,
        summary: `Mengubah status verifikasi laporan RT ${targetRt} (${existing.bulanTahun}) menjadi ${status}`,
        notification: {
          title: `Verifikasi Laporan RT ${targetRt}`,
          body: `Laporan periode ${existing.bulanTahun} berstatus: ${status}.`,
          category: 'laporan',
          entityType: 'laporan',
          entityId: id,
          targetRts: targetRt ? [targetRt] : ['SEMUA'],
          targetRoles: ['server', 'admin'],
          createdBy: actorName,
        },
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Admin RT: Send monthly update to RW 05
  const handleKirimLaporanBulanan = async (laporan: PembaruanBulananRT) => {
    const targetRt = normalizeRTCode(laporan.rt) || normalizeRTCode(currentUser?.rtScope) || '08';
    const perm = assertRtWriteAllowed(currentUser, targetRt);
    if (!perm.ok) {
      setCloudError(perm.message);
      return;
    }

    const lapId = toValidDocId(laporan.id || 'lap_' + Date.now(), 'lap');
    const nowLabel = formatWaktuSyncID();
    const actorName = currentUser?.username || 'system';

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        const stamped: PembaruanBulananRT = {
          ...laporan,
          id: lapId,
          rt: targetRt,
          updatedAt: nowIso,
          updatedBy: actorName,
        };
        draft.laporan = [stamped, ...draft.laporan];
        const touched: MqttModuleTopic[] = ['laporan'];
        if (currentUser?.role === 'admin') {
          let accUpdated = false;
          draft.accounts = draft.accounts.map((acc) => {
            if (acc.username.toLowerCase() === currentUser.username.toLowerCase()) {
              accUpdated = true;
              return {
                ...acc,
                terakhirSinkronisasi: `Tersinkron ${nowLabel}`,
                updatedAt: nowIso,
                updatedBy: actorName,
              };
            }
            return acc;
          });
          if (accUpdated) touched.push('accounts');
        }
        return touched;
      },
      {
        user: currentUser,
        action: 'KIRIM_LAPORAN_BULANAN',
        entityType: 'laporan',
        entityId: lapId,
        rtScope: `RT ${targetRt}`,
        summary: `Mengirim laporan rekap bulanan RT ${targetRt} (${laporan.bulanTahun})`,
        notification: {
          title: `Laporan Bulanan RT ${targetRt} Masuk`,
          body: `${laporan.namaAdminPengirim} mengirim laporan periode ${laporan.bulanTahun}.`,
          category: 'laporan',
          entityType: 'laporan',
          entityId: lapId,
          targetRts: ['SEMUA'],
          targetRoles: ['server'],
          createdBy: actorName,
        },
      }
    );
    if (res.synced) flashWriteSuccess();
  };

  // Restore entire database from backup JSON -> merges & publishes across MQTT
  const handleRestoreDatabase = async (dbData: AppDatabaseSchema) => {
    const actorName = currentUser?.username || 'system';
    const stampAll = <T extends { updatedAt?: string }>(list: T[] | undefined, nowIso: string): T[] =>
      Array.isArray(list) ? list.map((item) => ({ ...item, updatedAt: item.updatedAt || nowIso })) : [];

    const res = await mqttSync.mutate(
      (draft, nowIso) => {
        draft.warga = mergeModuleLists(draft.warga, stampAll(dbData.wargaList, nowIso));
        draft.transactions = mergeModuleLists(
          draft.transactions,
          stampAll(dbData.transactions, nowIso)
        );
        draft.bantuan = mergeModuleLists(draft.bantuan, stampAll(dbData.bantuanList, nowIso));
        draft.pengumuman = mergeModuleLists(
          draft.pengumuman,
          stampAll(dbData.pengumumanList, nowIso)
        );
        draft.dokumen = mergeModuleLists(draft.dokumen, stampAll(dbData.dokumenList, nowIso));
        draft.laporan = mergeModuleLists(
          draft.laporan,
          stampAll(dbData.laporanBulananRT, nowIso)
        );
        draft.accounts = mergeAccountsWithSeeds(
          draft.accounts,
          stampAll(dbData.adminAccounts, nowIso)
        );
        if (dbData.pengaturanKas) {
          draft.settings = {
            pengaturanKas: {
              ...DEFAULT_PENGATURAN_KAS,
              ...dbData.pengaturanKas,
              updatedAt: nowIso,
              updatedBy: actorName,
            },
            tahunAktif: dbData.tahunAktif || dbData.pengaturanKas.tahunAktif || tahunAktif,
            updatedAt: nowIso,
            updatedBy: actorName,
          };
        }
        return [
          'warga',
          'transactions',
          'bantuan',
          'pengumuman',
          'dokumen',
          'laporan',
          'accounts',
          'settings',
        ];
      },
      {
        user: currentUser,
        action: 'RESTORE_JSON_BACKUP',
        entityType: 'system',
        entityId: `restore_${Date.now()}`,
        rtScope: currentUser?.rtScope || 'SEMUA',
        summary: `Memulihkan cadangan JSON (${dbData.wargaList?.length || 0} KK, ${dbData.transactions?.length || 0} transaksi)`,
      }
    );

    if (res.synced) {
      flashWriteSuccess();
      setRolloverNotice(
        `Database berhasil dipulihkan & disinkronkan ke cloud (${dbData.wargaList?.length || 0} KK, ${dbData.transactions?.length || 0} transaksi)!`
      );
    } else {
      setRolloverNotice(
        `Cadangan JSON dipulihkan ke cache lokal (${dbData.wargaList?.length || 0} KK) dan menunggu sinkronisasi otomatis.`
      );
    }
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  // Handle Login
  const handleLoginSuccess = (user: AuthUser) => {
    setAuthReady(true);
    setCurrentUser(user);
    saveAuthSession(user);
    setIsLoginModalOpen(false);
    setIsPinLocked(false);
    setCloudError(null);
    setLastActivity(Date.now());
    applyScopedStoreToUI(mqttSync.getStore(), user);
    if (user.role === 'server') {
      setCurrentView('server-kontrol');
    } else if (user.role === 'warga') {
      setCurrentView('dasbor-warga');
    } else {
      setCurrentView('beranda');
    }
  };

  // Handle Explicit Logout -> clears active session while keeping cloud sync alive
  const handleLogout = async () => {
    if (successFlashTimerRef.current) {
      clearTimeout(successFlashTimerRef.current);
      successFlashTimerRef.current = null;
    }
    await logoutFromServer();
    setCurrentUser(null);
    setWargaList([]);
    setTransactions([]);
    setBantuanList([]);
    setPengumumanList([]);
    setDokumenList([]);
    setLaporanBulananRT([]);
    setNotifications([]);
    setUnreadCount(0);
    setIsNotificationOpen(false);
    setFloatingAnnouncement(null);
    setIsPinLocked(false);
    setIsSidebarOpen(false);
    setCloudError(null);
    setIsLoginModalOpen(true);
  };

  // Quick switch role helper (only triggered from inside Server control view)
  const handleSwitchToRole = (targetRole: 'server' | 'admin' | 'warga', targetRtScope?: string) => {
    const fullAccounts = mqttSync.getStore().accounts;
    if (targetRole === 'server') {
      const superAcc =
        fullAccounts.find((a) => a.role === 'super_admin' || a.rtId === 'ALL') ||
        fullAccounts[0];
      const nextUser: AuthUser = {
        role: 'server',
        username: superAcc?.username || 'adminrw05',
        nama: superAcc?.nama || 'Super Admin RW 05',
        rtScope: 'Semua RT',
        rtId: 'ALL',
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      saveAuthSession(nextUser);
      setCurrentView('server-kontrol');
    } else if (targetRole === 'admin') {
      const targetRTCode = normalizeRTCode(targetRtScope);
      const matchedAcc = targetRTCode
        ? fullAccounts.find((a) => normalizeRTCode(a.rt) === targetRTCode)
        : undefined;
      const rtStr =
        normalizeRTCode(matchedAcc?.rt) || targetRTCode || pengaturanKas.profilRT?.namaRT || '08';
      const rwStr = matchedAcc?.rw || pengaturanKas.profilRT?.namaRW || '05';
      const ketuaStr = matchedAcc?.nama || pengaturanKas.kontakKetuaRT?.nama?.trim();
      const nextUser: AuthUser = {
        role: 'admin',
        username: matchedAcc?.username || `adminrt${rtStr}`,
        nama: matchedAcc
          ? `${matchedAcc.nama} (${matchedAcc.jabatan || `Ketua RT ${rtStr}`})`
          : ketuaStr
          ? `${ketuaStr} (Ketua RT ${rtStr})`
          : `Admin RT ${rtStr} RW ${rwStr}`,
        rtScope: `RT ${rtStr} RW ${rwStr}`,
        rtId: `RT${rtStr}`,
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      saveAuthSession(nextUser);
      setCurrentView('beranda');
    } else {
      const sampleWarga = wargaList[0] || mqttSync.getStore().warga[0];
      const wRt = normalizeRTCode(sampleWarga?.rt) || '08';
      const wRw = sampleWarga?.rw || '05';
      const nextUser: AuthUser = {
        role: 'warga',
        username: sampleWarga?.nama || 'Warga',
        nama: sampleWarga?.nama || 'Warga',
        noKK: sampleWarga?.noKK || '',
        wargaId: sampleWarga?.id || '',
        rtScope: `RT ${wRt} RW ${wRw}`,
        rtId: `RT${wRt}`,
        isPinAuthenticated: true,
      };
      setCurrentUser(nextUser);
      saveAuthSession(nextUser);
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
    { id: 'kas-kematian', label: 'Kas Kematian Warga', icon: <Heart size={18} fill="currentColor" /> },
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

  // Wait briefly for Server Pusat session persistence recovery before showing login screen
  if (!authReady) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#063A27] via-[#0B5D3F] to-[#0F172A] text-white p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 backdrop-blur-xs shadow-lg mb-4">
          <HouseLogo size={46} variant="white" />
        </div>
        <h1 className="text-lg font-extrabold tracking-tight">Aplikasi Desa Kotayasa</h1>
        <p className="mt-1 text-xs text-emerald-200 flex items-center gap-2">
          <RefreshCw size={13} className="animate-spin" />
          Memulihkan sesi Database Server Pusat...
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
                  !serverConnected || syncStatus === 'error'
                    ? 'bg-rose-400'
                    : cloudSyncBusy ||
                      syncStatus === 'connecting' ||
                      syncStatus === 'pending' ||
                      pendingOpsCount > 0 ||
                      getPendingServerWriteCount() > 0
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              ></span>
              <span>
                {!serverConnected || syncStatus === 'error'
                  ? 'Mode Offline'
                  : cloudSyncBusy ||
                    syncStatus === 'connecting' ||
                    syncStatus === 'pending' ||
                    pendingOpsCount > 0 ||
                    getPendingServerWriteCount() > 0
                  ? 'Menyinkronkan...'
                  : 'Terhubung & Tersinkron'}
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
              title="Akun Admin belum terdaftar di Database Server Pusat. Klik untuk menyinkronkan akun & data."
            >
              <CloudUpload size={13} />
              <span>{adminSyncBusy ? 'Menyinkronkan Akun...' : 'Sinkron Akun ke Server'}</span>
            </button>
          )}

          {isAdminRT && dataLoadedReady && isCurrentAdminOnServer && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-400/15 px-2.5 py-1.5 text-[10px] text-emerald-100 border border-emerald-300/20">
              <span className="truncate font-semibold">Server Pusat: Live</span>
              <button
                type="button"
                onClick={() => handleSyncAdminAccountToServer()}
                disabled={adminSyncBusy}
                className="shrink-0 font-black text-emerald-300 hover:text-white ml-1 cursor-pointer disabled:opacity-50"
                title="Sinkronkan ulang akun & data ke Database Server Pusat"
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

            {/* Notification Center Bell Button */}
            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="relative flex items-center justify-center h-8 w-8 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer transition-all"
              title="Pusat Notifikasi & Pengingat Push"
              aria-label="Pusat Notifikasi"
            >
              <Bell size={15} className={unreadCount > 0 ? 'text-[#0B5D3F]' : 'text-slate-600'} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Central Server Connection Status Pill */}
            <button
              type="button"
              onClick={handleForceSyncNow}
              disabled={cloudSyncBusy}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-60 ${
                !serverConnected || syncStatus === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : cloudSyncBusy ||
                    syncStatus === 'connecting' ||
                    syncStatus === 'pending' ||
                    pendingOpsCount > 0 ||
                    getPendingServerWriteCount() > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
              title="Status Sinkronisasi Cloud Real-Time (Klik untuk sinkronkan ulang)"
            >
              {!serverConnected || syncStatus === 'error' ? (
                <AlertCircle size={13} />
              ) : cloudSyncBusy ||
                syncStatus === 'connecting' ||
                syncStatus === 'pending' ||
                pendingOpsCount > 0 ||
                getPendingServerWriteCount() > 0 ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : syncStatus === 'success' ? (
                <CheckCircle2 size={13} />
              ) : sseConnected ? (
                <Wifi size={13} />
              ) : (
                <Database size={13} />
              )}
              <span className="hidden xs:inline">
                {!serverConnected || syncStatus === 'error'
                  ? 'Mode Offline'
                  : cloudSyncBusy ||
                    syncStatus === 'connecting' ||
                    syncStatus === 'pending' ||
                    pendingOpsCount > 0 ||
                    getPendingServerWriteCount() > 0
                  ? 'Menyinkronkan...'
                  : 'Terhubung & Tersinkron'}
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

        {/* Retry Banner when local edits or legacy migration are queued for PostgreSQL Server */}
        {(syncStatus === 'pending' || hasPendingLocalMigration || pendingOpsCount > 0) &&
          dataLoadedReady && (
            <div className="bg-slate-800 text-amber-200 px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw size={14} className={cloudSyncBusy ? 'shrink-0 animate-spin' : 'shrink-0'} />
                <span className="truncate">
                  {hasPendingLocalMigration
                    ? 'Sebagian data lama perangkat ini belum selesai tersinkron ke Server Pusat (data lokal tetap aman).'
                    : `${pendingOpsCount || 1} perubahan menunggu disinkronkan ke Server Pusat (coba ulang otomatis aktif).`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleForceSyncNow}
                disabled={cloudSyncBusy}
                className="shrink-0 rounded-lg bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-extrabold hover:bg-amber-300 cursor-pointer disabled:opacity-60"
              >
                {cloudSyncBusy ? 'Menunggu Sinkronisasi' : 'Sinkronkan Ulang'}
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
                <Suspense fallback={<ViewSkeleton />}>
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
                  onOpenWargaModal={handleOpenNewWarga}
                  onEditWarga={handleOpenEditWarga}
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
                  activeRole={currentUser?.role}
                  targetRT={selectedServerRT}
                  onAddBantuan={handleAddBantuan}
                  onUpdateStatus={handleUpdateStatusBantuan}
                  onDeleteBantuan={handleDeleteBantuan}
                  onOpenImportExcel={handleOpenNewWarga}
                  onGoToDataWarga={() => setCurrentView('data-warga')}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'beranda' ? (
                <BerandaView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onNavigate={(view) => setCurrentView(view)}
                  onOpenTxModal={(type) => handleOpenNewTransaction(type || 'masuk')}
                  onOpenWargaModal={handleOpenNewWarga}
                  onOpenPengumumanModal={() => setIsPengumumanModalOpen(true)}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                />
              ) : currentView === 'kas-warga' ? (
                <KasWargaView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={(type) => handleOpenNewTransaction(type || 'masuk')}
                  onEditTransaction={handleOpenEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-masuk' ? (
                <KasMasukView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => handleOpenNewTransaction('masuk')}
                  onEditTransaction={handleOpenEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-keluar' ? (
                <KasKeluarView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => handleOpenNewTransaction('keluar')}
                  onEditTransaction={handleOpenEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'kas-kematian' ? (
                <KasKematianView
                  transactions={serverViewData.transactions}
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onOpenTxModal={() => handleOpenNewTransaction('kematian')}
                  onEditTransaction={handleOpenEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  onBack={() => setCurrentView('beranda')}
                />
              ) : currentView === 'status-iuran' ? (
                <StatusIuranView
                  wargaList={serverViewData.wargaList}
                  pengaturanKas={serverViewData.pengaturanKas}
                  onToggleStatus={handleToggleWargaStatus}
                  onOpenWargaModal={handleOpenNewWarga}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'pengumuman' ? (
                <PengumumanView
                  pengumumanList={activeAnnouncements}
                  isAdmin={true}
                  isServerRole={true}
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
                  onDownloadBackup={async () => {
                    const snap = await fetchServerSnapshot();
                    if (snap) downloadBackupJSON(snap);
                  }}
                  onRestoreDatabase={handleRestoreDatabase}
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
                    const actorName = currentUser?.username || 'warga';
                    const res = await mqttSync.mutate((draft, nowIso) => {
                      draft.warga = draft.warga.map((w) =>
                        w.id === targetWargaId
                          ? { ...w, pin, updatedAt: nowIso, updatedBy: actorName }
                          : w
                      );
                      return ['warga'];
                    });
                    if (res.synced) {
                      flashWriteSuccess();
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
                    onOpenTxModal={(type) => handleOpenNewTransaction(type || 'masuk')}
                    onOpenWargaModal={handleOpenNewWarga}
                    onOpenPengumumanModal={() => setIsPengumumanModalOpen(true)}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                  />
                )}

                {currentView === 'kas-warga' && (
                  <KasWargaView
                    transactions={transactions}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={(type) => handleOpenNewTransaction(type || 'masuk')}
                    onEditTransaction={handleOpenEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-masuk' && (
                  <KasMasukView
                    transactions={transactions}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => handleOpenNewTransaction('masuk')}
                    onEditTransaction={handleOpenEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-keluar' && (
                  <KasKeluarView
                    transactions={transactions}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => handleOpenNewTransaction('keluar')}
                    onEditTransaction={handleOpenEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kas-kematian' && (
                  <KasKematianView
                    transactions={transactions}
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onOpenTxModal={() => handleOpenNewTransaction('kematian')}
                    onEditTransaction={handleOpenEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onOpenSaldoAwalModal={() => setIsSaldoAwalModalOpen(true)}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'status-iuran' && (
                  <StatusIuranView
                    wargaList={wargaList}
                    pengaturanKas={pengaturanKas}
                    onToggleStatus={handleToggleWargaStatus}
                    onOpenWargaModal={handleOpenNewWarga}
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
                    onOpenWargaModal={handleOpenNewWarga}
                    onEditWarga={handleOpenEditWarga}
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
                    activeRole={currentUser?.role}
                    targetRT={
                      normalizeRTCode(currentUser?.rtScope) ||
                      normalizeRTCode(pengaturanKas.profilRT?.namaRT) ||
                      '08'
                    }
                    onAddBantuan={handleAddBantuan}
                    onUpdateStatus={handleUpdateStatusBantuan}
                    onDeleteBantuan={handleDeleteBantuan}
                    onOpenImportExcel={handleOpenNewWarga}
                    onGoToDataWarga={() => setCurrentView('data-warga')}
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
                    isServerRole={false}
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
                    onDownloadBackup={async () => {
                      const snap = await fetchServerSnapshot();
                      if (snap) downloadBackupJSON(snap);
                    }}
                    onRestoreDatabase={handleRestoreDatabase}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'kebijakan-privasi' && (
                  <KebijakanPrivasiView onBack={() => setCurrentView('beranda')} pengaturanKas={pengaturanKas} />
                )}
              </>
            )}
                </Suspense>
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
          onClose={() => {
            setIsTxModalOpen(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveTransaction}
          onUpdate={handleUpdateTransaction}
          editingTransaction={editingTransaction}
          defaultType={txModalType}
          pengaturanKas={isServer && selectedServerRT !== 'SEMUA' ? serverViewData.pengaturanKas : pengaturanKas}
          wargaList={isServer ? serverViewData.wargaList : wargaList}
          activeRole={currentUser?.role}
          targetRT={
            isServer
              ? selectedServerRT
              : normalizeRTCode(currentUser?.rtScope) || normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08'
          }
          onGoToDataWarga={() => {
            setIsTxModalOpen(false);
            setEditingTransaction(null);
            setCurrentView('data-warga');
          }}
        />
      )}

      {/* Resident (Warga) Modal with Bulk Excel Import, Add Manual & Edit KK (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <WargaModal
          isOpen={isWargaModalOpen}
          onClose={() => {
            setIsWargaModalOpen(false);
            setEditingWarga(null);
          }}
          onSave={handleSaveWarga}
          onUpdate={handleUpdateWarga}
          editingWarga={editingWarga}
          isServer={isServer}
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
          isServer={isServer}
          availableRTs={['01', '02', '03', '04', '05', '06', '07', '08']}
        />
      )}

      {/* Notification Center Modal (In-App + Web Push) */}
      <NotificationCenterModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={(id) => {
          const ids = readUserReadNotifIds(currentUser);
          ids.add(id);
          writeUserReadNotifIds(currentUser, ids);
          applyScopedStoreToUI(mqttSync.getStore(), currentUser);
        }}
        onMarkAllRead={() => {
          const ids = readUserReadNotifIds(currentUser);
          notifications.forEach((n) => ids.add(n.id));
          writeUserReadNotifIds(currentUser, ids);
          applyScopedStoreToUI(mqttSync.getStore(), currentUser);
        }}
      />

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
          wargaList={isServer ? serverViewData.wargaList : wargaList}
          transactions={isServer ? serverViewData.transactions : transactions}
          initialTargetWarga={upgradeTargetWarga}
          isServer={isServer}
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
                        shareOrSaveExcelFile(
                          excelDownloadNotice.blob,
                          excelDownloadNotice.filename
                        )
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
