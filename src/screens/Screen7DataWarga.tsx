import React, { useState } from 'react';
import {
  ChevronLeft,
  Search,
  Users,
  User,
  ChevronRight,
  UserPlus,
  SlidersHorizontal,
} from 'lucide-react';

interface Screen7DataWargaProps {
  isSampleData?: boolean;
  onBack?: () => void;
}

export const Screen7DataWarga: React.FC<Screen7DataWargaProps> = ({
  isSampleData = false,
  onBack,
}) => {
  const [activeFilter, setActiveFilter] = useState<'semua' | 'pria' | 'wanita'>('semua');
  const [searchTerm, setSearchTerm] = useState('');

  const sampleWarga = [
    { no: 1, name: 'Ahmad Fauzi', rt: '08' },
    { no: 2, name: 'Siti Aminah', rt: '08' },
    { no: 3, name: 'Budi Santoso', rt: '08' },
    { no: 4, name: 'Rina Lestari', rt: '08' },
    { no: 5, name: 'Agus Setiawan', rt: '08' },
    { no: 6, name: 'Nurhayati', rt: '08' },
    { no: 7, name: 'Dedi Kurniawan', rt: '08' },
    { no: 8, name: 'Eka Pratama', rt: '08' },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#F6F8F7] text-slate-800">
      {/* Header */}
      <div className="bg-[#0B5D3F] px-4 pb-3.5 pt-1 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft size={22} className="text-white" />
          </button>
          <h1 className="text-sm font-bold tracking-wide">Data Warga</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
        {/* Search Bar */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama / nomor rumah..."
            className="w-full rounded-xl bg-white py-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 shadow-xs border border-slate-200/80 focus:border-[#0B5D3F] focus:outline-hidden"
          />
          <SlidersHorizontal size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          {[
            { id: 'semua', label: 'Semua' },
            { id: 'pria', label: 'Laki-laki' },
            { id: 'wanita', label: 'Perempuan' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`flex-1 rounded-lg py-1.5 text-center text-[11px] font-semibold transition-all cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Summary Badges: Total KK & Jumlah Jiwa */}
        <div className="grid grid-cols-2 gap-2">
          {/* Total KK */}
          <div className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 border border-slate-100 shadow-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F5EE] text-[#0B5D3F]">
              <Users size={16} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 leading-tight">
                {isSampleData ? '78' : '0'}
              </p>
              <span className="text-[10px] font-medium text-slate-400">Total KK</span>
            </div>
          </div>

          {/* Jumlah Jiwa */}
          <div className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 border border-slate-100 shadow-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F5EE] text-[#0B5D3F]">
              <User size={16} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 leading-tight">
                {isSampleData ? '156' : '0'}
              </p>
              <span className="text-[10px] font-medium text-slate-400">Jumlah Jiwa</span>
            </div>
          </div>
        </div>

        {/* Table / List Area */}
        <div className="rounded-xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500 border-b border-slate-100">
            <span className="col-span-2">No</span>
            <span className="col-span-8">Nama Kepala Keluarga</span>
            <span className="col-span-2 text-right">RT</span>
          </div>

          {!isSampleData ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Users size={20} />
              </div>
              <p className="text-xs font-bold text-slate-700">Belum ada data warga</p>
              <p className="mt-0.5 text-[10px] text-slate-400 max-w-[200px]">
                Silakan tambahkan data Kartu Keluarga warga RT 08 RW 05.
              </p>
            </div>
          ) : (
            /* Sample Table Rows */
            <div className="divide-y divide-slate-100 text-[11px]">
              {sampleWarga.map((row) => (
                <div
                  key={row.no}
                  className="grid grid-cols-12 items-center px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className="col-span-2 text-slate-400 font-medium">{row.no}</span>
                  <span className="col-span-8 font-semibold text-slate-800 truncate">{row.name}</span>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-slate-600 font-medium">{row.rt}</span>
                    <ChevronRight size={12} className="text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
