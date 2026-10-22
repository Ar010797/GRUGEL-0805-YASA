import React, { useState, useRef } from 'react';
import {
  X,
  UserPlus,
  Check,
  Camera,
  Upload,
  Sparkles,
  FileText,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { Warga } from '../types';
import { scanKartuKeluargaImage } from '../utils/ocrKKScanner';

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
  const [activeTab, setActiveTab] = useState<'ocr' | 'manual'>('ocr');
  
  // Form values
  const [nama, setNama] = useState('');
  const [noRumah, setNoRumah] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [jumlahJiwa, setJumlahJiwa] = useState('3');
  const [statusIuran, setStatusIuran] = useState<'Sudah' | 'Belum'>('Belum');

  // OCR state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      setScanSuccess(false);
      
      // Automatically trigger OCR processing
      setIsScanning(true);
      try {
        const extracted = await scanKartuKeluargaImage(base64, file.type);
        setNama(extracted.nama);
        setNoRumah(extracted.noRumah);
        setJenisKelamin(extracted.jenisKelamin);
        setJumlahJiwa(extracted.jumlahJiwa.toString());
        setStatusIuran(extracted.statusIuran);
        setScanSuccess(true);
      } catch (err) {
        console.error('Scan error:', err);
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

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
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/70 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">Tambah Data Warga Baru</h3>
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

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ocr')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ocr'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles size={15} />
            <span>Foto / Import Gambar KK (Auto OCR)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={15} />
            <span>Input Manual</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto p-6 space-y-4 no-scrollbar">
          {/* TAB OCR / FOTO KK */}
          {activeTab === 'ocr' && (
            <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-4 text-center space-y-3">
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleImageSelected(e.target.files[0]);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleImageSelected(e.target.files[0]);
                }}
              />

              {!imagePreview ? (
                <div>
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs text-[#0B5D3F]">
                    <Camera size={24} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Foto atau Unggah Gambar Kartu Keluarga (KK)
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-500 max-w-sm mx-auto">
                    Sistem OCR akan membaca dokumen KK dan secara otomatis mengisi kolom nama kepala keluarga, nomor rumah, dan jumlah jiwa.
                  </p>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
                    >
                      <Camera size={15} />
                      <span>Ambil Foto Kamera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      <Upload size={15} />
                      <span>Pilih dari Galeri / File</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Preview and Scan Status */
                <div className="space-y-3">
                  <div className="relative mx-auto max-h-36 max-w-xs overflow-hidden rounded-xl border border-slate-300 bg-black/5 shadow-xs">
                    <img
                      src={imagePreview}
                      alt="Pratinjau KK"
                      className="h-full w-full object-contain"
                    />
                    {isScanning && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white backdrop-blur-xs">
                        <RefreshCw size={24} className="animate-spin text-emerald-400 mb-1.5" />
                        <span className="text-xs font-bold">Menganalisis Dokumen KK...</span>
                      </div>
                    )}
                  </div>

                  {scanSuccess && (
                    <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100/80 px-3 py-2 text-xs font-bold text-emerald-900 border border-emerald-300">
                      <CheckCircle2 size={16} className="text-emerald-700" />
                      <span>Berhasil! Data warga telah diekstrak secara otomatis di bawah.</span>
                    </div>
                  )}

                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      Ganti Foto Lain
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Fields (auto-filled by OCR or edited manually) */}
          <form id="warga-form" onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Nama Kepala Keluarga (KK)</label>
                {scanSuccess && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Otomatis dari KK
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Contoh: Ahmad Fauzi"
                className="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-semibold text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">No. Rumah / Gang</label>
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
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5 shrink-0">
          <span className="text-[11px] text-slate-400">RT 08 RW 05 Desa Kotayasa</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              form="warga-form"
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Simpan Data Warga</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
