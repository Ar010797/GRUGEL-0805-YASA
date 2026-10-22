import React, { useState } from 'react';
import { ArrowLeft, ArrowUp, Calendar, Plus, Search, Receipt } from 'lucide-react';
import { Transaction } from '../types';

interface KasMasukViewProps {
  transactions: Transaction[];
  onOpenTxModal: () => void;
  onBack: () => void;
}

export const KasMasukView: React.FC<KasMasukViewProps> = ({
  transactions,
  onOpenTxModal,
  onBack,
}) => {
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('Oktober 2026');

  const masukList = transactions.filter((t) => t.tipe === 'masuk');
  const totalMasuk = masukList.reduce((acc, t) => acc + t.nominal, 0);

  const filtered = masukList.filter(
    (t) =>
      t.keterangan.toLowerCase().includes(search.toLowerCase()) ||
      t.namaWarga?.toLowerCase().includes(search.toLowerCase())
  );

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
            <h1 className="text-xl font-extrabold text-slate-900">Kas Masuk</h1>
            <p className="text-xs text-slate-500">Pencatatan iuran warga dan penerimaan dana kas</p>
          </div>
        </div>

        <button
          onClick={onOpenTxModal}
          className="flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#059669] transition-all cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Catat Pemasukan</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-r from-[#0B5D3F] to-[#0A5237] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <ArrowUp size={24} strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-xs font-semibold text-emerald-200">Total Kas Masuk</span>
              <p className="text-2xl font-extrabold">{formatRupiah(totalMasuk)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Periode Aktif</span>
            <p className="text-base font-bold text-slate-800 mt-1">{selectedMonth}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0B5D3F]">
            <Calendar size={18} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Transaksi Masuk</span>
            <p className="text-base font-bold text-slate-800 mt-1">{masukList.length} Transaksi</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#0B5D3F]">
            <Receipt size={18} />
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama warga / keterangan..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* List / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
              <Receipt size={32} strokeWidth={1.75} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada data pemasukan</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Data kas masuk saat ini masih kosong (Rp 0). Belum ada pencatatan iuran warga atau dana hibah yang masuk.
            </p>
            <button
              onClick={onOpenTxModal}
              className="mt-4 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              + Catat Pemasukan Baru
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3.5 px-6">Tanggal</th>
                <th className="py-3.5 px-6">Sumber / Warga</th>
                <th className="py-3.5 px-6">Kategori</th>
                <th className="py-3.5 px-6">Keterangan</th>
                <th className="py-3.5 px-6 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-6 text-slate-500">{t.tanggal}</td>
                  <td className="py-3.5 px-6 font-bold text-slate-800">{t.namaWarga || 'Warga RT 08'}</td>
                  <td className="py-3.5 px-6">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      {t.kategori}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-slate-600">{t.keterangan}</td>
                  <td className="py-3.5 px-6 text-right font-extrabold text-emerald-700">
                    +{formatRupiah(t.nominal)}
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
