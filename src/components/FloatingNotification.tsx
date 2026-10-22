import React from 'react';
import { Megaphone, X, Share2, Download, ArrowUpRight } from 'lucide-react';
import { PengumumanRT } from '../types';
import { kirimWhatsAppPengumuman } from '../utils/whatsappShare';
import { exportSuratPengumumanPDF } from '../utils/pdfExport';

interface FloatingNotificationProps {
  announcement: PengumumanRT | null;
  onClose: () => void;
  onOpenDetail?: (p: PengumumanRT) => void;
}

export const FloatingNotification: React.FC<FloatingNotificationProps> = ({
  announcement,
  onClose,
  onOpenDetail,
}) => {
  if (!announcement) return null;

  return (
    <div className="fixed top-20 right-4 lg:right-8 z-50 max-w-sm w-full animate-in slide-in-from-top-4 duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-2xl border-2 border-emerald-500/80 backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-[#0B5D3F]" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B5D3F] text-white shadow-md">
              <Megaphone size={18} className="animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Warta Baru RT 08
                </span>
                <span className="text-[10px] text-slate-400">{announcement.tanggal}</span>
              </div>
              <h4 className="text-xs font-bold text-slate-900 mt-0.5 line-clamp-1">
                {announcement.judul}
              </h4>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {announcement.isi}
        </p>

        {/* Quick Action Buttons */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Kirim WhatsApp */}
            <button
              onClick={() => kirimWhatsAppPengumuman(announcement)}
              className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Bagikan ke WhatsApp Grup Warga RT 08"
            >
              <Share2 size={12} />
              <span>Kirim WA</span>
            </button>

            {/* Download Surat PDF */}
            <button
              onClick={() => exportSuratPengumumanPDF(announcement)}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              title="Unduh Dokumen Surat Pengumuman Resmi (.PDF)"
            >
              <Download size={12} />
              <span>Surat PDF</span>
            </button>
          </div>

          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(announcement)}
              className="text-[11px] font-bold text-[#0B5D3F] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Detail</span>
              <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
