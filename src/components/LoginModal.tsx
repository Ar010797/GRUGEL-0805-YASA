import React, { useState } from 'react';
import { ShieldCheck, User, Lock, KeyRound, AlertCircle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { AuthUser, Warga } from '../types';
import { HouseLogo } from './HouseLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  wargaList: Warga[];
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  wargaList,
}) => {
  const [activeTab, setActiveTab] = useState<'admin' | 'warga'>('admin');
  
  // Admin form
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [adminPassword, setAdminPassword] = useState('rt08rw05');
  const [adminError, setAdminError] = useState('');

  // Warga form
  const [wargaName, setWargaName] = useState('');
  const [wargaError, setWargaError] = useState('');

  if (!isOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const u = adminUsername.trim();
    const p = adminPassword.trim();

    if (u.toLowerCase() === 'admin' && p === 'rt08rw05') {
      onLoginSuccess({
        role: 'admin',
        username: 'Admin',
        nama: 'Administrator RT 08 RW 05',
      });
      onClose();
    } else {
      setAdminError('Username atau password Admin salah. (Gunakan Username: Admin, Password: rt08rw05)');
    }
  };

  const handleWargaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWargaError('');

    const searchName = wargaName.trim();
    if (!searchName) {
      setWargaError('Silakan masukkan nama warga Anda');
      return;
    }

    // Match with resident list or allow direct name
    const foundWarga = wargaList.find(
      (w) => w.nama.toLowerCase() === searchName.toLowerCase()
    );

    if (foundWarga) {
      onLoginSuccess({
        role: 'warga',
        username: foundWarga.nama,
        nama: foundWarga.nama,
        wargaId: foundWarga.id,
      });
      onClose();
    } else if (wargaList.length === 0) {
      // If list is empty, allow resident login with custom name
      onLoginSuccess({
        role: 'warga',
        username: searchName,
        nama: searchName,
      });
      onClose();
    } else {
      // Name not found in list
      setWargaError(`Nama "${searchName}" belum terdaftar di data warga RT 08. Silakan pilih dari nama yang tercantum di bawah.`);
    }
  };

  const handleSelectWargaQuick = (w: Warga) => {
    setWargaName(w.nama);
    onLoginSuccess({
      role: 'warga',
      username: w.nama,
      nama: w.nama,
      wargaId: w.id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden">
        {/* Top Header */}
        <div className="relative bg-gradient-to-r from-[#0B5D3F] to-[#06442D] px-6 pt-6 pb-5 text-white">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs p-1">
              <HouseLogo size={36} variant="white" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                Portal Masuk Akun
              </span>
              <h2 className="text-lg font-extrabold tracking-tight">RT 08 RW 05 Desa Kotayasa</h2>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab('admin'); setAdminError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck size={16} />
            <span>Login Admin RT</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('warga'); setWargaError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'warga'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User size={16} />
            <span>Login Warga</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'admin' ? (
            /* ADMIN LOGIN FORM */
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="rounded-2xl bg-[#E8F5EE] p-3 text-xs text-[#0B5D3F] border border-emerald-200/80">
                <p className="font-bold">Akses Penuh Pengurus / Admin RT:</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Berfungsi mencatat kas masuk, kas keluar, kas kematian, kelola data warga, dan update status iuran.
                </p>
                <p className="mt-2 text-[11px] font-mono bg-white/70 py-1 px-2 rounded-lg border border-emerald-300">
                  User: <strong>Admin</strong> • Sandi: <strong>rt08rw05</strong>
                </p>
              </div>

              {adminError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{adminError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Username Admin</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="Admin"
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="rt08rw05"
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B5D3F] py-3 text-xs font-bold text-white shadow-md hover:bg-[#084831] transition-all cursor-pointer"
              >
                <KeyRound size={16} />
                <span>Masuk sebagai Admin RT</span>
              </button>
            </form>
          ) : (
            /* WARGA LOGIN FORM */
            <form onSubmit={handleWargaSubmit} className="space-y-4">
              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
                <p className="font-bold">Akses Warga RT 08 (Hanya Melihat / Read-Only):</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Warga dapat melihat sisa tagihan/kekurangan kas masing-masing akun, histori iuran, dan informasi/pengumuman resmi dari RT.
                </p>
              </div>

              {wargaError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{wargaError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Warga (Sesuai tercantum di data KK)
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={wargaName}
                    onChange={(e) => setWargaName(e.target.value)}
                    placeholder="Ketik nama Anda (Contoh: Ahmad Fauzi)"
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Quick Select Warga if data is available */}
              {wargaList.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                    Atau langsung pilih nama warga yang terdaftar:
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 p-1.5 no-scrollbar">
                    {wargaList.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleSelectWargaQuick(w)}
                        className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-[#E8F5EE] transition-colors cursor-pointer group"
                      >
                        <span className="font-medium text-slate-700 group-hover:text-[#0B5D3F]">
                          {w.nama} (Rumah {w.noRumah})
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#0B5D3F]">
                          Masuk &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B5D3F] py-3 text-xs font-bold text-white shadow-md hover:bg-[#084831] transition-all cursor-pointer"
              >
                <span>Masuk ke Dasbor Warga</span>
                <ChevronRight size={16} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
