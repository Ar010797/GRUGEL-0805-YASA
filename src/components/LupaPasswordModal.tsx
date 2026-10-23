import React from 'react';
import { X, PhoneCall, MessageSquare, ShieldAlert, UserCheck, MapPin, Clock } from 'lucide-react';
import { PengaturanKas } from '../types';

interface LupaPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  pengaturanKas: PengaturanKas;
}

export const LupaPasswordModal: React.FC<LupaPasswordModalProps> = ({
  isOpen,
  onClose,
  pengaturanKas,
}) => {
  if (!isOpen) return null;

  const kontakList = [
    {
      jabatan: 'Ketua RT 08 RW 05',
      nama: pengaturanKas.kontakKetuaRT?.nama || 'Bpk. Suwardi',
      telp: pengaturanKas.kontakKetuaRT?.telp || '0812-3456-7890',
      whatsapp: '6281234567890',
      tugas: 'Verifikasi identitas warga & reset sandi / PIN',
    },
    {
      jabatan: 'Bendahara RT 08',
      nama: pengaturanKas.kontakBendahara?.nama || 'Bpk. Bambang S.',
      telp: pengaturanKas.kontakBendahara?.telp || '0813-9876-5432',
      whatsapp: '6281398765432',
      tugas: 'Konfirmasi bukti pembayaran & status iuran kas',
    },
  ];

  const handleHubungiWA = (whatsapp: string, namaPengurus: string) => {
    const text = encodeURIComponent(
      `Assalamu'alaikum ${namaPengurus}, saya warga RT 08 RW 05 Desa Kotayasa. Saya membutuhkan bantuan terkait informasi akun / lupa password / PIN di Aplikasi Kas RT.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${whatsapp}&text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">
                Lupa Password & Bantuan Akun
              </h3>
              <p className="text-xs text-slate-500">
                Hubungi Pengurus Resmi RT 08 RW 05 Desa Kotayasa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200/80 text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-1">Panduan Login Warga:</p>
            <p>
              &bull; <strong>Username:</strong> Nama Asli Kepala Keluarga (sesuai Kartu Keluarga).<br />
              &bull; <strong>Password:</strong> 16 Digit Nomor Kartu Keluarga (No KK) Anda.<br />
              &bull; <strong>PIN Awal:</strong> 123456 (dapat diubah setelah masuk di menu Pengaturan).
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-700">
            Jika Nomor KK Anda belum terdaftar atau lupa akun, silakan hubungi pengurus RT berikut:
          </p>

          <div className="space-y-3">
            {kontakList.map((k, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 flex items-center justify-between hover:bg-white hover:border-emerald-300 hover:shadow-xs transition-all"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#0B5D3F]">
                    {k.jabatan}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">{k.nama}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{k.telp}</p>
                  <p className="text-[11px] text-slate-400 mt-1 italic">{k.tugas}</p>
                </div>

                <button
                  onClick={() => handleHubungiWA(k.whatsapp, k.nama)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] px-3.5 py-2 text-xs font-bold text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <MessageSquare size={14} />
                  <span>Kirim WA</span>
                </button>
              </div>
            ))}
          </div>

          {/* Posko RT */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
            <MapPin size={16} className="text-[#0B5D3F] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-700">Posko Sekretariat RT 08 RW 05:</p>
              <p className="text-[11px]">Pos Kamling RT 08, Dusun Kotayasa, Kec. Sumbang, Kab. Banyumas</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3.5 text-right">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-200 hover:bg-slate-300 px-5 py-2 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
