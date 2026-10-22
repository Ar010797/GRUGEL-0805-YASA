import React from 'react';
import {
  Menu,
  Bell,
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  Users,
  Check,
  Clock,
  Home,
  ReceiptText,
  User,
  ChevronRight,
} from 'lucide-react';
import { GreetingVillageIllustration } from '../components/VillageLandscape';

interface Screen2BerandaProps {
  isSampleData?: boolean;
  onNavigate?: (screenName: string) => void;
}

export const Screen2Beranda: React.FC<Screen2BerandaProps> = ({
  isSampleData = false,
  onNavigate,
}) => {
  return (
    <div className="flex h-full w-full flex-col bg-[#F6F8F7] text-slate-800">
      {/* Top Header - Dark Green */}
      <div className="bg-[#0B5D3F] px-4 pb-4 pt-1 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => onNavigate?.('menu')}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            title="Menu Utama"
          >
            <Menu size={22} className="text-white" />
          </button>

          <div className="text-left flex-1 px-3">
            <h1 className="text-sm font-bold tracking-wide">RT 08 RW 05</h1>
            <p className="text-[11px] text-emerald-100/90 font-medium -mt-0.5">Desa Kotayasa</p>
          </div>

          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all">
            <Bell size={20} className="text-white" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-[#0B5D3F]" />
          </button>
        </div>
      </div>

      {/* Scrollable Screen Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 no-scrollbar">
        {/* Salam / Greeting Card with Village Artwork */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#EBF6F1] via-[#E2F2EB] to-[#DCEDE5] p-3.5 shadow-xs border border-emerald-100 flex items-center justify-between">
          <div className="z-10 max-w-[62%]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B5D3F]">
              Assalamu'alaikum
            </span>
            <h2 className="text-sm font-extrabold text-[#0B5D3F] mt-0.5">
              Warga RT 08 RW 05
            </h2>
            <p className="mt-1 text-[10px] text-slate-600 leading-snug">
              Semoga selalu sehat dan mendapat keberkahan.
            </p>
          </div>

          <div className="w-[110px] h-[65px] rounded-xl overflow-hidden shadow-xs border border-emerald-200/50">
            <GreetingVillageIllustration className="w-full h-full" />
          </div>
        </div>

        {/* Total Kas RT Card */}
        <div 
          onClick={() => onNavigate?.('kas-warga')}
          className="group relative cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B5D3F] to-[#0A5237] p-4 text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99]"
        >
          {/* Subtle background curved pattern */}
          <div className="absolute -right-4 -top-8 h-28 w-28 rounded-full bg-white/5 blur-xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-xs shadow-inner">
                <Wallet size={24} className="text-emerald-100" />
              </div>
              <div>
                <span className="text-[11px] font-medium text-emerald-100/90 tracking-wide">
                  Total Kas RT
                </span>
                <p className="text-xl font-extrabold tracking-tight text-white mt-0.5">
                  {isSampleData ? 'Rp 5.780.000' : 'Rp 0'}
                </p>
              </div>
            </div>

            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-1">
              <ChevronRight size={18} className="text-white" />
            </div>
          </div>
        </div>

        {/* 4 Summary Cards (2x2 Grid) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. Kas Masuk */}
          <div 
            onClick={() => onNavigate?.('kas-masuk')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white p-3 shadow-xs border border-slate-100 transition-all hover:border-emerald-200 active:scale-95"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white shadow-xs">
              <ArrowUp size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-slate-500 block truncate">
                Kas Masuk
              </span>
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {isSampleData ? 'Rp 3.250.000' : 'Rp 0'}
              </p>
            </div>
          </div>

          {/* 2. Kas Keluar */}
          <div 
            onClick={() => onNavigate?.('kas-warga')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white p-3 shadow-xs border border-slate-100 transition-all hover:border-rose-200 active:scale-95"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EF4444] text-white shadow-xs">
              <ArrowDown size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-slate-500 block truncate">
                Kas Keluar
              </span>
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {isSampleData ? 'Rp 2.100.000' : 'Rp 0'}
              </p>
            </div>
          </div>

          {/* 3. Kas Kematian */}
          <div 
            onClick={() => onNavigate?.('kas-warga')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white p-3 shadow-xs border border-slate-100 transition-all hover:border-rose-200 active:scale-95"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F43F5E] text-white shadow-xs">
              <Heart size={18} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-slate-500 block truncate">
                Kas Kematian
              </span>
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {isSampleData ? 'Rp 750.000' : 'Rp 0'}
              </p>
            </div>
          </div>

          {/* 4. Jumlah Warga */}
          <div 
            onClick={() => onNavigate?.('data-warga')}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white p-3 shadow-xs border border-slate-100 transition-all hover:border-emerald-200 active:scale-95"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white shadow-xs">
              <Users size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-slate-500 block truncate">
                Jumlah Warga
              </span>
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {isSampleData ? '78 KK' : '0 KK'}
              </p>
            </div>
          </div>
        </div>

        {/* Section: Status Pembayaran Iuran */}
        <div className="pt-1">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Users size={15} className="text-[#0B5D3F]" />
              <span>Status Pembayaran Iuran</span>
            </div>
            <button 
              onClick={() => onNavigate?.('status-iuran')}
              className="text-[11px] font-bold text-[#0B5D3F] hover:underline cursor-pointer"
            >
              Lihat Semua
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Sudah Bayar */}
            <div className="flex items-center gap-3 rounded-xl bg-[#E8F5EE] p-3 border border-emerald-200/60 shadow-xs">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
                <Check size={16} strokeWidth={3} />
              </div>
              <div>
                <span className="text-[10px] font-medium text-emerald-900 block">
                  Sudah Bayar
                </span>
                <p className="text-xs font-extrabold text-[#0B5D3F]">
                  {isSampleData ? '56 KK' : '0 KK'}
                </p>
                <span className="text-[10px] font-medium text-emerald-700">
                  {isSampleData ? '(71,8%)' : '(0%)'}
                </span>
              </div>
            </div>

            {/* Belum Bayar */}
            <div className="flex items-center gap-3 rounded-xl bg-[#FFF4ED] p-3 border border-orange-200/60 shadow-xs">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F97316] text-white">
                <Clock size={16} strokeWidth={2.5} />
              </div>
              <div>
                <span className="text-[10px] font-medium text-orange-950 block">
                  Belum Bayar
                </span>
                <p className="text-xs font-extrabold text-orange-700">
                  {isSampleData ? '22 KK' : '0 KK'}
                </p>
                <span className="text-[10px] font-medium text-orange-600">
                  {isSampleData ? '(28,2%)' : '(0%)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="shrink-0 border-t border-slate-200/80 bg-white px-4 py-2 shadow-xs">
        <div className="flex items-center justify-between">
          {/* Beranda (Active) */}
          <button className="flex flex-col items-center gap-0.5 text-[#0B5D3F]">
            <Home size={19} strokeWidth={2.5} />
            <span className="text-[10px] font-bold">Beranda</span>
          </button>

          {/* Transaksi */}
          <button 
            onClick={() => onNavigate?.('kas-warga')}
            className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ReceiptText size={19} />
            <span className="text-[10px] font-medium">Transaksi</span>
          </button>

          {/* Warga */}
          <button 
            onClick={() => onNavigate?.('data-warga')}
            className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Users size={19} />
            <span className="text-[10px] font-medium">Warga</span>
          </button>

          {/* Profil */}
          <button 
            onClick={() => onNavigate?.('menu')}
            className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <User size={19} />
            <span className="text-[10px] font-medium">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
};
