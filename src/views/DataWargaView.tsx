import React, { useState } from 'react';
import {
  ArrowLeft,
  Users,
  User,
  Plus,
  Search,
  Trash2,
  Phone,
  Home,
  Check,
  UserCheck,
  Camera,
  Download,
  Eye,
  FileText,
  Shield,
  HeartHandshake,
  Calendar,
  X,
  CreditCard,
  Building,
} from 'lucide-react';
import { Warga, BantuanPemerintah } from '../types';
import { exportDataWargaPerKK_PDF, exportSingleKK_PDF } from '../utils/pdfExport';

interface DataWargaViewProps {
  wargaList: Warga[];
  bantuanList?: BantuanPemerintah[];
  onOpenWargaModal: () => void;
  onDeleteWarga: (id: string) => void;
  onBack: () => void;
}

export const DataWargaView: React.FC<DataWargaViewProps> = ({
  wargaList,
  bantuanList = [],
  onOpenWargaModal,
  onDeleteWarga,
  onBack,
}) => {
  const [filterGender, setFilterGender] = useState<'semua' | 'Laki-laki' | 'Perempuan'>('semua');
  const [search, setSearch] = useState('');
  const [selectedWarga, setSelectedWarga] = useState<Warga | null>(null);

  const totalKK = wargaList.length;
  const totalJiwa = wargaList.reduce((acc, w) => acc + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1), 0);

  const filtered = wargaList.filter((w) => {
    if (filterGender !== 'semua' && w.jenisKelamin !== filterGender) return false;
    if (
      search &&
      !w.nama.toLowerCase().includes(search.toLowerCase()) &&
      !w.noRumah.toLowerCase().includes(search.toLowerCase()) &&
      !(w.noKK && w.noKK.includes(search)) &&
      !(w.anggotaKeluarga && w.anggotaKeluarga.some(m => m.nama.toLowerCase().includes(search.toLowerCase()) || (m.nik && m.nik.includes(search))))
    ) {
      return false;
    }
    return true;
  });

  // Aid data for currently selected resident
  const selectedWargaBansos = selectedWarga
    ? bantuanList.filter(
        (b) =>
          (b.noKK && b.noKK === selectedWarga.noKK) ||
          b.namaPenerima.toLowerCase() === selectedWarga.nama.toLowerCase()
      )
    : [];

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
            <h1 className="text-xl font-extrabold text-slate-900">Data Warga & Rekapitulasi KK</h1>
            <p className="text-xs text-slate-500">
              Daftar Kartu Keluarga, Anggota Keluarga & Alokasi Bantuan Sosial RT 08 RW 05 Desa Kotayasa
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Download PDF Data Warga Per-KK */}
          <button
            onClick={() => exportDataWargaPerKK_PDF(wargaList, bantuanList)}
            className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            title="Download Dokumen PDF Data Seluruh Warga Per KK beserta Bantuan Sosial"
          >
            <Download size={15} />
            <span>Download PDF Per-KK (+ Bansos)</span>
          </button>

          {/* Tambah Warga / Foto KK */}
          <button
            onClick={onOpenWargaModal}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Camera size={15} className="text-[#0B5D3F]" />
            <span>+ Foto / Tambah KK</span>
          </button>
        </div>
      </div>

      {/* Metrics Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
            <Users size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Kepala Keluarga</span>
            <p className="text-2xl font-extrabold text-slate-900">{totalKK} KK</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
            <User size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Total Jumlah Jiwa</span>
            <p className="text-2xl font-extrabold text-slate-900">{totalJiwa} Jiwa</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <HeartHandshake size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400">Alokasi Bantuan Pemerintah</span>
            <p className="text-xl font-extrabold text-amber-900">{bantuanList.length} Penerima Bansos</p>
          </div>
        </div>
      </div>

      {/* Filter & Search "Cari Nama Warga" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {[
            { id: 'semua', label: 'Semua Warga' },
            { id: 'Laki-laki', label: 'Laki-laki' },
            { id: 'Perempuan', label: 'Perempuan' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterGender(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                filterGender === tab.id
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* FUNGSI CARI NAMA WARGA UNTUK ADMIN */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama warga, NIK, No KK, anggota..."
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#0B5D3F] focus:ring-2 focus:ring-[#0B5D3F]/10 outline-hidden"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Table / Empty State */}
      <div className="rounded-3xl bg-white shadow-xs border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Users size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {search ? `Tidak ada warga dengan kata kunci "${search}"` : 'Belum ada data warga'}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
              {search
                ? 'Coba periksa ejaan nama kepala keluarga atau nomor KK yang dicari.'
                : 'Database kependudukan RT 08 RW 05 saat ini masih kosong (0 KK). Anda dapat menambahkan warga baru atau foto KK.'}
            </p>
            <button
              onClick={onOpenWargaModal}
              className="mt-4 rounded-xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            >
              + Tambah Warga Baru
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3.5 px-4 text-center">No</th>
                  <th className="py-3.5 px-4">Nama Kepala Keluarga</th>
                  <th className="py-3.5 px-4">No. Kartu Keluarga (KK)</th>
                  <th className="py-3.5 px-4">Alamat & Rumah</th>
                  <th className="py-3.5 px-4 text-center">Anggota</th>
                  <th className="py-3.5 px-4">Bantuan Pemerintah</th>
                  <th className="py-3.5 px-4">Status Iuran</th>
                  <th className="py-3.5 px-4 text-right">Aksi & Periksa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((w, index) => {
                  const bansosCount = bantuanList.filter(
                    (b) =>
                      (b.noKK && b.noKK === w.noKK) ||
                      b.namaPenerima.toLowerCase() === w.nama.toLowerCase()
                  ).length;

                  return (
                    <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-slate-400 font-medium text-center">{index + 1}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{w.nama}</div>
                        <div className="text-[10px] text-slate-400">Username: {w.nama}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {w.noKK || '330214050800000' + (index + 1)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-700 font-semibold">Rumah {w.noRumah}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {w.alamat || 'RT 08 / RW 05'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {w.anggotaKeluarga?.length || w.jumlahJiwa || 1} Jiwa
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {bansosCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            ★ {bansosCount} Bantuan
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Tidak ada bansos</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            w.statusIuran === 'Sudah'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-orange-50 text-orange-600 border border-orange-200'
                          }`}
                        >
                          {w.statusIuran === 'Sudah' ? 'Lunas' : 'Belum'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Tombol Periksa / Lihat Detail KK */}
                          <button
                            onClick={() => setSelectedWarga(w)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-[#0B5D3F] transition-colors cursor-pointer"
                            title="Periksa Data Lengkap KK & Bantuan Pemerintah"
                          >
                            <Eye size={13} />
                            <span>Detail KK</span>
                          </button>

                          <button
                            onClick={() => onDeleteWarga(w.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus data warga"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETAIL KARTU KELUARGA & BANTUAN PEMERINTAH (UNTUK ADMIN) */}
      {selectedWarga && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0B5D3F]">
                    Detail Kartu Keluarga & Riwayat Bantuan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Data Kependudukan Resmi RT 08 RW 05 Desa Kotayasa
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWarga(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="overflow-y-auto p-6 space-y-5 no-scrollbar">
              {/* KK Header Card */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/90 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Kepala Keluarga
                    </span>
                    <h2 className="text-base font-black text-slate-900">{selectedWarga.nama}</h2>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Nomor Kartu Keluarga (KK)
                    </span>
                    <p className="font-mono text-sm font-extrabold text-[#0B5D3F]">
                      {selectedWarga.noKK || '3302140508000000'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Nomor Rumah</span>
                    <strong className="text-slate-800">Rumah {selectedWarga.noRumah}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Wilayah RT/RW</span>
                    <strong className="text-slate-800">RT {selectedWarga.rt || '08'} / RW {selectedWarga.rw || '05'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Jumlah Jiwa</span>
                    <strong className="text-slate-800">{selectedWarga.anggotaKeluarga?.length || selectedWarga.jumlahJiwa || 1} Orang</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Status Iuran Kas</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedWarga.statusIuran === 'Sudah'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {selectedWarga.statusIuran === 'Sudah' ? 'LUNAS' : 'BELUM BAYAR'}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 pt-1 border-t border-slate-200">
                  <span className="text-slate-400 block text-[10px]">Alamat Lengkap</span>
                  <p>{selectedWarga.alamat || 'RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas'}</p>
                </div>
              </div>

              {/* Anggota Keluarga Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Users size={14} className="text-[#0B5D3F]" />
                  <span>Daftar Anggota Keluarga Terdaftar (Sesuai Kartu Keluarga):</span>
                </h4>

                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 text-center">No</th>
                        <th className="p-2.5">Nama Lengkap</th>
                        <th className="p-2.5">NIK (16 Digit)</th>
                        <th className="p-2.5">Hubungan</th>
                        <th className="p-2.5">Tempat / Tgl Lahir</th>
                        <th className="p-2.5">Pekerjaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedWarga.anggotaKeluarga && selectedWarga.anggotaKeluarga.length > 0
                        ? selectedWarga.anggotaKeluarga
                        : [
                            {
                              nik: selectedWarga.nik || '3302140000000001',
                              nama: selectedWarga.nama,
                              hubungan: 'Kepala Keluarga',
                              tempatLahir: 'Banyumas',
                              tanggalLahir: '—',
                              pekerjaan: 'Wiraswasta',
                            },
                          ]
                      ).map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800">{m.nama}</td>
                          <td className="p-2.5 font-mono text-emerald-800 font-semibold">{m.nik || '—'}</td>
                          <td className="p-2.5 text-slate-600">{m.hubungan}</td>
                          <td className="p-2.5 text-slate-500">{m.tempatLahir} {m.tanggalLahir}</td>
                          <td className="p-2.5 text-slate-600">{m.pekerjaan || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bantuan Pemerintah Section for this KK */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <HeartHandshake size={14} className="text-amber-700" />
                  <span>Catatan Bantuan Pemerintah (Khusus Akses Pengurus RT):</span>
                </h4>

                {selectedWargaBansos.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-amber-100/70 text-amber-900 font-bold border-b border-amber-200">
                        <tr>
                          <th className="p-2.5 text-center">No</th>
                          <th className="p-2.5">Jenis Bantuan</th>
                          <th className="p-2.5">Nama Penerima</th>
                          <th className="p-2.5">Nominal / Wujud</th>
                          <th className="p-2.5">Tanggal Salur</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {selectedWargaBansos.map((b, bIdx) => (
                          <tr key={bIdx} className="hover:bg-amber-50">
                            <td className="p-2.5 text-center text-amber-700 font-bold">{bIdx + 1}</td>
                            <td className="p-2.5 font-extrabold text-amber-950">{b.jenisBantuan}</td>
                            <td className="p-2.5 text-slate-800">{b.namaPenerima}</td>
                            <td className="p-2.5 font-semibold text-slate-700">{b.nominalAtauBarang}</td>
                            <td className="p-2.5 text-slate-600">{b.tanggal}</td>
                            <td className="p-2.5">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-500 text-center">
                    Keluarga ini belum tercatat menerima bantuan sosial pemerintah (BPNT, PKH, Sembako, BLT).
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedWarga(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Tutup
              </button>

              <button
                onClick={() => exportSingleKK_PDF(selectedWarga, bantuanList)}
                className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] hover:bg-[#084831] px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                <Download size={13} />
                <span>Download PDF KK Ini</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

