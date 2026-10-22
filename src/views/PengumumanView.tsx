import React, { useState } from 'react';
import {
  ArrowLeft,
  Megaphone,
  Plus,
  Share2,
  Download,
  Copy,
  Check,
  Search,
  Trash2,
  AlertCircle,
  FileText,
  Printer,
} from 'lucide-react';
import { PengumumanRT } from '../types';
import { kirimWhatsAppPengumuman, salinTeksPengumuman } from '../utils/whatsappShare';
import { exportSuratPengumumanPDF } from '../utils/pdfExport';

interface PengumumanViewProps {
  pengumumanList: PengumumanRT[];
  isAdmin: boolean;
  onOpenCreateModal: () => void;
  onDeletePengumuman: (id: string) => void;
  onBack: () => void;
}

export const PengumumanView: React.FC<PengumumanViewProps> = ({
  pengumumanList,
  isAdmin,
  onOpenCreateModal,
  onDeletePengumuman,
  onBack,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('Semua');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (p: PengumumanRT) => {
    const ok = await salinTeksPengumuman(p);
    if (ok) {
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const filtered = pengumumanList.filter((p) => {
    if (filterCategory !== 'Semua' && p.kategori !== filterCategory) return false;
    if (
      search &&
      !p.judul.toLowerCase().includes(search.toLowerCase()) &&
      !p.isi.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              Pengumuman & Warta Warga
            </h1>
            <p className="text-xs text-slate-500">
              Pemberitahuan resmi RT 08 RW 05 Desa Kotayasa dengan integrasi WhatsApp & PDF
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>+ Buat Pengumuman Baru</span>
          </button>
        )}
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['Semua', 'Kegiatan', 'Iuran', 'Keamanan', 'Sosial', 'Umum'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                filterCategory === cat
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kata kunci pengumuman..."
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Announcements List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="md:col-span-2 flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl bg-white border border-slate-200">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-[#0B5D3F]">
              <Megaphone size={30} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Belum ada pengumuman</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Tidak ada pengumuman untuk kategori ini. Pengumuman baru yang dibuat oleh Admin RT akan otomatis muncul di sini.
            </p>
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`rounded-3xl p-6 border shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md bg-white ${
                p.penting ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        p.kategori === 'Kegiatan'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.kategori === 'Iuran'
                          ? 'bg-blue-100 text-blue-800'
                          : p.kategori === 'Keamanan'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {p.kategori}
                    </span>
                    {p.penting && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        ★ Penting
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">{p.tanggal}</span>
                </div>

                <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                  {p.judul}
                </h3>
                <p className="mt-2.5 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {p.isi}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                  <span>Diterbitkan oleh: <strong>{p.penulis}</strong></span>
                </div>
              </div>

              {/* Action Buttons: Kirim WA, Download Surat PDF, Salin Teks */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Tombol Kirim WhatsApp */}
                  <button
                    onClick={() => kirimWhatsAppPengumuman(p)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer"
                    title="Bagikan format pesan resmi ke grup WhatsApp Warga"
                  >
                    <Share2 size={13} />
                    <span>Kirim WA</span>
                  </button>

                  {/* Tombol Download PDF Surat Pengumuman */}
                  <button
                    onClick={() => exportSuratPengumumanPDF(p)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all cursor-pointer"
                    title="Unduh PDF Surat Edaran Resmi RT 08 RW 05"
                  >
                    <Download size={13} />
                    <span>Surat PDF</span>
                  </button>

                  {/* Salin Teks Format WA */}
                  <button
                    onClick={() => handleCopy(p)}
                    className="flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    title="Salin teks pengumuman ke clipboard"
                  >
                    {copiedId === p.id ? (
                      <>
                        <Check size={13} className="text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Salin Teks</span>
                      </>
                    )}
                  </button>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => onDeletePengumuman(p.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Hapus pengumuman ini"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
