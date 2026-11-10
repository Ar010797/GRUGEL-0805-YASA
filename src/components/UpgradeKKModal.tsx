import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  RefreshCw,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Users,
  CreditCard,
  User,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Heart,
  FileText,
  AlertTriangle,
  History,
  Check,
  Plus,
  Trash2,
  Calendar,
} from 'lucide-react';
import { Warga, AnggotaKeluarga, Transaction } from '../types';
import {
  scanKartuKeluargaImage,
  cleanIndonesianName,
  cleanNIK,
  isFormOrHeaderGarbage,
  preprocessAndCompressImage,
  rotateImage90,
  CONTOH_KK_KARSINEM,
} from '../utils/ocrKKScanner';

interface UpgradeKKModalProps {
  isOpen: boolean;
  onClose: () => void;
  wargaList: Warga[];
  transactions: Transaction[];
  initialTargetWarga?: Warga | null;
  onApplyUpgrade: (payload: {
    wargaId: string;
    oldWarga: Warga;
    newKKData: {
      nama: string;
      noKK: string;
      rt: string;
      rw: string;
      alamat: string;
      jenisKelamin: 'Laki-laki' | 'Perempuan';
      anggotaKeluarga: AnggotaKeluarga[];
    };
    alasan: 'meninggal' | 'pisah_kk' | 'perubahan_anggota' | 'pembaruan_berkala';
    keterangan: string;
    catatSantunanKematian: boolean;
    namaMeninggal?: string;
  }) => void;
}

