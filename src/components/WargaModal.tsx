import React, { useState } from 'react';
import { X, UserPlus, Check } from 'lucide-react';
import { Warga } from '../types';

interface WargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (warga: Omit<Warga, 'id' | 'no'>) => void;
}

export const WargaModal: React.FC<WargaModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [nama, setNama] = useState('');
  const [noRumah, setNoRumah] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [jumlahJiwa, setJumlahJiwa] = useState('3');
  const [statusIuran, setStatusIuran] = useState<'Sudah' | 'Belum'>('Belum');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) return;

    onSave({
      nama,
      noRumah: noRumah || '01',
      rt: '08',
      jenisKelamin,
      jumlahJiwa: parseInt(jumlahJiwa) || 1,
      statusIuran,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B5D3F] text-white">
              <UserPlus size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">Tambah Data Warga</h3>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Kepala Keluarga (KK)</label>
            <input
              type="text"
              required
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Ahmad Fauzi"
              className="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">No. Rumah / Blok</label>
              <input
                type="text"
                value={noRumah}
                onChange={(e) => setNoRumah(e.target.value)}
                placeholder="Contoh: 12B"
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jumlah Jiwa (Anggota)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={jumlahJiwa}
                onChange={(e) => setJumlahJiwa(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Kelamin</label>
              <select
                value={jenisKelamin}
                onChange={(e) => setJenisKelamin(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden bg-white"
              >
                <option value="Laki-laki">Laki-laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Status Iuran Kas</label>
              <select
                value={statusIuran}
                onChange={(e) => setStatusIuran(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden bg-white"
              >
                <option value="Belum">Belum Bayar</option>
                <option value="Sudah">Sudah Bayar</option>
              </select>
            </div>
          </div>

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
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Simpan Data</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
