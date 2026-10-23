import React, { useState } from 'react';
import { X, History, Check, Wallet, Heart, AlertCircle } from 'lucide-react';
import { PengaturanKas } from '../types';

interface SaldoAwalModalProps {
  isOpen: boolean;
  onClose: () => void;
  pengaturanKas: PengaturanKas;
  onSaveSaldoAwal: (kasUmum: number, kasKematian: number, keterangan: string, tanggal: string) => void;
}

export const SaldoAwalModal: React.FC<SaldoAwalModalProps> = ({
  isOpen,
  onClose,
  pengaturanKas,
  onSaveSaldoAwal,
}) => {
  const [kasUmum, setKasUmum] = useState(pengaturanKas.saldoAwalKasUmum.toString());
  const [kasKematian, setKasKematian] = useState(pengaturanKas.saldoAwalKasKematian.toString());
  const [keterangan, setKeterangan] = useState(pengaturanKas.keteranganSaldoAwal || 'Sisa Kas RT Tahun Lalu (Pindahan Pembukuan Manual)');
  const [tanggal, setTanggal] = useState(pengaturanKas.tanggalSaldoAwal || '2026-01-01');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valUmum = parseFloat(kasUmum.replace(/[^0-9]/g, '')) || 0;
    const valKematian = parseFloat(kasKematian.replace(/[^0-9]/g, '')) || 0;

    onSaveSaldoAwal(valUmum, valKematian, keterangan, tanggal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">
                Input Kas Masa Lalu / Saldo Awal Pindahan
              </h3>
              <p className="text-xs text-slate-500">
                Pencatatan sisa kas terdahulu yang belum dimasukkan ke aplikasi
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-2xl bg-amber-50 p-3.5 text-xs text-amber-900 border border-amber-200 leading-relaxed">
            <div className="flex items-center gap-2 font-bold mb-1">
              <AlertCircle size={15} className="text-amber-700" />
              <span>Fungsi Saldo Pindahan:</span>
            </div>
            Masukkan sisa dana kas RT atau kas kematian dari pembukuan buku kas manual tahun-tahun sebelumnya agar total kas di aplikasi langsung akurat dan sesuai keadaan riil.
          </div>

          {/* Saldo Kas Umum Masa Lalu */}
          <div>
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <Wallet size={15} className="text-[#0B5D3F]" />
              <span>Sisa Kas Umum RT Masa Lalu (Rp)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={kasUmum}
                onChange={(e) => setKasUmum(e.target.value)}
                placeholder="Contoh: 1500000"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm font-bold text-slate-900 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Saldo Kas Kematian Masa Lalu */}
          <div>
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <Heart size={15} className="text-[#F43F5E]" />
              <span>Sisa Kas Kematian (Mori & Duka) Masa Lalu (Rp)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={kasKematian}
                onChange={(e) => setKasKematian(e.target.value)}
                placeholder="Contoh: 800000"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm font-bold text-slate-900 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Dana khusus cadangan kain mori dan santunan pemulasaraan jenazah warga RT 08.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Cut-Off / Pindahan</label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Keterangan Sumber Dana</label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Sisa Kas 2025 Buku Lama"
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Simpan Saldo Masa Lalu</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