export const UpgradeKKModal: React.FC<UpgradeKKModalProps> = ({
  isOpen,
  onClose,
  wargaList,
  transactions,
  initialTargetWarga,
  onApplyUpgrade,
}) => {
  // Target resident selection
  const [selectedWargaId, setSelectedWargaId] = useState<string>(initialTargetWarga?.id || '');

  // Step state: 1 = Scan & Upload, 2 = Review & Confirm Migration
  const [step, setStep] = useState<1 | 2>(1);

  // OCR scanning state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Scanned / New KK Data
  const [newNama, setNewNama] = useState('');
  const [newNoKK, setNewNoKK] = useState('');
  const [newRt, setNewRt] = useState('08');
  const [newRw, setNewRw] = useState('05');
  const [newAlamat, setNewAlamat] = useState('');
  const [newJenisKelamin, setNewJenisKelamin] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [newAnggota, setNewAnggota] = useState<AnggotaKeluarga[]>([]);

  // Migration details
  const [alasan, setAlasan] = useState<'meninggal' | 'pisah_kk' | 'perubahan_anggota' | 'pembaruan_berkala'>('meninggal');
  const [keterangan, setKeterangan] = useState('');
  const [catatSantunanKematian, setCatatSantunanKematian] = useState(false);
  const [namaMeninggal, setNamaMeninggal] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync initial target
  useEffect(() => {
    if (initialTargetWarga) {
      setSelectedWargaId(initialTargetWarga.id);
    } else if (wargaList.length > 0 && !selectedWargaId) {
      setSelectedWargaId(wargaList[0].id);
    }
  }, [initialTargetWarga, wargaList]);

  if (!isOpen) return null;

  const targetWarga = wargaList.find((w) => w.id === selectedWargaId) || null;

  // Calculate past cash history for target family
  const targetTransactions = targetWarga
    ? transactions.filter(
        (t) =>
          (t.noKK && t.noKK === targetWarga.noKK) ||
          (t.namaWarga && t.namaWarga.toLowerCase() === targetWarga.nama.toLowerCase())
      )
    : [];

  const totalKasMasukTercatat = targetTransactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((sum, t) => sum + t.nominal, 0);

  const handleFillKarsinemSample = () => {
    setImagePreview('/assets/aistudio/IMG_20261108_183853_2e1ae6e4.jpg');
    setNewNama(CONTOH_KK_KARSINEM.nama);
    setNewNoKK(CONTOH_KK_KARSINEM.noKK);
    setNewRt(CONTOH_KK_KARSINEM.rt);
    setNewRw(CONTOH_KK_KARSINEM.rw);
    setNewAlamat(CONTOH_KK_KARSINEM.alamat);
    setNewJenisKelamin(CONTOH_KK_KARSINEM.jenisKelamin);
    setNewAnggota([...CONTOH_KK_KARSINEM.anggotaKeluarga]);
    setScanSuccess(true);
    setScanError(null);
  };

  const handleRotateImage = async () => {
    if (!imagePreview) return;
    setIsScanning(true);
    try {
      const rotated = await rotateImage90(imagePreview, true);
      setImagePreview(rotated);
      const extracted = await scanKartuKeluargaImage(rotated, 'image/jpeg');
      const cleanName = cleanIndonesianName(extracted.nama);
      const cleanNoKKDigits = cleanNIK(extracted.noKK);
      const cleanMembers = (extracted.anggotaKeluarga || []).map((m, idx) => {
        let mName = cleanIndonesianName(m.nama);
        if (!mName || isFormOrHeaderGarbage(mName) || mName === 'Istri' || mName.startsWith('Anak #')) {
          mName = idx === 0 ? cleanName : '';
        }
        return {
          ...m,
          nama: mName,
          nik: cleanNIK(m.nik),
        };
      });

      setNewNama(cleanName);
      setNewNoKK(cleanNoKKDigits);
      setNewRt(extracted.rt || targetWarga?.rt || '08');
      setNewRw(extracted.rw || targetWarga?.rw || '05');
      setNewAlamat(extracted.alamat || targetWarga?.alamat || 'RT 08 RW 05 Desa Kotayasa');
      setNewJenisKelamin(extracted.jenisKelamin);
      setNewAnggota(cleanMembers);
      setScanSuccess(true);
    } catch (err: any) {
      setScanError(err.message || 'Gagal memutar gambar.');
    } finally {
      setIsScanning(false);
    }
  };

  // Handle OCR upload
  const handleImageSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setScanSuccess(false);
      setScanError(null);
      setIsScanning(true);

      try {
        const optimized = await preprocessAndCompressImage(base64);
        setImagePreview(optimized);

        const extracted = await scanKartuKeluargaImage(optimized, 'image/jpeg');
        const cleanName = cleanIndonesianName(extracted.nama);
        const cleanNoKKDigits = cleanNIK(extracted.noKK);
        const cleanMembers = (extracted.anggotaKeluarga || []).map((m, idx) => {
          let mName = cleanIndonesianName(m.nama);
          if (!mName || isFormOrHeaderGarbage(mName) || mName === 'Istri' || mName.startsWith('Anak #')) {
            mName = idx === 0 ? cleanName : '';
          }
          return {
            ...m,
            nama: mName,
            nik: cleanNIK(m.nik),
          };
        });

        setNewNama(cleanName);
        setNewNoKK(cleanNoKKDigits);
        setNewRt(extracted.rt || targetWarga?.rt || '08');
        setNewRw(extracted.rw || targetWarga?.rw || '05');
        setNewAlamat(extracted.alamat || targetWarga?.alamat || 'RT 08 RW 05 Desa Kotayasa');
        setNewJenisKelamin(extracted.jenisKelamin);
        setNewAnggota(cleanMembers);
        setScanSuccess(true);

        // Auto-detect removed member for meninggal / pisah KK if target exists
        if (targetWarga && targetWarga.anggotaKeluarga) {
          const oldMembers = targetWarga.anggotaKeluarga.map((m) => m.nama.toLowerCase());
          const newMemberNames = cleanMembers.map((m) => m.nama.toLowerCase());
          const missing = targetWarga.anggotaKeluarga.filter(
            (m) => !newMemberNames.some((n) => n.includes(m.nama.toLowerCase()) || m.nama.toLowerCase().includes(n))
          );
          if (missing.length > 0) {
            setNamaMeninggal(missing[0].nama);
            setKeterangan(`Pembaruan KK: ${missing.map((m) => m.nama).join(', ')} tidak lagi tercantum dalam KK terbaru.`);
          }
        }
      } catch (err: any) {
        console.error('OCR Upgrade Error:', err);
        setScanError(err.message || 'Gagal membaca foto Kartu Keluarga.');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Find diffs
  const oldMemberNames = targetWarga?.anggotaKeluarga?.map((m) => m.nama) || [targetWarga?.nama || ''];
  const newMemberNames = newAnggota.map((m) => m.nama);

  const anggotaKeluar = oldMemberNames.filter(
    (oldN) => !newMemberNames.some((newN) => newN.toLowerCase().includes(oldN.toLowerCase()) || oldN.toLowerCase().includes(newN.toLowerCase()))
  );

  const anggotaMasuk = newMemberNames.filter(
    (newN) => !oldMemberNames.some((oldN) => oldN.toLowerCase().includes(newN.toLowerCase()) || newN.toLowerCase().includes(oldN.toLowerCase()))
  );

  const isKepalaBerubah = targetWarga && newNama && targetWarga.nama.toLowerCase() !== newNama.toLowerCase();
  const isNoKKBerubah = targetWarga && newNoKK && targetWarga.noKK !== newNoKK;

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWarga) {
      alert('Silakan pilih data KK yang ingin diperbarui.');
      return;
    }
    const cleanName = cleanIndonesianName(newNama);
    const cleanNoKKDigits = cleanNIK(newNoKK);

    if (!cleanName) {
      alert('Silakan masukkan Nama Kepala Keluarga baru.');
      return;
    }
    if (!cleanNoKKDigits || cleanNoKKDigits.length < 16) {
      alert('Nomor Kartu Keluarga baru harus tepat 16 digit angka.');
      return;
    }

    const finalMembers = newAnggota.map((m) => ({
      ...m,
      nama: cleanIndonesianName(m.nama),
      nik: cleanNIK(m.nik),
    }));

    onApplyUpgrade({
      wargaId: targetWarga.id,
      oldWarga: targetWarga,
      newKKData: {
        nama: cleanName,
        noKK: cleanNoKKDigits,
        rt: newRt,
        rw: newRw,
        alamat: newAlamat,
        jenisKelamin: newJenisKelamin,
        anggotaKeluarga: finalMembers,
      },
      alasan,
      keterangan: keterangan || `Pembaruan data KK via scan foto terbaru (${alasan})`,
      catatSantunanKematian,
      namaMeninggal: namaMeninggal.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#E8F5EE] to-emerald-100/60 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0B5D3F] text-white shadow-sm">
              <RefreshCw size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[#0B5D3F]">
                  Upgrade & Pembaruan Data KK Terbaru
                </h3>
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                  Proteksi Kas Otomatis
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Scan KK baru saat ada anggota meninggal, pisah KK, atau perubahan keluarga tanpa menghilangkan catatan kas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6 no-scrollbar">
          {/* STEP 1: Pilih KK & Scan KK Baru */}
          <div className="space-y-4">
            {/* Target Family Selector */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                1. Pilih Data Kartu Keluarga yang Akan Diperbarui:
              </label>
              <select
                value={selectedWargaId}
                onChange={(e) => setSelectedWargaId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
              >
                <option value="">-- Pilih Kepala Keluarga Terdaftar --</option>
                {wargaList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nama} &bull; No KK: {w.noKK || '-'} &bull; Rumah: {w.noRumah} &bull; {w.jumlahJiwa || 1} Jiwa
                  </option>
                ))}
              </select>

              {/* Protected Balance Callout */}
              {targetWarga && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200/90 p-3 text-xs text-emerald-900 flex items-start gap-2.5">
                  <ShieldCheck size={18} className="text-[#0B5D3F] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">
                      Proteksi Catatan Kas & Iuran Terjamin:
                    </p>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      KK <strong>{targetWarga.nama}</strong> memiliki catatan iuran masuk total{' '}
                      <strong className="text-[#0B5D3F] font-extrabold font-mono">
                        Rp {totalKasMasukTercatat.toLocaleString('id-ID')}
                      </strong>{' '}
                      ({targetTransactions.length} transaksi) dengan status{' '}
                      <strong>{targetWarga.statusIuran === 'Sudah' ? 'LUNAS' : 'BELUM LUNAS'}</strong>. Seluruh riwayat ini akan otomatis dipindahkan ke KK/Kepala Keluarga baru.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Scan Area */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-[#F4FAF6] p-5 text-center space-y-3">
              {/* Quick Fill Specific Reference Sample */}
              <button
                type="button"
                onClick={handleFillKarsinemSample}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-md hover:from-amber-600 hover:to-emerald-700 active:scale-98 transition-all cursor-pointer"
              >
                <Sparkles size={16} className="animate-pulse" />
                <span>⭐ Isi Spesifik Sesuai Foto KK Terlampir (Ibu KARSINEM)</span>
              </button>

              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Scan / Ambil Foto Dokumen Kartu Keluarga (KK) Terbaru:
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelected(file);
                }}
              />

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelected(file);
                }}
              />

              {imagePreview ? (
                <div className="space-y-2">
                  <div className="relative mx-auto max-w-sm overflow-hidden rounded-xl border border-emerald-200 shadow-xs">
                    <img src={imagePreview} alt="Preview KK Baru" className="max-h-40 w-full object-cover" />
                    {isScanning && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white">
                        <RefreshCw size={24} className="animate-spin text-emerald-400 mb-1" />
                        <span className="text-xs font-bold">Menganalisis Foto KK Terbaru...</span>
                      </div>
                    )}
                    {scanSuccess && (
                      <div className="absolute top-2 right-2 rounded-full bg-emerald-600 p-1 text-white shadow-xs">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleRotateImage}
                    disabled={isScanning}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCw size={13} />
                    <span>Putar Foto 90° (Orientasi Lanskap)</span>
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#0B5D3F] mb-2">
                    <Camera size={24} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Foto Kartu Keluarga (KK) yang Sudah Diperbarui
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
                    Sistem akan membaca susunan anggota keluarga baru dan mendeteksi anggota yang meninggal/pisah secara otomatis.
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
                  <span>Ambil Foto KK Baru</span>
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
                  <span>Foto KK berhasil terbaca! Silakan tinjau analisis perubahan di bawah.</span>
                </div>
              )}

              {scanError && (
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 text-left">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span>{scanError}</span>
                </div>
              )}
            </div>

            {/* STEP 2: Analisis Perubahan & Formulir Penyesuaian */}
            {targetWarga && (
              <form onSubmit={handleConfirmSubmit} className="space-y-5 pt-2">
                {/* Comparison Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <History size={15} className="text-[#0B5D3F]" />
                    <span>3. Analisis Perubahan Data Kartu Keluarga:</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data Lama */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                      <span className="font-bold text-slate-500 block border-b border-slate-200 pb-1">
                        DATA KK LAMA:
                      </span>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Kepala Keluarga:</span>
                        <strong className="text-slate-800">{targetWarga.nama}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Nomor KK:</span>
                        <span className="font-mono font-bold text-slate-700">{targetWarga.noKK}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Daftar Anggota ({targetWarga.anggotaKeluarga?.length || 1} Jiwa):</span>
                        <ul className="list-disc list-inside text-[11px] text-slate-600 mt-0.5 space-y-0.5">
                          {targetWarga.anggotaKeluarga?.map((m, i) => (
                            <li key={i}>{m.nama} ({m.hubungan})</li>
                          )) || <li>{targetWarga.nama}</li>}
                        </ul>
                      </div>
                    </div>

                    {/* Data Baru */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs space-y-2">
                      <span className="font-bold text-[#0B5D3F] block border-b border-emerald-200 pb-1">
                        DATA KK BARU (DARI SCAN):
                      </span>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          Kepala Keluarga Baru:*
                        </label>
                        <input
                          type="text"
                          required
                          value={newNama}
                          onChange={(e) => setNewNama(e.target.value)}
                          placeholder="Nama Kepala Keluarga Baru"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-[#0B5D3F] outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          Nomor KK Baru (16 Digit):*
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={16}
                          value={newNoKK}
                          onChange={(e) => setNewNoKK(e.target.value)}
                          placeholder="16 Digit No KK Baru"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-[#0B5D3F] outline-hidden"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-1">
                          Susunan Anggota Baru ({newAnggota.length} Jiwa):
                        </span>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
                          {newAnggota.map((m, i) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1 border border-slate-200 text-[11px]">
                              <span className="font-semibold text-slate-800">{m.nama || 'Anggota'}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{m.hubungan}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Highlights of changes */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {isKepalaBerubah && (
                      <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-200">
                        <User size={15} className="text-amber-700 shrink-0" />
                        <span>
                          Pergantian Kepala Keluarga dari <strong>{targetWarga.nama}</strong> menjadi{' '}
                          <strong>{newNama}</strong>. Akun login warga otomatis dialihkan ke Kepala Keluarga baru.
                        </span>
                      </div>
                    )}

                    {anggotaKeluar.length > 0 && (
                      <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-900 border border-rose-200">
                        <AlertTriangle size={15} className="text-rose-700 shrink-0" />
                        <span>
                          Anggota tidak tercantum di KK baru:{' '}
                          <strong>{anggotaKeluar.join(', ')}</strong> (Meninggal Dunia / Pisah KK).
                        </span>
                      </div>
                    )}

                    {anggotaMasuk.length > 0 && (
                      <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-2.5 text-xs text-blue-900 border border-blue-200">
                        <Sparkles size={15} className="text-blue-700 shrink-0" />
                        <span>
                          Anggota baru terdaftar di KK: <strong>{anggotaMasuk.join(', ')}</strong>.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reason & Options */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    4. Konfirmasi Alasan Pembaruan KK:
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'meninggal', label: 'Meninggal Dunia', icon: '⚰️' },
                      { id: 'pisah_kk', label: 'Pisah KK (Menikah)', icon: '💍' },
                      { id: 'perubahan_anggota', label: 'Lahir / Tambah Anggota', icon: '👶' },
                      { id: 'pembaruan_berkala', label: 'Ganti Blanko / Berkala', icon: '📋' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAlasan(opt.id as any)}
                        className={`rounded-xl p-2.5 text-xs font-bold text-center border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                          alasan === opt.id
                            ? 'bg-[#0B5D3F] text-white border-[#0B5D3F] shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-base">{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  {alasan === 'meninggal' && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2.5 text-xs text-rose-950">
                      <div>
                        <label className="block text-[11px] font-bold text-rose-900 mb-1">
                          Nama Anggota Keluarga yang Meninggal Dunia:
                        </label>
                        <input
                          type="text"
                          value={namaMeninggal}
                          onChange={(e) => setNamaMeninggal(e.target.value)}
                          placeholder="Nama almarhum / almarhumah"
                          className="w-full rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-rose-600 outline-hidden"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-1 font-semibold text-rose-900">
                        <input
                          type="checkbox"
                          checked={catatSantunanKematian}
                          onChange={(e) => setCatatSantunanKematian(e.target.checked)}
                          className="h-4 w-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                        <span>
                          Catat pengeluaran santunan Kas Kematian & Kain Mori (Rp 200.000) otomatis di kas RT?
                        </span>
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Catatan Tambahan (Opsional):
                    </label>
                    <input
                      type="text"
                      value={keterangan}
                      onChange={(e) => setKeterangan(e.target.value)}
                      placeholder="Contoh: Bpk. Suwardi wafat, KK baru diterbitkan dengan Ibu Siti sebagai Kepala Keluarga"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                    />
                  </div>
                </div>

                {/* Final Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#0B5D3F]">
                    <CheckCircle2 size={16} />
                    <span>Dana kas Rp {totalKasMasukTercatat.toLocaleString('id-ID')} dipindahkan utuh</span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 sm:flex-none rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={14} />
                      <span>Terapkan Pembaruan KK & Pindahkan Data Kas</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
