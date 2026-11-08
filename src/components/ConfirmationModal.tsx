import React from 'react';
import { AlertTriangle, Trash2, RotateCcw, Edit3, X, Check, ShieldAlert } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  targetName?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant = 'danger',
  targetName,
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Header Banner */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDanger
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : isWarning
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-[#0B5D3F]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                isDanger
                  ? 'bg-rose-600 text-white'
                  : isWarning
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#0B5D3F] text-white'
              }`}
            >
              {isDanger ? (
                <Trash2 size={20} />
              ) : isWarning ? (
                <AlertTriangle size={20} />
              ) : (
                <ShieldAlert size={20} />
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold">{title}</h3>
              <p className="text-[11px] opacity-80">Konfirmasi Tindakan Keamanan Data</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {targetName && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Objek yang terpengaruh
              </span>
              <p className="text-sm font-black text-slate-800 mt-0.5">{targetName}</p>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed text-center sm:text-left">
            {message}
          </p>

          <div
            className={`rounded-2xl p-3 text-[11px] leading-relaxed flex items-start gap-2 ${
              isDanger
                ? 'bg-rose-50/70 border border-rose-200 text-rose-800'
                : 'bg-amber-50/70 border border-amber-200 text-amber-800'
            }`}
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              Harap berhati-hati. Pastikan keputusan Anda sudah tepat untuk mencegah kehilangan atau perubahan data kas & warga yang tidak disengaja.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`w-full rounded-xl py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition-all cursor-pointer ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : isWarning
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : 'bg-[#0B5D3F] hover:bg-[#084831] shadow-emerald-800/20'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
