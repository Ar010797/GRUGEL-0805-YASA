import React, { useState } from 'react';
import { ArrowLeft, ArrowDown, Plus, Search, Receipt, Heart, AlertCircle } from 'lucide-react';
import { Transaction } from '../types';

interface KasKeluarViewProps {
  transactions: Transaction[];
  onOpenTxModal: () => void;
  onBack: () => void;
}

export const KasKeluarView: React.FC<KasKeluarViewProps> = ({
  transactions,
  onOpenTxModal,
  onBack,
}) => {
  const [search, setSearch] = useState('');
  const keluarList = transactions.filter((t) => t.tipe === 'keluar');
  const totalKeluar = keluarList.reduce((acc, t) => acc + t.nominal, 0);

  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Kas Keluar</h1>
            <p className="text-xs text-slate-500">Pencatatan pengeluaran kegiatan warga dan operasional RT 08 RW 05</p>
          </div>
        </div>

        <button
          onClick={onOpenTxModal}
          className="flex items-center gap-2 rounded-xl bg-[#EF4444] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#DC2626] transition-all cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Catat Pengeluaran</span>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-r from-[#DC2626] to-[#991B1B] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <ArrowDown size={24} strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-xs font-semibold text-rose-200">Total Kas Keluar</span>
              <p className="text-2xl font-extrabold">{formatRupiah(totalKeluar)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Transaksi Keluar</span>
            <p className="text-base font-bold text-slate-800 mt-1">{keluarList.length} Transaksi</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <Receipt size={18} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Verifikasi Pengurus</span>
            <p className="text-base font-bold text-slate-800 mt-1">Bendahara & Ketua RT</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0B5D3F]">
            <AlertCircle size={18} />
          </div>
        </div>
      </div>

      {/* List / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {keluarList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <ArrowDown size={32} strokeWidth={2} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada transaksi pengeluaran</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Kas pengeluaran saat ini masih kosong (Rp 0). Belum ada biaya operasional atau pembelanjaan kegiatan yang dicatat.
            </p>
            <button
              onClick={onOpenTxModal}
              className="mt-4 rounded-xl bg-[#EF4444] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#DC2626] transition-all cursor-pointer"
            >
              + Catat Pengeluaran Baru
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3.5 px-6">Tanggal</th>
                <th className="py-3.5 px-6">Keperluan</th>
                <th className="py-3.5 px-6">Penerima / Toko</th>
                <th className="py-3.5 px-6">Kategori</th>
                <th className="py-3.5 px-6 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keluarList.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-6 text-slate-500">{t.tanggal}</td>
                  <td className="py-3.5 px-6 font-bold text-slate-800">{t.keterangan}</td>
                  <td className="py-3.5 px-6 text-slate-600">{t.namaWarga || 'Operasional RT'}</td>
                  <td className="py-3.5 px-6">
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                      {t.kategori}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right font-extrabold text-rose-600">
                    -{formatRupiah(t.nominal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
