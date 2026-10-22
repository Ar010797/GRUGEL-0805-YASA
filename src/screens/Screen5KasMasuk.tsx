import React from 'react';
import {
  ChevronLeft,
  ArrowUp,
  Calendar,
  ChevronDown,
  Users,
  Building2,
  ChevronRight,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';

interface Screen5KasMasukProps {
  isSampleData?: boolean;
  onBack?: () => void;
}

export const Screen5KasMasuk: React.FC<Screen5KasMasukProps> = ({
  isSampleData = false,
  onBack,
}) => {
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
          <h1 className="text-sm font-bold tracking-wide">Kas Masuk</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
        {/* Total Kas Masuk Card */}
        <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-[#0B5D3F] to-[#0A5237] p-3.5 text-white shadow-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xs">
            <ArrowUp size={22} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-[11px] font-medium text-emerald-100/90">
              Total Kas Masuk
            </span>
            <p className="text-lg font-extrabold tracking-tight text-white">
              {isSampleData ? 'Rp 3.250.000' : 'Rp 0'}
            </p>
          </div>
        </div>

        {/* Month Selector Pill */}
        <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 shadow-xs border border-slate-200/80 cursor-pointer hover:border-emerald-300 transition-colors">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Calendar size={15} className="text-[#0B5D3F]" />
            <span>Apr 2025</span>
          </div>
          <ChevronDown size={16} className="text-slate-400" />
        </div>

        {/* Transaction Entries / Empty State */}
        {!isSampleData ? (
          /* Requested empty state */
          <div className="my-3 flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-white/80 px-4 py-10 text-center shadow-xs">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F5EE] text-[#0B5D3F]">
              <Receipt size={26} strokeWidth={1.75} />
            </div>
            <h3 className="text-xs font-bold text-slate-800">
              Belum ada data pemasukan
            </h3>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-[220px]">
              Belum ada iuran warga atau donasi masuk untuk periode ini.
            </p>
            <span className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600">
              Saldo Masuk: Rp 0
            </span>
          </div>
        ) : (
          /* Sample list of pemasukan */
          <div className="space-y-2">
            {[
              {
                title: 'Iuran Warga',
                date: '12 Apr 2025 • 10 KK',
                amount: 'Rp 200.000',
                icon: <Users size={16} className="text-[#0B5D3F]" />,
              },
              {
                title: 'Iuran Warga',
                date: '10 Apr 2025 • 8 KK',
                amount: 'Rp 150.000',
                icon: <Users size={16} className="text-[#0B5D3F]" />,
              },
              {
                title: 'Iuran Warga',
                date: '08 Apr 2025 • 12 KK',
                amount: 'Rp 200.000',
                icon: <Users size={16} className="text-[#0B5D3F]" />,
              },
              {
                title: 'Donasi Kegiatan',
                date: '05 Apr 2025 • 1 KK',
                amount: 'Rp 500.000',
                icon: <Building2 size={16} className="text-[#0B5D3F]" />,
              },
              {
                title: 'Iuran Warga',
                date: '02 Apr 2025 • 6 KK',
                amount: 'Rp 100.000',
                icon: <Users size={16} className="text-[#0B5D3F]" />,
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-xs border border-slate-100 hover:border-emerald-200 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F5EE]">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800">{item.title}</h4>
                    <p className="text-[9px] text-slate-400">{item.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-emerald-700">{item.amount}</span>
                  <ChevronRight size={13} className="text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
