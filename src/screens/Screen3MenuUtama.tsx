import React from 'react';
import {
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  CalendarCheck,
  Users,
  FileText,
  Settings,
} from 'lucide-react';
import { HouseLogo, LeafIcon } from '../components/HouseLogo';

interface Screen3MenuUtamaProps {
  onSelectMenu?: (menuKey: string) => void;
}

export const Screen3MenuUtama: React.FC<Screen3MenuUtamaProps> = ({ onSelectMenu }) => {
  const menuItems = [
    {
      id: 'kas-warga',
      label: 'Kas Warga',
      icon: <Wallet size={20} className="text-white" />,
      bgColor: 'bg-[#10B981]',
    },
    {
      id: 'kas-masuk',
      label: 'Kas Masuk',
      icon: <ArrowUp size={20} strokeWidth={2.5} className="text-white" />,
      bgColor: 'bg-[#10B981]',
    },
    {
      id: 'kas-keluar',
      label: 'Kas Keluar',
      icon: <ArrowDown size={20} strokeWidth={2.5} className="text-white" />,
      bgColor: 'bg-[#EF4444]',
    },
    {
      id: 'kas-kematian',
      label: 'Kas Kematian',
      icon: <Heart size={20} fill="currentColor" className="text-white" />,
      bgColor: 'bg-[#F43F5E]',
    },
    {
      id: 'status-iuran',
      label: 'Status Iuran',
      icon: <CalendarCheck size={20} className="text-white" />,
      bgColor: 'bg-[#059669]',
    },
    {
      id: 'data-warga',
      label: 'Data Warga',
      icon: <Users size={20} className="text-white" />,
      bgColor: 'bg-[#0D9488]',
    },
    {
      id: 'laporan',
      label: 'Laporan',
      icon: <FileText size={20} className="text-white" />,
      bgColor: 'bg-[#0284C7]',
    },
    {
      id: 'pengaturan',
      label: 'Pengaturan',
      icon: <Settings size={20} className="text-white" />,
      bgColor: 'bg-[#475569]',
    },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#F6F8F7] text-slate-800">
      {/* Top Header with Dark Green Village Backdrop */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#094831] to-[#0B5D3F] px-4 pb-5 pt-3 text-center text-white shadow-sm">
        {/* Subtle decorative glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-32 rounded-full bg-emerald-400/20 blur-2xl pointer-events-none" />

        {/* House Logo in glowing emblem */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-2 flex h-14 w-16 items-center justify-center rounded-xl bg-white/10 p-1 backdrop-blur-xs shadow-xs">
            <HouseLogo size={52} variant="white" />
          </div>
          <h1 className="text-base font-extrabold tracking-wide text-white">
            RT 08 RW 05
          </h1>
          <p className="text-xs font-semibold text-emerald-200">
            Desa Kotayasa
          </p>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5 no-scrollbar">
        {/* Section Heading */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">
            Menu Utama
          </h2>
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
            8 Layanan
          </span>
        </div>

        {/* 2-Column Grid of 8 Menu Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectMenu?.(item.id)}
              className="group flex flex-col items-center justify-center rounded-2xl bg-white p-3.5 shadow-xs border border-slate-100 transition-all duration-200 hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5 active:scale-95 cursor-pointer text-center"
            >
              <div
                className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl shadow-xs transition-transform group-hover:scale-105 ${item.bgColor}`}
              >
                {item.icon}
              </div>
              <span className="text-xs font-bold text-slate-800 group-hover:text-[#0B5D3F]">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0B5D3F] to-[#0A5237] p-3.5 text-center text-white shadow-sm flex items-center justify-center gap-3">
          <LeafIcon size={18} className="text-emerald-300/80 -rotate-12" />
          <div>
            <p className="text-xs font-bold tracking-wide">
              Jaga Kekompakan
            </p>
            <p className="text-xs font-semibold text-emerald-200/90 italic">
              Jaga Keberkahan
            </p>
          </div>
          <LeafIcon size={18} className="text-emerald-300/80 rotate-12" />
        </div>
      </div>
    </div>
  );
};
