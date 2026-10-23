import React, { useState } from 'react';
import {
  HandHeart,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  X,
  FileSpreadsheet,
  Download,
  Building2,
  ShieldCheck,
  Eye,
  Trash2,
} from 'lucide-react';
import { BantuanPemerintah, Warga } from '../types';

interface BantuanPemerintahViewProps {
  bantuanList: BantuanPemerintah[];
  wargaList: Warga[];
  onAddBantuan: (data: Omit<BantuanPemerintah, 'id'>) => void;
  onUpdateStatus: (id: string, newStatus: BantuanPemerintah['status']) => void;
  onDeleteBantuan: (id: string) => void;
  onBack: () => void;
}

export const BantuanPemerintahView: React.FC<BantuanPemerintahViewProps> = ({
  bantuanList,
  wargaList,
  onAddBantuan,
  onUpdateStatus,
  onDeleteBantuan,
  onBack,
}) => {
  const [search, setSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState<string>('semua');
  const [filterStatus, setFilterStatus] = useState<string>('semua');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [jenisBantuan, setJenisBantuan] = useState<BantuanPemerintah['jenisBantuan']>('BPNT');
  const [namaPenerima, setNamaPenerima] = useState('');
  const [noKK, setNoKK] = useState('');
  const [nik, setNik] = useState('');
  const [nominalAtauBarang, setNominalAtauBarang] = useState('Rp 600.000 / Triwulan');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<BantuanPemerintah['status']>('Sudah Disalurkan');
  const [sumberDana, setSumberDana] = useState('Kemensos RI & Pemerintah Desa');
  const [keterangan, setKeterangan] = useState('Penyaluran resmi melalui Kantor Pos / Balai Desa Kotayasa');

  // When resident name is chosen from registered list
  const handleSelectWarga = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setNamaPenerima(val);
    const found = wargaList.find((w) => w.nama === val);
    if (found) {
      setNoKK(found.noKK || '');
      if (found.anggotaKeluarga && found.anggotaKeluarga.length > 0) {
        setNik(found.anggotaKeluarga[0].nik || '');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPenerima) return;

    onAddBantuan({
      jenisBantuan,
      namaPenerima,
      noKK: noKK || '3302140805120001',
      nik,
      nominalAtauBarang,
      tanggal,
      status,
      sumberDana,
      keterangan,
    });

    setIsModalOpen(false);
    // Reset form
    setNamaPenerima('');
    setNoKK('');
    setNik('');
  };

  // Filtered List
  const filtered = bantuanList.filter((b) => {
    const matchSearch =
      b.namaPenerima.toLowerCase().includes(search.toLowerCase()) ||
      b.noKK.includes(search) ||
      b.jenisBantuan.toLowerCase().includes(search.toLowerCase());

    const matchJenis = filterJenis === 'semua' || b.jenisBantuan === filterJenis;
    const matchStatus = filterStatus === 'semua' || b.status === filterStatus;

    return matchSearch && matchJenis && matchStatus;
  });

  // Summary Metrics
  const totalPenerima = bantuanList.length;
  const sudahDisalurkanCount = bantuanList.filter((b) => b.status === 'Sudah Disalurkan').length;
  const usulanCount = bantuanList.filter((b) => b.status === 'Baru Diusulkan' || b.status === 'Proses Verifikasi').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
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
              <h1 className="text-xl font-extrabold text-slate-900">Data Bantuan Pemerintah</h1>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200 flex items-center gap-1">
                <ShieldCheck size={12} />
                <span>Khusus Admin (Rahasia)</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Pencatatan BPNT, PKH, Bansos, Sembako, dan BLT Desa untuk warga RT 08 RW 05 Desa Kotayasa
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-2xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>+ Input Data Bantuan</span>
        </button>
      </div>

      {/* Privacy Notice Banner */}
      <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200/80 flex items-start gap-3">
        <ShieldCheck size={20} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-bold">Keamanan & Kerahasiaan Data Sosial:</p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            Sesuai instruksi dan UU PDP, modul <strong>Bantuan Pemerintah</strong> ini 100% tersembunyi dari akun Warga untuk mencegah kecemburuan sosial dan menjaga privasi data penerima manfaat.
          </p>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500">Total Bantuan Terdata</span>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalPenerima} Alokasi</p>
          <span className="text-[11px] font-semibold text-emerald-700 mt-1 block">
            RT 08 RW 05 Desa Kotayasa
          </span>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500">Sudah Disalurkan</span>
          <p className="mt-2 text-2xl font-extrabold text-[#0B5D3F]">{sudahDisalurkanCount} Penerima</p>
          <span className="text-[11px] font-semibold text-slate-500 mt-1 block">
            Penyaluran tuntas & terverifikasi
          </span>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500">Dalam Pengusulan / Verifikasi</span>
          <p className="mt-2 text-2xl font-extrabold text-amber-600">{usulanCount} Usulan Baru</p>
          <span className="text-[11px] font-semibold text-slate-500 mt-1 block">
            Menunggu pencairan dari Dinsos/Desa
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama penerima / jenis bantuan / No KK..."
            className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0B5D3F] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Filter Jenis */}
          <select
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
          >
            <option value="semua">Semua Jenis Bantuan</option>
            <option value="BPNT">BPNT (Non Tunai)</option>
            <option value="PKH">PKH (Keluarga Harapan)</option>
            <option value="Bansos Tunai / BLT Desa">BLT Desa / Tunai</option>
            <option value="Sembako Beras">Sembako Beras</option>
            <option value="Bantuan Lansia">Bantuan Lansia</option>
            <option value="KIP / PIP">KIP / PIP Pendidikan</option>
          </select>

          {/* Filter Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
          >
            <option value="semua">Semua Status</option>
            <option value="Sudah Disalurkan">Sudah Disalurkan</option>
            <option value="Baru Diusulkan">Baru Diusulkan</option>
            <option value="Proses Verifikasi">Proses Verifikasi</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Table of Bantuan */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#E8F5EE]/60 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Penerima Manfaat</th>
                <th className="px-4 py-3.5">Jenis Bantuan</th>
                <th className="px-4 py-3.5">Nominal / Barang</th>
                <th className="px-4 py-3.5">Tanggal</th>
                <th className="px-4 py-3.5">Sumber Dana</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <HandHeart size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold">Belum ada data bantuan pemerintah</p>
                    <p className="text-[11px] mt-0.5">Klik tombol "+ Input Data Bantuan" untuk mencatat penerima bantuan.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900">{item.namaPenerima}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        No KK: {item.noKK}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#0B5D3F] border border-emerald-200">
                        {item.jenisBantuan}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-800">
                      {item.nominalAtauBarang}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {item.tanggal}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      {item.sumberDana || 'Pemerintah Desa Kotayasa'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <select
                        value={item.status}
                        onChange={(e) => onUpdateStatus(item.id, e.target.value as any)}
                        className={`rounded-xl px-2.5 py-1 text-[11px] font-bold border outline-hidden cursor-pointer ${
                          item.status === 'Sudah Disalurkan'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : item.status === 'Baru Diusulkan'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : item.status === 'Proses Verifikasi'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <option value="Sudah Disalurkan">Sudah Disalurkan</option>
                        <option value="Baru Diusulkan">Baru Diusulkan</option>
                        <option value="Proses Verifikasi">Proses Verifikasi</option>
                        <option value="Ditolak">Ditolak</option>
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => onDeleteBantuan(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Hapus data bantuan"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Input Bantuan Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-900/10 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <HandHeart size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0B5D3F]">Input Data Bantuan Pemerintah</h3>
                  <p className="text-xs text-slate-500">Khusus Pengurus RT &bull; Rahasia</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Nama Warga / Kepala Keluarga
                </label>
                <select
                  value={namaPenerima}
                  onChange={handleSelectWarga}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                >
                  <option value="">-- Pilih dari Daftar Warga RT 08 --</option>
                  {wargaList.map((w) => (
                    <option key={w.id} value={w.nama}>
                      {w.nama} (No Rumah: {w.noRumah}, KK: {w.noKK})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Atau ketik langsung jika belum terdaftar di bawah.
                </p>
              </div>

              {!namaPenerima && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Penerima Manual
                  </label>
                  <input
                    type="text"
                    value={namaPenerima}
                    onChange={(e) => setNamaPenerima(e.target.value)}
                    placeholder="Nama lengkap warga penerima"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Kartu Keluarga (No KK)
                  </label>
                  <input
                    type="text"
                    value={noKK}
                    onChange={(e) => setNoKK(e.target.value)}
                    placeholder="16 digit No KK"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    NIK Penerima
                  </label>
                  <input
                    type="text"
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    placeholder="16 digit NIK"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenis Program Bantuan
                  </label>
                  <select
                    value={jenisBantuan}
                    onChange={(e) => setJenisBantuan(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#0B5D3F] focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                  >
                    <option value="BPNT">BPNT (Bantuan Pangan Non Tunai)</option>
                    <option value="PKH">PKH (Program Keluarga Harapan)</option>
                    <option value="Bansos Tunai / BLT Desa">BLT Desa / Tunai</option>
                    <option value="Sembako Beras">Sembako Beras & Pangan</option>
                    <option value="Bantuan Lansia">Bantuan Lansia Disabilitas</option>
                    <option value="KIP / PIP">KIP / PIP Siswa</option>
                    <option value="Lainnya">Bantuan Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Penyaluran
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                  >
                    <option value="Sudah Disalurkan">Sudah Disalurkan</option>
                    <option value="Baru Diusulkan">Baru Diusulkan</option>
                    <option value="Proses Verifikasi">Proses Verifikasi</option>
                    <option value="Ditolak">Ditolak</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nominal atau Bentuk Barang
                  </label>
                  <input
                    type="text"
                    required
                    value={nominalAtauBarang}
                    onChange={(e) => setNominalAtauBarang(e.target.value)}
                    placeholder="Contoh: Rp 600.000 atau Beras 10 Kg"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Penyaluran / Usulan
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sumber Dana / Instansi
                </label>
                <input
                  type="text"
                  value={sumberDana}
                  onChange={(e) => setSumberDana(e.target.value)}
                  placeholder="Kemensos RI / APBDes Desa Kotayasa"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan Tambahan
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Catatan lokasi pengambilan atau nomor berkas"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#0B5D3F] outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer"
                >
                  Simpan Bantuan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
