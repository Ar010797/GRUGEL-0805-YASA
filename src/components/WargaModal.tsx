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
  Users,
  CreditCard,
  Plus,
  Trash2,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { Warga, AnggotaKeluarga } from '../types';
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
  const [noKK, setNoKK] = useState('');
  const [noRumah, setNoRumah] = useState('');
  const [alamat, setAlamat] = useState('RT 08 RW 05 Desa Kotayasa');
  const [rt, setRt] = useState('08');
  const [rw, setRw] = useState('05');
  const [jenisKelamin, setJenisKelamin] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [statusIuran, setStatusIuran] = useState<'Sudah' | 'Belum'>('Belum');
  const [anggotaKeluarga, setAnggotaKeluarga] = useState<AnggotaKeluarga[]>([]);

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
        setNoKK(extracted.noKK);
        setNoRumah(extracted.noRumah);
        setRt(extracted.rt || '08');
        setRw(extracted.rw || '05');
        setAlamat(extracted.alamat || 'RT 08 RW 05 Desa Kotayasa');
        setJenisKelamin(extracted.jenisKelamin);
        setStatusIuran(extracted.statusIuran);
        setAnggotaKeluarga(extracted.anggotaKeluarga || []);
        setScanSuccess(true);
      } catch (err) {
        console.error('Scan error:', err);
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddAnggota = () => {
    const newIdx = anggotaKeluarga.length + 1;
    const baseKK = noKK || '3302140805120000';
    setAnggotaKeluarga((prev) => [
      ...prev,
      {
        nik: baseKK.slice(0, 12) + newIdx.toString().padStart(4, '0'),
        nama: '',
        hubungan: newIdx === 1 ? 'Kepala Keluarga' : newIdx === 2 ? 'Istri' : 'Anak',
        tempatLahir: 'Banyumas',
        tanggalLahir: '2000-01-01',
        jenisKelamin: 'Laki-laki',
        agama: 'Islam',
        pekerjaan: 'Pelajar / Mahasiswa',
        statusPerkawinan: 'Belum Kawin',
      },
    ]);
  };

  const handleRemoveAnggota = (index: number) => {
    setAnggotaKeluarga((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAnggota = (index: number, field: keyof AnggotaKeluarga, value: string) => {
    setAnggotaKeluarga((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) return;

    const finalNoKK = noKK.trim() || ('330214' + Math.floor(1000000000 + Math.random() * 9000000000).toString());

    // Ensure at least one member (the head) exists
    const membersToSave: AnggotaKeluarga[] =
      anggotaKeluarga.length > 0
        ? anggotaKeluarga
        : [
            {
              nik: finalNoKK.slice(0, 12) + '0001',
              nama,
              hubungan: 'Kepala Keluarga',
              tempatLahir: 'Banyumas',
              tanggalLahir: '1980-01-01',
              jenisKelamin,
              agama: 'Islam',
              pekerjaan: 'Wiraswasta',
              statusPerkawinan: 'Kawin',
            },
          ];

    onSave({
      nama,
      noKK: finalNoKK,
      noRumah: noRumah || '01',
      rt: rt || '08',
      rw: rw || '05',
      alamat: alamat || 'RT 08 RW 05 Desa Kotayasa',
      jenisKelamin,
      jumlahJiwa: membersToSave.length,
      statusIuran,
      anggotaKeluarga: membersToSave,
      pin: '123456',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/80 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">Tambah Warga & Scan Foto KK</h3>
              <p className="text-xs text-slate-500">
                OCR Otomatis Isi No KK, Kepala Keluarga & Daftar Anggota
              </p>
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
            <span>Foto / Upload KK (OCR On-Device)</span>
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
            <span>Isi Manual Langsung</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
          {/* TAB OCR / FOTO KK */}
          {activeTab === 'ocr' && (
            <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-4 text-center space-y-3">
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

              {imagePreview ? (
                <div className="relative mx-auto max-w-xs overflow-hidden rounded-xl border border-emerald-200 shadow-xs">
                  <img src={imagePreview} alt="Preview KK" className="max-h-36 w-full object-cover" />
                  {isScanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white">
                      <RefreshCw size={24} className="animate-spin text-emerald-400 mb-1" />
                      <span className="text-xs font-bold">Membaca Teks KK (OCR)...</span>
                    </div>
                  )}
                  {scanSuccess && (
                    <div className="absolute top-2 right-2 rounded-full bg-emerald-600 p-1 text-white shadow-xs">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#0B5D3F] mb-2">
                    <Camera size={24} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Pindai Kartu Keluarga (KK) Warga
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-0.5">
                    Sistem akan membaca No KK, Nama Kepala Keluarga, dan Anggota Keluarga otomatis.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
                >
                  <Camera size={14} />
                  <span>Ambil Foto KK</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-4 py-2 text-xs font-bold text-[#0B5D3F] hover:bg-emerald-50 cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Upload Foto KK</span>
                </button>
              </div>

              {scanSuccess && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/80 rounded-xl py-1.5 px-3">
                  <CheckCircle2 size={15} />
                  <span>Data KK berhasil terbaca! Anda dapat mengoreksi data di bawah.</span>
                </div>
              )}
            </div>
          )}

          {/* Account Activation Info Banner */}
          <div className="rounded-2xl bg-blue-50 p-3.5 border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-900">
            <KeyRound size={18} className="text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Akun Warga Otomatis Aktif Setelah Disimpan:</p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                &bull; <strong>Username:</strong> Nama Kepala Keluarga ({nama || 'Nama Warga'})<br />
                &bull; <strong>Password:</strong> Nomor KK 16 Digit ({noKK || '16 digit No KK'})<br />
                &bull; <strong>PIN Standar:</strong> 123456 (bisa diubah warga di Pengaturan)
              </p>
            </div>
          </div>

          {/* Form Fields: Data Kartu Keluarga */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Identitas Kepala Keluarga & Rumah
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nomor Kartu Keluarga (16 Digit)*
                </label>
                <div className="relative">
                  <CreditCard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={16}
                    value={noKK}
                    onChange={(e) => setNoKK(e.target.value)}
                    placeholder="3302140805120001"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Kepala Keluarga*
                </label>
                <input
                  type="text"
                  required
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nomor Rumah
                </label>
                <input
                  type="text"
                  value={noRumah}
                  onChange={(e) => setNoRumah(e.target.value)}
                  placeholder="Contoh: 08 atau 12A"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RT / RW
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={rt}
                    onChange={(e) => setRt(e.target.value)}
                    placeholder="08"
                    className="w-1/2 rounded-xl border border-slate-200 px-2.5 py-2 text-xs text-center font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                  <input
                    type="text"
                    value={rw}
                    onChange={(e) => setRw(e.target.value)}
                    placeholder="05"
                    className="w-1/2 rounded-xl border border-slate-200 px-2.5 py-2 text-xs text-center font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jenis Kelamin Kepala KK
                </label>
                <select
                  value={jenisKelamin}
                  onChange={(e) => setJenisKelamin(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                >
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alamat Lengkap
              </label>
              <input
                type="text"
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                placeholder="RT 08 RW 05 Desa Kotayasa, Kec. Sumbang"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
              />
            </div>
          </div>

          {/* Section 2: Anggota Keluarga */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Daftar Anggota Keluarga ({anggotaKeluarga.length} Jiwa)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Data NIK, hubungan, dan pekerjaan yang tercatat di KK
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddAnggota}
                className="flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-[#0B5D3F] border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Anggota</span>
              </button>
            </div>

            <div className="space-y-3">
              {anggotaKeluarga.map((member, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5 relative"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-xs font-bold text-[#0B5D3F]">
                      Anggota #{idx + 1}: {member.hubungan || 'Anggota'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAnggota(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Hapus anggota"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        NIK (16 Digit)
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={member.nik}
                        onChange={(e) => handleUpdateAnggota(idx, 'nik', e.target.value)}
                        placeholder="3302141503800001"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        value={member.nama}
                        onChange={(e) => handleUpdateAnggota(idx, 'nama', e.target.value)}
                        placeholder="Nama anggota keluarga"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        Status Hubungan
                      </label>
                      <select
                        value={member.hubungan}
                        onChange={(e) => handleUpdateAnggota(idx, 'hubungan', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      >
                        <option value="Kepala Keluarga">Kepala Keluarga</option>
                        <option value="Istri">Istri</option>
                        <option value="Anak">Anak</option>
                        <option value="Orang Tua">Orang Tua</option>
                        <option value="Mertua">Mertua</option>
                        <option value="Famili Lain">Famili Lain</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Jenis Kelamin</label>
                      <select
                        value={member.jenisKelamin}
                        onChange={(e) => handleUpdateAnggota(idx, 'jenisKelamin', e.target.value as any)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-500">Agama</label>
                      <input
                        type="text"
                        value={member.agama || 'Islam'}
                        onChange={(e) => handleUpdateAnggota(idx, 'agama', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-500">Pekerjaan</label>
                      <input
                        type="text"
                        value={member.pekerjaan || 'Wiraswasta'}
                        onChange={(e) => handleUpdateAnggota(idx, 'pekerjaan', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-500">Status Kawin</label>
                      <input
                        type="text"
                        value={member.statusPerkawinan || 'Kawin'}
                        onChange={(e) => handleUpdateAnggota(idx, 'statusPerkawinan', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white py-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
            >
              <Check size={16} strokeWidth={2.5} />
              <span>Simpan Warga & Aktifkan Akun</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
