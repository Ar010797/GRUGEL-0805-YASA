import React, { useState } from 'react';
import { ShieldCheck, User, Lock, KeyRound, AlertCircle, HelpCircle, X, CreditCard, Server, Building2, Check, Eye, EyeOff, RefreshCw, LogOut, Wifi, CloudUpload } from 'lucide-react';
import { AuthUser, Warga, AdminRTAccount, PengaturanKas } from '../types';
import { HouseLogo } from './HouseLogo';
import { fetchServerAdminAccounts } from '../utils/cloudSync';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  wargaList: Warga[];
  adminAccounts?: AdminRTAccount[];
  serverAdminAccounts?: AdminRTAccount[];
  pengaturanKas?: PengaturanKas;
  currentPin?: string;
  onOpenLupaPassword: () => void;
  onRefreshSync?: () => Promise<void> | void;
  onSyncAdminAccountToServer?: (
    account: AdminRTAccount
  ) => Promise<{ ok: boolean; message?: string; account?: AdminRTAccount }>;
  canClose?: boolean;
  onLogout?: () => void;
  sseConnected?: boolean;
  isCloudConnected?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  wargaList,
  adminAccounts = [],
  serverAdminAccounts,
  pengaturanKas,
  currentPin = '123456',
  onOpenLupaPassword,
  onRefreshSync,
  onSyncAdminAccountToServer,
  canClose = true,
  onLogout,
  sseConnected = false,
  isCloudConnected = false,
}) => {
  const desaStr = pengaturanKas?.profilRT?.desa || 'Desa Kotayasa';
  const rtStr = pengaturanKas?.profilRT?.namaRT || '08';
  const rwStr = pengaturanKas?.profilRT?.namaRW || '05';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  // Default to 'warga' so new installs start at citizen/admin login and Server tab is hidden
  const [activeTab, setActiveTab] = useState<'server' | 'admin' | 'warga'>('warga');
  const [showServerTab, setShowServerTab] = useState(false);

  // Password visibility toggles
  const [showServerPassword, setShowServerPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showWargaPassword, setShowWargaPassword] = useState(false);

  // Server form (NEVER pre-fill password for security on fresh installs)
  const [serverUsername, setServerUsername] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [serverError, setServerError] = useState('');

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
  const [syncAccountBusy, setSyncAccountBusy] = useState(false);

  // Warga form: Username = Nama Asli, Password = Nomor KK (16 digit)
  const [wargaUsername, setWargaUsername] = useState('');
  const [wargaPasswordKK, setWargaPasswordKK] = useState('');
  const [wargaError, setWargaError] = useState('');

  if (!isOpen) return null;

  // Handle Server Submit
  const handleServerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const u = serverUsername.trim();
    const p = serverPassword.trim();

    // Specific user credentials: Username: RW05GLEMPANG, Password: Rw05glempang
    if (u === 'RW05GLEMPANG' && p === 'Rw05glempang') {
      onLoginSuccess({
        role: 'server',
        username: 'RW05GLEMPANG',
        nama: 'Super Admin Server RW 05 Glempang',
        rtScope: 'Semua RT se-RW 05 Glempang',
        isPinAuthenticated: false,
      });
      onClose();
    } else {
      setServerError('Username atau password Server salah. Akses ini khusus Pengelola Server.');
    }
  };

  const getBuiltinDefaultAdmin = (): AdminRTAccount => ({
    id: 'adm_rt08',
    username: 'Admin',
    passwordHash: 'rt08rw05',
    nama: pengaturanKas?.kontakKetuaRT?.nama
      ? `${pengaturanKas.kontakKetuaRT.nama} (Ketua RT ${rtStr})`
      : `Ketua RT ${rtStr} RW ${rwStr}`,
    rt: rtStr,
    rw: rwStr,
    kontak: pengaturanKas?.kontakKetuaRT?.telp || '0812-3456-7890',
    jabatan: `Ketua RT ${rtStr} RW ${rwStr}`,
    status: 'aktif',
  });

  const handleSyncAndLoginAdmin = async (accountToSync: AdminRTAccount) => {
    setAdminError('');
    setSyncAccountBusy(true);
    try {
      if (onSyncAdminAccountToServer) {
        const res = await onSyncAdminAccountToServer(accountToSync);
        if (!res.ok) {
          setAdminError(res.message || 'Gagal menyinkronkan akun admin ke server.');
          return;
        }
        const synced = res.account || accountToSync;
        setPendingSyncAdmin(null);
        setShowRegisterAdminBox(false);
        onLoginSuccess({
          role: 'admin',
          username: synced.username,
          nama: synced.nama,
          rtScope: `RT ${synced.rt} RW ${synced.rw}`,
          isPinAuthenticated: false,
        });
        onClose();
      } else {
        onLoginSuccess({
          role: 'admin',
          username: accountToSync.username,
          nama: accountToSync.nama,
          rtScope: `RT ${accountToSync.rt} RW ${accountToSync.rw}`,
          isPinAuthenticated: false,
        });
        onClose();
      }
    } finally {
      setSyncAccountBusy(false);
    }
  };

  // Handle Admin RT Submit: verifies live against Server first, and offers "Sinkronkan Akun ke Server" if missing on Server
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
      // 1. Always fetch fresh server admin accounts so accounts added/synced on other devices are recognized immediately
      const liveServerInfo = await fetchServerAdminAccounts();
      const authoritativeServerList =
        liveServerInfo?.adminAccounts ?? serverAdminAccounts ?? [];

      const matchedOnServer = authoritativeServerList.find(
        (acc) => acc.username.trim().toLowerCase() === u.toLowerCase()
      );

      if (matchedOnServer) {
        if (matchedOnServer.passwordHash !== p) {
          setAdminError(
            'Password salah! Periksa kembali kata sandi admin RT Anda atau hubungi Server Pusat untuk pemulihan akses.'
          );
          return;
        }
        if (matchedOnServer.status === 'nonaktif') {
          setAdminError(`Akun Admin ${matchedOnServer.nama} sedang dinonaktifkan oleh Server Pusat.`);
          return;
        }

        // Valid & registered on server -> Refresh snapshot & log in
        await onRefreshSync?.();
        onLoginSuccess({
          role: 'admin',
          username: matchedOnServer.username,
          nama: matchedOnServer.nama,
          rtScope: `RT ${matchedOnServer.rt} RW ${matchedOnServer.rw}`,
          isPinAuthenticated: false,
        });
        onClose();
        return;
      }

      // 2. Not found on Server yet: check local device accounts or built-in default RT Admin
      const defaultAdm = getBuiltinDefaultAdmin();
      const localCandidates = [
        ...adminAccounts,
        ...(adminAccounts.some((a) => a.username.toLowerCase() === 'admin') ? [] : [defaultAdm]),
      ];
      const matchedLocal = localCandidates.find(
        (acc) => acc.username.trim().toLowerCase() === u.toLowerCase()
      );

      if (matchedLocal && matchedLocal.passwordHash === p) {
        setPendingSyncAdmin(matchedLocal);
        setShowRegisterAdminBox(false);
        setAdminError(
          `Akun Admin "${matchedLocal.username}" valid di perangkat ini, namun belum terdaftar di Server Pusat. Klik "Sinkronkan Akun ke Server & Masuk" di bawah agar semua data terbaca oleh perangkat lain.`
        );
        return;
      }

      if (matchedLocal && matchedLocal.passwordHash !== p) {
        setAdminError(
          'Password salah! Periksa kembali kata sandi admin RT Anda atau hubungi Server Pusat untuk pemulihan akses.'
        );
        return;
      }

      // 3. Account neither on server nor in local cache
      setAdminError(
        `Akun Admin "${u}" belum terdaftar di Server Pusat. Anda dapat menyinkronkan data dari server atau mendaftarkan & menyinkronkan akun ini ke Server jika memiliki PIN Keamanan Pengurus.`
      );
      setShowRegisterAdminBox(false);
    } finally {
      setAdminChecking(false);
    }
  };

  // Handle Warga Submit
  const handleWargaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWargaError('');

    const name = wargaUsername.trim();
    const noKKRaw = wargaPasswordKK.trim().replace(/\s+/g, '');
    const noKKDigits = noKKRaw.replace(/\D/g, '');

    if (!name) {
      setWargaError('Silakan masukkan Nama Asli Kepala Keluarga sesuai Kartu Keluarga.');
      return;
    }

    if (!noKKRaw) {
      setWargaError('Silakan masukkan Password (Nomor KK 16 digit).');
      return;
    }

    // Match with resident list by name and normalized No KK (supports digits or dashed format)
    const matched = wargaList.find((w) => {
      const matchName =
        w.nama.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.nama.toLowerCase());
      if (!w.noKK) return false;
      const storedRaw = w.noKK.trim().replace(/\s+/g, '');
      const storedDigits = storedRaw.replace(/\D/g, '');
      const matchKK =
        storedRaw === noKKRaw ||
        (noKKDigits.length >= 6 && storedDigits.length >= 6 && storedDigits === noKKDigits);
      return matchName && matchKK;
    });

    if (matched) {
      onLoginSuccess({
        role: 'warga',
        username: matched.nama,
        nama: matched.nama,
        noKK: matched.noKK,
        wargaId: matched.id,
        rtScope: `RT ${matched.rt || '08'} RW ${matched.rw || '05'}`,
        isPinAuthenticated: false,
      });
      onClose();
    } else {
      const nameOnly = wargaList.find((w) =>
        w.nama.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.nama.toLowerCase())
      );

      if (nameOnly) {
        setWargaError(`Nomor KK untuk warga "${nameOnly.nama}" tidak sesuai. Pastikan 16 digit No KK sudah benar.`);
      } else {
        setWargaError(`Data warga "${name}" dengan No KK tersebut tidak ditemukan. Silakan hubungi Admin RT atau tekan Sinkronkan Data.`);
      }
    }
  };

  const handleQuickSelectWarga = (w: Warga) => {
    setWargaUsername(w.nama);
    setWargaPasswordKK(w.noKK);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto ${
        canClose
          ? 'bg-black/65 backdrop-blur-sm'
          : 'bg-gradient-to-br from-[#063A27] via-[#0B5D3F] to-[#0F172A]'
      }`}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden my-auto">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs p-1">
              <HouseLogo size={36} variant="white" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
                <span>Menu Login Aplikasi</span>
                {(sseConnected || isCloudConnected) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] text-emerald-100">
                    <Wifi size={9} />
                    <span>{isCloudConnected ? 'Cloud & Server Live' : 'Server Live'}</span>
                  </span>
                )}
              </span>
              <h2 className="text-lg font-extrabold tracking-tight">Aplikasi {desaStr}</h2>
            </div>
          </div>
        </div>

        {/* Tab Selection: Default hanya Admin RT dan Warga (KK), Server disembunyikan */}
        <div className={`grid ${showServerTab ? 'grid-cols-3' : 'grid-cols-2'} border-b border-slate-200 bg-slate-50 p-1.5 gap-1 transition-all`}>
          <button
            type="button"
            onClick={() => { setActiveTab('admin'); setAdminError(''); }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-[#0B5D3F] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={14} />
            <span>Admin RT</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('warga'); setWargaError(''); }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'warga'
                ? 'bg-[#0B5D3F] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User size={14} />
            <span>Warga (KK)</span>
          </button>

          {showServerTab && (
            <button
              type="button"
              onClick={() => { setActiveTab('server'); setServerError(''); }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'server'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Server size={14} />
              <span>Server Pusat</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'server' ? (
            /* SERVER (SUPER ADMIN) LOGIN FORM */
            <form onSubmit={handleServerSubmit} className="space-y-4">
              <div className="rounded-2xl bg-indigo-50 p-3 text-xs text-indigo-900 border border-indigo-200/80">
                <p className="font-bold flex items-center gap-1.5">
                  <Server size={14} className="text-indigo-600" />
                  <span>Akses Server Pusat Desa:</span>
                </p>
                <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                  Menerima data seluruh RT, menambahkan Admin untuk mengelola tiap RT, mengontrol pembukuan desa, dan backup database antar-perangkat.
                </p>
              </div>

              {serverError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{serverError}</span>
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
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
              >
                Masuk Sebagai Server RW 05
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
                  Mengelola data warga 1 RT, mencatat kas/kematian, input bansos, dan mengirim laporan bulanan ke Server Desa.
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
                    <span>{adminError}</span>
                  </div>

                  {pendingSyncAdmin && (
                    <button
                      type="button"
                      disabled={syncAccountBusy}
                      onClick={() => handleSyncAndLoginAdmin(pendingSyncAdmin)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] py-2.5 px-3 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60"
                    >
                      <CloudUpload size={14} />
                      <span>
                        {syncAccountBusy
                          ? 'Menyinkronkan Akun & Data ke Server...'
                          : 'Sinkronkan Akun ke Server & Masuk'}
                      </span>
                    </button>
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
                      Akun beserta seluruh data yang tersimpan di perangkat ini akan didaftarkan ke Server agar terbaca oleh semua perangkat lain.
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
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Nama Lengkap Pengurus RT</label>
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
                      if (regPin.trim() !== currentPin) {
                        setAdminError('PIN Keamanan Pengurus salah. Gunakan PIN aplikasi yang valid untuk mendaftarkan akun ke Server.');
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
                      await handleSyncAndLoginAdmin(newAcc);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-60"
                  >
                    <CloudUpload size={13} />
                    <span>{syncAccountBusy ? 'Menyinkronkan ke Server...' : 'Daftarkan, Sinkronkan Data & Masuk'}</span>
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
                  Akun diverifikasi langsung ke Server Pusat agar data Anda otomatis masuk ke semua perangkat.
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
                  Warga hanya dapat melihat data keluarganya sendiri berdasarkan Nomor Kartu Keluarga (16 digit).
                </p>
              </div>

              {wargaError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{wargaError}</span>
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
                    placeholder="3302140508000001"
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
                className="w-full rounded-xl bg-[#0B5D3F] py-3 text-sm font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                Masuk Sebagai Warga
              </button>
            </form>
          )}

          {/* Footer security note & Discreet Server Access for App Owner */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
            {onRefreshSync && (
              <button
                type="button"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  setSyncNotice(null);
                  try {
                    await onRefreshSync();
                    setSyncNotice('Data terbaru berhasil disinkronkan dari server.');
                    setTimeout(() => setSyncNotice(null), 3500);
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-[#0B5D3F] hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                <span>
                  {isRefreshing
                    ? 'Menyinkronkan data server...'
                    : `Sinkronkan Data Server (${wargaList.length} KK, ${adminAccounts.length} Admin)`}
                </span>
              </button>
            )}

            {syncNotice && (
              <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                <Check size={12} />
                <span>{syncNotice}</span>
              </p>
            )}

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

            {/* Tombol Tersembunyi Khusus Pemilik / Pengelola Server RW 05 */}
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
      </div>
    </div>
  );
};
