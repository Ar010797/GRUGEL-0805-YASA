import React, { useState } from 'react';
import {
  ArrowLeft,
  Search,
  Check,
  Clock,
  UserX,
  UserCheck,
  Plus,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Warga, PengaturanKas } from '../types';

interface StatusIuranViewProps {
  wargaList: Warga[];
  pengaturanKas?: PengaturanKas;
  onToggleStatus: (id: string) => void;
  onOpenWargaModal: () => void;
  onBack: () => void;
}

export const StatusIuranView: React.FC<StatusIuranViewProps> = ({
  wargaList,
  pengaturanKas,
  onToggleStatus,
  onOpenWargaModal,
  onBack,
}) => {
  const [filter, setFilter] = useState<'semua' | 'sudah' | 'belum'>('semua');
  const [search, setSearch] = useState('');

  const totalKK = wargaList.length;
  const sudahCount = wargaList.filter((w) => w.statusIuran === 'Sudah').length;
  const belumCount = totalKK - sudahCount;
  const persenSudah = totalKK > 0 ? Math.round((sudahCount / totalKK) * 100) : 0;
  const persenBelum = totalKK > 0 ? 100 - persenSudah : 0;

  const filtered = wargaList.filter((w) => {
    if (filter === 'sudah' && w.statusIuran !== 'Sudah') return false;
    if (filter === 'belum' && w.statusIuran !== 'Belum') return false;
    if (search && !w.nama.toLowerCase().includes(search.toLowerCase()) && !w.noRumah.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

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
            <h1 className="text-xl font-extrabold text-slate-900">Status Pembayaran Iuran</h1>
            <p className="text-xs text-slate-500">Monitoring pembayaran iuran kas warga RT 08 RW 05 Desa Kotayasa</p>
          </div>
        </div>

        <button
          onClick={onOpenWargaModal}
          className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Tambah Data Warga</span>
        </button>
      </div>

      {pengaturanKas && (
        <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-800">Besaran Iuran Bulan Berjalan (Auto-Hitung Tahunan &divide; 12):</span>
            <p className="text-slate-500 mt-0.5">
              Jimpitan Rp {pengaturanKas.nominalJimpitanBulanan.toLocaleString('id-ID')}/bln (dari Rp {pengaturanKas.nominalJimpitanTahunan.toLocaleString('id-ID')}/thn) + Kas Kematian Rp {pengaturanKas.nominalKematianBulanan.toLocaleString('id-ID')}/bln (dari Rp {pengaturanKas.nominalKematianTahunan.toLocaleString('id-ID')}/thn)
            </p>
          </div>
          <div className="rounded-xl bg-[#E8F5EE] px-3.5 py-2 font-extrabold text-[#0B5D3F] border border-emerald-200 shrink-0 text-center">
            Rp {(pengaturanKas.nominalJimpitanBulanan + pengaturanKas.nominalKematianBulanan).toLocaleString('id-ID')} / bulan / KK
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Sudah Bayar */}
        <div className="rounded-3xl bg-[#E8F5EE] p-5 border border-emerald-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981] text-white">
              <Check size={22} strokeWidth={3} />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Sudah Bayar</span>
              <p className="text-2xl font-extrabold text-[#0B5D3F]">{sudahCount} KK ({persenSudah}%)</p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-white/70 px-3 py-1 rounded-full border border-emerald-200">
            Lunas Iuran
          </span>
        </div>

        {/* Belum Bayar */}
        <div className="rounded-3xl bg-[#FFF4ED] p-5 border border-orange-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F97316] text-white">
              <Clock size={22} strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-xs font-bold text-orange-950 uppercase tracking-wider">Belum Bayar</span>
              <p className="text-2xl font-extrabold text-orange-700">{belumCount} KK ({persenBelum}%)</p>
            </div>
          </div>
          <span className="text-xs font-bold text-orange-800 bg-white/70 px-3 py-1 rounded-full border border-orange-200">
            Menunggu
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {[
            { id: 'semua', label: 'Semua Status' },
            { id: 'sudah', label: 'Sudah Bayar' },
            { id: 'belum', label: 'Belum Bayar' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                filter === tab.id
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
            placeholder="Cari nama / no. rumah..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Table / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <UserX size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada data warga</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Daftar status iuran masih kosong. Silakan tambahkan data warga untuk mulai mencatat status pembayaran iuran kas bulanan.
            </p>
            <button
              onClick={onOpenWargaModal}
              className="mt-4 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              + Tambah Data Warga Sekarang
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="py-3.5 px-6">No</th>
                <th className="py-3.5 px-6">Nama Kepala Keluarga</th>
                <th className="py-3.5 px-6">No. Rumah</th>
                <th className="py-3.5 px-6">RT</th>
                <th className="py-3.5 px-6">Status Pembayaran</th>
                <th className="py-3.5 px-6 text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((w, index) => (
                <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-6 text-slate-400 font-medium">{index + 1}</td>
                  <td className="py-3.5 px-6 font-bold text-slate-800">{w.nama}</td>
                  <td className="py-3.5 px-6 text-slate-600">Rumah {w.noRumah}</td>
                  <td className="py-3.5 px-6 text-slate-500">RT {w.rt}</td>
                  <td className="py-3.5 px-6">
                    {w.statusIuran === 'Sudah' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                        <Check size={12} strokeWidth={3} />
                        Sudah Bayar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600 border border-orange-200">
                        <Clock size={12} />
                        Belum Bayar
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={() => onToggleStatus(w.id)}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                        w.statusIuran === 'Sudah'
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-[#10B981] text-white hover:bg-[#059669]'
                      }`}
                    >
                      {w.statusIuran === 'Sudah' ? 'Tandai Belum' : 'Tandai Sudah Lunas'}
                    </button>
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
