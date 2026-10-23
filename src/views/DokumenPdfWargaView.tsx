import React, { useState } from 'react';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Search,
  ShieldAlert,
  ArrowLeft,
  X,
  FileCheck,
  Calendar,
  Lock,
  Eye,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { DokumenPdfWarga } from '../types';

interface DokumenPdfWargaViewProps {
  dokumenList: DokumenPdfWarga[];
  onUploadDokumen: (doc: Omit<DokumenPdfWarga, 'id'>) => void;
  onDeleteDokumen: (id: string) => void;
  onBack: () => void;
}

export const DokumenPdfWargaView: React.FC<DokumenPdfWargaViewProps> = ({
  dokumenList,
  onUploadDokumen,
  onDeleteDokumen,
  onBack,
}) => {
  const [search, setSearch] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [judul, setJudul] = useState('');
  const [kategori, setKategori] = useState('Data Sensus Warga RT');
  const [keterangan, setKeterangan] = useState('Arsip resmi Dukcapil / Kelurahan');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DokumenPdfWarga | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setFileError('Format file harus berupa PDF (.pdf)');
        return;
      }
      setSelectedFile(file);
      if (!judul) {
        setJudul(file.name.replace(/\.pdf$/i, ''));
      }
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileError('Silakan pilih berkas PDF yang ingin diunggah');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      onUploadDokumen({
        judul: judul || selectedFile.name,
        namaFile: selectedFile.name,
        ukuranKb: Math.round(selectedFile.size / 1024),
        tanggalUpload: new Date().toISOString().split('T')[0],
        kategori,
        keterangan,
        dataBase64: base64Data,
      });

      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setJudul('');
      setKeterangan('');
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDownload = (doc: DokumenPdfWarga) => {
    if (doc.dataBase64) {
      const link = document.createElement('a');
      link.href = doc.dataBase64;
      link.download = doc.namaFile;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Create a fallback downloadable PDF file for demonstration
      const blob = new Blob([`%PDF-1.4\n1 0 obj << /Title (${doc.judul}) >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.namaFile;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const filtered = dokumenList.filter(
    (d) =>
      d.judul.toLowerCase().includes(search.toLowerCase()) ||
      d.namaFile.toLowerCase().includes(search.toLowerCase()) ||
      d.kategori.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">Arsip PDF Data Warga</h1>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200 flex items-center gap-1">
                <Lock size={12} />
                <span>Khusus Admin (Terkunci)</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Penyimpanan berkas digital sensus, rekap NIK/KK, dan dokumen resmi RT 08 RW 05 Desa Kotayasa
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-2 rounded-2xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Upload size={16} />
          <span>+ Unggah Dokumen PDF</span>
        </button>
      </div>

      {/* Security Banner */}
      <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200/80 flex items-start gap-3">
        <ShieldAlert size={20} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-bold">Keamanan & Perlindungan Privasi Data Seluruh Warga:</p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            Dokumen yang diunggah ke menu ini hanya dapat dilihat dan diunduh oleh Pengurus RT (Admin). Akun Warga sama sekali tidak memiliki akses ke direktori ini untuk melindungi kerahasiaan NIK dan No KK bersama.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul dokumen / nama file PDF..."
          className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0B5D3F] focus:outline-hidden"
        />
      </div>

      {/* Document List Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-3xl bg-white p-12 text-center border border-slate-200">
            <FileText size={40} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-700">Belum Ada Dokumen PDF Diunggah</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Admin dapat mengunggah file rekap PDF data seluruh warga untuk disimpan dengan aman di sistem.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
            >
              <Upload size={14} />
              <span>Unggah File PDF Sekarang</span>
            </button>
          </div>
        ) : (
          filtered.map((doc) => (
            <div
              key={doc.id}
              className="group flex flex-col justify-between rounded-3xl bg-white p-5 border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
                    <FileText size={22} />
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {doc.ukuranKb} KB
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B5D3F] transition-colors line-clamp-1">
                  {doc.judul}
                </h3>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                  {doc.namaFile}
                </p>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-[#0B5D3F]">
                    {doc.kategori}
                  </span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="text-[11px]">{doc.tanggalUpload}</span>
                </div>

                {doc.keterangan && (
                  <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 italic">
                    &ldquo;{doc.keterangan}&rdquo;
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] py-2 text-xs font-bold text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                  title="Unduh file PDF"
                >
                  <Download size={14} />
                  <span>Unduh PDF</span>
                </button>

                <button
                  onClick={() => onDeleteDokumen(doc.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors cursor-pointer"
                  title="Hapus file"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0B5D3F]">Unggah File PDF Data Warga</h3>
                  <p className="text-xs text-slate-500">Khusus Pengurus RT &bull; Tersimpan Aman</p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {fileError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih File PDF (.pdf)
                </label>
                <div className="relative border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-2xl p-5 text-center bg-slate-50 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <FileText size={32} className="mx-auto text-rose-500 mb-2" />
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-slate-800">{selectedFile.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Ukuran: {Math.round(selectedFile.size / 1024)} KB &bull; Siap diunggah
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-700">Klik untuk memilih file PDF</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Format PDF resmi sensus / ekspor data kelurahan
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Dokumen
                </label>
                <input
                  type="text"
                  required
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  placeholder="Contoh: Rekap Data Sensus RT 08 RW 05 Tahun 2026"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kategori Dokumen
                </label>
                <select
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                >
                  <option value="Data Sensus Warga RT">Data Sensus Warga RT</option>
                  <option value="Rekap Dukcapil & KK">Rekap Dukcapil & KK</option>
                  <option value="Laporan Kas Tahunan">Laporan Kas Tahunan</option>
                  <option value="Daftar Bansos Desa">Daftar Bansos Desa</option>
                  <option value="Dokumen Peraturan RT">Dokumen Peraturan RT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan / Catatan Arsip
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Catatan sumber arsip atau nomor surat pengesahan"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
                >
                  Simpan ke Arsip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
