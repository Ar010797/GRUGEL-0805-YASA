import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Users,
  ShieldCheck,
  Send,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Building,
  KeyRound,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Edit,
  UserCheck,
  X,
  Wallet,
  HeartHandshake,
  ArrowRight,
  Eye,
  EyeOff,
  Database,
  Wifi,
} from 'lucide-react';
import {
  AdminRTAccount,
  PembaruanBulananRT,
  Warga,
  Transaction,
  BantuanPemerintah,
  PengaturanKas,
  PengumumanRT,
  DokumenPdfWarga,
} from '../types';
import { downloadBackupJSON, parseBackupFile, AppDatabaseSchema } from '../utils/cloudSync';
import { collectRegisteredRTs } from '../utils/rtFilter';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface ServerKontrolViewProps {
  adminAccounts: AdminRTAccount[];
  laporanBulananRT: PembaruanBulananRT[];
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengaturanKas: PengaturanKas;
  pengumumanList?: PengumumanRT[];
  dokumenList?: DokumenPdfWarga[];
  serverConnected?: boolean;
  sseConnected?: boolean;
  cloudSyncBusy?: boolean;
  cloudError?: string | null;
  onForceSyncNow?: () => Promise<void> | void;
  onAddAdminAccount: (acc: Omit<AdminRTAccount, 'id'>) => void;
  onUpdateAdminAccount: (id: string, acc: Partial<AdminRTAccount>) => void;
  onDeleteAdminAccount: (id: string) => void;
  onUpdateStatusLaporan: (id: string, status: PembaruanBulananRT['statusVerifikasi']) => void;
  onRestoreDatabase: (db: AppDatabaseSchema) => void;
  onSwitchToRTAdmin?: (rtScope: string) => void;
  onViewRTKas?: (rtCode: string) => void;
}

