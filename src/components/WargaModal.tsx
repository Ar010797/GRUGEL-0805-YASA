import React, { useState, useRef } from 'react';
import {
  X,
  UserPlus,
  Check,
  Upload,
  FileSpreadsheet,
  Download,
  FileText,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Users,
  CreditCard,
  Plus,
  Trash2,
  KeyRound,
  HandHeart,
  AlertTriangle,
} from 'lucide-react';
import { Warga, AnggotaKeluarga, BantuanPemerintah, ProfilRT } from '../types';
import { cleanIndonesianName, cleanNIK } from '../utils/wargaHelpers';
import {
  downloadTemplateExcelWargaBansos,
  parseExcelWargaAndBantuan,
  ExcelImportResult,
} from '../utils/excelWargaImport';

interface WargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (warga: Omit<Warga, 'id' | 'no'>) => void;
  onBulkImport?: (
    wargaList: Omit<Warga, 'id' | 'no'>[],
    bantuanList: Omit<BantuanPemerintah, 'id'>[],
    options: { mergeExisting: boolean }
  ) => void;
  profilRT?: ProfilRT;
}

export const WargaModal: React.FC<WargaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onBulkImport,
  profilRT,
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel');

  // Excel bulk import state
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState<boolean>(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [mergeExisting, setMergeExisting] = useState<boolean>(true);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Manual form values
  const [nama, setNama] = useState('');
  const [noKK, setNoKK] = useState('');
  const [noRumah, setNoRumah] = useState('');
  const [alamat, setAlamat] = useState(
    profilRT?.sebutanWilayah || `RT ${profilRT?.namaRT || '08'} RW ${profilRT?.namaRW || '05'} ${profilRT?.desa || 'Desa Kotayasa'}`
  );
  const [rt, setRt] = useState(profilRT?.namaRT || '08');
  const [rw, setRw] = useState(profilRT?.namaRW || '05');
  const [jenisKelamin, setJenisKelamin] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [statusIuran, setStatusIuran] = useState<'Sudah' | 'Belum'>('Belum');
  const [kodePos, setKodePos] = useState(profilRT?.kodePos || '53183');
  const [tanggalDikeluarkan, setTanggalDikeluarkan] = useState('');
  const [anggotaKeluarga, setAnggotaKeluarga] = useState<AnggotaKeluarga[]>([]);

  if (!isOpen) return null;

  const handleExcelSelected = async (file: File) => {
    setExcelFileName(file.name);
    setExcelError(null);
    setImportResult(null);
    setIsParsingExcel(true);

    try {
      const parsed = await parseExcelWargaAndBantuan(file, {
        rt: profilRT?.namaRT || '08',
        rw: profilRT?.namaRW || '05',
        alamat: profilRT?.sebutanWilayah || 'RT 08 RW 05 Desa Kotayasa',
      });

      if (parsed.wargaList.length === 0 && parsed.bantuanList.length === 0) {
        setExcelError(
          'Tidak ditemukan data warga yang valid di file Excel. Pastikan menggunakan format Template Excel resmi.'
        );
      } else {
        setImportResult(parsed);
      }
    } catch (err: any) {
      console.error('Excel parse error:', err);
      setExcelError(err?.message || 'Gagal membaca file Excel. Pastikan file berformat .xlsx, .xls, atau .csv.');
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleConfirmBulkImport = () => {
    if (!importResult) return;
    if (onBulkImport) {
      onBulkImport(importResult.wargaList, importResult.bantuanList, { mergeExisting });
    } else {
      importResult.wargaList.forEach((w) => onSave(w));
    }
    setImportResult(null);
    setExcelFileName(null);
    setExcelError(null);
    onClose();
  };

  const handleAddAnggota = () => {
    const newIdx = anggotaKeluarga.length + 1;
    const baseKK = cleanNIK(noKK) || '3302210000000000';
    setAnggotaKeluarga((prev) => [
      ...prev,
      {
        nik: baseKK.slice(0, 12) + newIdx.toString().padStart(4, '0'),
        nama: '',
        hubungan: newIdx === 1 ? 'Kepala Keluarga' : newIdx === 2 ? 'Istri' : 'Anak',
        tempatLahir: 'Banyumas',
        tanggalLahir: '',
        jenisKelamin: newIdx === 2 ? 'Perempuan' : 'Laki-laki',
        agama: 'Islam',
        pendidikan: newIdx === 1 ? 'Diploma IV/Strata I' : newIdx === 2 ? 'SLTP/Sederajat' : 'Tidak/Belum Sekolah',
        pekerjaan: newIdx === 2 ? 'Mengurus Rumah Tangga' : 'Belum/Tidak Bekerja',
        golonganDarah: 'Tidak Tahu',
        statusPerkawinan: newIdx <= 2 ? 'Kawin Tercatat' : 'Belum Kawin',
        tanggalPerkawinan: '',
        kewarganegaraan: 'WNI',
        namaAyah: '',
        namaIbu: '',
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

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNama = cleanIndonesianName(nama);
    const finalNoKK = cleanNIK(noKK);

    if (!cleanNama) {
      alert('Silakan masukkan Nama Kepala Keluarga.');
      return;
    }
    if (!finalNoKK || finalNoKK.length < 16) {
      alert('Nomor Kartu Keluarga harus tepat 16 digit angka.');
      return;
    }

    const membersToSave: AnggotaKeluarga[] =
      anggotaKeluarga.length > 0
        ? anggotaKeluarga.map((m) => ({
            ...m,
            nik: cleanNIK(m.nik),
            nama: cleanIndonesianName(m.nama),
            tempatLahir: m.tempatLahir || 'Banyumas',
            tanggalLahir: m.tanggalLahir || '',
            pendidikan: m.pendidikan || 'Tidak/Belum Sekolah',
            pekerjaan: m.pekerjaan || 'Belum/Tidak Bekerja',
            golonganDarah: m.golonganDarah || 'Tidak Tahu',
            statusPerkawinan: m.statusPerkawinan || 'Belum Kawin',
            tanggalPerkawinan: m.tanggalPerkawinan || '',
            kewarganegaraan: m.kewarganegaraan || 'WNI',
            namaAyah: cleanIndonesianName(m.namaAyah || ''),
            namaIbu: cleanIndonesianName(m.namaIbu || ''),
          }))
        : [
            {
              nik: finalNoKK,
              nama: cleanNama,
              hubungan: 'Kepala Keluarga',
              tempatLahir: 'Banyumas',
              tanggalLahir: '',
              jenisKelamin,
              agama: 'Islam',
              pendidikan: 'SLTA/Sederajat',
              pekerjaan: 'Wiraswasta',
              golonganDarah: 'Tidak Tahu',
              statusPerkawinan: 'Kawin Tercatat',
              tanggalPerkawinan: '',
              kewarganegaraan: 'WNI',
              namaAyah: '',
              namaIbu: '',
            },
          ];

    onSave({
      nama: cleanNama,
      noKK: finalNoKK,
      noRumah: noRumah || '01',
      rt: rt || '08',
      rw: rw || '05',
      alamat: alamat || 'RT 08 RW 05 Desa Kotayasa',
      kodePos: kodePos || '53183',
      tanggalDikeluarkan: tanggalDikeluarkan || '',
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
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE]/80 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B5D3F]">
                Import Excel Warga & Penerimaan Bantuan
              </h3>
              <p className="text-xs text-slate-500">
                Sekali import langsung dikelompokkan ke KK, Anggota Keluarga & Data Bansos
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
            onClick={() => setActiveTab('excel')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'excel'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>Import File Excel (Sekaligus Semua Warga & Bantuan)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-[#0B5D3F] shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus size={15} />
            <span>Tambah Manual Satu KK</span>
          </button>
        </div>

        {/* TAB 1: IMPORT EXCEL MASSAL */}
        {activeTab === 'excel' && (
          <div className="overflow-y-auto p-6 space-y-5 flex-1">
            {/* Step 1: Download Template */}
            <div className="rounded-2xl border border-emerald-200 bg-[#F4FAF6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B5D3F] text-white text-xs font-extrabold">
                    1
                  </span>
                  <h4 className="text-xs font-extrabold text-slate-900">
                    Download Template Excel Resmi (.xlsx) — Format Blok KK & Bansos
                  </h4>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pl-8">
                  Format template sudah disesuaikan dengan struktur <strong>Data KK Warga (Blok KK)</strong>: isi <strong>Nama Kepala Keluarga</strong> di Kolom A dan <strong>ID / No KK 16 digit tepat di baris bawahnya</strong>, lalu seluruh anggota keluarga (Kep.Keluarga, Istri, Anak) dan kolom <strong>Jenis Bantuan</strong> akan otomatis terkelompokkan sekali import.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadTemplateExcelWargaBansos({
                    rt: profilRT?.namaRT || '08',
                    rw: profilRT?.namaRW || '05',
                    desa: profilRT?.desa || 'Desa Kotayasa',
                  })
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
              >
                <Download size={15} />
                <span>Download Template Excel (.xlsx)</span>
              </button>
            </div>

            {/* Step 2: Upload File Excel */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 text-center space-y-3">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExcelSelected(file);
                  e.target.value = '';
                }}
              />

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#0B5D3F]">
                {isParsingExcel ? (
                  <RefreshCw size={24} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={24} />
                )}
              </div>

              <div>
                <h4 className="text-xs font-extrabold text-slate-800">
                  2. Upload File Excel Data Warga & Bantuan (.xlsx / .xls / .csv)
                </h4>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
                  Mendukung file format Blok KK (seperti <strong>Data KK Halaman 1</strong> dengan ID KK di bawah Nama Kepala Keluarga) maupun tabel No KK biasa. Semua anggota keluarga (termasuk KK tunggal) & bansos langsung terbaca cepat.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={isParsingExcel}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload size={15} />
                  <span>{excelFileName ? 'Ganti File Excel' : 'Pilih & Import File Excel'}</span>
                </button>
                {excelFileName && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-900">
                    <FileText size={14} className="text-[#0B5D3F]" />
                    <span className="truncate max-w-[200px]">{excelFileName}</span>
                  </span>
                )}
              </div>

              {excelError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-left text-xs font-semibold text-rose-800">
                  <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                  <span>{excelError}</span>
                </div>
              )}
            </div>

            {/* Step 3: Preview Hasil Pengelompokan */}
            {importResult && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Summary KPIs */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-[#E8F5EE] border border-emerald-200 p-3.5 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Total KK Terkelompok
                    </span>
                    <p className="text-xl font-extrabold text-[#0B5D3F] mt-0.5">
                      {importResult.totalKK} KK
                    </p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3.5 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                      Total Anggota Keluarga
                    </span>
                    <p className="text-xl font-extrabold text-blue-900 mt-0.5">
                      {importResult.totalJiwa} Jiwa
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      Penerima Bantuan
                    </span>
                    <p className="text-xl font-extrabold text-amber-900 mt-0.5">
                      {importResult.totalBantuan} Data
                    </p>
                  </div>
                </div>

                {/* Duplicate Merge Option */}
                <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mergeExisting}
                    onChange={(e) => setMergeExisting(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#0B5D3F] cursor-pointer"
                  />
                  <span>
                    Perbarui / gabungkan otomatis jika <strong>No KK sudah terdaftar</strong> di aplikasi (mencegah data ganda)
                  </span>
                </label>

                {/* Warnings */}
                {importResult.warnings.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <AlertTriangle size={15} className="text-amber-600" />
                      <span>Catatan Pemeriksaan ({importResult.warnings.length}):</span>
                    </div>
                    <ul className="list-disc pl-5 text-[11px] text-amber-800 space-y-0.5 max-h-24 overflow-y-auto">
                      {importResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Grouped Families Preview List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Preview Hasil Pengelompokan Per Kartu Keluarga
                    </h4>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      {importResult.totalRowsRead} baris dibaca
                    </span>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                    {importResult.wargaList.map((family, fIdx) => {
                      const familyBansos = importResult.bantuanList.filter(
                        (b) =>
                          (family.noKK && b.noKK === family.noKK) ||
                          b.namaPenerima.toLowerCase() === family.nama.toLowerCase()
                      );

                      return (
                        <div
                          key={fIdx}
                          className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div>
                              <span className="text-xs font-extrabold text-slate-900">
                                {fIdx + 1}. {family.nama}
                              </span>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-sm border border-emerald-200">
                                  KK: {family.noKK || 'Belum diisi'}
                                </span>
                                <span>Rumah {family.noRumah}</span>
                                <span>RT {family.rt} / RW {family.rw}</span>
                                <span
                                  className={`font-bold ${
                                    family.statusIuran === 'Sudah' ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  Iuran: {family.statusIuran}
                                </span>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                              <Users size={11} />
                              <span>{family.anggotaKeluarga?.length || 1} Anggota</span>
                            </span>
                          </div>

                          {/* Members */}
                          <div className="flex flex-wrap gap-1.5">
                            {(family.anggotaKeluarga || []).map((m, mIdx) => (
                              <span
                                key={mIdx}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[10px] text-slate-700"
                              >
                                <strong className="text-[#0B5D3F]">{m.hubungan}:</strong>
                                <span className="font-semibold">{m.nama}</span>
                                {m.nik && <span className="font-mono text-slate-400">({m.nik})</span>}
                              </span>
                            ))}
                          </div>

                          {/* Aid Badges */}
                          {familyBansos.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {familyBansos.map((b, bIdx) => (
                                <span
                                  key={bIdx}
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-bold text-amber-900"
                                >
                                  <HandHeart size={11} className="text-amber-600" />
                                  <span>
                                    {b.jenisBantuan} ({b.nominalAtauBarang}) &bull; {b.status}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBulkImport}
                    className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>
                      Simpan Semua ({importResult.totalKK} KK
                      {importResult.totalBantuan > 0 ? ` + ${importResult.totalBantuan} Bantuan` : ''})
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MANUAL ENTRY */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="overflow-y-auto p-6 space-y-4 flex-1">
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

            {/* Section 1: Data Kartu Keluarga */}
            <div className="space-y-3 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Identitas Kepala Keluarga & Alamat
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
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
                      placeholder="3302210101850001"
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Rumah
                  </label>
                  <input
                    type="text"
                    value={noRumah}
                    onChange={(e) => setNoRumah(e.target.value)}
                    placeholder="Contoh: 01"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Iuran Tahun Berjalan
                  </label>
                  <select
                    value={statusIuran}
                    onChange={(e) => setStatusIuran(e.target.value as 'Sudah' | 'Belum')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                  >
                    <option value="Belum">Belum Bayar</option>
                    <option value="Sudah">Sudah Bayar / Lunas</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Wilayah RT / RW
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-400">RT:</span>
                      <input
                        type="text"
                        value={rt}
                        onChange={(e) => setRt(e.target.value)}
                        placeholder="08"
                        className="w-full text-xs font-bold text-slate-800 outline-hidden bg-transparent"
                      />
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-400">RW:</span>
                      <input
                        type="text"
                        value={rw}
                        onChange={(e) => setRw(e.target.value)}
                        placeholder="05"
                        className="w-full text-xs font-bold text-slate-800 outline-hidden bg-transparent"
                      />
                    </div>
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
                  Alamat Lengkap Warga (Dusun / Jalan)
                </label>
                <input
                  type="text"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  placeholder="RT 08 RW 05 Desa Kotayasa, Kec. Sumbang"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kode Pos
                  </label>
                  <input
                    type="text"
                    value={kodePos}
                    onChange={(e) => setKodePos(e.target.value)}
                    placeholder="53183"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Dikeluarkan KK
                  </label>
                  <input
                    type="text"
                    value={tanggalDikeluarkan}
                    onChange={(e) => setTanggalDikeluarkan(e.target.value)}
                    placeholder="DD-MM-YYYY"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Anggota Keluarga */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    2. Susunan Anggota Keluarga ({anggotaKeluarga.length} Jiwa)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Lengkap sesuai blangko KK: Tgl Lahir, Pendidikan Terakhir, Pekerjaan, Kawin & Silsilah
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

              <datalist id="pendidikan-options">
                <option value="Tidak/Belum Sekolah" />
                <option value="Belum Tamat SD/Sederajat" />
                <option value="Tamat SD/Sederajat" />
                <option value="SLTP/Sederajat" />
                <option value="SLTA/Sederajat" />
                <option value="Diploma I/II" />
                <option value="Akademi/Diploma III/S. Muda" />
                <option value="Diploma IV/Strata I" />
                <option value="Strata II" />
                <option value="Strata III" />
              </datalist>

              <datalist id="golongan-darah-options">
                <option value="Tidak Tahu" />
                <option value="A" />
                <option value="B" />
                <option value="AB" />
                <option value="O" />
              </datalist>

              <datalist id="pekerjaan-options">
                <option value="Belum/Tidak Bekerja" />
                <option value="Mengurus Rumah Tangga" />
                <option value="Pelajar/Mahasiswa" />
                <option value="Karyawan Swasta" />
                <option value="Wiraswasta" />
                <option value="Buruh Harian Lepas" />
                <option value="Pegawai Negeri Sipil" />
                <option value="Petani/Pekebun" />
              </datalist>

              <div className="space-y-3">
                {anggotaKeluarga.map((member, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 relative shadow-xs"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-bold text-[#0B5D3F] flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B5D3F] text-white text-[10px]">
                          {idx + 1}
                        </span>
                        <span>
                          {member.nama || `Anggota #${idx + 1}`} ({member.hubungan || 'Anggota'})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAnggota(idx)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        title="Hapus anggota"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          NIK (16 Digit)*
                        </label>
                        <input
                          type="text"
                          maxLength={16}
                          value={member.nik}
                          onChange={(e) => handleUpdateAnggota(idx, 'nik', e.target.value)}
                          placeholder="16 digit NIK"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          Nama Lengkap (Sesuai KK)*
                        </label>
                        <input
                          type="text"
                          value={member.nama}
                          onChange={(e) => handleUpdateAnggota(idx, 'nama', e.target.value)}
                          placeholder={
                            idx === 0
                              ? 'Nama Kepala Keluarga'
                              : member.hubungan === 'Istri'
                              ? 'Nama Lengkap Istri Sesuai KK'
                              : `Nama Lengkap Anggota #${idx + 1}`
                          }
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
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
                        <label className="block text-[10px] text-slate-500 font-semibold">Jenis Kelamin</label>
                        <select
                          value={member.jenisKelamin}
                          onChange={(e) => handleUpdateAnggota(idx, 'jenisKelamin', e.target.value as any)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 font-medium"
                        >
                          <option value="Laki-laki">Laki-laki</option>
                          <option value="Perempuan">Perempuan</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Tempat Lahir</label>
                        <input
                          type="text"
                          value={member.tempatLahir || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'tempatLahir', e.target.value)}
                          placeholder="Banyumas"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Tanggal Lahir (DD-MM-YYYY)</label>
                        <input
                          type="text"
                          value={member.tanggalLahir || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'tanggalLahir', e.target.value)}
                          placeholder="25-12-1992"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-mono font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Agama</label>
                        <input
                          type="text"
                          value={member.agama || 'Islam'}
                          onChange={(e) => handleUpdateAnggota(idx, 'agama', e.target.value)}
                          placeholder="Islam"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Pendidikan Terakhir*</label>
                        <input
                          type="text"
                          list="pendidikan-options"
                          value={member.pendidikan || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'pendidikan', e.target.value)}
                          placeholder="Contoh: SLTA/Sederajat"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Jenis Pekerjaan*</label>
                        <input
                          type="text"
                          list="pekerjaan-options"
                          value={member.pekerjaan || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'pekerjaan', e.target.value)}
                          placeholder="Contoh: Wiraswasta"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Golongan Darah</label>
                        <input
                          type="text"
                          list="golongan-darah-options"
                          value={member.golonganDarah || 'Tidak Tahu'}
                          onChange={(e) => handleUpdateAnggota(idx, 'golonganDarah', e.target.value)}
                          placeholder="Tidak Tahu"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-slate-200/60">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Status Perkawinan</label>
                        <input
                          type="text"
                          value={member.statusPerkawinan || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'statusPerkawinan', e.target.value)}
                          placeholder="Kawin Tercatat / Belum Kawin"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Tanggal Perkawinan</label>
                        <input
                          type="text"
                          value={member.tanggalPerkawinan || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'tanggalPerkawinan', e.target.value)}
                          placeholder="DD-MM-YYYY atau -"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Nama Ayah Kandung</label>
                        <input
                          type="text"
                          value={member.namaAyah || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'namaAyah', e.target.value)}
                          placeholder="Nama Ayah"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold">Nama Ibu Kandung</label>
                        <input
                          type="text"
                          value={member.namaIbu || ''}
                          onChange={(e) => handleUpdateAnggota(idx, 'namaIbu', e.target.value)}
                          placeholder="Nama Ibu"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 font-medium"
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
        )}
      </div>
    </div>
  );
};
