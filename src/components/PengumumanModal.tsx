import React, { useState } from 'react';
import { X, Megaphone, Send, Check, AlertCircle } from 'lucide-react';
import { PengumumanRT } from '../types';

interface PengumumanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (p: Omit<PengumumanRT, 'id'>) => void;
}

export const PengumumanModal: React.FC<PengumumanModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [judul, setJudul] = useState('');
  const [kategori, setKategori] = useState<'Kegiatan' | 'Iuran' | 'Keamanan' | 'Sosial' | 'Umum'>('Kegiatan');
  const [isi, setIsi] = useState('');
  const [penulis, setPenulis] = useState('Ketua RT 08 (Bpk. Suwardi)');
  const [penting, setPenting] = useState(false);
  const [tanggal, setTanggal] = useState(
    new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim() || !isi.trim()) return;

    onSave({
      judul,
      kategori,
      isi,
      penulis,
      penting,
      tanggal,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/70 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <Megaphone size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">Buat Pengumuman Baru untuk Warga</h3>
              <p className="text-xs text-slate-500">RT 08 RW 05 Desa Kotayasa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Judul / Perihal Pengumuman
            </label>
            <input
              type="text"
              required
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Contoh: Kerja Bakti Massal & Pembersihan Selokan RT 08"
              className="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-semibold text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kategori Pengumuman</label>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden bg-white"
              >
                <option value="Kegiatan">Kegiatan Warga</option>
                <option value="Iuran">Iuran & Keuangan</option>
                <option value="Keamanan">Keamanan / Ronda</option>
                <option value="Sosial">Sosial & Posyandu</option>
                <option value="Umum">Umum / Himbauan</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Pengirim / Penanggung Jawab</label>
              <input
                type="text"
                value={penulis}
                onChange={(e) => setPenulis(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Isi Lengkap Pengumuman
            </label>
            <textarea
              required
              rows={4}
              value={isi}
              onChange={(e) => setIsi(e.target.value)}
              placeholder="Tuliskan isi pengumuman, jadwal acara, lokasi, atau informasi penting yang ingin disampaikan kepada seluruh warga RT 08..."
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden leading-relaxed"
            />
          </div>

          {/* Tandai Penting */}
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 border border-amber-200">
            <input
              type="checkbox"
              id="penting-check"
              checked={penting}
              onChange={(e) => setPenting(e.target.checked)}
              className="h-4 w-4 rounded-sm text-[#0B5D3F] focus:ring-[#0B5D3F] cursor-pointer"
            />
            <label htmlFor="penting-check" className="text-xs font-semibold text-amber-900 cursor-pointer">
              Tandai sebagai <strong>Pemberitahuan Mendesak / Penting</strong>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Send size={14} />
              <span>Terbitkan Pengumuman</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
