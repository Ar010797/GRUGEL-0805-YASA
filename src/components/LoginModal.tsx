import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  User,
  Lock,
  KeyRound,
  AlertCircle,
  HelpCircle,
  X,
  CreditCard,
  Server,
  Building2,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  LogOut,
  Wifi,
  CloudUpload,
} from 'lucide-react';
import { AuthUser, AdminRTAccount, PengaturanKas } from '../types';
import { HouseLogo } from './HouseLogo';
import {
  checkServerHealth,
  getApiBaseUrl,
  getResolvedEndpointDisplay,
  loginWithServer,
  readLegacyLocalCacheForMigration,
  setApiBaseUrl,
  syncAdminAccountToServer,
  type ServerHealthDiagnostic,
} from '../utils/cloudSync';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  adminAccounts?: AdminRTAccount[];
  pengaturanKas?: PengaturanKas;
  currentPin?: string;
  onOpenLupaPassword: () => void;
  onRefreshSync?: () => Promise<void> | void;
  onSyncAdminAccountToServer?: (
    account: AdminRTAccount,
    securityPin?: string
  ) => Promise<{ ok: boolean; message?: string; account?: AdminRTAccount; user?: AuthUser }>;
  canClose?: boolean;
  onLogout?: () => void;
  sseConnected?: boolean;
  serverConnected?: boolean;
  serverErrorDetail?: string | null;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  pengaturanKas,
  onOpenLupaPassword,
  onRefreshSync,
  onSyncAdminAccountToServer,
  canClose = true,
  onLogout,
  sseConnected = false,
  serverConnected = true,
  serverErrorDetail = null,
}) => {
  const desaStr = pengaturanKas?.profilRT?.desa || 'Desa Kotayasa';
  const rtStr = pengaturanKas?.profilRT?.namaRT || '08';
  const rwStr = pengaturanKas?.profilRT?.namaRW || '05';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'server' | 'admin' | 'warga'>('warga');
  const [showServerTab, setShowServerTab] = useState(false);

  // Password visibility toggles
  const [showServerPassword, setShowServerPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showWargaPassword, setShowWargaPassword] = useState(false);

  // Server form
  const [serverUsername, setServerUsername] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [serverError, setServerError] = useState('');
  const [serverChecking, setServerChecking] = useState(false);

  // Admin form
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminChecking, setAdminChecking] = useState(false);
  const [pendingSyncAdmin, setPendingSyncAdmin] = useState<AdminRTAccount | null>(null);
  const [showRegisterAdminBox, setShowRegisterAdminBox] = useState(false);
  const [regNama, setRegNama] = useState('');
  const [regRT, setRegRT] = useState(rtStr);
  const [regRW, setRegRW] = useState(rwStr);
  const [regJabatan, setRegJabatan] = useState(`Ketua RT ${rtStr}`);
  const [regKontak, setRegKontak] = useState(pengaturanKas?.kontakKetuaRT?.telp || '');
  const [regPin, setRegPin] = useState('');
  const [pendingSyncPin, setPendingSyncPin] = useState('');
  const [syncAccountBusy, setSyncAccountBusy] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<ServerHealthDiagnostic | null>(null);
  const [showUrlConfig, setShowUrlConfig] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState(() => getApiBaseUrl());

  // Warga form: Username = Nama Asli, Password = Nomor KK (16 digit)
  const [wargaUsername, setWargaUsername] = useState('');
  const [wargaPasswordKK, setWargaPasswordKK] = useState('');
  const [wargaError, setWargaError] = useState('');
  const [wargaChecking, setWargaChecking] = useState(false);

  const effectiveServerConnected = diagnosticResult ? diagnosticResult.connected : serverConnected;
  const activeDiagnosticError =
    (diagnosticResult && !diagnosticResult.connected && diagnosticResult.message) ||
    (!effectiveServerConnected ? serverErrorDetail : null);

  if (!isOpen) return null;

  // Handle Server Submit via REST API
  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const u = serverUsername.trim();
    const p = serverPassword.trim();
    if (!u || !p) {
      setServerError('Username dan password Server harus diisi.');
      return;
    }

    setServerChecking(true);
    try {
      const res = await loginWithServer('server', u, p);
      if (res.ok && res.user) {
        onLoginSuccess(res.user);
        onClose();
      } else {
        setServerError(res.message || 'Username atau password Server salah. Akses ini khusus Pengelola Server.');
      }
    } finally {
      setServerChecking(false);
    }
  };

  const handleSyncAndLoginAdmin = async (accountToSync: AdminRTAccount, pinCode?: string) => {
    setAdminError('');
    setSyncAccountBusy(true);
    try {
      if (onSyncAdminAccountToServer) {
        const res = await onSyncAdminAccountToServer(accountToSync, pinCode);
        if (!res.ok) {
          setAdminError(res.message || 'Gagal menyinkronkan akun admin ke server.');
          return;
        }
        const synced = res.account || accountToSync;
        setPendingSyncAdmin(null);
        setShowRegisterAdminBox(false);
        onLoginSuccess(
          res.user || {
            role: 'admin',
            username: synced.username,
            nama: synced.nama,
            rtScope: `RT ${synced.rt} RW ${synced.rw}`,
            isPinAuthenticated: false,
          }
        );
        onClose();
      } else {
        const legacyCache = readLegacyLocalCacheForMigration();
        const res = await syncAdminAccountToServer({
          account: accountToSync,
          syncData: legacyCache || undefined,
          securityPin: pinCode,
        });
        if (!res.ok || !res.user) {
          setAdminError(res.message || 'Gagal menyinkronkan akun admin ke server.');
          return;
        }
        setPendingSyncAdmin(null);
        setShowRegisterAdminBox(false);
        onLoginSuccess(res.user);
        onClose();
      }
    } finally {
      setSyncAccountBusy(false);
    }
  };

  // Handle Admin RT Submit via Central Database REST API
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setPendingSyncAdmin(null);

    const u = adminUsername.trim();
    const p = adminPassword.trim();

    if (!u) {
      setAdminError('Silakan masukkan Username Admin RT Anda.');
      return;
    }
    if (!p) {
      setAdminError('Silakan masukkan Password Admin RT Anda.');
      return;
    }

    setAdminChecking(true);
    try {
      const res = await loginWithServer('admin', u, p);
      if (res.ok && res.user) {
        onLoginSuccess(res.user);
        onClose();
        return;
      }

      // Check legacy pre-migration HP local storage cache only if server didn't find the account
      const legacyCache = readLegacyLocalCacheForMigration();
      const legacyAdmins = Array.isArray(legacyCache?.adminAccounts) ? legacyCache.adminAccounts : [];
      const matchedLegacy = legacyAdmins.find(
        (acc) => acc.username?.trim().toLowerCase() === u.toLowerCase() && acc.passwordHash === p
      );

      if (matchedLegacy) {
        setPendingSyncAdmin(matchedLegacy);
        setShowRegisterAdminBox(false);
        setAdminError(
          `Akun Admin "${matchedLegacy.username}" ditemukan pada data lama perangkat ini. Klik "Sinkronkan Akun ke Server & Masuk" di bawah untuk memigrasikan akun dan seluruh datanya ke Database Server Pusat.`
        );
        return;
      }

      setAdminError(
        res.message ||
          `Akun Admin "${u}" tidak ditemukan di Database Server. Periksa password atau daftarkan akun ini ke Server jika memiliki PIN Keamanan Pengurus.`
      );
      setShowRegisterAdminBox(false);
    } finally {
      setAdminChecking(false);
    }
  };

  // Handle Warga Submit directly via Central Database REST API
  const handleWargaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWargaError('');

    const name = wargaUsername.trim();
    const noKKRaw = wargaPasswordKK.trim().replace(/\s+/g, '');

    if (!name) {
      setWargaError('Silakan masukkan Nama Asli Kepala Keluarga sesuai Kartu Keluarga.');
      return;
    }

    if (!noKKRaw) {
      setWargaError('Silakan masukkan Password (Nomor KK 16 digit).');
      return;
    }

    setWargaChecking(true);
    try {
      const res = await loginWithServer('warga', name, noKKRaw);
      if (res.ok && res.user) {
        onLoginSuccess(res.user);
        onClose();
      } else {
        setWargaError(
          res.message ||
            `Data warga "${name}" dengan No KK tersebut tidak ditemukan di Database Server. Silakan hubungi Admin RT.`
        );
      }
    } finally {
      setWargaChecking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${
        canClose
          ? 'bg-black/65 backdrop-blur-sm'
          : 'bg-gradient-to-br from-[#063A27] via-[#0B5D3F] to-[#0F172A]'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden my-auto"
      >
        {/* Top Header */}
        <div className="relative bg-gradient-to-r from-[#0B5D3F] to-[#06442D] px-6 pt-6 pb-5 text-white">
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          )}

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs p-1"
            >
              <HouseLogo size={36} variant="white" />
            </motion.div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
                <span>Menu Login Aplikasi</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] ${
                    sseConnected || effectiveServerConnected
                      ? 'bg-emerald-400/20 text-emerald-100'
                      : 'bg-rose-500/40 text-rose-100'
                  }`}
                >
                  <Wifi size={9} />
                  <span>
                    {sseConnected
                      ? 'Database Server Live'
                      : effectiveServerConnected
                      ? 'Database Server Online'
                      : 'Server Terputus'}
                  </span>
                </span>
              </span>
              <h2 className="text-lg font-extrabold tracking-tight">Aplikasi {desaStr}</h2>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div
          className={`grid ${
            showServerTab ? 'grid-cols-3' : 'grid-cols-2'
          } border-b border-slate-200 bg-slate-50 p-1.5 gap-1 transition-all`}
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setActiveTab('admin');
              setAdminError('');
            }}
            className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'admin' ? 'text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {activeTab === 'admin' && (
              <motion.span
                layoutId="loginActiveTabPill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-xl bg-[#0B5D3F] shadow-xs"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <ShieldCheck size={14} />
              <span>Admin RT</span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setActiveTab('warga');
              setWargaError('');
            }}
            className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'warga' ? 'text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {activeTab === 'warga' && (
              <motion.span
                layoutId="loginActiveTabPill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-xl bg-[#0B5D3F] shadow-xs"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <User size={14} />
              <span>Warga (KK)</span>
            </span>
          </motion.button>

          {showServerTab && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setActiveTab('server');
                setServerError('');
              }}
              className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'server' ? 'text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {activeTab === 'server' && (
                <motion.span
                  layoutId="loginActiveTabPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-indigo-600 shadow-xs"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Server size={14} />
                <span>Server Pusat</span>
              </span>
            </motion.button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
          {activeTab === 'server' ? (
            /* SERVER (SUPER ADMIN) LOGIN FORM */
            <form onSubmit={handleServerSubmit} className="space-y-4">
              <div className="rounded-2xl bg-indigo-50 p-3 text-xs text-indigo-900 border border-indigo-200/80">
                <p className="font-bold flex items-center gap-1.5">
                  <Server size={14} className="text-indigo-600" />
                  <span>Akses Server Pusat Desa:</span>
                </p>
                <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                  Menerima data seluruh RT, menambahkan Admin untuk mengelola tiap RT, mengontrol pembukuan desa, dan sinkronisasi database antar-perangkat.
                </p>
              </div>

              {serverError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{serverError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Username Server
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Server size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={serverUsername}
                    onChange={(e) => setServerUsername(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-hidden font-medium"
                    placeholder="RW05GLEMPANG"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password Server
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound size={16} />
                  </div>
                  <input
                    type={showServerPassword ? 'text' : 'password'}
                    required
                    value={serverPassword}
                    onChange={(e) => setServerPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-10 py-2.5 text-sm text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-hidden font-mono"
                    placeholder="Password Server"
                  />
                  <button
                    type="button"
                    onClick={() => setShowServerPassword(!showServerPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title={showServerPassword ? 'Tutup Password' : 'Lihat Password'}
                    aria-label={showServerPassword ? 'Tutup Password' : 'Lihat Password'}
                  >
                    {showServerPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={serverChecking}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              >
                {serverChecking ? 'Memverifikasi ke Database Server...' : 'Masuk Sebagai Server RW 05'}
              </button>
            </form>
          ) : activeTab === 'admin' ? (
            /* ADMIN RT LOGIN FORM */
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="rounded-2xl bg-[#E8F5EE] p-3 text-xs text-[#0B5D3F] border border-emerald-200/80">
                <p className="font-bold flex items-center gap-1.5">
                  <Building2 size={14} />
                  <span>Akses Pengurus RT:</span>
                </p>
                <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                  Mengelola data warga 1 RT, mencatat kas/kematian, input bansos, dan sinkronisasi otomatis ke Database Server Pusat.
                </p>
              </div>

              {adminError && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold border space-y-2.5 ${
                    pendingSyncAdmin
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span className="min-w-0 break-words">{adminError}</span>
                  </div>

                  {pendingSyncAdmin && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          PIN Keamanan Pengurus (6 Digit, Awal: 123456)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={pendingSyncPin}
                          onChange={(e) => setPendingSyncPin(e.target.value.replace(/\D/g, ''))}
                          placeholder="Masukkan 6 digit PIN (contoh: 123456)"
                          className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={syncAccountBusy}
                        onClick={() =>
                          handleSyncAndLoginAdmin(
                            pendingSyncAdmin,
                            pendingSyncPin.trim() || undefined
                          )
                        }
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] py-2.5 px-3 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60"
                      >
                        <CloudUpload size={14} />
                        <span>
                          {syncAccountBusy
                            ? 'Menyinkronkan Akun & Data ke Server...'
                            : 'Sinkronkan Akun ke Server & Masuk'}
                        </span>
                      </button>
                    </div>
                  )}

                  {!pendingSyncAdmin && adminUsername.trim() && adminPassword.trim() && (
                    <div className="pt-1 border-t border-rose-200/70 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowRegisterAdminBox((prev) => !prev);
                          if (!regNama) setRegNama(pengaturanKas?.kontakKetuaRT?.nama || '');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#0B5D3F] hover:underline cursor-pointer"
                      >
                        <CloudUpload size={12} />
                        <span>
                          {showRegisterAdminBox
                            ? 'Tutup Form Sinkron Akun Baru'
                            : 'Belum Masuk Server? Daftarkan & Sinkronkan Akun Ini'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showRegisterAdminBox && (
                <div className="rounded-2xl bg-indigo-50/80 border border-indigo-200 p-3.5 space-y-2.5">
                  <div className="text-[11px] text-indigo-900">
                    <p className="font-extrabold flex items-center gap-1.5">
                      <CloudUpload size={13} className="text-indigo-700" />
                      <span>Daftarkan & Sinkronkan Akun Admin ke Server</span>
                    </p>
                    <p className="mt-0.5 text-indigo-800 leading-relaxed">
                      Akun beserta data perangkat ini akan didaftarkan ke Database Server Pusat agar terbaca oleh seluruh perangkat lain.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Nomor RT</label>
                      <input
                        type="text"
                        value={regRT}
                        onChange={(e) => setRegRT(e.target.value)}
                        placeholder="08"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Nomor RW</label>
                      <input
                        type="text"
                        value={regRW}
                        onChange={(e) => setRegRW(e.target.value)}
                        placeholder="05"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Nama Lengkap Pengurus RT
                    </label>
                    <input
                      type="text"
                      value={regNama}
                      onChange={(e) => setRegNama(e.target.value)}
                      placeholder="Contoh: Bpk. Karsono"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Jabatan</label>
                      <input
                        type="text"
                        value={regJabatan}
                        onChange={(e) => setRegJabatan(e.target.value)}
                        placeholder="Ketua RT 08"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">No. WhatsApp</label>
                      <input
                        type="text"
                        value={regKontak}
                        onChange={(e) => setRegKontak(e.target.value)}
                        placeholder="0812..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      PIN Keamanan Pengurus (6 Digit)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Masukkan PIN keamanan (Awal: 123456)"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={syncAccountBusy}
                    onClick={async () => {
                      if (!regNama.trim()) {
                        setAdminError('Nama lengkap pengurus harus diisi.');
                        return;
                      }
                      if (regPin.trim().length !== 6) {
                        setAdminError('PIN Keamanan Pengurus 6 digit wajib diisi.');
                        return;
                      }
                      const newAcc: AdminRTAccount = {
                        id: `adm_${Date.now()}`,
                        username: adminUsername.trim(),
                        passwordHash: adminPassword.trim(),
                        nama: regNama.trim(),
                        rt: regRT.trim() || rtStr,
                        rw: regRW.trim() || rwStr,
                        kontak: regKontak.trim() || '0812-0000-0000',
                        jabatan: regJabatan.trim() || `Ketua RT ${regRT.trim() || rtStr}`,
                        status: 'aktif',
                      };
                      await handleSyncAndLoginAdmin(newAcc, regPin.trim());
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60"
                  >
                    <CloudUpload size={13} />
                    <span>
                      {syncAccountBusy ? 'Menyinkronkan ke Server...' : 'Daftarkan, Sinkronkan Data & Masuk'}
                    </span>
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Username Admin RT
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => {
                      setAdminUsername(e.target.value);
                      setPendingSyncAdmin(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-medium"
                    placeholder="Admin"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password Admin RT
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound size={16} />
                  </div>
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setPendingSyncAdmin(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-10 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-mono"
                    placeholder={`rt${rtStr}rw${rwStr}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#0B5D3F] transition-colors cursor-pointer"
                    title={showAdminPassword ? 'Tutup Password' : 'Lihat Password'}
                    aria-label={showAdminPassword ? 'Tutup Password' : 'Lihat Password'}
                  >
                    {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Akun diverifikasi langsung ke Database Server Pusat secara online.
                </p>
              </div>

              <button
                type="submit"
                disabled={adminChecking || syncAccountBusy}
                className="w-full rounded-xl bg-[#0B5D3F] py-3 text-sm font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              >
                {adminChecking ? 'Memeriksa Akun ke Server...' : 'Masuk Sebagai Admin RT'}
              </button>
            </form>
          ) : (
            /* WARGA LOGIN FORM */
            <form onSubmit={handleWargaSubmit} className="space-y-4">
              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200/80">
                <p className="font-bold">Privasi Warga Terlindungi (Sesuai UU PDP):</p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Warga hanya dapat melihat data keluarganya sendiri berdasarkan Nomor Kartu Keluarga (16 digit) yang tersinkron dengan Database Server.
                </p>
              </div>

              {wargaError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{wargaError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Username (Nama Asli Sesuai KK)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={wargaUsername}
                    onChange={(e) => setWargaUsername(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-medium"
                    placeholder="Contoh: Budi Santoso"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password (Nomor Kartu Keluarga — 16 Digit)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <CreditCard size={16} />
                  </div>
                  <input
                    type={showWargaPassword ? 'text' : 'password'}
                    maxLength={24}
                    required
                    value={wargaPasswordKK}
                    onChange={(e) => setWargaPasswordKK(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-10 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-mono tracking-wider"
                    placeholder="Contoh: 3302000000000001"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWargaPassword(!showWargaPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#0B5D3F] transition-colors cursor-pointer"
                    title={showWargaPassword ? 'Tutup Password / No KK' : 'Lihat Password / No KK'}
                    aria-label={showWargaPassword ? 'Tutup Password / No KK' : 'Lihat Password / No KK'}
                  >
                    {showWargaPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Harus 16 digit angka</span>
                  <button
                    type="button"
                    onClick={onOpenLupaPassword}
                    className="font-bold text-[#0B5D3F] hover:underline cursor-pointer"
                  >
                    Lupa Password? Hubungi Admin
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={wargaChecking}
                className="w-full rounded-xl bg-[#0B5D3F] py-3 text-sm font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              >
                {wargaChecking ? 'Memeriksa Data di Server...' : 'Masuk Sebagai Warga'}
              </button>
            </form>
          )}
            </motion.div>
          </AnimatePresence>

          {/* Footer security note & Discreet Server Access */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                setSyncNotice(null);
                try {
                  const health = await checkServerHealth();
                  setDiagnosticResult(health);
                  if (health.connected && onRefreshSync) {
                    await onRefreshSync();
                    setSyncNotice(
                      `${health.message} • ${health.totalAdminAccounts ?? 0} Akun Admin • ${health.totalWarga ?? 0} KK`
                    );
                  }
                } finally {
                  setIsRefreshing(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-[#0B5D3F] hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              <span>
                {isRefreshing ? 'Memeriksa koneksi server...' : 'Periksa Koneksi Database Server'}
              </span>
            </button>

            {syncNotice && (
              <div className="w-full rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-left text-[11px] text-emerald-800 space-y-0.5">
                <p className="font-bold flex items-center gap-1 text-emerald-900">
                  <Check size={12} className="shrink-0" />
                  <span>{syncNotice}</span>
                </p>
                <p className="text-[10px] text-emerald-700 break-all">
                  API: {diagnosticResult?.endpointUrl || getResolvedEndpointDisplay('/api/health')}
                </p>
              </div>
            )}

            {activeDiagnosticError && (
              <div className="w-full rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-left text-[11px] text-rose-800 space-y-1.5">
                <p className="font-bold flex items-start gap-1.5 text-rose-900">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{activeDiagnosticError}</span>
                </p>
                <p className="text-[10px] text-rose-700 break-all">
                  Endpoint diuji: {diagnosticResult?.endpointUrl || getResolvedEndpointDisplay('/api/health')}
                </p>
                {!showUrlConfig && (
                  <button
                    type="button"
                    onClick={() => setShowUrlConfig(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white border border-rose-300 px-2 py-1 text-[10px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
                  >
                    Atur Alamat Server API (APK / Domain Lain)
                  </button>
                )}
              </div>
            )}

            <div className="w-full">
              <button
                type="button"
                onClick={() => setShowUrlConfig((prev) => !prev)}
                className="text-[10px] font-semibold text-slate-400 hover:text-[#0B5D3F] underline cursor-pointer"
              >
                {showUrlConfig
                  ? 'Tutup Pengaturan URL Server API'
                  : 'Pengaturan Alamat Server API (Untuk APK / Perangkat Luar)'}
              </button>

              {showUrlConfig && (
                <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-left space-y-2">
                  <label className="block text-[10px] font-bold text-slate-700">
                    URL Server Backend (kosongkan jika sama dengan domain saat ini):
                  </label>
                  <input
                    type="url"
                    value={apiUrlInput}
                    onChange={(e) => setApiUrlInput(e.target.value)}
                    placeholder="https://nama-server-publik-anda.run.app"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-mono text-slate-800"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setApiBaseUrl(apiUrlInput);
                        setIsRefreshing(true);
                        setSyncNotice(null);
                        try {
                          const health = await checkServerHealth();
                          setDiagnosticResult(health);
                          if (health.connected && onRefreshSync) {
                            await onRefreshSync();
                            setSyncNotice(
                              `${health.message} • ${health.totalAdminAccounts ?? 0} Akun Admin • ${health.totalWarga ?? 0} KK`
                            );
                          }
                        } finally {
                          setIsRefreshing(false);
                        }
                      }}
                      className="flex-1 rounded-lg bg-[#0B5D3F] hover:bg-[#084831] py-1.5 px-2.5 text-[11px] font-bold text-white cursor-pointer"
                    >
                      Simpan &amp; Uji Koneksi
                    </button>
                    {getApiBaseUrl() && (
                      <button
                        type="button"
                        onClick={() => {
                          setApiUrlInput('');
                          setApiBaseUrl('');
                          setDiagnosticResult(null);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {canClose && onLogout && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <LogOut size={12} />
                <span>Keluar ke Menu Login Utama</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLupaPassword}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0B5D3F] transition-colors cursor-pointer"
            >
              <HelpCircle size={14} />
              <span>Butuh Bantuan Akun atau Reset PIN? Hubungi Pengurus RT</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowServerTab((prev) => {
                  const nextState = !prev;
                  if (nextState) setActiveTab('server');
                  else if (activeTab === 'server') setActiveTab('warga');
                  return nextState;
                });
              }}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 cursor-pointer pt-1"
              title="Akses Khusus Pemilik Aplikasi / Pengelola Server"
            >
              <Lock size={10} />
              <span>{showServerTab ? 'Sembunyikan Akses Server' : 'Akses Pengelola Server Pusat'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
