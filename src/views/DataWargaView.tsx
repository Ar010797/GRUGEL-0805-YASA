import React, { useState } from 'react';
import {
  ArrowLeft,
  Users,
  User,
  Plus,
  Search,
  Trash2,
  Phone,
  Home,
  Check,
  UserCheck,
  Camera,
} from 'lucide-react';
import { Warga } from '../types';

interface DataWargaViewProps {
  wargaList: Warga[];
  onOpenWargaModal: () => void;
  onDeleteWarga: (id: string) => void;
  onBack: () => void;
}

export const DataWargaView: React.FC<DataWargaViewProps> = ({
  wargaList,
  onOpenWargaModal,
  onDeleteWarga,
  onBack,
}) => {
  const [filterGender, setFilterGender] = useState<'semua' | 'Laki-laki' | 'Perempuan'>('semua');
  const [search, setSearch] = useState('');

  const totalKK = wargaList.length;
  const totalJiwa = wargaList.reduce((acc, w) => acc + (w.jumlahJiwa || 1), 0);

  const filtered = wargaList.filter((w) => {
    if (filterGender !== 'semua' && w.jenisKelamin !== filterGender) return false;
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
            <h1 className="text-xl font-extrabold text-slate-900">Data Warga</h1>
            <p className="text-xs text-slate-500">Daftar Kepala Keluarga & Warga RT 08 RW 05 Desa Kotayasa</p>
          </div>
        </div>

        <button
          onClick={onOpenWargaModal}
          className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
        >
          <Camera size={16} />
          <span>+ Tambah Warga / Foto KK</span>
        </button>
      </div>

      {/* Metrics Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
            <Users size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Kepala Keluarga</span>
            <p className="text-2xl font-extrabold text-slate-900">{totalKK} KK</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
            <User size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Jumlah Jiwa</span>
            <p className="text-2xl font-extrabold text-slate-900">{totalJiwa} Jiwa</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
            <Home size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Wilayah Rukun Tetangga</span>
            <p className="text-xl font-extrabold text-slate-900">RT 08 / RW 05</p>
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {[
            { id: 'semua', label: 'Semua Warga' },
            { id: 'Laki-laki', label: 'Laki-laki' },
            { id: 'Perempuan', label: 'Perempuan' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterGender(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                filterGender === tab.id
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
            placeholder="Cari nama warga / nomor rumah..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Table / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Users size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada data warga</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              Database kependudukan RT 08 RW 05 saat ini masih kosong (0 KK). Anda dapat menambahkan warga satu per satu atau memuat contoh data simulasi.
            </p>
            <button
              onClick={onOpenWargaModal}
              className="mt-4 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              + Tambah Warga Baru
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
                <th className="py-3.5 px-6">Jenis Kelamin</th>
                <th className="py-3.5 px-6">Jumlah Jiwa</th>
                <th className="py-3.5 px-6">Status Iuran</th>
                <th className="py-3.5 px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((w, index) => (
                <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-6 text-slate-400 font-medium">{index + 1}</td>
                  <td className="py-3.5 px-6 font-bold text-slate-800">{w.nama}</td>
                  <td className="py-3.5 px-6 text-slate-600">Rumah {w.noRumah}</td>
                  <td className="py-3.5 px-6 text-slate-500">RT {w.rt}</td>
                  <td className="py-3.5 px-6 text-slate-600">{w.jenisKelamin}</td>
                  <td className="py-3.5 px-6 text-slate-700 font-semibold">{w.jumlahJiwa} orang</td>
                  <td className="py-3.5 px-6">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        w.statusIuran === 'Sudah'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-orange-50 text-orange-600 border border-orange-200'
                      }`}
                    >
                      {w.statusIuran === 'Sudah' ? 'Sudah Bayar' : 'Belum Bayar'}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={() => onDeleteWarga(w.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Hapus data warga"
                    >
                      <Trash2 size={15} />
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
