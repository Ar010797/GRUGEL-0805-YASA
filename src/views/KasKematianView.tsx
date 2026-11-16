import React, { useState } from 'react';
import { ArrowLeft, Heart, Plus, Search, History, ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { Transaction, PengaturanKas, Warga } from '../types';
import {
  getKasKematianBalanceSummary,
  isKasKematianOutflow,
  resolveTransactionWargaName,
} from '../utils/rtFilter';

interface KasKematianViewProps {
  transactions: Transaction[];
  wargaList?: Warga[];
  pengaturanKas?: PengaturanKas;
  onOpenTxModal: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onOpenSaldoAwalModal?: () => void;
  onBack: () => void;
}

export const KasKematianView: React.FC<KasKematianViewProps> = ({
  transactions,
  wargaList = [],
  pengaturanKas,
  onOpenTxModal,
  onEditTransaction,
  onDeleteTransaction,
  onOpenSaldoAwalModal,
  onBack,
}) => {
  const [filterMode, setFilterMode] = useState<'semua' | 'masuk' | 'keluar'>('semua');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const showActions = Boolean(onEditTransaction || onDeleteTransaction);

  const kematianList = transactions.filter((t) => t.tipe === 'kematian');
  const {
    totalMasukKematian,
    totalKeluarKematian,
    saldoKematian,
    masukCount,
    keluarCount,
  } = getKasKematianBalanceSummary(transactions);

  const filtered = kematianList.filter((t) => {
    const outflow = isKasKematianOutflow(t);
    if (filterMode === 'masuk' && outflow) return false;
    if (filterMode === 'keluar' && !outflow) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const resolvedName = resolveTransactionWargaName(t, wargaList).toLowerCase();
    return (
      t.keterangan.toLowerCase().includes(q) ||
      t.kategori.toLowerCase().includes(q) ||
      resolvedName.includes(q)
    );
  });

  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  const iuranBulan = pengaturanKas?.nominalKematianBulanan || 3000;
  const iuranTahun = pengaturanKas?.nominalKematianTahunan || iuranBulan * 12;
  const rtStr = pengaturanKas?.profilRT?.namaRT || '08';
  const isAllRT = rtStr.toLowerCase().includes('semua');

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
            <h1 className="text-xl font-extrabold text-slate-900">Kas Kematian Warga</h1>
            <p className="text-xs text-slate-500">
              Pencatatan iuran kas kematian bulanan/tahunan dan saldo cadangan sosial warga{' '}
              {isAllRT ? 'Seluruh RT' : `RT ${rtStr}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSaldoAwalModal && (
            <button
              onClick={onOpenSaldoAwalModal}
              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition-all cursor-pointer"
              title="Input Sisa Kas Kematian Masa Lalu"
            >
              <History size={15} />
              <span>+ Input Kas Masa Lalu</span>
            </button>
          )}

          <button
            onClick={onOpenTxModal}
            className="flex items-center gap-2 rounded-xl bg-[#F43F5E] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#E11D48] transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>+ Catat Kas Kematian</span>
          </button>
        </div>
      </div>

      {/* Banner Penjelasan Kas Kematian Warga */}
      <div className="rounded-3xl bg-gradient-to-r from-rose-500 via-rose-600 to-pink-600 p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="max-w-2xl">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
              Dana Cadangan Kas Kematian Warga
            </span>
            <h2 className="text-lg font-black mt-1">
              Iuran Kas Kematian Terpisah dari Kas Umum Warga
            </h2>
            <p className="mt-1.5 text-xs text-rose-100 leading-relaxed">
              Warga dapat menyetorkan iuran kas kematian secara <strong>bulanan</strong> (misalnya Rp 3.000, Rp 4.000, Rp 5.000/bulan) atau <strong>tahunan</strong> (atau nominal khusus sesuai kesepakatan RT). Dana tercatat sebagai saldo kas tersendiri dan baru berkurang bila ada pengeluaran/santunan duka.
            </p>
          </div>

          <div className="rounded-2xl bg-white/15 p-4 backdrop-blur-xs border border-white/20 shrink-0 text-left md:text-right">
            <span className="text-[10px] text-rose-200 uppercase font-semibold block">
              Tarif Acuan Pengaturan RT
            </span>
            <p className="text-2xl font-black text-white">{formatRupiah(iuranBulan)}<span className="text-xs font-semibold text-rose-100"> / bln</span></p>
            <span className="text-[11px] text-rose-100">
              atau {formatRupiah(iuranTahun)} / tahun per KK
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-r from-[#F43F5E] to-[#BE123C] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Heart size={24} fill="currentColor" />
            </div>
            <div>
              <span className="text-xs font-semibold text-rose-200">Saldo Kas Kematian Tersedia</span>
              <p className="text-2xl font-extrabold">{formatRupiah(saldoKematian)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Iuran / Kas Masuk</span>
            <p className="text-lg font-extrabold text-emerald-700 mt-0.5">
              +{formatRupiah(totalMasukKematian)}
            </p>
            <span className="text-[11px] text-slate-500">{masukCount} transaksi setoran</span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowUp size={18} strokeWidth={2.5} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">Pengeluaran / Santunan</span>
            <p className="text-lg font-extrabold text-rose-600 mt-0.5">
              {totalKeluarKematian > 0 ? `-${formatRupiah(totalKeluarKematian)}` : 'Rp 0'}
            </p>
            <span className="text-[11px] text-slate-500">{keluarCount} penyaluran</span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#F43F5E]">
            <ArrowDown size={18} strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'semua', label: `Semua (${kematianList.length})` },
            { id: 'masuk', label: `Setoran Masuk (${masukCount})` },
            { id: 'keluar', label: `Pengeluaran / Santunan (${keluarCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterMode === tab.id
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
            placeholder="Cari nama warga atau keterangan..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* List / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-50 text-[#F43F5E]">
              <Heart size={32} fill="currentColor" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada catatan kas kematian</h3>
            <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
              Catat setoran iuran kas kematian warga (misalnya Rp 3.000, Rp 5.000, atau iuran tahunan) maupun pengeluaran santunan bila diperlukan.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onOpenTxModal}
                className="rounded-xl bg-[#F43F5E] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#E11D48] transition-all cursor-pointer"
              >
                + Catat Setoran Kas Kematian
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="sm:hidden flex items-center justify-between text-[11px] font-bold text-rose-800 bg-rose-50 px-3.5 py-2 border-b border-rose-200">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-black">&larr; &rarr;</span>
                <span>Geser tabel ke samping untuk melihat seluruh data</span>
              </span>
              <span className="text-[10px] text-rose-700 font-semibold">{filtered.length} Data</span>
            </div>

            <div className="overflow-x-auto touch-pan-x scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="py-3.5 px-4 sm:px-6">Tanggal</th>
                    <th className="py-3.5 px-4 sm:px-6">Nama Warga / Sumber</th>
                    <th className="py-3.5 px-4 sm:px-6">Jenis</th>
                    <th className="py-3.5 px-4 sm:px-6">Keterangan</th>
                    <th className="py-3.5 px-4 sm:px-6 text-right">Nominal</th>
                    {showActions && <th className="py-3.5 px-4 sm:px-6 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((t) => {
                    const outflow = isKasKematianOutflow(t);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 sm:px-6 text-slate-500 whitespace-nowrap">
                          {t.tanggal}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 font-bold text-slate-800">
                          {resolveTransactionWargaName(t, wargaList) || `Warga RT ${rtStr}`}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border whitespace-nowrap ${
                              outflow
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {t.kategori || (outflow ? 'Santunan Kematian' : 'Iuran Kas Kematian')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-slate-600">{t.keterangan}</td>
                        <td
                          className={`py-3.5 px-4 sm:px-6 text-right font-extrabold whitespace-nowrap ${
                            outflow ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {outflow ? '-' : '+'}
                          {formatRupiah(t.nominal)}
                        </td>
                        {showActions && (
                          <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              {onEditTransaction && (
                                <button
                                  type="button"
                                  onClick={() => onEditTransaction(t)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-[#0B5D3F] transition-colors cursor-pointer"
                                  title="Edit catatan kas kematian"
                                >
                                  <Pencil size={15} />
                                </button>
                              )}
                              {onDeleteTransaction && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(t)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Hapus catatan kas kematian"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget && onDeleteTransaction) {
            onDeleteTransaction(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        title="Hapus Catatan Kas Kematian"
        targetName={
          deleteTarget
            ? `${deleteTarget.keterangan} (${isKasKematianOutflow(deleteTarget) ? '-' : '+'}${formatRupiah(deleteTarget.nominal)})`
            : undefined
        }
        message={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus catatan kas kematian${
                resolveTransactionWargaName(deleteTarget, wargaList)
                  ? ` atas nama ${resolveTransactionWargaName(deleteTarget, wargaList)}`
                  : ''
              } pada tanggal ${deleteTarget.tanggal}? Saldo kas kematian akan dihitung ulang otomatis.`
            : ''
        }
        confirmText="Ya, Hapus Catatan"
        variant="danger"
      />
    </div>
  );
};
