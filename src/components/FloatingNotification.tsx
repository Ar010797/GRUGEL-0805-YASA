import React, { useEffect } from 'react';
import { Megaphone, X, Share2, Download, ArrowUpRight, Volume2, BellRing } from 'lucide-react';
import { PengumumanRT } from '../types';
import { kirimWhatsAppPengumuman } from '../utils/whatsappShare';
import { exportSuratPengumumanPDF } from '../utils/pdfExport';
import { playNotificationSound } from '../utils/audioNotification';

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
  // Automatically ring the bell when announcement appears
  useEffect(() => {
    if (announcement) {
      playNotificationSound();
    }
  }, [announcement]);

  if (!announcement) return null;

  return (
    <div className="fixed top-18 sm:top-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-[430px] max-w-full z-50 animate-in slide-in-from-top-4 duration-300 pointer-events-auto">
      <div className="relative overflow-hidden rounded-3xl bg-white p-4 sm:p-5 shadow-2xl border-2 border-emerald-500 ring-4 ring-emerald-400/20 backdrop-blur-md">
        {/* Animated Beacon Header Glow */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-[#0B5D3F] animate-pulse" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0B5D3F] text-white shadow-md">
              <BellRing size={20} className="animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  🔔 Warta Warga RT 08
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">{announcement.tanggal}</span>
              </div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 mt-0.5 line-clamp-1">
                {announcement.judul}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => playNotificationSound()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
              title="Bunyikan Ulang Lonceng Warta"
            >
              <Volume2 size={15} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Tutup Notifikasi"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Announcement Excerpt */}
        <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          {announcement.isi}
        </p>

        {/* Action Buttons */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Kirim WA */}
            <button
              onClick={() => kirimWhatsAppPengumuman(announcement)}
              className="flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition-colors cursor-pointer"
              title="Kirim ke Grup WhatsApp Warga RT 08"
            >
              <Share2 size={12} />
              <span>Kirim WA</span>
            </button>

            {/* Download Surat PDF */}
            <button
              onClick={() => exportSuratPengumumanPDF(announcement)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition-colors cursor-pointer"
              title="Download Surat Edaran Resmi (.PDF)"
            >
              <Download size={12} />
              <span>Surat PDF</span>
            </button>
          </div>

          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(announcement)}
              className="text-xs font-bold text-[#0B5D3F] hover:underline flex items-center gap-0.5 cursor-pointer ml-auto"
            >
              <span>Baca Lengkap</span>
              <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
