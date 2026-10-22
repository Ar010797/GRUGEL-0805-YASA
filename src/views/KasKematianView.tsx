import React, { useState } from 'react';
import { ArrowLeft, Heart, Plus, Search, ShieldCheck } from 'lucide-react';
import { Transaction } from '../types';

interface KasKematianViewProps {
  transactions: Transaction[];
  onOpenTxModal: () => void;
  onBack: () => void;
}

export const KasKematianView: React.FC<KasKematianViewProps> = ({
  transactions,
  onOpenTxModal,
  onBack,
}) => {
  const kematianList = transactions.filter((t) => t.tipe === 'kematian');
  const totalKematian = kematianList.reduce((acc, t) => acc + t.nominal, 0);

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
            <h1 className="text-xl font-extrabold text-slate-900">Kas Kematian & Duka</h1>
            <p className="text-xs text-slate-500">Dana sosial santunan duka untuk keluarga warga yang berduka</p>
          </div>
        </div>

        <button
          onClick={onOpenTxModal}
          className="flex items-center gap-2 rounded-xl bg-[#F43F5E] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#E11D48] transition-all cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Catat Santunan Duka</span>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-r from-[#F43F5E] to-[#BE123C] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Heart size={24} fill="currentColor" />
            </div>
            <div>
              <span className="text-xs font-semibold text-rose-200">Total Kas Kematian</span>
              <p className="text-2xl font-extrabold">{formatRupiah(totalKematian)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Santunan Disalurkan</span>
            <p className="text-base font-bold text-slate-800 mt-1">{kematianList.length} Kejadian</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#F43F5E]">
            <Heart size={18} fill="currentColor" />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Alokasi Standar per Warga</span>
            <p className="text-base font-bold text-slate-800 mt-1">Rp 500.000 / Duka</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0B5D3F]">
            <ShieldCheck size={18} />
          </div>
        </div>
      </div>

      {/* List / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {kematianList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-50 text-[#F43F5E]">
              <Heart size={32} fill="currentColor" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada data kas kematian</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Alhamdulillah, belum ada catatan santunan kematian yang dikeluarkan untuk periode ini. Kas kematian tetap dicadangkan secara aman.
            </p>
            <button
              onClick={onOpenTxModal}
              className="mt-4 rounded-xl bg-[#F43F5E] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#E11D48] transition-all cursor-pointer"
            >
              + Catat Santunan Duka
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3.5 px-6">Tanggal</th>
                <th className="py-3.5 px-6">Ahli Waris / Warga</th>
                <th className="py-3.5 px-6">Keterangan</th>
                <th className="py-3.5 px-6 text-right">Nominal Santunan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {kematianList.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-6 text-slate-500">{t.tanggal}</td>
                  <td className="py-3.5 px-6 font-bold text-slate-800">{t.namaWarga || 'Warga RT 08'}</td>
                  <td className="py-3.5 px-6 text-slate-600">{t.keterangan}</td>
                  <td className="py-3.5 px-6 text-right font-extrabold text-rose-600">
                    {formatRupiah(t.nominal)}
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
