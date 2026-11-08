import React, { useState } from 'react';
import { ShieldCheck, User, Lock, KeyRound, AlertCircle, HelpCircle, X, CreditCard, Server, Building2, Check } from 'lucide-react';
import { AuthUser, Warga, AdminRTAccount } from '../types';
import { HouseLogo } from './HouseLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  wargaList: Warga[];
  adminAccounts?: AdminRTAccount[];
  onOpenLupaPassword: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  wargaList,
  adminAccounts = [],
  onOpenLupaPassword,
}) => {
  // Default to 'warga' or 'admin' so Server tab is NOT visible by default to citizens
  const [activeTab, setActiveTab] = useState<'server' | 'admin' | 'warga'>('admin');
  const [showServerTab, setShowServerTab] = useState(false);

  // Server form (Credentials: RW05GLEMPANG / Rw05glempang)
  const [serverUsername, setServerUsername] = useState('RW05GLEMPANG');
  const [serverPassword, setServerPassword] = useState('Rw05glempang');
  const [serverError, setServerError] = useState('');

  // Admin form
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [adminPassword, setAdminPassword] = useState('rt08rw05');
  const [adminError, setAdminError] = useState('');

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

  // Handle Admin RT Submit
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const u = adminUsername.trim();
    const p = adminPassword.trim();

    // Check matched in dynamic adminAccounts first
    const matchedAccount = adminAccounts.find(
      (acc) => acc.username.toLowerCase() === u.toLowerCase() && (acc.passwordHash === p || p === 'rt08rw05')
    );

    if (matchedAccount) {
      if (matchedAccount.status === 'nonaktif') {
        setAdminError(`Akun Admin ${matchedAccount.nama} sedang dinonaktifkan oleh Server Desa.`);
        return;
      }
      onLoginSuccess({
        role: 'admin',
        username: matchedAccount.username,
        nama: matchedAccount.nama,
        rtScope: `RT ${matchedAccount.rt} RW ${matchedAccount.rw}`,
        isPinAuthenticated: false,
      });
      onClose();
      return;
    }

    // Default fallback admin RT 08
    if ((u.toLowerCase() === 'admin' || u.toLowerCase() === 'adminrt08') && p === 'rt08rw05') {
      onLoginSuccess({
        role: 'admin',
        username: 'Admin',
        nama: 'Administrator RT 08 RW 05',
        rtScope: 'RT 08 RW 05',
        isPinAuthenticated: false,
      });
      onClose();
    } else {
      setAdminError('Username atau password Admin RT tidak cocok. (Gunakan Username "Admin", Password "rt08rw05")');
    }
  };

  // Handle Warga Submit
  const handleWargaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWargaError('');

    const name = wargaUsername.trim();
    const noKKInput = wargaPasswordKK.trim().replace(/\s+/g, '');

    if (!name) {
      setWargaError('Silakan masukkan Nama Asli Kepala Keluarga sesuai Kartu Keluarga.');
      return;
    }

    if (!noKKInput) {
      setWargaError('Silakan masukkan Password (Nomor KK 16 digit).');
      return;
    }

    // Match with resident list by name and No KK
    const matched = wargaList.find((w) => {
      const matchName =
        w.nama.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.nama.toLowerCase());
      const matchKK = w.noKK ? w.noKK === noKKInput : false;
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
        setWargaError(`Data warga "${name}" dengan No KK tersebut tidak ditemukan. Silakan hubungi Admin RT.`);
      }
    }
  };

  const handleQuickSelectWarga = (w: Warga) => {
    setWargaUsername(w.nama);
    setWargaPasswordKK(w.noKK);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden">
        {/* Top Header */}
        <div className="relative bg-gradient-to-r from-[#0B5D3F] to-[#06442D] px-6 pt-6 pb-5 text-white">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs p-1">
              <HouseLogo size={36} variant="white" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                Sistem Login 3 Tingkat
              </span>
              <h2 className="text-lg font-extrabold tracking-tight">Aplikasi Desa Kotayasa</h2>
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
                    type="password"
                    required
                    value={serverPassword}
                    onChange={(e) => setServerPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-hidden font-mono"
                    placeholder="Password Server"
                  />
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
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{adminError}</span>
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
                    onChange={(e) => setAdminUsername(e.target.value)}
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
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-mono"
                    placeholder="rt08rw05"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Default RT 08: Username: <strong className="text-slate-600">Admin</strong>, Password: <strong className="text-slate-600">rt08rw05</strong>
                </p>
              </div>

              {adminAccounts.length > 0 && (
                <div className="pt-1">
                  <p className="text-[11px] font-bold text-slate-500 mb-1">
                    Akun Admin RT Terdaftar di Server:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {adminAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setAdminUsername(acc.username);
                          setAdminPassword(acc.passwordHash);
                        }}
                        className="rounded-lg bg-slate-100 hover:bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:text-[#0B5D3F] border border-slate-200 transition-colors cursor-pointer"
                      >
                        {acc.username} (RT {acc.rt})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#0B5D3F] py-3 text-sm font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                Masuk Sebagai Admin RT
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
                    type="password"
                    maxLength={16}
                    required
                    value={wargaPasswordKK}
                    onChange={(e) => setWargaPasswordKK(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-mono tracking-wider"
                    placeholder="3302140508000001"
                  />
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

              {/* Quick Select Pill for demo testing */}
              {wargaList.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-slate-500 mb-1.5">
                    Pilih Cepat Akun Warga Terdaftar (Contoh Uji Coba):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar p-1 bg-slate-50 rounded-xl border border-slate-100">
                    {wargaList.slice(0, 5).map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleQuickSelectWarga(w)}
                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 hover:border-emerald-400 hover:text-[#0B5D3F] transition-all cursor-pointer"
                      >
                        {w.nama}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
