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

  const [selectedSurat, setSelectedSurat] = useState<PengumumanRT | null>(null);

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
              Pemberitahuan resmi RT 08 RW 05 Desa Kotayasa dengan Kop Surat Resmi, WhatsApp & PDF
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              className={`rounded-3xl p-5 sm:p-6 border shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-md bg-white ${
                p.penting ? 'border-amber-300 ring-2 ring-amber-200/60' : 'border-slate-200'
              }`}
            >
              <div>
                {/* KOP SURAT RESMI RT PADA KARTU PENGUMUMAN */}
                <div className="bg-slate-50/80 rounded-2xl p-3 mb-4 border border-slate-200/80 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                    PEMERINTAH KABUPATEN BANYUMAS &bull; KECAMATAN SUMBANG
                  </p>
                  <p className="text-[11px] font-extrabold uppercase text-[#0B5D3F] mt-0.5">
                    RUKUN TETANGGA 08 RUKUN WARGA 05 DESA KOTAYASA
                  </p>
                  <p className="text-[8px] text-slate-400 mt-0.5">
                    Sekretariat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183
                  </p>
                  <div className="h-[1.5px] bg-[#0B5D3F] mt-2 w-full" />
                  <div className="h-[0.5px] bg-[#0B5D3F] mt-[1.5px] w-full" />
                </div>

                <div className="flex items-center justify-between gap-2 mb-2">
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
                        ★ Surat Resmi Penting
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-semibold">{p.tanggal}</span>
                </div>

                <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                  {p.judul}
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line line-clamp-4">
                  {p.isi}
                </p>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Diterbitkan oleh: <strong>{p.penulis}</strong></span>
                  {p.tanggalBerakhir && (
                    <span className="text-[10px] text-rose-600 font-semibold">
                      Berlaku s/d: {p.tanggalBerakhir}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Lihat Format Surat, Kirim WA, Download Surat PDF */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Tombol Lihat Kop Surat Resmi Lengkap */}
                  <button
                    onClick={() => setSelectedSurat(p)}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                    title="Buka Pratinjau Surat Resmi dengan Kop RT"
                  >
                    <FileText size={13} className="text-[#0B5D3F]" />
                    <span>Lihat Kop Surat</span>
                  </button>

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
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    title="Salin teks pengumuman ke clipboard"
                  >
                    {copiedId === p.id ? (
                      <Check size={14} className="text-emerald-600" />
                    ) : (
                      <Copy size={14} />
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

      {/* MODAL PRATINJAU SURAT RESMI DENGAN KOP SURAT RT 08 RW 05 */}
      {selectedSurat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-3.5 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#0B5D3F]" />
                <h3 className="text-xs sm:text-sm font-extrabold text-[#0B5D3F]">
                  Format Surat Edaran Resmi RT 08 RW 05
                </h3>
              </div>
              <button
                onClick={() => setSelectedSurat(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Letter Body replicating Official Document */}
            <div className="overflow-y-auto p-6 sm:p-8 space-y-4 no-scrollbar font-sans text-slate-800 bg-white">
              {/* KOP RESMI DOKUMEN */}
              <div className="text-center pb-3">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
                  PEMERINTAH KABUPATEN BANYUMAS
                </p>
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
                  KECAMATAN SUMBANG &bull; DESA KOTAYASA
                </p>
                <h2 className="text-sm sm:text-base font-black uppercase text-[#0B5D3F] mt-1">
                  PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05
                </h2>
                <p className="text-[10px] text-slate-500 mt-1">
                  Sekretariat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183 | Layanan Warga: 0812-3456-7890
                </p>
                {/* Double Border Line Kop */}
                <div className="h-[2px] bg-[#0B5D3F] mt-3 w-full" />
                <div className="h-[0.5px] bg-[#0B5D3F] mt-[2px] w-full" />
              </div>

              {/* Metadata Surat */}
              <div className="flex flex-col sm:flex-row justify-between text-xs text-slate-700 gap-2 pt-2">
                <div className="space-y-0.5">
                  <p>Nomor&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: 01/EDR/RT08-RW05/X/2026</p>
                  <p>Lampiran : -</p>
                  <p>Perihal&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong className="text-slate-900">PENGUMUMAN - {selectedSurat.judul.toUpperCase()}</strong></p>
                </div>
                <div className="text-left sm:text-right">
                  <p>Kotayasa, {selectedSurat.tanggal}</p>
                </div>
              </div>

              {/* Kepada Yth */}
              <div className="text-xs text-slate-700 pt-2 space-y-0.5">
                <p>Kepada Yth.</p>
                <p className="font-bold text-slate-900">Bapak/Ibu/Sdr Seluruh Warga RT 08 RW 05</p>
                <p>Desa Kotayasa, Kec. Sumbang</p>
                <p>di Tempat</p>
              </div>

              {/* Salam & Isi */}
              <div className="text-xs leading-relaxed space-y-3 pt-2 text-slate-700">
                <p className="italic">Assalamu’alaikum Warahmatullahi Wabarakatuh,</p>
                <p>
                  Sehubungan dengan agenda kemaslahatan dan ketertiban lingkungan di wilayah RT 08 RW 05 Desa Kotayasa, melalui surat edaran resmi ini Pengurus RT memberitahukan kepada seluruh warga perihal kegiatan sebagai berikut:
                </p>

                {/* Kotak Pengumuman */}
                <div className="rounded-2xl bg-[#E8F5EE]/60 border border-emerald-300 p-4 space-y-1.5">
                  <p className="font-bold text-sm text-[#0B5D3F]">{selectedSurat.judul}</p>
                  <p className="text-xs text-slate-700 whitespace-pre-line">{selectedSurat.isi}</p>
                </div>

                <p>
                  Demikian surat pengumuman resmi ini kami sampaikan. Atas perhatian, kesadaran, dan kerja sama yang baik dari seluruh warga RT 08 RW 05 Desa Kotayasa, kami ucapkan terima kasih yang sebesar-besarnya.
                </p>
                <p className="italic">Wassalamu’alaikum Warahmatullahi Wabarakatuh.</p>
              </div>

              {/* Tanda Tangan & Stempel */}
              <div className="pt-4 flex justify-end">
                <div className="text-center w-56 relative">
                  <p className="text-xs text-slate-700">Pengurus RT 08 RW 05 Desa Kotayasa</p>
                  <p className="text-xs font-bold text-slate-900">Ketua RT 08,</p>

                  {/* Stempel Visual Digital */}
                  <div className="my-2 flex justify-center">
                    <div className="h-16 w-16 rounded-full border-2 border-dashed border-[#0B5D3F] flex flex-col items-center justify-center p-1 text-[#0B5D3F] rotate-[-8deg] opacity-85">
                      <span className="text-[7px] font-black uppercase">RT 08 RW 05</span>
                      <span className="text-[6px] font-bold">★ KOTAYASA ★</span>
                      <span className="text-[6px] font-semibold">BANYUMAS</span>
                    </div>
                  </div>

                  <p className="text-xs font-bold underline text-slate-900">Bapak Suwardi</p>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSurat(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Tutup
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => kirimWhatsAppPengumuman(selectedSurat)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer"
                >
                  <Share2 size={13} />
                  <span>Kirim ke WA Warga</span>
                </button>
                <button
                  onClick={() => exportSuratPengumumanPDF(selectedSurat)}
                  className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download Surat PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

