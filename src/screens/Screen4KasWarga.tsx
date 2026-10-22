import React, { useState } from 'react';
import {
  ChevronLeft,
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  ChevronRight,
  Inbox,
  PlusCircle,
} from 'lucide-react';
import { LeafIcon } from '../components/HouseLogo';

interface Screen4KasWargaProps {
  isSampleData?: boolean;
  onBack?: () => void;
}

export const Screen4KasWarga: React.FC<Screen4KasWargaProps> = ({
  isSampleData = false,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'semua' | 'masuk' | 'keluar' | 'kematian'>('semua');

  return (
    <div className="flex h-full w-full flex-col bg-[#F6F8F7] text-slate-800">
      {/* Top Header */}
      <div className="bg-[#0B5D3F] px-4 pb-3.5 pt-1 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft size={22} className="text-white" />
          </button>
          <h1 className="text-sm font-bold tracking-wide">Kas Warga</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar flex flex-col justify-between">
        <div className="space-y-3">
          {/* Total Kas RT Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B5D3F] to-[#084831] p-3.5 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs">
                <Wallet size={22} className="text-emerald-100" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-emerald-100/90">
                  Total Kas RT
                </span>
                <p className="text-lg font-extrabold tracking-tight text-white">
                  {isSampleData ? 'Rp 5.780.000' : 'Rp 0'}
                </p>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'semua', label: 'Semua' },
              { id: 'masuk', label: 'Masuk' },
              { id: 'keluar', label: 'Keluar' },
              { id: 'kematian', label: 'Kematian' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-center text-[11px] font-semibold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#0B5D3F] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Transaction List Area */}
          {!isSampleData ? (
            /* Empty State matching user instructions */
            <div className="my-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-white/80 px-4 py-8 text-center shadow-xs">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F5EE] text-[#0B5D3F]">
                <Inbox size={26} strokeWidth={1.75} />
              </div>
              <h3 className="text-xs font-bold text-slate-800">
                Belum ada transaksi
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-[220px]">
                Data kas masih kosong. Transaksi kas masuk dan keluar akan tampil di sini.
              </p>
              <div className="mt-3 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-medium text-[#0B5D3F] border border-emerald-200/50">
                <PlusCircle size={12} />
                <span>Siap mencatat transaksi baru</span>
              </div>
            </div>
          ) : (
            /* Sample Populated State from mockup */
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs border border-slate-100 hover:border-emerald-200 transition-all cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Kas Masuk (Iuran Warga)</h4>
                    <p className="text-[10px] text-slate-400">12 Apr 2025 • 56 transaksi</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-700">Rp 3.250.000</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs border border-slate-100 hover:border-rose-200 transition-all cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-white">
                    <ArrowDown size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Kas Keluar (Kegiatan RT)</h4>
                    <p className="text-[10px] text-slate-400">10 Apr 2025 • 18 transaksi</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-rose-600">Rp 2.100.000</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs border border-slate-100 hover:border-rose-200 transition-all cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F43F5E] text-white">
                    <Heart size={18} fill="currentColor" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Kas Kematian</h4>
                    <p className="text-[10px] text-slate-400">05 Apr 2025 • 2 transaksi</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-rose-600">Rp 750.000</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Motivation Card at Bottom */}
        <div className="mt-3 rounded-2xl bg-[#E8F5EE] p-3 text-center border border-emerald-200/80 shadow-xs">
          <p className="text-[11px] font-medium text-[#0B5D3F] italic leading-relaxed">
            &ldquo;Setiap rupiah yang dikelola dengan baik, akan kembali menjadi manfaat untuk kita semua.&rdquo;
          </p>
          <div className="mt-1 flex items-center justify-center text-[#0B5D3F]">
            <LeafIcon size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};
