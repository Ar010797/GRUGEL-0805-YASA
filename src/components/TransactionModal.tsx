import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown, Heart, Check } from 'lucide-react';
import { Transaction, TransactionType } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id'>) => void;
  defaultType?: TransactionType;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultType = 'masuk',
}) => {
  const [tipe, setTipe] = useState<TransactionType>(defaultType);
  const [kategori, setKategori] = useState('Iuran Bulanan');
  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState('');
  const [namaWarga, setNamaWarga] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(nominal.replace(/[^0-9]/g, '')) || 0;
    if (num <= 0) return;

    onSave({
      tanggal,
      kategori,
      keterangan: keterangan || (tipe === 'masuk' ? 'Iuran Warga' : 'Pengeluaran Kegiatan'),
      nominal: num,
      tipe,
      namaWarga: namaWarga || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/60 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#0B5D3F]">Catat Transaksi Kas</h3>
            <p className="text-xs text-slate-500">RT 08 RW 05 Desa Kotayasa</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Tipe Transaksi */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Jenis Transaksi</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setTipe('masuk'); setKategori('Iuran Warga'); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'masuk'
                    ? 'bg-[#10B981] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
                <span>Kas Masuk</span>
              </button>

              <button
                type="button"
                onClick={() => { setTipe('keluar'); setKategori('Kegiatan RT'); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'keluar'
                    ? 'bg-[#EF4444] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowDown size={14} strokeWidth={2.5} />
                <span>Kas Keluar</span>
              </button>

              <button
                type="button"
                onClick={() => { setTipe('kematian'); setKategori('Santunan Kematian'); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'kematian'
                    ? 'bg-[#F43F5E] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Heart size={14} fill="currentColor" />
                <span>Kematian</span>
              </button>
            </div>
          </div>

          {/* Nominal */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nominal (Rupiah)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">Rp</span>
              <input
                type="number"
                required
                min="1000"
                step="1000"
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                placeholder="50000"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Nama Warga / Sumber */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Warga / Keterangan Pihak</label>
            <input
              type="text"
              value={namaWarga}
              onChange={(e) => setNamaWarga(e.target.value)}
              placeholder="Contoh: Pak Suparman (No. 12)"
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          {/* Keterangan */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Keterangan Tambahan</label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Iuran Kas Warga Bulan Oktober"
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          {/* Tanggal */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Transaksi</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Simpan Transaksi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