export const ServerKontrolView: React.FC<ServerKontrolViewProps> = ({
  adminAccounts,
  laporanBulananRT,
  wargaList,
  transactions,
  bantuanList,
  pengaturanKas,
  pengumumanList = [],
  dokumenList = [],
  serverConnected = true,
  sseConnected = false,
  cloudSyncBusy = false,
  cloudError = null,
  onForceSyncNow,
  onAddAdminAccount,
  onUpdateAdminAccount,
  onDeleteAdminAccount,
  onUpdateStatusLaporan,
  onRestoreDatabase,
  onSwitchToRTAdmin,
  onViewRTKas,
}) => {
  const [activeTab, setActiveTab] = useState<'admin-rt' | 'laporan-masuk' | 'database'>('admin-rt');
  const [searchAdmin, setSearchAdmin] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Edit / Recovery Admin Modal State
  const [editingAdmin, setEditingAdmin] = useState<AdminRTAccount | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editKontak, setEditKontak] = useState('');
  const [editJabatan, setEditJabatan] = useState('');

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    targetName?: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    onConfirm: () => {},
  });

  // Form State for Adding Admin RT
  const [formNama, setFormNama] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [formRT, setFormRT] = useState('01');
  const [formRW, setFormRW] = useState('05');
  const [formKontak, setFormKontak] = useState('');
  const [formJabatan, setFormJabatan] = useState('Ketua RT');

  // Multi-RT aggregated calculations
  const totalKKGlobal = wargaList.length;
  const totalJiwaGlobal = wargaList.reduce((acc, w) => acc + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1), 0);
  const totalMasukGlobal = transactions.filter((t) => t.tipe === 'masuk').reduce((acc, t) => acc + t.nominal, 0);
  const totalKeluarGlobal = transactions.filter((t) => t.tipe === 'keluar').reduce((acc, t) => acc + t.nominal, 0);
  const saldoKasGlobal = totalMasukGlobal - totalKeluarGlobal;

  const registeredRTs = collectRegisteredRTs({
    adminAccounts,
    wargaList,
    transactions,
    bantuanList,
    laporanBulananRT,
    pengaturanKas,
  });

  const filteredAdmins = adminAccounts.filter(
    (a) =>
      a.nama.toLowerCase().includes(searchAdmin.toLowerCase()) ||
      a.username.toLowerCase().includes(searchAdmin.toLowerCase()) ||
      a.rt.includes(searchAdmin)
  );

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNama || !formUsername || !formPassword) return;

    onAddAdminAccount({
      nama: formNama,
      username: formUsername,
      passwordHash: formPassword,
      rt: formRT,
      rw: formRW,
      kontak: formKontak || '0812-0000-0000',
      jabatan: `${formJabatan} RT ${formRT}`,
      status: 'aktif',
    });

    setIsAddModalOpen(false);
    setFormNama('');
    setFormUsername('');
    setFormPassword('');
    setFormKontak('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseBackupFile(file);
      onRestoreDatabase(parsed);
      setImportNotice('Database berhasil dipulihkan dari file cadangan.');
      setTimeout(() => setImportNotice(null), 4000);
    } catch (err: any) {
      setImportNotice(`Gagal mengimpor: ${err.message}`);
      setTimeout(() => setImportNotice(null), 5000);
    }
  };

  const handleExportAll = () => {
    const currentDb: AppDatabaseSchema = {
      version: 2,
      lastUpdated: new Date().toISOString(),
      tahunAktif: pengaturanKas.tahunAktif || 2026,
      pengaturanKas,
      wargaList,
      transactions,
      bantuanList,
      pengumumanList,
      dokumenList,
      adminAccounts,
      laporanBulananRT,
    };
    downloadBackupJSON(currentDb);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-[#0B5D3F] text-white shadow-md">
            <Server size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900">Pusat Kontrol Server Desa</h1>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-[#0B5D3F] border border-emerald-300">
                Super Admin {pengaturanKas?.profilRT?.desa || 'Desa Kotayasa'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Pusat penerima data seluruh RT, manajemen akun pengurus RT, dan verifikasi pembaruan bulanan
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-xs"
            title="Download seluruh data desa ke file .JSON"
          >
            <Download size={14} className="text-[#0B5D3F]" />
            <span>Cadangkan Data (.JSON)</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>+ Tambah Admin RT</span>
          </button>
        </div>
      </div>

      {/* Aggregate Village Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          whileHover={{ y: -2 }}
          className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Admin RT Terdaftar</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-[#0B5D3F]">
              Aktif
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{adminAccounts.length} Akun RT</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Mengelola {registeredRTs.length} wilayah RT</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 }}
          whileHover={{ y: -2 }}
          className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs"
        >
          <span className="text-xs font-bold text-slate-500 uppercase">Laporan Bulanan Masuk</span>
          <p className="text-2xl font-black text-emerald-800 mt-2">{laporanBulananRT.length} Laporan</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Pembaruan berkala dari RT</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
          whileHover={{ y: -2 }}
          className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs"
        >
          <span className="text-xs font-bold text-slate-500 uppercase">Total Warga (Semua RT)</span>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalKKGlobal} KK</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">{totalJiwaGlobal} Jiwa terdaftar</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12 }}
          whileHover={{ y: -2 }}
          className="rounded-3xl bg-[#E8F5EE] p-5 border border-emerald-300 shadow-xs"
        >
          <span className="text-xs font-bold text-emerald-900 uppercase">Saldo Kas Keseluruhan</span>
          <p className="text-xl font-black text-[#0B5D3F] mt-2">
            Rp {saldoKasGlobal.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] text-emerald-700 mt-0.5 block">Gabungan seluruh RT terdaftar</span>
        </motion.div>
      </div>

      {/* Monitoring Kas Seluruh Admin RT Terdaftar */}
      <div className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                Pantau Kas Seluruh Admin RT Terdaftar
              </h2>
              <p className="text-xs text-slate-500">
                Pilih salah satu Admin RT atau gabungkan seluruh RT untuk memeriksa kas masuk, kas keluar, kematian, dan iuran warga
              </p>
            </div>
          </div>

          {onViewRTKas && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onViewRTKas('SEMUA')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Wallet size={14} />
              <span>Lihat Kas Gabungan Semua RT</span>
              <ArrowRight size={14} />
            </motion.button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {registeredRTs.map((rtInfo, idx) => (
            <motion.div
              key={rtInfo.rt}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.04 }}
              whileHover={{ y: -2 }}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-emerald-300 hover:shadow-md p-4 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#0B5D3F] px-2.5 py-0.5 text-xs font-black text-white">
                      {rtInfo.label}
                    </span>
                    <span className="text-[11px] font-bold text-slate-600">
                      {rtInfo.totalKK} KK
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-slate-800 truncate">
                    {rtInfo.adminNames.length > 0
                      ? `Admin: ${rtInfo.adminNames.join(', ')}`
                      : `Admin RT ${rtInfo.rt} (Belum ada akun khusus)`}
                  </p>
                </div>

                {rtInfo.latestLaporan && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200 shrink-0">
                    {rtInfo.latestLaporan.bulanTahun}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-xl bg-white p-2 border border-slate-200/70">
                  <span className="text-[10px] text-slate-400 block">Kas Masuk</span>
                  <strong className="text-emerald-700 font-extrabold">
                    Rp {rtInfo.totalMasuk.toLocaleString('id-ID')}
                  </strong>
                </div>
                <div className="rounded-xl bg-white p-2 border border-slate-200/70">
                  <span className="text-[10px] text-slate-400 block">Kas Keluar</span>
                  <strong className="text-rose-600 font-extrabold">
                    Rp {rtInfo.totalKeluar.toLocaleString('id-ID')}
                  </strong>
                </div>
                <div className="rounded-xl bg-[#E8F5EE] p-2 border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 block">Saldo Kas</span>
                  <strong className="text-[#0B5D3F] font-extrabold">
                    Rp {rtInfo.saldoKas.toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-[11px]">
                <span className="text-slate-500">
                  Kematian: <strong className="text-rose-600">Rp {rtInfo.totalKematian.toLocaleString('id-ID')}</strong>
                </span>
                {onViewRTKas && (
                  <button
                    type="button"
                    onClick={() => onViewRTKas(rtInfo.rt)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 hover:bg-[#0B5D3F] px-2.5 py-1 text-[11px] font-extrabold text-[#0B5D3F] hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Lihat Kas RT {rtInfo.rt}</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {importNotice && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-4 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
          <span>{importNotice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-xs gap-1">
        {[
          { id: 'admin-rt' as const, label: `Kelola Akun Admin RT (${adminAccounts.length})`, icon: <Users size={15} /> },
          { id: 'laporan-masuk' as const, label: `Data Pembaruan Bulanan Masuk (${laporanBulananRT.length})`, icon: <Send size={15} /> },
          { id: 'database' as const, label: 'Keamanan & Cadangan Cloud', icon: <Server size={15} /> },
        ].map((tab) => {
          const isTabActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition-colors cursor-pointer ${
                isTabActive ? 'text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {isTabActive && (
                <motion.span
                  layoutId="serverTabPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-[#0B5D3F] shadow-xs"
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                <span>{tab.label}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* TAB 1: KELOLA AKUN ADMIN RT */}
      {activeTab === 'admin-rt' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="relative w-full sm:w-80">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchAdmin}
                onChange={(e) => setSearchAdmin(e.target.value)}
                placeholder="Cari nama admin / username / RT..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:border-[#0B5D3F] outline-hidden"
              />
            </div>

            <span className="text-xs text-slate-500">
              Total <strong>{filteredAdmins.length}</strong> Akun Admin RT Terdaftar
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
            {/* Mobile Scroll Tip */}
            <div className="sm:hidden flex items-center justify-between text-[11px] font-bold text-emerald-800 bg-[#E8F5EE] px-3.5 py-2 border-b border-emerald-200">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-black">&larr; &rarr;</span>
                <span>Geser tabel ke samping untuk melihat seluruh data admin</span>
              </span>
            </div>

            <div className="overflow-x-auto touch-pan-x scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 text-center">Wilayah</th>
                    <th className="py-3.5 px-4">Nama Pengurus RT</th>
                    <th className="py-3.5 px-4">Username Login</th>
                    <th className="py-3.5 px-4">Password Akses</th>
                    <th className="py-3.5 px-4">Kontak WhatsApp</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4">Terakhir Kirim</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdmins.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block rounded-lg bg-emerald-100 text-[#0B5D3F] font-black px-2.5 py-1 text-xs border border-emerald-300">
                          RT {acc.rt} / RW {acc.rw}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{acc.nama}</div>
                        <div className="text-[10px] text-slate-400">{acc.jabatan}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                        {acc.username}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 bg-slate-50/80 rounded-md">
                        <div className="flex items-center justify-between gap-1.5 min-w-[120px]">
                          <span>{revealedPasswords[acc.id] ? acc.passwordHash : '••••••••'}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswords((prev) => ({
                                ...prev,
                                [acc.id]: !prev[acc.id],
                              }))
                            }
                            className="p-1 text-slate-400 hover:text-[#0B5D3F] transition-colors cursor-pointer rounded"
                            title={revealedPasswords[acc.id] ? 'Tutup Password' : 'Lihat Password'}
                            aria-label={revealedPasswords[acc.id] ? 'Tutup Password' : 'Lihat Password'}
                          >
                            {revealedPasswords[acc.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {acc.kontak}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() =>
                            onUpdateAdminAccount(acc.id, {
                              status: acc.status === 'aktif' ? 'nonaktif' : 'aktif',
                            })
                          }
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border cursor-pointer transition-colors ${
                            acc.status === 'aktif'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {acc.status === 'aktif' ? '● Aktif' : '○ Nonaktif'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-slate-500">
                        <div className="font-semibold text-slate-700">
                          {acc.terakhirSinkronisasi || 'Belum ada sinkronisasi'}
                        </div>
                        {acc.terakhirLogin && (
                          <div className="text-[10px] text-slate-400">
                            Login: {acc.terakhirLogin}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit / Pulihkan Akun Admin RT */}
                          <button
                            onClick={() => {
                              setEditingAdmin(acc);
                              setEditNama(acc.nama);
                              setEditUsername(acc.username);
                              setEditPassword(acc.passwordHash);
                              setEditKontak(acc.kontak);
                              setEditJabatan(acc.jabatan);
                            }}
                            className="p-1 rounded-lg text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 cursor-pointer"
                            title="Tinjau, Edit & Pulihkan Akun Admin Ini"
                          >
                            <Edit size={14} />
                          </button>

                          {onSwitchToRTAdmin && (
                            <button
                              onClick={() => onSwitchToRTAdmin(`RT ${acc.rt} RW ${acc.rw}`)}
                              className="rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2 py-1 text-[11px] font-bold text-[#0B5D3F] transition-colors cursor-pointer"
                              title="Masuk & Kelola RT Ini Langsung"
                            >
                              Buka RT &rarr;
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Hapus Akun Pengurus RT',
                                message: `Apakah Anda yakin ingin menghapus akun ${acc.nama} (${acc.username})? Pengurus RT tidak akan bisa login lagi sebelum dibuatkan akun baru.`,
                                targetName: `${acc.nama} - RT ${acc.rt} / RW ${acc.rw}`,
                                variant: 'danger',
                                onConfirm: () => onDeleteAdminAccount(acc.id),
                              });
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Hapus akun admin RT ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAdmins.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 px-6 text-center text-xs text-slate-500">
                        Belum ada akun Admin RT yang terdaftar di Server Pusat. Klik tombol{' '}
                        <strong className="text-[#0B5D3F]">+ Tambah Admin RT</strong> di atas atau minta Admin RT menekan{' '}
                        <strong className="text-[#0B5D3F]">Sinkronkan Akun ke Server</strong> pada perangkatnya.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATA PEMBARUAN BULANAN MASUK DARI SETIAP RT */}
      {activeTab === 'laporan-masuk' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 border border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Arsip Laporan & Pembaruan Bulanan RT</h3>
              <p className="text-xs text-slate-500">
                Data resmi yang dikirimkan setiap bulan oleh Admin RT ke Server {pengaturanKas?.profilRT?.desa || 'Desa Kotayasa'}
              </p>
            </div>
            <span className="text-xs font-bold text-[#0B5D3F] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              {laporanBulananRT.length} Laporan Masuk
            </span>
          </div>

          {laporanBulananRT.length === 0 ? (
            <div className="rounded-3xl bg-white p-12 text-center border border-slate-200 space-y-2">
              <Send size={32} className="mx-auto text-slate-300" />
              <h4 className="text-sm font-bold text-slate-800">Belum ada pembaruan bulanan</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Admin RT dapat mengirimkan pembaruan data bulanan (keuangan, kependudukan & bansos) melalui tombol "Kirim Pembaruan ke Server" pada dasbor masing-masing RT.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {laporanBulananRT.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs space-y-3.5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-[#0B5D3F] px-2.5 py-1 text-xs font-black text-white">
                        RT {rep.rt} / RW {rep.rw}
                      </span>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900">{rep.bulanTahun}</h4>
                        <span className="text-[10px] text-slate-400">Pengirim: {rep.namaAdminPengirim}</span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                        rep.statusVerifikasi === 'Diterima'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {rep.statusVerifikasi}
                    </span>
                  </div>

                  {/* Financial & Resident Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">Total KK</span>
                      <strong className="text-slate-800 text-sm">{rep.totalKK} KK</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">Lunas Iuran</span>
                      <strong className="text-emerald-700 text-sm">{rep.totalLunasIuran} KK</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <span className="text-[10px] text-emerald-900 block font-semibold">Saldo Kas</span>
                      <strong className="text-[#0B5D3F] text-xs">Rp {rep.saldoKasUmumBerjalan.toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200">
                      <span className="text-[10px] text-amber-900 block font-semibold">Bansos</span>
                      <strong className="text-amber-800 text-sm">{rep.totalPenerimaBansos} Penerima</strong>
                    </div>
                  </div>

                  {rep.catatanKhusus && (
                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 border border-slate-100">
                      <span className="font-bold text-[10px] text-slate-400 uppercase block">Catatan Pengurus RT:</span>
                      <p className="mt-0.5">{rep.catatanKhusus}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-400">Tgl Kirim: {rep.tanggalKirim}</span>
                    <button
                      onClick={() =>
                        onUpdateStatusLaporan(
                          rep.id,
                          rep.statusVerifikasi === 'Diterima' ? 'Perlu Klarifikasi' : 'Diterima'
                        )
                      }
                      className="text-xs font-bold text-[#0B5D3F] hover:underline cursor-pointer"
                    >
                      {rep.statusVerifikasi === 'Diterima' ? 'Tandai Perlu Klarifikasi' : 'Setujui & Verifikasi'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: KEAMANAN & CADANGAN SERVER */}
      {activeTab === 'database' && (
        <div className="space-y-6 max-w-3xl">
          {/* Central SQL Database & Live Real-time Sync Panel */}
          <div className="rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <Database size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Database Server Pusat (SQL &amp; REST API)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Seluruh perangkat (Admin HP, Warga HP, Desktop, dan APK) terhubung langsung ke satu database server pusat secara online
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 self-start sm:self-center rounded-full px-3 py-1 text-[11px] font-bold border ${
                  sseConnected || serverConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <Wifi size={12} />
                <span>
                  {sseConnected
                    ? 'Database & SSE Live Terhubung'
                    : serverConnected
                    ? 'Database Server Online'
                    : 'Koneksi Server Terputus'}
                </span>
              </span>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Status Koneksi &amp; Sinkronisasi Server Pusat
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-extrabold ${
                        serverConnected ? 'text-emerald-800' : 'text-rose-700'
                      }`}
                    >
                      {serverConnected
                        ? 'Terhubung ke Database Server Pusat Online'
                        : 'Gagal terhubung ke Database Server Pusat'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        sseConnected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {sseConnected ? 'Sinkronisasi Real-Time Aktif' : 'Polling Sinkronisasi Aktif'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onForceSyncNow && (
                    <button
                      type="button"
                      disabled={cloudSyncBusy}
                      onClick={onForceSyncNow}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw size={14} className={cloudSyncBusy ? 'animate-spin' : ''} />
                      <span>Sinkronkan Sekarang</span>
                    </button>
                  )}
                </div>
              </div>

              {cloudError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] font-semibold text-rose-700 flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{cloudError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-[#0B5D3F]">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Penyimpanan Terpusat &amp; Cadangan JSON</h3>
                <p className="text-xs text-slate-500">
                  Data kas, iuran, pengumuman, bansos, dan warga tersimpan permanen di Database Server Pusat
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Setiap perubahan dari HP Admin, akun Warga, maupun Server Pusat dikirim melalui <strong>REST API Terautentikasi</strong> ke database SQL pusat dan disiarkan real-time melalui SSE ke semua perangkat yang sedang aktif. Data tetap utuh saat logout, ganti HP, atau instal ulang aplikasi.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleExportAll}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#084831] shadow-xs cursor-pointer"
              >
                <Download size={15} />
                <span>Unduh Cadangan Lengkap (.JSON)</span>
              </button>

              <label className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 transition-colors cursor-pointer">
                <Upload size={15} className="text-[#0B5D3F]" />
                <span>Pulihkan Database dari File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH ADMIN RT BARU */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0B5D3F]">Tambah Akun Admin RT Baru</h3>
                  <p className="text-[11px] text-slate-500">Memberikan hak kelola untuk satu RT tertentu</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-6 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor RT</label>
                  <select
                    value={formRT}
                    onChange={(e) => setFormRT(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((rt) => (
                      <option key={rt} value={rt}>
                        RT {rt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor RW</label>
                  <input
                    type="text"
                    value={formRW}
                    onChange={(e) => setFormRW(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Pengurus</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Nama lengkap pengurus RT"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jabatan di RT</label>
                <input
                  type="text"
                  value={formJabatan}
                  onChange={(e) => setFormJabatan(e.target.value)}
                  placeholder="Ketua RT / Bendahara RT"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder={`AdminRT${formRT}`}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Akses</label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={`rt${formRT}rw${formRW || '05'}`}
                      className="w-full rounded-xl border border-slate-200 pl-3 pr-9 py-2 text-xs font-mono text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-[#0B5D3F] transition-colors cursor-pointer"
                      title={showFormPassword ? 'Tutup Password' : 'Lihat Password'}
                      aria-label={showFormPassword ? 'Tutup Password' : 'Lihat Password'}
                    >
                      {showFormPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Kontak WhatsApp</label>
                <input
                  type="text"
                  value={formKontak}
                  onChange={(e) => setFormKontak(e.target.value)}
                  placeholder="0812-3456-7890"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white hover:bg-[#084831] cursor-pointer"
                >
                  Simpan Akun Admin RT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT / PULIHKAN AKUN ADMIN RT (OLEH SERVER) */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0B5D3F]">Tinjau & Pulihkan Akun Admin RT</h3>
                  <p className="text-[11px] text-slate-500">
                    RT {editingAdmin.rt} / RW {editingAdmin.rw} &bull; Pengaturan Kredensial
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingAdmin(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmDialog({
                  isOpen: true,
                  title: 'Simpan Pembaruan Kredensial Admin',
                  message: `Anda akan mengubah data login untuk akun ${editNama}. Password baru akan langsung aktif dan admin bisa login kembali.`,
                  targetName: `Username: ${editUsername} (RT ${editingAdmin.rt})`,
                  variant: 'warning',
                  onConfirm: () => {
                    onUpdateAdminAccount(editingAdmin.id, {
                      nama: editNama,
                      username: editUsername,
                      passwordHash: editPassword,
                      kontak: editKontak,
                      jabatan: editJabatan,
                    });
                    setEditingAdmin(null);
                  },
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  Jika Admin RT lupa username atau password, Server Pusat dapat mengubah dan memulihkan akses login mereka di sini.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Pengurus</label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jabatan di RT</label>
                <input
                  type="text"
                  value={editJabatan}
                  onChange={(e) => setEditJabatan(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Akses Baru</label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      required
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-3 pr-9 py-2 text-xs font-mono text-emerald-800 font-bold bg-emerald-50/50 focus:border-[#0B5D3F] outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-[#0B5D3F] transition-colors cursor-pointer"
                      title={showEditPassword ? 'Tutup Password' : 'Lihat Password'}
                      aria-label={showEditPassword ? 'Tutup Password' : 'Lihat Password'}
                    >
                      {showEditPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp Pengurus</label>
                <input
                  type="text"
                  value={editKontak}
                  onChange={(e) => setEditKontak(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white hover:bg-[#084831] cursor-pointer"
                >
                  Perbarui & Pulihkan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REUSABLE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        targetName={confirmDialog.targetName}
        variant={confirmDialog.variant}
      />
    </div>
  );
};
