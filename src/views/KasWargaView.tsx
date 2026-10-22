import React, { useState } from 'react';
import {
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  Plus,
  Search,
  Filter,
  Inbox,
  ArrowLeft,
} from 'lucide-react';
import { LeafIcon } from '../components/HouseLogo';
import { Transaction } from '../types';

interface KasWargaViewProps {
  transactions: Transaction[];
  onOpenTxModal: (type?: 'masuk' | 'keluar' | 'kematian') => void;
  onBack: () => void;
}

export const KasWargaView: React.FC<KasWargaViewProps> = ({
  transactions,
  onOpenTxModal,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'semua' | 'masuk' | 'keluar' | 'kematian'>('semua');
  const [search, setSearch] = useState('');

  const totalMasuk = transactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKeluar = transactions
    .filter((t) => t.tipe === 'keluar')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKematian = transactions
    .filter((t) => t.tipe === 'kematian')
    .reduce((acc, t) => acc + t.nominal, 0);

  const saldoKas = totalMasuk - totalKeluar;

  const filtered = transactions.filter((t) => {
    if (activeTab !== 'semua' && t.tipe !== activeTab) return false;
    if (search && !t.keterangan.toLowerCase().includes(search.toLowerCase()) && !t.namaWarga?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Kas Warga</h1>
            <p className="text-xs text-slate-500">Rekapitulasi seluruh mutasi kas RT 08 RW 05 Desa Kotayasa</p>
          </div>
        </div>

        <button
          onClick={() => onOpenTxModal('masuk')}
          className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Catat Transaksi Baru</span>
        </button>
      </div>

      {/* Main Balances */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 rounded-3xl bg-gradient-to-br from-[#0B5D3F] to-[#07472F] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
              <Wallet size={22} className="text-emerald-100" />
            </div>
            <div>
              <span className="text-xs font-semibold text-emerald-200">Total Kas RT</span>
              <p className="text-2xl font-extrabold">{formatRupiah(saldoKas)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10B981] text-white">
            <ArrowUp size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Kas Masuk</span>
            <p className="text-lg font-extrabold text-slate-900">{formatRupiah(totalMasuk)}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EF4444] text-white">
            <ArrowDown size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Kas Keluar</span>
            <p className="text-lg font-extrabold text-slate-900">{formatRupiah(totalKeluar)}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F43F5E] text-white">
            <Heart size={20} fill="currentColor" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Kas Kematian</span>
            <p className="text-lg font-extrabold text-slate-900">{formatRupiah(totalKematian)}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'semua', label: 'Semua Transaksi' },
            { id: 'masuk', label: 'Kas Masuk' },
            { id: 'keluar', label: 'Kas Keluar' },
            { id: 'kematian', label: 'Kas Kematian' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari transaksi..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Transaction Table / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
              <Inbox size={32} strokeWidth={1.75} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada transaksi</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
              Data kas warga RT 08 RW 05 masih kosong (Rp 0). Belum ada riwayat transaksi pemasukan maupun pengeluaran kas yang tercatat.
            </p>
            <button
              onClick={() => onOpenTxModal('masuk')}
              className="mt-4 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              + Catat Transaksi Baru
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-6">Tanggal</th>
                  <th className="py-3.5 px-6">Keterangan</th>
                  <th className="py-3.5 px-6">Warga / Pihak</th>
                  <th className="py-3.5 px-6">Kategori</th>
                  <th className="py-3.5 px-6 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-6 text-slate-500">{tx.tanggal}</td>
                    <td className="py-3.5 px-6 font-bold text-slate-800">{tx.keterangan}</td>
                    <td className="py-3.5 px-6 text-slate-600">{tx.namaWarga || '—'}</td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          tx.tipe === 'masuk'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : tx.tipe === 'keluar'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-pink-50 text-pink-700 border border-pink-200'
                        }`}
                      >
                        {tx.kategori}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right font-extrabold">
                      <span className={tx.tipe === 'masuk' ? 'text-emerald-700' : 'text-rose-600'}>
                        {tx.tipe === 'masuk' ? '+' : '-'} {formatRupiah(tx.nominal)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Motivation Banner at Bottom */}
      <div className="rounded-2xl bg-[#E8F5EE] p-4 text-center border border-emerald-200">
        <p className="text-xs font-medium text-[#0B5D3F] italic leading-relaxed">
          &ldquo;Setiap rupiah yang dikelola dengan baik, akan kembali menjadi manfaat untuk kita semua.&rdquo;
        </p>
        <div className="mt-1 flex items-center justify-center text-[#0B5D3F]">
          <LeafIcon size={16} />
        </div>
      </div>
    </div>
  );
};
