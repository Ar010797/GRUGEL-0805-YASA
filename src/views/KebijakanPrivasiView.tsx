import React from 'react';
import { ShieldCheck, Lock, EyeOff, Server, FileCheck, ArrowLeft, CheckCircle2, UserCheck, AlertTriangle, Clock } from 'lucide-react';

interface KebijakanPrivasiViewProps {
  onBack: () => void;
}

export const KebijakanPrivasiView: React.FC<KebijakanPrivasiViewProps> = ({ onBack }) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Kebijakan Privasi & Keamanan Data</h1>
          <p className="text-xs text-slate-500">
            Aplikasi Kas Warga RT 08 RW 05 Desa Kotayasa &bull; Kepatuhan UU No. 27 Tahun 2022 (UU PDP)
          </p>
        </div>
      </div>

      {/* Hero Badge */}
      <div className="rounded-3xl bg-gradient-to-r from-[#0B5D3F] to-[#07402B] p-6 lg:p-8 text-white shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
            <ShieldCheck size={28} className="text-emerald-200" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
              Komitmen Perlindungan Data Warga
            </span>
            <h2 className="text-lg lg:text-xl font-extrabold">Data Keluarga Anda Aman & Terlindungi</h2>
          </div>
        </div>
        <p className="text-xs lg:text-sm text-emerald-100/90 leading-relaxed">
          Pengurus RT 08 RW 05 Desa Kotayasa berkomitmen penuh menjaga kerahasiaan seluruh data kependudukan (Nomor Kartu Keluarga, NIK, dan catatan administrasi iuran warga). Seluruh pengelolaan data dijalankan sesuai dengan prinsip Undang-Undang Perlindungan Data Pribadi Republik Indonesia.
        </p>
      </div>

      {/* 5 Core Privacy Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pillar 1 */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2.5 text-[#0B5D3F]">
            <EyeOff size={20} />
            <h3 className="text-sm font-bold text-slate-900">1. Privasi Ketat Antar Warga</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Setiap akun warga hanya dapat mengakses data keluarga dan catatan iuran miliknya sendiri berdasarkan 16 digit Nomor Kartu Keluarga. Warga tidak memiliki izin untuk melihat data kependudukan atau riwayat iuran warga lain.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2.5 text-[#0B5D3F]">
            <Lock size={20} />
            <h3 className="text-sm font-bold text-slate-900">2. Enkripsi Penyimpanan Sensitif</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Data NIK dan No KK disimpan dalam bentuk terenkripsi menggunakan algoritma standar industri. Pada antarmuka publik atau tampilan sekilas, NIK disensor (masked) untuk mencegah intip layar oleh pihak yang tidak berhak.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2.5 text-[#0B5D3F]">
            <Server size={20} />
            <h3 className="text-sm font-bold text-slate-900">3. Pemrosesan OCR di Perangkat (On-Device)</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Pemindaian foto Kartu Keluarga (KK) oleh pengurus RT diproses langsung di perangkat aplikasi tanpa mengirimkan berkas gambar mentah ke server pihak ketiga yang tidak terverifikasi.
          </p>
        </div>

        {/* Pillar 4 */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2.5 text-[#0B5D3F]">
            <UserCheck size={20} />
            <h3 className="text-sm font-bold text-slate-900">4. Pembatasan Menu Bantuan Sosial</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Data program bantuan pemerintah (BPNT, PKH, Bansos, Sembako) hanya dapat diakses oleh Pengurus RT untuk keperluan koordinasi penyaluran dan 100% tersembunyi dari dashboard warga demi mencegah potensi friksi sosial.
          </p>
        </div>

        {/* Pillar 5 */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs space-y-2 md:col-span-2">
          <div className="flex items-center gap-2.5 text-[#0B5D3F]">
            <Clock size={20} />
            <h3 className="text-sm font-bold text-slate-900">5. Kunci PIN 6 Digit & Auto-Logout Sesi 5 Menit</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Aplikasi dilengkapi lapisan keamanan ganda: Kunci PIN 6 Digit (dengan proteksi kunci otomatis jika salah 3 kali) serta pemutusan sesi otomatis (Auto-Logout) setelah 5 menit tidak ada aktivitas interaksi layar, menjamin keamanan saat ponsel diletakkan.
          </p>
        </div>
      </div>

      {/* Contact Authority */}
      <div className="rounded-2xl bg-[#E8F5EE] p-5 border border-emerald-200/80 text-xs text-[#0B5D3F] space-y-2">
        <h4 className="font-bold">Pertanyaan Terkait Data Pribadi:</h4>
        <p className="leading-relaxed text-emerald-900">
          Jika Anda memiliki pertanyaan terkait pembaruan data anggota keluarga, koreksi NIK/No KK, atau permohonan penghapusan akun, silakan hubungi Sekretariat RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas.
        </p>
      </div>
    </div>
  );
};
