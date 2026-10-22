import React, { useState } from 'react';
import {
  ChevronLeft,
  Search,
  Check,
  Clock,
  UserX,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface Screen6StatusIuranProps {
  isSampleData?: boolean;
  onBack?: () => void;
}

export const Screen6StatusIuran: React.FC<Screen6StatusIuranProps> = ({
  isSampleData = false,
  onBack,
}) => {
  const [activeFilter, setActiveFilter] = useState<'semua' | 'sudah' | 'belum'>('semua');
  const [searchTerm, setSearchTerm] = useState('');

  const sampleWarga = [
    { no: 1, name: 'Ahmad Fauzi', status: 'Sudah' },
    { no: 2, name: 'Siti Aminah', status: 'Sudah' },
    { no: 3, name: 'Budi Santoso', status: 'Belum' },
    { no: 4, name: 'Rina Lestari', status: 'Sudah' },
    { no: 5, name: 'Agus Setiawan', status: 'Belum' },
    { no: 6, name: 'Nurhayati', status: 'Sudah' },
    { no: 7, name: 'Dedi Kurniawan', status: 'Belum' },
    { no: 8, name: 'Eka Pratama', status: 'Sudah' },
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
          <h1 className="text-sm font-bold tracking-wide">Status Iuran</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          {[
            { id: 'semua', label: 'Semua' },
            { id: 'sudah', label: 'Sudah Bayar' },
            { id: 'belum', label: 'Belum Bayar' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveFilter(item.id as any)}
              className={`flex-1 rounded-lg py-1.5 text-center text-[11px] font-semibold transition-all cursor-pointer ${
                activeFilter === item.id
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama / nomor rumah..."
            className="w-full rounded-xl bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 shadow-xs border border-slate-200/80 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>

        {/* Summary Badges (Sudah Bayar & Belum Bayar) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Sudah Bayar */}
          <div className="flex items-center gap-2.5 rounded-xl bg-[#E8F5EE] p-2.5 border border-emerald-200/70 shadow-xs">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
              <Check size={14} strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-emerald-950 block">Sudah Bayar</span>
              <p className="text-[11px] font-bold text-[#0B5D3F] truncate">
                {isSampleData ? '56 KK (71,8%)' : '0 KK (0%)'}
              </p>
            </div>
          </div>

          {/* Belum Bayar */}
          <div className="flex items-center gap-2.5 rounded-xl bg-[#FFF4ED] p-2.5 border border-orange-200/70 shadow-xs">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F97316] text-white">
              <Clock size={14} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-orange-950 block">Belum Bayar</span>
              <p className="text-[11px] font-bold text-orange-700 truncate">
                {isSampleData ? '22 KK (28,2%)' : '0 KK (0%)'}
              </p>
            </div>
          </div>
        </div>

        {/* Table / List Area */}
        <div className="rounded-xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500 border-b border-slate-100">
            <span className="col-span-2">No</span>
            <span className="col-span-7">Nama Kepala Keluarga</span>
            <span className="col-span-3 text-right">Status</span>
          </div>

          {!isSampleData ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <UserX size={20} />
              </div>
              <p className="text-xs font-bold text-slate-700">Belum ada data warga</p>
              <p className="mt-0.5 text-[10px] text-slate-400 max-w-[200px]">
                Data iuran warga RT 08 RW 05 belum diinput.
              </p>
            </div>
          ) : (
            /* Sample List */
            <div className="divide-y divide-slate-100 text-[11px]">
              {sampleWarga.map((row) => (
                <div
                  key={row.no}
                  className="grid grid-cols-12 items-center px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className="col-span-2 text-slate-400 font-medium">{row.no}</span>
                  <span className="col-span-7 font-semibold text-slate-800 truncate">{row.name}</span>
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    {row.status === 'Sudah' ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        <Check size={11} strokeWidth={3} />
                        Sudah
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600 border border-orange-200">
                        <Clock size={11} />
                        Belum
                      </span>
                    )}
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
