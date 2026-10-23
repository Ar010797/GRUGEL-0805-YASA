import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

import { HouseLogo, LeafIcon } from './components/HouseLogo';
import { TransactionModal } from './components/TransactionModal';
import { WargaModal } from './components/WargaModal';
import { LoginModal } from './components/LoginModal';
import { PengumumanModal } from './components/PengumumanModal';
import { SaldoAwalModal } from './components/SaldoAwalModal';
import { PinLockModal } from './components/PinLockModal';
import { LupaPasswordModal } from './components/LupaPasswordModal';
import { FloatingNotification } from './components/FloatingNotification';
import {
  AuthUser,
  Transaction,
  Warga,
  PengumumanRT,
  PengaturanKas,
  BantuanPemerintah,
  DokumenPdfWarga,
} from './types';
import { isPengumumanExpired } from './utils/security';

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

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>({
    role: 'admin',
    username: 'Admin',
    nama: 'Administrator RT 08 RW 05',
    isPinAuthenticated: true,
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isLupaPasswordOpen, setIsLupaPasswordOpen] = useState<boolean>(false);

  // App Lock (6 Digit PIN)
  const [currentPin, setCurrentPin] = useState<string>('123456');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(false);

  // Inactivity Auto-Logout (5 Minutes = 300,000 ms)
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [inactivityNotice, setInactivityNotice] = useState<boolean>(false);

  useEffect(() => {
    const recordActivity = () => setLastActivity(Date.now());
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, recordActivity));

    const checkInterval = setInterval(() => {
      // 5 minutes inactivity
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

  // Navigation active tab
  const [currentView, setCurrentView] = useState<string>('beranda');

  // Mobile sidebar open state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [txModalType, setTxModalType] = useState<'masuk' | 'keluar' | 'kematian'>('masuk');
  const [isWargaModalOpen, setIsWargaModalOpen] = useState<boolean>(false);
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
  });

  // Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Registered Residents (with 16 digit No KK & full family members)
  const [wargaList, setWargaList] = useState<Warga[]>([
    {
      id: 'w1',
      no: 1,
      nama: 'Ahmad Fauzi',
      noKK: '3302140508000001',
      noRumah: '01',
      rt: '08',
      rw: '05',
      alamat: 'Jalan Kenanga No. 01, RT 08 RW 05 Desa Kotayasa',
      jenisKelamin: 'Laki-laki',
      jumlahJiwa: 4,
      statusIuran: 'Sudah',
      anggotaKeluarga: [
        { nik: '3302141503790001', nama: 'Ahmad Fauzi', hubungan: 'Kepala Keluarga', tempatLahir: 'Banyumas', tanggalLahir: '1979-03-15', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'PNS', statusPerkawinan: 'Kawin' },
        { nik: '3302144806820002', nama: 'Wahyuni Ningsih', hubungan: 'Istri', tempatLahir: 'Purwokerto', tanggalLahir: '1982-06-08', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Guru', statusPerkawinan: 'Kawin' },
        { nik: '3302141010070003', nama: 'Fajar Nugraha', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2007-10-10', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'Pelajar', statusPerkawinan: 'Belum Kawin' },
        { nik: '3302145504120004', nama: 'Annisa Fitri', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2012-04-15', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Pelajar', statusPerkawinan: 'Belum Kawin' },
      ],
    },
    {
      id: 'w2',
      no: 2,
      nama: 'Siti Aminah',
      noKK: '3302140508000002',
      noRumah: '02',
      rt: '08',
      rw: '05',
      alamat: 'Jalan Kenanga No. 02, RT 08 RW 05 Desa Kotayasa',
      jenisKelamin: 'Perempuan',
      jumlahJiwa: 3,
      statusIuran: 'Sudah',
      anggotaKeluarga: [
        { nik: '3302145009750001', nama: 'Siti Aminah', hubungan: 'Kepala Keluarga', tempatLahir: 'Banyumas', tanggalLahir: '1975-09-10', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Pedagang', statusPerkawinan: 'Janda' },
        { nik: '3302141208030002', nama: 'Dimas Aditya', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2003-08-12', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'Mahasiswa', statusPerkawinan: 'Belum Kawin' },
        { nik: '3302146102090003', nama: 'Laras Sekar', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2009-02-21', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Pelajar', statusPerkawinan: 'Belum Kawin' },
      ],
    },
    {
      id: 'w3',
      no: 3,
      nama: 'Budi Santoso',
      noKK: '3302140508000003',
      noRumah: '03',
      rt: '08',
      rw: '05',
      alamat: 'Jalan Flamboyan No. 03, RT 08 RW 05 Desa Kotayasa',
      jenisKelamin: 'Laki-laki',
      jumlahJiwa: 5,
      statusIuran: 'Belum',
      anggotaKeluarga: [
        { nik: '3302142207800001', nama: 'Budi Santoso', hubungan: 'Kepala Keluarga', tempatLahir: 'Banyumas', tanggalLahir: '1980-07-22', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'Wiraswasta', statusPerkawinan: 'Kawin' },
        { nik: '3302145311840002', nama: 'Dewi Sartika', hubungan: 'Istri', tempatLahir: 'Banyumas', tanggalLahir: '1984-11-13', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Ibu Rumah Tangga', statusPerkawinan: 'Kawin' },
        { nik: '3302141505080003', nama: 'Bagus Pratama', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2008-05-15', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'Pelajar', statusPerkawinan: 'Belum Kawin' },
        { nik: '3302146409130004', nama: 'Salma Putri', hubungan: 'Anak', tempatLahir: 'Banyumas', tanggalLahir: '2013-09-24', jenisKelamin: 'Perempuan', agama: 'Islam', pekerjaan: 'Pelajar', statusPerkawinan: 'Belum Kawin' },
        { nik: '3302141804550005', nama: 'Mbah Karyo', hubungan: 'Orang Tua', tempatLahir: 'Banyumas', tanggalLahir: '1955-04-18', jenisKelamin: 'Laki-laki', agama: 'Islam', pekerjaan: 'Pensiunan', statusPerkawinan: 'Kawin' },
      ],
    },
    {
      id: 'w4',
      no: 4,
      nama: 'Rina Lestari',
      noKK: '3302140508000004',
      noRumah: '04',
      rt: '08',
      rw: '05',
      alamat: 'Jalan Flamboyan No. 04, RT 08 RW 05 Desa Kotayasa',
      jenisKelamin: 'Perempuan',
      jumlahJiwa: 2,
      statusIuran: 'Sudah',
    },
    {
      id: 'w5',
      no: 5,
      nama: 'Agus Setiawan',
      noKK: '3302140508000005',
      noRumah: '05',
      rt: '08',
      rw: '05',
      alamat: 'Jalan Mawar No. 05, RT 08 RW 05 Desa Kotayasa',
      jenisKelamin: 'Laki-laki',
      jumlahJiwa: 4,
      statusIuran: 'Belum',
    },
  ]);

  // Announcements from RT (each has a tanggalBerakhir / expiry date)
  const [pengumumanList, setPengumumanList] = useState<PengumumanRT[]>([
    {
      id: 'p1',
      judul: 'Kerja Bakti Lingkungan & Pembersihan Saluran Air',
      tanggal: '18 Okt 2026',
      tanggalBerakhir: '2026-11-20',
      kategori: 'Kegiatan',
      isi: 'Diberitahukan kepada seluruh warga RT 08 RW 05, kerja bakti massal akan dilaksanakan pada hari Minggu pagi pukul 07.00 WIB. Titik kumpul di depan pos kamling RT 08. Mohon membawa cangkul/sabit.',
      penulis: 'Ketua RT 08 (Bpk. Suwardi)',
      penting: true,
      tentang: 'Kerja Bakti Massal & Pembersihan Saluran Air',
      hariTanggalAcara: 'Minggu, 25 Oktober 2026',
      waktuAcara: '07.00 WIB s/d selesai',
      tempatAcara: 'Pos Kamling RT 08',
    },
    {
      id: 'p2',
      judul: 'Penarikan Iuran Kas & Kas Kematian (Kain Mori)',
      tanggal: '10 Okt 2026',
      tanggalBerakhir: '2026-11-30',
      kategori: 'Iuran',
      isi: 'Penarikan iuran jimpitan RT sebesar Rp 25.000 dan kas kematian Rp 10.000 (total Rp 35.000) mulai dikoordinasikan. Pembayaran dapat diserahkan langsung ke Bendahara atau melalui transfer kas.',
      penulis: 'Bendahara (Bpk. Bambang S.)',
      tentang: 'Penarikan Iuran Kas RT & Kas Kematian',
      hariTanggalAcara: '10 - 25 Setiap Bulan',
      waktuAcara: '19.30 - 21.00 WIB',
      tempatAcara: 'Rumah Bendahara RT 08',
    },
  ]);

  // Active announcements (filtered by expiration date)
  const activeAnnouncements = pengumumanList.filter((p) => !isPengumumanExpired(p.tanggalBerakhir));

  // Read notifications memory (floating alert will dismiss and NEVER show again once clicked/closed)
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [floatingAnnouncement, setFloatingAnnouncement] = useState<PengumumanRT | null>(null);

  useEffect(() => {
    // Show newest unread announcement if available
    const unread = activeAnnouncements.find((p) => !readNotificationIds.includes(p.id));
    if (unread && !floatingAnnouncement) {
      setFloatingAnnouncement(unread);
    }
  }, [activeAnnouncements, readNotificationIds]);

  const handleDismissFloating = (idToDismiss?: string) => {
    const id = idToDismiss || floatingAnnouncement?.id;
    if (id) {
      setReadNotificationIds((prev) => Array.from(new Set([...prev, id])));
    }
    setFloatingAnnouncement(null);
  };

  // Government Aid Data (KHUSUS ADMIN - 100% Tersembunyi dari Warga)
  const [bantuanList, setBantuanList] = useState<BantuanPemerintah[]>([
    {
      id: 'b1',
      jenisBantuan: 'BPNT',
      namaPenerima: 'Budi Santoso',
      noKK: '3302140508000003',
      nominalAtauBarang: 'Rp 600.000 / Tahap',
      tanggal: '2026-10-15',
      status: 'Sudah Disalurkan',
      sumberDana: 'Kemensos RI',
      keterangan: 'Penyaluran sembako & pangan non tunai via Bank Himbara',
    },
    {
      id: 'b2',
      jenisBantuan: 'Sembako Beras',
      namaPenerima: 'Agus Setiawan',
      noKK: '3302140508000005',
      nominalAtauBarang: 'Beras Bulog 10 Kg + Minyak 2L',
      tanggal: '2026-10-18',
      status: 'Sudah Disalurkan',
      sumberDana: 'Cadangan Pangan Desa Kotayasa',
      keterangan: 'Penyaluran langsung di Balai Desa Kotayasa',
    },
  ]);

  // Document PDF Archive (KHUSUS ADMIN - 100% Tersembunyi dari Warga)
  const [dokumenList, setDokumenList] = useState<DokumenPdfWarga[]>([
    {
      id: 'doc1',
      judul: 'Rekapitulasi Data Sensus Kependudukan RT 08 RW 05 Tahun 2026',
      namaFile: 'Data_Sensus_Warga_RT08_RW05_2026.pdf',
      ukuranKb: 342,
      tanggalUpload: '2026-10-01',
      kategori: 'Data Sensus Warga RT',
      keterangan: 'Pemutakhiran data sensus door-to-door pengurus RT',
    },
  ]);

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

  // Sample data loader for optional simulation demo
  const handleLoadSample = () => {
    setTransactions([
      { id: '1', tanggal: '2026-10-12', kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan Periode Aktif', nominal: 250000, tipe: 'masuk', namaWarga: 'Ahmad Fauzi' },
      { id: '2', tanggal: '2026-10-10', kategori: 'Iuran Warga', keterangan: 'Iuran Jimpitan & Kas Kematian', nominal: 350000, tipe: 'masuk', namaWarga: 'Siti Aminah' },
      { id: '3', tanggal: '2026-10-08', kategori: 'Kas Kematian', keterangan: 'Pengadaan Kain Mori & Perlengkapan Jenazah', nominal: 200000, tipe: 'keluar', namaWarga: 'Bendahara Kas' },
    ]);
  };

  const handleResetEmpty = () => {
    setTransactions([]);
    setPengaturanKas((prev) => ({
      ...prev,
      saldoAwalKasUmum: 0,
      saldoAwalKasKematian: 0,
    }));
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
          tanggal: tanggal || '2026-01-01',
          kategori: 'Saldo Awal / Pindahan Kas Lalu',
          keterangan: `Saldo Kas Umum Masa Lalu: ${keterangan}`,
          nominal: kasUmum,
          tipe: 'masuk',
          namaWarga: 'Pindahan Kas Masa Lalu',
          isSaldoAwal: true,
        });
      }

      if (kasKematian > 0) {
        newSaldoTxs.push({
          id: 'saldo-awal-kematian-' + Date.now(),
          tanggal: tanggal || '2026-01-01',
          kategori: 'Kas Kematian',
          keterangan: `Saldo Kas Kematian Masa Lalu: ${keterangan}`,
          nominal: kasKematian,
          tipe: 'kematian',
          namaWarga: 'Pindahan Kas Kematian Lalu',
          isSaldoAwal: true,
        });
      }

      return [...newSaldoTxs, ...nonSaldoAwal];
    });
  };

  // Add Transaction (Admin only)
  const handleSaveTransaction = (tx: Omit<Transaction, 'id'>) => {
    const newTx: Transaction = {
      ...tx,
      id: Date.now().toString(),
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  // Add Resident (Admin only - supports OCR and Manual)
  const handleSaveWarga = (w: Omit<Warga, 'id' | 'no'>) => {
    const newW: Warga = {
      ...w,
      id: Date.now().toString(),
      no: wargaList.length + 1,
    };
    setWargaList((prev) => [...prev, newW]);
  };

  // Toggle resident fee status (Admin only)
  const handleToggleWargaStatus = (id: string) => {
    setWargaList((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, statusIuran: w.statusIuran === 'Sudah' ? 'Belum' : 'Sudah' }
          : w
      )
    );
  };

  // Delete resident (Admin only)
  const handleDeleteWarga = (id: string) => {
    setWargaList((prev) => prev.filter((w) => w.id !== id));
  };

  // Create Announcement (Admin only)
  const handleSavePengumuman = (p: Omit<PengumumanRT, 'id'>) => {
    const newP: PengumumanRT = {
      ...p,
      id: 'p' + Date.now(),
    };
    setPengumumanList((prev) => [newP, ...prev]);
    // Pop floating notification with sound!
    setFloatingAnnouncement(newP);
  };

  // Handle Login
  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    if (user.role === 'warga') {
      setCurrentView('dasbor-warga');
    } else {
      setCurrentView('beranda');
    }
  };

  // Quick switch between Admin and Resident for convenience
  const handleSwitchToWarga = () => {
    setCurrentUser({
      role: 'warga',
      username: 'Budi Santoso',
      nama: 'Budi Santoso',
      noKK: '3302140508000003',
      wargaId: 'w3',
      isPinAuthenticated: true,
    });
    setCurrentView('dasbor-warga');
  };

  const handleSwitchToAdmin = () => {
    setCurrentUser({
      role: 'admin',
      username: 'Admin',
      nama: 'Administrator RT 08 RW 05',
      isPinAuthenticated: true,
    });
    setCurrentView('beranda');
  };

  const isAdmin = currentUser?.role === 'admin';

  interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }

  // Strict Navigation Items based on Role
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

  const currentNavItems: NavItem[] = isAdmin ? adminNavItems : wargaNavItems;

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
      />

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col justify-between bg-gradient-to-b from-[#094A32] via-[#0B5D3F] to-[#073F2B] p-5 text-white shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto no-scrollbar">
          {/* Header Brand */}
          <div className="flex items-center justify-between border-b border-emerald-800/80 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 p-1.5 backdrop-blur-xs shadow-inner">
                <HouseLogo size={34} variant="white" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">
                  RT 08 RW 05
                </h1>
                <p className="text-xs font-semibold text-emerald-200">
                  Desa Kotayasa
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
                {isAdmin ? 'Akun Pengurus / Admin' : 'Akun Warga RT'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                  isAdmin
                    ? 'bg-amber-400/90 text-slate-900'
                    : 'bg-emerald-300/90 text-emerald-950'
                }`}
              >
                {isAdmin ? 'ADMIN' : 'WARGA'}
              </span>
            </div>
            <p className="text-sm font-bold truncate text-white">
              {currentUser?.nama || 'Tamu'}
            </p>
            {currentUser?.noKK && (
              <p className="text-[10px] font-mono text-emerald-200 mt-0.5">
                KK: {currentUser.noKK}
              </p>
            )}

            {/* Quick Switch Button */}
            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
              <button
                onClick={isAdmin ? handleSwitchToWarga : handleSwitchToAdmin}
                className="text-[11px] font-semibold text-emerald-200 hover:text-white underline cursor-pointer"
              >
                {isAdmin ? 'Uji Mode Warga &rarr;' : 'Uji Mode Admin &rarr;'}
              </button>
              <button
                onClick={() => setIsPinLocked(true)}
                className="flex items-center gap-1 text-[10px] font-bold text-emerald-200 hover:text-white cursor-pointer"
                title="Kunci Aplikasi Sekarang"
              >
                <Lock size={11} />
                <span>Kunci PIN</span>
              </button>
            </div>
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
                      ? 'bg-white text-[#0B5D3F] shadow-sm'
                      : 'text-emerald-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-[#0B5D3F]' : 'text-emerald-300'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="rounded-md bg-rose-500/80 px-1.5 py-0.5 text-[9px] font-black text-white uppercase">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-emerald-800/80 pt-4">
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                {currentNavItems.find((n) => n.id === currentView)?.label || 'Aplikasi Kas Warga'}
              </h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                RT 08 RW 05 Desa Kotayasa &bull; {isAdmin ? 'Mode Pengurus RT' : 'Mode Warga Pribadi'}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {/* Lock PIN button */}
            <button
              onClick={() => setIsPinLocked(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              title="Kunci Layar (PIN 6 Digit)"
            >
              <Lock size={14} className="text-[#0B5D3F]" />
              <span className="hidden sm:inline">Kunci PIN</span>
            </button>

            {/* Admin only: Buat Pengumuman */}
            {isAdmin && (
              <button
                onClick={() => setIsPengumumanModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Buat Pengumuman Resmi & WA"
              >
                <Megaphone size={14} />
                <span className="hidden sm:inline">Pengumuman & WA</span>
              </button>
            )}

            {/* Admin only: Catat Kas */}
            {isAdmin && (
              <button
                onClick={() => {
                  setTxModalType('masuk');
                  setIsTxModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">+ Catat Kas</span>
                <span className="sm:hidden">Kas</span>
              </button>
            )}

            {/* Login / Ganti Akun */}
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 transition-all cursor-pointer"
            >
              <User size={14} className="text-[#0B5D3F]" />
              <span className="hidden sm:inline">Ganti Akun</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 no-scrollbar">
          <div className="mx-auto max-w-7xl">
            {/* ROLE: WARGA VIEW (Strictly their family data) */}
            {!isAdmin ? (
              currentView === 'pengumuman' ? (
                <PengumumanView
                  pengumumanList={activeAnnouncements}
                  isAdmin={false}
                  onOpenCreateModal={() => {}}
                  onDeletePengumuman={() => {}}
                  onBack={() => setCurrentView('dasbor-warga')}
                />
              ) : currentView === 'laporan' ? (
                <LaporanView
                  transactions={transactions}
                  wargaList={wargaList}
                  onBack={() => setCurrentView('dasbor-warga')}
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
              /* ROLE: ADMIN VIEWS */
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
                    onOpenWargaModal={() => setIsWargaModalOpen(true)}
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
                    onDeletePengumuman={(id) => setPengumumanList((prev) => prev.filter((p) => p.id !== id))}
                    onBack={() => setCurrentView('beranda')}
                  />
                )}

                {currentView === 'laporan' && (
                  <LaporanView
                    transactions={transactions}
                    wargaList={wargaList}
                    bantuanList={bantuanList}
                    onBack={() => setCurrentView('beranda')}
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
          </div>
        </main>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        wargaList={wargaList}
        onOpenLupaPassword={() => setIsLupaPasswordOpen(true)}
      />

      {/* Lupa Password Modal */}
      <LupaPasswordModal
        isOpen={isLupaPasswordOpen}
        onClose={() => setIsLupaPasswordOpen(false)}
        pengaturanKas={pengaturanKas}
      />

      {/* Transaction Modal (Admin Only) */}
      {isAdmin && (
        <TransactionModal
          isOpen={isTxModalOpen}
          onClose={() => setIsTxModalOpen(false)}
          onSave={handleSaveTransaction}
          defaultType={txModalType}
        />
      )}

      {/* Resident (Warga) Modal with OCR / Photo KK (Admin Only) */}
      {isAdmin && (
        <WargaModal
          isOpen={isWargaModalOpen}
          onClose={() => setIsWargaModalOpen(false)}
          onSave={handleSaveWarga}
        />
      )}

      {/* Pengumuman Modal (Admin Only) */}
      {isAdmin && (
        <PengumumanModal
          isOpen={isPengumumanModalOpen}
          onClose={() => setIsPengumumanModalOpen(false)}
          onSave={handleSavePengumuman}
        />
      )}

      {/* Saldo Masa Lalu Modal (Admin Only) */}
      {isAdmin && (
        <SaldoAwalModal
          isOpen={isSaldoAwalModalOpen}
          onClose={() => setIsSaldoAwalModalOpen(false)}
          pengaturanKas={pengaturanKas}
          onSaveSaldoAwal={handleSaveSaldoAwal}
        />
      )}
    </div>
  );
}
