import React, { useState } from 'react';
import { ShieldCheck, User, Lock, KeyRound, AlertCircle, HelpCircle, X, CreditCard } from 'lucide-react';
import { AuthUser, Warga, PengaturanKas } from '../types';
import { HouseLogo } from './HouseLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
  wargaList: Warga[];
  onOpenLupaPassword: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  wargaList,
  onOpenLupaPassword,
}) => {
  const [activeTab, setActiveTab] = useState<'admin' | 'warga'>('admin');

  // Admin form
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [adminPassword, setAdminPassword] = useState('rt08rw05');
  const [adminError, setAdminError] = useState('');

  // Warga form: Username = Nama Asli, Password = Nomor KK (16 digit)
  const [wargaUsername, setWargaUsername] = useState('');
  const [wargaPasswordKK, setWargaPasswordKK] = useState('');
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
        isPinAuthenticated: false,
      });
      onClose();
    } else {
      setAdminError('Username atau password Admin salah. (Gunakan Username: Admin, Password: rt08rw05)');
    }
  };

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
      const matchName = w.nama.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.nama.toLowerCase());
      // Check No KK match
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
        isPinAuthenticated: false,
      });
      onClose();
    } else {
      // Check if name exists but KK is wrong
      const nameOnly = wargaList.find((w) =>
        w.nama.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.nama.toLowerCase())
      );

      if (nameOnly) {
        setWargaError(`Nomor KK untuk warga "${nameOnly.nama}" tidak sesuai. Pastikan 16 digit No KK sudah benar.`);
      } else {
        setWargaError(`Data warga "${name}" dengan No KK tersebut tidak ditemukan. Silakan hubungi Admin RT untuk verifikasi.`);
      }
    }
  };

  // Quick select helper for demo convenience
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
                Sistem Login Dua Peran
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
            <span>Login Warga (No KK)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === 'admin' ? (
            /* ADMIN LOGIN FORM */
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="rounded-2xl bg-[#E8F5EE] p-3 text-xs text-[#0B5D3F] border border-emerald-200/80">
                <p className="font-bold">Akses Penuh Pengurus RT:</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Mencatat kas masuk/keluar, kas kematian, upload foto KK, data bantuan pemerintah, dan pengumuman warga.
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
                  Username Admin
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
                  Password Admin
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
                  Akun awal: Username: <strong className="text-slate-600">Admin</strong>, Password: <strong className="text-slate-600">rt08rw05</strong>
                </p>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#0B5D3F] py-3 text-sm font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                Masuk Sebagai Admin
              </button>
            </form>
          ) : (
            /* WARGA LOGIN FORM */
            <form onSubmit={handleWargaSubmit} className="space-y-4">
              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200/80">
                <p className="font-bold">Privasi Warga Terlindungi (Sesuai UU PDP):</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
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

          {/* Footer security note */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={onOpenLupaPassword}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0B5D3F] transition-colors cursor-pointer"
            >
              <HelpCircle size={14} />
              <span>Butuh Bantuan Akun atau Reset PIN? Hubungi Pengurus RT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
