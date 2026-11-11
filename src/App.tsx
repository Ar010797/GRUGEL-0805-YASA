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
  CloudCheck,
  Database,
  Building,
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
  loadAppData,
  saveAppData,
  clearAppData,
  AppDatabaseSchema,
} from './utils/cloudSync';

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
  // Authentication State (Role: 'server' | 'admin' | 'warga')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>({
    role: 'server',
    username: 'RW05GLEMPANG',
    nama: 'Super Admin Server RW 05 Glempang',
    rtScope: 'Semua RT se-RW 05 Glempang',
    isPinAuthenticated: true,
  });

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

  // Cloud Sync Notification indicator
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');

  // Navigation active tab
  const [currentView, setCurrentView] = useState<string>('server-kontrol');

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

  // Admin RT Accounts (Managed by Server Super Admin)
  const [adminAccounts, setAdminAccounts] = useState<AdminRTAccount[]>([
    {
      id: 'adm_rt08',
      username: 'Admin',
      passwordHash: 'rt08rw05',
      nama: 'Bpk. Suwardi (Ketua RT 08)',
      rt: '08',
      rw: '05',
      kontak: '0812-3456-7890',
      jabatan: 'Ketua RT 08 RW 05',
      status: 'aktif',
      terakhirLogin: 'Baru Dibuat',
      terakhirSinkronisasi: 'Belum ada',
    },
  ]);

  // Monthly Submissions sent by RT Admins to the Server (Siap Pakai - Bersih 0 Data)
  const [laporanBulananRT, setLaporanBulananRT] = useState<PembaruanBulananRT[]>([]);

  // Initial Data Load (Loads from Server or localStorage)
  const isLoadedRef = useRef(false);
  useEffect(() => {
    async function initData() {
      const defaultState: AppDatabaseSchema = {
        version: 2,
        lastUpdated: new Date().toISOString(),
        tahunAktif: 2026,
        pengaturanKas,
        wargaList: [],
        transactions: [],
        bantuanList: [],
        pengumumanList: [],
        dokumenList: [],
        adminAccounts,
        laporanBulananRT: [],
      };

      try {
        const loaded = await loadAppData(defaultState);
        if (loaded) {
          if (loaded.tahunAktif) setTahunAktif(loaded.tahunAktif);
          if (loaded.pengaturanKas) setPengaturanKas(loaded.pengaturanKas);
          setWargaList(Array.isArray(loaded.wargaList) ? loaded.wargaList : []);
          setTransactions(Array.isArray(loaded.transactions) ? loaded.transactions : []);
          setBantuanList(Array.isArray(loaded.bantuanList) ? loaded.bantuanList : []);
          setPengumumanList(Array.isArray(loaded.pengumumanList) ? loaded.pengumumanList : []);
          setDokumenList(Array.isArray(loaded.dokumenList) ? loaded.dokumenList : []);
          setAdminAccounts(Array.isArray(loaded.adminAccounts) && loaded.adminAccounts.length > 0 ? loaded.adminAccounts : adminAccounts);
          setLaporanBulananRT(Array.isArray(loaded.laporanBulananRT) ? loaded.laporanBulananRT : []);
        }
      } catch (err) {
        console.warn('Init data load notice:', err);
      } finally {
        isLoadedRef.current = true;
      }
    }

    initData();
  }, []);

  // Auto-Save when core states change
  useEffect(() => {
    if (!isLoadedRef.current) return;

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      const stateToPersist: AppDatabaseSchema = {
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
      };

      const ok = await saveAppData(stateToPersist);
      setSyncStatus(ok ? 'synced' : 'offline');
    }, 600);

    return () => clearTimeout(timer);
  }, [
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

  // Inactivity Auto-Logout Timer (5 Minutes)
  useEffect(() => {
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
  }, [lastActivity, isPinLocked]);

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
  const handleAddBantuan = (b: Omit<BantuanPemerintah, 'id'>) => {
    setBantuanList((prev) => [{ ...b, id: 'b' + Date.now() }, ...prev]);
  };

  const handleUpdateStatusBantuan = (id: string, newStatus: BantuanPemerintah['status']) => {
    setBantuanList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleDeleteBantuan = (id: string) => {
    setBantuanList((prev) => prev.filter((b) => b.id !== id));
  };

  // Handlers for PDF Documents
  const handleUploadDokumen = (doc: Omit<DokumenPdfWarga, 'id'>) => {
    setDokumenList((prev) => [{ ...doc, id: 'doc' + Date.now() }, ...prev]);
  };

  const handleDeleteDokumen = (id: string) => {
    setDokumenList((prev) => prev.filter((d) => d.id !== id));
  };

  // Sample data loader for demo
  const handleLoadSample = () => {
    setTransactions([
      { id: '1', tanggal: `${tahunAktif}-10-12`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan Periode Aktif', nominal: 250000, tipe: 'masuk', namaWarga: 'Ahmad Fauzi', tahun: tahunAktif },
      { id: '2', tanggal: `${tahunAktif}-10-10`, kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan & Kas Kematian', nominal: 350000, tipe: 'masuk', namaWarga: 'Siti Aminah', tahun: tahunAktif },
      { id: '3', tanggal: `${tahunAktif}-10-08`, kategori: 'Kas Kematian', keterangan: 'Pengadaan Kain Mori & Perlengkapan Jenazah', nominal: 200000, tipe: 'keluar', namaWarga: 'Bendahara Kas', tahun: tahunAktif },
    ]);
  };

  // Complete Reset: Wipes all residents, transactions, aid records, documents, announcements, and local/cloud storage
  const handleResetEmpty = async () => {
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
    }));

    // 2. Wipe persistent storage & backend
    await clearAppData();
    setRolloverNotice('Seluruh data berhasil direset dan dihapus secara tuntas dari perangkat dan server.');
    setTimeout(() => setRolloverNotice(null), 5000);
  };

  const handleUpdatePengaturan = (newSetting: Partial<PengaturanKas>) => {
    setPengaturanKas((prev) => ({ ...prev, ...newSetting }));
  };

  const handleSaveSaldoAwal = (
    kasUmum: number,
    kasKematian: number,
    keterangan: string,
    tanggal: string
  ) => {
    setPengaturanKas((prev) => ({
      ...prev,
      saldoAwalKasUmum: kasUmum,
      saldoAwalKasKematian: kasKematian,
      keteranganSaldoAwal: keterangan,
      tanggalSaldoAwal: tanggal,
    }));

    setTransactions((prev) => {
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
        });
      }

      return [...newSaldoTxs, ...nonSaldoAwal];
    });
  };

  // Add Transaction
  const handleSaveTransaction = (tx: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = {
      ...tx,
      id: Date.now().toString(),
      tahun: tahunAktif,
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  // Add Resident
  const handleSaveWarga = (w: Omit<Warga, 'id' | 'no'>) => {
    const newW: Warga = {
      ...w,
      id: Date.now().toString(),
      no: wargaList.length + 1,
      statusIuran: w.statusIuran || 'Belum',
      statusIuranPerTahun: { [tahunAktif]: w.statusIuran || 'Belum' },
    };
    setWargaList((prev) => [...prev, newW]);
  };

  // Toggle resident fee status
  const handleToggleWargaStatus = (id: string) => {
    setWargaList((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const nextStatus: 'Sudah' | 'Belum' = w.statusIuran === 'Sudah' ? 'Belum' : 'Sudah';
          const perTahun: Record<number, 'Sudah' | 'Belum'> = {
            ...(w.statusIuranPerTahun || {}),
            [tahunAktif]: nextStatus,
          };
          return {
            ...w,
            statusIuran: nextStatus,
            statusIuranPerTahun: perTahun,
          };
        }
        return w;
      })
    );
  };

  // Delete resident
  const handleDeleteWarga = (id: string) => {
    setWargaList((prev) => prev.filter((w) => w.id !== id));
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
      keterangan: keterangan || 'Pembaruan data KK melalui scan otomatis',
      noKKLama: oldWarga.noKK,
      noKKBaru: newKKData.noKK,
      kepalaKeluargaLama: oldWarga.nama,
      kepalaKeluargaBaru: newKKData.nama,
      anggotaKeluar: anggotaKeluar.length > 0 ? anggotaKeluar : undefined,
      anggotaMasuk: anggotaMasuk.length > 0 ? anggotaMasuk : undefined,
      totalKasDipindahkan,
    };

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
  const handleSavePengumuman = (p: Omit<PengumumanRT, 'id'>) => {
    const newP: PengumumanRT = {
      ...p,
      id: 'p' + Date.now(),
    };
    setPengumumanList((prev) => [newP, ...prev]);
    setFloatingAnnouncement(newP);
  };

  // Delete Announcement (Permanently records id as dismissed so it NEVER reappears)
  const handleDeletePengumuman = (id: string) => {
    setPengumumanList((prev) => prev.filter((p) => p.id !== id));
    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, id])));
    if (floatingAnnouncement?.id === id) {
      setFloatingAnnouncement(null);
    }
  };

  // Server: Admin RT Accounts Management
  const handleAddAdminAccount = (acc: Omit<AdminRTAccount, 'id'>) => {
    const newAcc: AdminRTAccount = {
      ...acc,
      id: 'adm_' + Date.now(),
    };
    setAdminAccounts((prev) => [newAcc, ...prev]);
  };

  const handleUpdateAdminAccount = (id: string, updated: Partial<AdminRTAccount>) => {
    setAdminAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
    );
  };

  const handleDeleteAdminAccount = (id: string) => {
    setAdminAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // Server: Update verification status of monthly submission
  const handleUpdateStatusLaporan = (id: string, status: PembaruanBulananRT['statusVerifikasi']) => {
    setLaporanBulananRT((prev) =>
      prev.map((lap) => (lap.id === id ? { ...lap, statusVerifikasi: status } : lap))
    );
  };

  // Admin RT: Send monthly update to Server
  const handleKirimLaporanBulanan = (laporan: PembaruanBulananRT) => {
    setLaporanBulananRT((prev) => [laporan, ...prev]);
  };

  // Restore entire database from backup JSON
  const handleRestoreDatabase = (db: AppDatabaseSchema) => {
    if (db.tahunAktif) setTahunAktif(db.tahunAktif);
    if (db.pengaturanKas) setPengaturanKas(db.pengaturanKas);
    if (db.wargaList) setWargaList(db.wargaList);
    if (db.transactions) setTransactions(db.transactions);
    if (db.bantuanList) setBantuanList(db.bantuanList);
    if (db.pengumumanList) setPengumumanList(db.pengumumanList);
    if (db.dokumenList) setDokumenList(db.dokumenList);
    if (db.adminAccounts) setAdminAccounts(db.adminAccounts);
    if (db.laporanBulananRT) setLaporanBulananRT(db.laporanBulananRT);
    setRolloverNotice('Database berhasil dipulihkan dari cadangan JSON!');
    setTimeout(() => setRolloverNotice(null), 4000);
  };

  // Handle Login
  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    if (user.role === 'server') {
      setCurrentView('server-kontrol');
    } else if (user.role === 'warga') {
      setCurrentView('dasbor-warga');
    } else {
      setCurrentView('beranda');
    }
  };

  // Quick switch role buttons for easy testing
  const handleSwitchToRole = (targetRole: 'server' | 'admin' | 'warga') => {
    if (targetRole === 'server') {
      setCurrentUser({
        role: 'server',
        username: 'RW05GLEMPANG',
        nama: 'Super Admin Server RW 05 Glempang',
        rtScope: 'Semua RT se-RW 05 Glempang',
        isPinAuthenticated: true,
      });
      setCurrentView('server-kontrol');
    } else if (targetRole === 'admin') {
      setCurrentUser({
        role: 'admin',
        username: 'Admin',
        nama: 'Administrator RT 08 RW 05',
        rtScope: 'RT 08 RW 05',
        isPinAuthenticated: true,
      });
      setCurrentView('beranda');
    } else {
      setCurrentUser({
        role: 'warga',
        username: 'Budi Santoso',
        nama: 'Budi Santoso',
        noKK: '3302140508000003',
        wargaId: 'w3',
        rtScope: 'RT 08 RW 05',
        isPinAuthenticated: true,
      });
      setCurrentView('dasbor-warga');
    }
  };

  const isServer = currentUser?.role === 'server';
  const isAdminRT = currentUser?.role === 'admin';
  const isWarga = currentUser?.role === 'warga';

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
    { id: 'beranda', label: 'Lihat Kas RT 08', icon: <LayoutDashboard size={18} /> },
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
    { id: 'data-warga', label: 'Data Warga (KK OCR)', icon: <Users size={18} /> },
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
          {/* Cloud persistence indicator */}
          <div className="flex items-center justify-between text-[10px] text-white/70 px-1">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-400' : syncStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span>{syncStatus === 'synced' ? 'Tersimpan di Cloud' : syncStatus === 'saving' ? 'Menyimpan...' : 'Offline'}</span>
            </span>
            <span className="font-mono text-white/50">v2.0</span>
          </div>

          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 text-xs font-bold text-white transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Ganti Akun / Keluar</span>
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
                  {currentNavItems.find((n) => n.id === currentView)?.label || 'Aplikasi Desa Kotayasa'}
                </h2>
                {isServer && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                    <Server size={10} /> SERVER PUSAT
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Desa Kotayasa &bull; {currentUser?.nama} ({currentUser?.rtScope || 'RT 08'})
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
                  onAddAdminAccount={handleAddAdminAccount}
                  onUpdateAdminAccount={handleUpdateAdminAccount}
                  onDeleteAdminAccount={handleDeleteAdminAccount}
                  onUpdateStatusLaporan={handleUpdateStatusLaporan}
                  onRestoreDatabase={handleRestoreDatabase}
                  onSwitchToRTAdmin={(rtScope) => {
                    handleSwitchToRole('admin');
                  }}
                />
              ) : currentView === 'data-warga' ? (
                <DataWargaView
                  wargaList={wargaList}
                  bantuanList={bantuanList}
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
                  onAddBantuan={handleAddBantuan}
                  onUpdateStatus={handleUpdateStatusBantuan}
                  onDeleteBantuan={handleDeleteBantuan}
                  onBack={() => setCurrentView('server-kontrol')}
                />
              ) : currentView === 'beranda' ? (
                <BerandaView
                  transactions={transactions}
                  wargaList={wargaList}
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
                <KebijakanPrivasiView onBack={() => setCurrentView('server-kontrol')} />
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
                  onUpdatePin={(pin) => setCurrentPin(pin)}
                  onUpdatePengaturan={handleUpdatePengaturan}
                  onOpenSaldoAwalModal={() => {}}
                  onOpenPrivacyPolicy={() => setCurrentView('kebijakan-privasi')}
                  onResetEmpty={() => {}}
                  onLoadSample={() => {}}
                  onBack={() => setCurrentView('dasbor-warga')}
                />
              ) : currentView === 'kebijakan-privasi' ? (
                <KebijakanPrivasiView onBack={() => setCurrentView('dasbor-warga')} />
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
                    onAddBantuan={handleAddBantuan}
                    onUpdateStatus={handleUpdateStatusBantuan}
                    onDeleteBantuan={handleDeleteBantuan}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'dokumen-pdf' && (
                  <DokumenPdfWargaView
                    dokumenList={dokumenList}
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
                  <KebijakanPrivasiView onBack={() => setCurrentView('beranda')} />
                )}
              </>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        wargaList={wargaList}
        adminAccounts={adminAccounts}
        onOpenLupaPassword={() => setIsLupaPasswordOpen(true)}
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
        />
      )}

      {/* Resident (Warga) Modal with OCR / Photo KK (Admin & Server) */}
      {(isAdminRT || isServer) && (
        <WargaModal
          isOpen={isWargaModalOpen}
          onClose={() => setIsWargaModalOpen(false)}
          onSave={handleSaveWarga}
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

      {/* Upgrade Data KK Modal (Scan KK Baru, Pindah Kas Utuh, Deteksi Anggota Meninggal/Pisah KK) */}
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
    </div>
  );
}
