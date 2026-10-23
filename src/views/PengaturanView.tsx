import React, { useState } from 'react';
import {
  ArrowLeft,
  Settings,
  Save,
  RotateCcw,
  Check,
  Sparkles,
  Shield,
  History,
  Wallet,
  Heart,
  Calendar,
  Lock,
  KeyRound,
  PhoneCall,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PengaturanKas, AuthUser } from '../types';

interface PengaturanViewProps {
  pengaturanKas: PengaturanKas;
  currentUser: AuthUser | null;
  currentPin: string;
  onUpdatePin: (newPin: string) => void;
  onUpdatePengaturan: (newSetting: Partial<PengaturanKas>) => void;
  onOpenSaldoAwalModal: () => void;
  onOpenPrivacyPolicy: () => void;
  onResetEmpty: () => void;
  onLoadSample: () => void;
  onBack: () => void;
}

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  pengaturanKas,
  currentUser,
  currentPin,
  onUpdatePin,
  onUpdatePengaturan,
  onOpenSaldoAwalModal,
  onOpenPrivacyPolicy,
  onResetEmpty,
  onLoadSample,
  onBack,
}) => {
  // Annual Dues Configuration (Admin input TAHUNAN -> auto hitung BULANAN)
  const [jimpitanTahunan, setJimpitanTahunan] = useState(
    (pengaturanKas.nominalJimpitanTahunan || 300000).toString()
  );
  const [kematianTahunan, setKematianTahunan] = useState(
    (pengaturanKas.nominalKematianTahunan || 120000).toString()
  );

  // Kontak Pengurus RT
  const [namaKetuaRT, setNamaKetuaRT] = useState(pengaturanKas.kontakKetuaRT?.nama || 'Bpk. Suwardi');
  const [telpKetuaRT, setTelpKetuaRT] = useState(pengaturanKas.kontakKetuaRT?.telp || '0812-3456-7890');
  const [namaBendahara, setNamaBendahara] = useState(pengaturanKas.kontakBendahara?.nama || 'Bpk. Bambang S.');
  const [telpBendahara, setTelpBendahara] = useState(pengaturanKas.kontakBendahara?.telp || '0813-9876-5432');

  // Change PIN state
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [pinKonfirmasi, setPinKonfirmasi] = useState('');
  const [pinMessage, setPinMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [savedSettings, setSavedSettings] = useState(false);

  // Live Auto-Calculation: Tahunan ÷ 12
  const numJimpitanTahunan = parseFloat(jimpitanTahunan.replace(/[^0-9]/g, '')) || 0;
  const numJimpitanBulanan = Math.round(numJimpitanTahunan / 12);

  const numKematianTahunan = parseFloat(kematianTahunan.replace(/[^0-9]/g, '')) || 0;
  const numKematianBulanan = Math.round(numKematianTahunan / 12);

  const totalIuranTahunan = numJimpitanTahunan + numKematianTahunan;
  const totalIuranBulanan = numJimpitanBulanan + numKematianBulanan;

  const handleSaveTarif = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePengaturan({
      nominalJimpitanTahunan: numJimpitanTahunan,
      nominalJimpitanBulanan: numJimpitanBulanan,
      nominalKematianTahunan: numKematianTahunan,
      nominalKematianBulanan: numKematianBulanan,
      kontakKetuaRT: { nama: namaKetuaRT, telp: telpKetuaRT },
      kontakBendahara: { nama: namaBendahara, telp: telpBendahara },
    });
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 2500);
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (pinLama !== currentPin) {
      setPinMessage({ text: 'PIN lama Anda tidak sesuai!', type: 'error' });
      return;
    }

    if (!/^\d{6}$/.test(pinBaru)) {
      setPinMessage({ text: 'PIN baru harus terdiri dari tepat 6 digit angka!', type: 'error' });
      return;
    }

    if (pinBaru !== pinKonfirmasi) {
      setPinMessage({ text: 'Konfirmasi PIN baru tidak cocok!', type: 'error' });
      return;
    }

    onUpdatePin(pinBaru);
    setPinMessage({ text: 'PIN 6 digit berhasil diubah! Gunakan PIN baru saat membuka aplikasi.', type: 'success' });
    setPinLama('');
    setPinBaru('');
    setPinKonfirmasi('');
  };

  const isWarga = currentUser?.role === 'warga';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {isWarga ? 'Pengaturan Akun & PIN Keamanan' : 'Pengaturan Sistem & Keamanan'}
          </h1>
          <p className="text-xs text-slate-500">
            {isWarga
              ? 'Kelola PIN 6 digit untuk kunci aplikasi serta lihat standar kebijakan privasi data keluarga Anda'
              : 'Kelola nominal tahunan (auto bulanan), ubah PIN 6 digit, kontak admin, dan kebijakan privasi'}
          </p>
        </div>
      </div>

      {isWarga ? (
        /* KHUSUS AKUN WARGA: HANYA PIN 6 DIGIT & KEBIJAKAN PRIVASI (TIDAK BISA UBAH IURAN / RESET DATA) */
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Ubah PIN 6 Digit */}
          <form onSubmit={handleSavePin} className="rounded-3xl bg-white p-6 sm:p-7 shadow-xs border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
                  <Lock size={20} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Ubah Kunci Aplikasi (PIN 6 Digit)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Akun: <strong className="text-slate-700">{currentUser?.nama}</strong> ({currentUser?.username})
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                Warga RT 08
              </span>
            </div>

            <div className="rounded-2xl bg-amber-50/70 p-4 border border-amber-200/80 flex items-start gap-3">
              <KeyRound size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1">
                <p className="font-bold">Keamanan Layar Warga</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  PIN 6 digit angka ini diminta setiap kali membuka aplikasi untuk melindungi privasi data keluarga dan status iuran Anda.
                </p>
              </div>
            </div>

            {pinMessage && (
              <div
                className={`flex items-center gap-2.5 rounded-2xl p-4 text-xs font-semibold ${
                  pinMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {pinMessage.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertCircle size={18} className="text-rose-600 shrink-0" />}
                <span>{pinMessage.text}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                PIN Lama Anda
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={pinLama}
                onChange={(e) => setPinLama(e.target.value.replace(/\D/g, ''))}
                placeholder="Ketik 6 digit PIN lama (Awal: 123456)"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-mono font-bold text-slate-800 focus:border-[#0B5D3F] focus:ring-2 focus:ring-[#0B5D3F]/10 outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  PIN Baru (6 Digit Angka)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={pinBaru}
                  onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 digit angka baru"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-mono font-bold text-slate-800 focus:border-[#0B5D3F] focus:ring-2 focus:ring-[#0B5D3F]/10 outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Konfirmasi PIN Baru
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={pinKonfirmasi}
                  onChange={(e) => setPinKonfirmasi(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ulangi 6 digit baru"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-mono font-bold text-slate-800 focus:border-[#0B5D3F] focus:ring-2 focus:ring-[#0B5D3F]/10 outline-hidden"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-[#0B5D3F] py-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Save size={16} />
              <span>Simpan & Perbarui PIN 6 Digit</span>
            </button>
          </form>

          {/* Kartu Profil Warga & Privasi */}
          <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#0B5D3F]">
                <Shield size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Perlindungan Data Pribadi Warga</h3>
                <p className="text-xs text-slate-500">
                  Data keluarga & KK Anda tersimpan aman dan terenkripsi sesuai UU Perlindungan Data Pribadi (UU PDP No. 27/2022).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="w-full rounded-2xl border border-emerald-600 bg-[#E8F5EE] py-3 text-xs font-bold text-[#0B5D3F] hover:bg-emerald-100/70 transition-colors cursor-pointer"
            >
              Baca Kebijakan Privasi RT 08 RW 05
            </button>
          </div>
        </div>
      ) : (
        /* MODE ADMIN: PENGATURAN LENGKAP */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PANEL 1: PENGATURAN NOMINAL TAHUNAN & AUTO BULANAN */}
          <div className="space-y-6">
            <form onSubmit={handleSaveTarif} className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Wallet size={18} className="text-[#0B5D3F]" />
                  <span>Pengaturan Nominal Tahunan (Auto Bulanan)</span>
                </h2>
                {savedSettings && (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                    <Check size={14} />
                    <span>Tersimpan!</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Admin mengatur <strong>Nominal Tahunan</strong>, sistem secara <strong>otomatis menghitung nominal bulanan</strong> (Nominal Tahunan &divide; 12) yang tampil di kartu warga dan dasbor.
              </p>

              {/* Jimpitan Warga */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    1. Nominal Jimpitan / Iuran Warga (Setahun)
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Auto: Rp {numJimpitanBulanan.toLocaleString('id-ID')} / bulan
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="text"
                    required
                    value={jimpitanTahunan}
                    onChange={(e) => setJimpitanTahunan(e.target.value)}
                    placeholder="300000"
                    className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2 text-sm font-bold text-slate-800 bg-white focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Kalkulasi otomatis: Rp {numJimpitanTahunan.toLocaleString('id-ID')} &divide; 12 = <strong>Rp {numJimpitanBulanan.toLocaleString('id-ID')} / bulan</strong> per KK.
                </p>
              </div>

              {/* Uang Kematian / Kain Mori */}
              <div className="rounded-2xl bg-rose-50/60 p-4 border border-rose-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                    <Heart size={14} className="text-rose-600" fill="currentColor" />
                    <span>2. Kas Kematian & Kain Mori (Setahun)</span>
                  </label>
                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
                    Auto: Rp {numKematianBulanan.toLocaleString('id-ID')} / bulan
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="text"
                    required
                    value={kematianTahunan}
                    onChange={(e) => setKematianTahunan(e.target.value)}
                    placeholder="120000"
                    className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2 text-sm font-bold text-slate-800 bg-white focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Kalkulasi otomatis: Rp {numKematianTahunan.toLocaleString('id-ID')} &divide; 12 = <strong>Rp {numKematianBulanan.toLocaleString('id-ID')} / bulan</strong> untuk kain mori & santunan.
                </p>
              </div>

              {/* Total Ringkasan Tahunan */}
              <div className="rounded-2xl bg-[#E8F5EE] p-4 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B5D3F]">
                    Total Kewajiban Warga
                  </span>
                  <p className="text-base font-extrabold text-[#0B5D3F]">
                    Rp {totalIuranTahunan.toLocaleString('id-ID')} / tahun
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-slate-500">Bila Dibayar Bulanan:</span>
                  <p className="text-base font-extrabold text-slate-800">
                    Rp {totalIuranBulanan.toLocaleString('id-ID')} / bln
                  </p>
                </div>
              </div>

              {/* Kontak Pengurus RT */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Kontak Bantuan Pengurus RT (Tampil di Lupa Password)
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 font-semibold block mb-0.5">Ketua RT 08</label>
                    <input
                      type="text"
                      value={namaKetuaRT}
                      onChange={(e) => setNamaKetuaRT(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    />
                    <input
                      type="text"
                      value={telpKetuaRT}
                      onChange={(e) => setTelpKetuaRT(e.target.value)}
                      placeholder="0812-3456-7890"
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 font-semibold block mb-0.5">Bendahara RT 08</label>
                    <input
                      type="text"
                      value={namaBendahara}
                      onChange={(e) => setNamaBendahara(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    />
                    <input
                      type="text"
                      value={telpBendahara}
                      onChange={(e) => setTelpBendahara(e.target.value)}
                      placeholder="0813-9876-5432"
                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs mt-1"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B5D3F] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
              >
                <Save size={15} />
                <span>Simpan Pengaturan Iuran & Kontak RT</span>
              </button>
            </form>

            {/* Quick Kas Masa Lalu Trigger */}
            <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-[#0B5D3F]">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Input Kas Masa Lalu</h3>
                  <p className="text-xs text-slate-500">
                    Sisa saldo tahun lalu yang belum tercatat di aplikasi
                  </p>
                </div>
              </div>
              <button
                onClick={onOpenSaldoAwalModal}
                className="rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white hover:bg-[#084831] cursor-pointer"
              >
                Atur Saldo Lalu
              </button>
            </div>
          </div>

          {/* PANEL 2: GANTI PIN 6 DIGIT & KEBIJAKAN PRIVASI */}
          <div className="space-y-6">
            {/* Ubah PIN 6 Digit */}
            <form onSubmit={handleSavePin} className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Lock size={18} className="text-[#0B5D3F]" />
                  <span>Ubah Kunci Aplikasi (PIN 6 Digit)</span>
                </h2>
                <span className="text-[11px] font-semibold text-slate-400">
                  Akun: {currentUser?.nama}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                PIN 6 digit diminta setiap kali membuka aplikasi untuk menjaga keamanan data kas dan privasi warga dari intip layar.
              </p>

              {pinMessage && (
                <div
                  className={`flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
                    pinMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {pinMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{pinMessage.text}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  PIN Lama Anda (Default Awal: 123456)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={pinLama}
                  onChange={(e) => setPinLama(e.target.value.replace(/\D/g, ''))}
                  placeholder="6 digit PIN lama"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    PIN Baru (6 Digit)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={pinBaru}
                    onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 digit angka baru"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Konfirmasi PIN Baru
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={pinKonfirmasi}
                    onChange={(e) => setPinKonfirmasi(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ulangi 6 digit"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#0B5D3F] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
              >
                Simpan & Perbarui PIN 6 Digit
              </button>
            </form>

            {/* Kebijakan Privasi & Reset Data */}
            <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-[#0B5D3F]" />
                <span>Kebijakan Privasi & Keamanan Data</span>
              </h3>

              <p className="text-xs text-slate-500 leading-relaxed">
                Pelajari standar keamanan data pribadi warga RT 08 RW 05 Desa Kotayasa sesuai UU No. 27 Tahun 2022 (UU PDP).
              </p>

              <button
                onClick={onOpenPrivacyPolicy}
                className="w-full rounded-xl border border-emerald-600 bg-emerald-50/50 py-2.5 text-xs font-bold text-[#0B5D3F] hover:bg-emerald-100/70 transition-colors cursor-pointer"
              >
                Baca Kebijakan Privasi Lengkap
              </button>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700">Manajemen Data Simulasi</h4>
                  <p className="text-[11px] text-slate-400">Reset ke kondisi kosong atau isi data contoh</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onResetEmpty}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    Reset Kosong
                  </button>
                  <button
                    type="button"
                    onClick={onLoadSample}
                    className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Isi Contoh
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
