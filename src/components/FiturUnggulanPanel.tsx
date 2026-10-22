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
import { LeafIcon } from './HouseLogo';

interface FiturUnggulanPanelProps {
  className?: string;
  onSelectFeature?: (id: string) => void;
}

export const FiturUnggulanPanel: React.FC<FiturUnggulanPanelProps> = ({
  className = '',
  onSelectFeature,
}) => {
  const features = [
    {
      id: 'kas-warga',
      title: 'Kas Warga',
      desc: 'Melihat total kas RT',
      icon: <Wallet size={18} className="text-white" />,
      bgColor: 'bg-[#0B5D3F]',
    },
    {
      id: 'kas-masuk',
      title: 'Kas Masuk',
      desc: 'Rekap pemasukan',
      icon: <ArrowUp size={18} strokeWidth={2.5} className="text-white" />,
      bgColor: 'bg-[#10B981]',
    },
    {
      id: 'kas-keluar',
      title: 'Kas Keluar',
      desc: 'Rekap pengeluaran',
      icon: <ArrowDown size={18} strokeWidth={2.5} className="text-white" />,
      bgColor: 'bg-[#EF4444]',
    },
    {
      id: 'kas-kematian',
      title: 'Kas Kematian',
      desc: 'Data dana kematian',
      icon: <Heart size={18} fill="currentColor" className="text-white" />,
      bgColor: 'bg-[#F43F5E]',
    },
    {
      id: 'status-iuran',
      title: 'Status Iuran',
      desc: 'Sudah / belum bayar',
      icon: <CalendarCheck size={18} className="text-white" />,
      bgColor: 'bg-[#059669]',
    },
    {
      id: 'data-warga',
      title: 'Data Warga',
      desc: 'Daftar seluruh warga',
      icon: <Users size={18} className="text-white" />,
      bgColor: 'bg-[#0D9488]',
    },
    {
      id: 'laporan',
      title: 'Laporan',
      desc: 'Rekapitulasi lengkap',
      icon: <FileText size={18} className="text-white" />,
      bgColor: 'bg-[#0284C7]',
    },
    {
      id: 'pengaturan',
      title: 'Pengaturan',
      desc: 'Kelola aplikasi',
      icon: <Settings size={18} className="text-white" />,
      bgColor: 'bg-[#334155]',
    },
  ];

  return (
    <div
      className={`relative flex h-[780px] w-[300px] flex-col justify-between rounded-[36px] bg-gradient-to-b from-[#F3F9F5] via-[#EAF4EE] to-[#E3EFE8] p-6 shadow-xl border border-emerald-900/10 backdrop-blur-sm select-none ${className}`}
    >
      {/* Decorative organic corner accents */}
      <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-emerald-100/40 pointer-events-none" />

      {/* Header with Script / Handwriting Typography */}
      <div className="relative z-10 pt-1">
        <h2 className="font-script text-4xl font-bold tracking-wide text-[#0B5D3F]">
          Fitur Unggulan
        </h2>
        <div className="mt-1 h-0.5 w-16 rounded-full bg-[#0B5D3F]/30" />
      </div>

      {/* List of 8 Features */}
      <div className="relative z-10 my-auto space-y-3.5 py-2">
        {features.map((feat) => (
          <div
            key={feat.id}
            onClick={() => onSelectFeature?.(feat.id)}
            className="group flex items-center gap-3.5 cursor-pointer transition-all duration-200 hover:translate-x-1"
          >
            {/* Circular Badge Icon */}
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform group-hover:scale-105 ${feat.bgColor}`}
            >
              {feat.icon}
            </div>

            {/* Label & Description */}
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-800 transition-colors group-hover:text-[#0B5D3F]">
                {feat.title}
              </h3>
              <p className="text-[10px] font-medium text-slate-500">
                {feat.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Motto & Branding */}
      <div className="relative z-10 border-t border-emerald-900/15 pt-4 text-center">
        <div className="font-script space-y-0.5 text-2xl font-bold tracking-wide text-[#0B5D3F] leading-snug">
          <p>Transparan</p>
          <p>Mudah Diakses</p>
          <p>Untuk Semua Warga</p>
        </div>

        <div className="mt-2.5 flex items-center justify-center text-[#0B5D3F]">
          <LeafIcon size={24} />
        </div>
      </div>
    </div>
  );
};
