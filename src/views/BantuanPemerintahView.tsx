import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  Check,
  Users,
} from 'lucide-react';
import { BantuanPemerintah, Warga, PengaturanKas } from '../types';
import { downloadTemplateExcelWargaBansos } from '../utils/excelWargaImport';
import { ConfirmationModal } from '../components/ConfirmationModal';
import {
  getSelectableResidentsForRT,
  normalizeRTCode,
  type ResidentOption,
} from '../utils/rtFilter';

interface BantuanPemerintahViewProps {
  bantuanList: BantuanPemerintah[];
  wargaList: Warga[];
  pengaturanKas?: PengaturanKas;
  activeRole?: 'server' | 'admin' | 'warga';
  targetRT?: string;
  onAddBantuan: (data: Omit<BantuanPemerintah, 'id'>) => void;
  onUpdateStatus: (id: string, newStatus: BantuanPemerintah['status']) => void;
  onDeleteBantuan: (id: string) => void;
  onOpenImportExcel?: () => void;
  onGoToDataWarga?: () => void;
  onBack: () => void;
}

export const BantuanPemerintahView: React.FC<BantuanPemerintahViewProps> = ({
  bantuanList,
  wargaList,
  pengaturanKas,
  activeRole = 'admin',
  targetRT,
  onAddBantuan,
  onUpdateStatus,
  onDeleteBantuan,
  onOpenImportExcel,
  onGoToDataWarga,
  onBack,
}) => {
  const rtStr = pengaturanKas?.profilRT?.namaRT || '08';
  const rwStr = pengaturanKas?.profilRT?.namaRW || '05';
  const desaStr = pengaturanKas?.profilRT?.desa || 'Desa Kotayasa';
  const [search, setSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState<string>('semua');
  const [filterStatus, setFilterStatus] = useState<string>('semua');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BantuanPemerintah | null>(null);

  // Form State
  const [jenisBantuan, setJenisBantuan] = useState<string>('BPNT (Bantuan Pangan Non Tunai)');
  const [isCustomJenis, setIsCustomJenis] = useState(false);
  const [customJenisText, setCustomJenisText] = useState('');
  const [selectedResident, setSelectedResident] = useState<ResidentOption | null>(null);
  const [residentSearch, setResidentSearch] = useState('');
  const [isResidentDropdownOpen, setIsResidentDropdownOpen] = useState(false);
  const [bantuanFormError, setBantuanFormError] = useState<string | null>(null);
  const [namaPenerima, setNamaPenerima] = useState('');
  const [noKK, setNoKK] = useState('');
  const [nik, setNik] = useState('');
  const [nominalAtauBarang, setNominalAtauBarang] = useState('Rp 600.000 / Triwulan');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<BantuanPemerintah['status']>('Sudah Disalurkan');
  const [sumberDana, setSumberDana] = useState('Kemensos RI & Pemerintah Desa');
  const [keterangan, setKeterangan] = useState('Penyaluran resmi melalui Kantor Pos / Balai Desa Kotayasa');

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const residentSearchInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveTargetRT = useMemo(() => {
    const raw = targetRT || rtStr || '08';
    return normalizeRTCode(raw) || '08';
  }, [targetRT, rtStr]);

  const isSemuaRT = effectiveTargetRT === 'SEMUA';
  const rtLabel = isSemuaRT ? `Semua RT RW ${rwStr}` : `RT ${effectiveTargetRT} RW ${rwStr}`;

  const residentOptions = useMemo(() => {
    return getSelectableResidentsForRT({
      wargaList,
      targetRT: effectiveTargetRT,
      activeRole,
      defaultRW: rwStr,
    });
  }, [wargaList, effectiveTargetRT, activeRole, rwStr]);

  const filteredResidentOptions = useMemo(() => {
    const q = residentSearch.trim().toLowerCase();
    if (!q) return residentOptions;
    return residentOptions.filter(
      (opt) =>
        opt.nama.toLowerCase().includes(q) ||
        opt.kkHeadName.toLowerCase().includes(q) ||
        opt.noKK.toLowerCase().includes(q) ||
        (opt.nik || '').toLowerCase().includes(q) ||
        opt.noRumah.toLowerCase().includes(q) ||
        opt.hubungan.toLowerCase().includes(q) ||
        `rt ${opt.rt}`.includes(q)
    );
  }, [residentOptions, residentSearch]);

  const resetModalForm = () => {
    setSelectedResident(null);
    setResidentSearch('');
    setIsResidentDropdownOpen(false);
    setBantuanFormError(null);
    setNamaPenerima('');
    setNoKK('');
    setNik('');
    setIsCustomJenis(false);
    setCustomJenisText('');
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsResidentDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isResidentDropdownOpen) {
          setIsResidentDropdownOpen(false);
        } else {
          setIsModalOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, isResidentDropdownOpen]);

  const handleSelectResident = (opt: ResidentOption) => {
    setSelectedResident(opt);
    setNamaPenerima(opt.nama);
    setNoKK(opt.noKK || '');
    setNik(opt.nik || '');
    setIsResidentDropdownOpen(false);
    setBantuanFormError(null);
  };

  const handleOpenResidentDropdown = () => {
    if (residentOptions.length === 0) return;
    setIsResidentDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => residentSearchInputRef.current?.focus(), 20);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident || !namaPenerima.trim()) {
      setBantuanFormError(
        residentOptions.length === 0
          ? `Belum ada data KK / warga terdaftar di ${rtLabel}. Tambahkan warga di Data Warga terlebih dahulu.`
          : 'Pilih nama warga / anggota KK dari daftar warga terdaftar terlebih dahulu.'
      );
      return;
    }

    const finalJenis = (isCustomJenis && customJenisText.trim())
      ? customJenisText.trim()
      : jenisBantuan;

    onAddBantuan({
      jenisBantuan: finalJenis,
      namaPenerima: namaPenerima.trim(),
      noKK: noKK.trim() || selectedResident.noKK,
      nik: nik.trim(),
      nominalAtauBarang,
      tanggal,
      status,
      sumberDana,
      keterangan,
      rtScope: selectedResident.rtScope,
    });

    setIsModalOpen(false);
    resetModalForm();
  };

  // Collect all unique bantuan types (presets + custom ones present in dataset)
  const allUniqueJenis = Array.from(
    new Set([
      'BPNT (Bantuan Pangan Non Tunai)',
      'PKH (Program Keluarga Harapan)',
      'Bansos Tunai / BLT Desa',
      'Sembako Beras & Pangan',
      'Bantuan Lansia Disabilitas',
      'KIP / PIP Siswa',
      'Bantuan RTLH (Bedah Rumah)',
      'Bansos Minyak Goreng & Sembako',
      ...bantuanList.map((b) => b.jenisBantuan),
    ])
  );

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
              Pencatatan BPNT, PKH, Bansos, Sembako, dan BLT Desa untuk warga RT {rtStr} RW {rwStr} {desaStr}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => downloadTemplateExcelWargaBansos()}
            className="flex items-center gap-1.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-[#0B5D3F] shadow-xs hover:bg-emerald-100 active:scale-95 transition-all cursor-pointer"
            title="Download Template Excel (.xlsx) berisi kolom Data Warga & Penerimaan Bantuan"
          >
            <Download size={15} />
            <span>Template Excel (.xlsx)</span>
          </button>

          {onOpenImportExcel && (
            <button
              onClick={onOpenImportExcel}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              <FileSpreadsheet size={15} className="text-[#0B5D3F]" />
              <span>Import Excel</span>
            </button>
          )}

          <button
            onClick={() => {
              resetModalForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-2xl bg-[#0B5D3F] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>+ Input Data Bantuan</span>
          </button>
        </div>
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
            RT {rtStr} RW {rwStr} {desaStr}
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
          {/* Filter Jenis Bantuan (Dinamis dengan Bantuan Manual) */}
          <select
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B5D3F] outline-hidden cursor-pointer max-w-[200px] truncate"
          >
            <option value="semua">Semua Program Bantuan</option>
            {allUniqueJenis.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
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

      {/* Petunjuk Geser Layar HP untuk Responsivitas Mobile */}
      <div className="sm:hidden flex items-center justify-between text-[11px] font-bold text-emerald-800 bg-[#E8F5EE] px-3.5 py-2 rounded-2xl border border-emerald-200">
        <span className="flex items-center gap-1.5">
          <span>&larr; &rarr;</span>
          <span>Geser tabel ke samping untuk melihat kolom lengkap</span>
        </span>
        <span className="text-[10px] text-emerald-700 font-semibold">{filtered.length} Data</span>
      </div>

      {/* Table of Bantuan */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-xs border border-slate-200">
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-xs min-w-[760px]">
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
                        type="button"
                        onClick={() => setDeleteTarget(item)}
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
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetModalForm();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Searchable Resident & KK Member Picker */}
              <div ref={dropdownRef} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Pilih Nama Warga Terdaftar per KK ({isSemuaRT ? 'Semua RT' : `RT ${effectiveTargetRT}`})
                  </label>
                  <span className="text-[10px] font-semibold text-emerald-700">
                    {residentOptions.length} Jiwa Terdaftar
                  </span>
                </div>

                {residentOptions.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <Users size={15} className="shrink-0 mt-0.5 text-amber-700" />
                      <div>
                        <p className="font-bold">
                          Belum ada data KK / warga terdaftar di {isSemuaRT ? 'RW ini' : `RT ${effectiveTargetRT}`}
                        </p>
                        <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                          Daftarkan warga beserta anggota KK di menu Data Warga terlebih dahulu agar penerima bantuan otomatis terhubung dengan No. KK dan NIK.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onGoToDataWarga && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalOpen(false);
                            onGoToDataWarga();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D3F] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#084831] transition-colors cursor-pointer"
                        >
                          <Users size={12} />
                          <span>Buka Data Warga</span>
                        </button>
                      )}
                      {onOpenImportExcel && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalOpen(false);
                            onOpenImportExcel();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100/60 transition-colors cursor-pointer"
                        >
                          <FileSpreadsheet size={12} />
                          <span>Import Excel</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenResidentDropdown}
                      aria-expanded={isResidentDropdownOpen}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                        isResidentDropdownOpen
                          ? 'border-[#0B5D3F] ring-1 ring-[#0B5D3F] bg-white'
                          : selectedResident
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {selectedResident ? (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-900 truncate">{selectedResident.nama}</p>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                selectedResident.isKepalaKeluarga
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {selectedResident.hubungan}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            KK: {selectedResident.noKK || '-'}
                            {!selectedResident.isKepalaKeluarga ? ` (${selectedResident.kkHeadName})` : ''}
                            {selectedResident.noRumah && selectedResident.noRumah !== '-'
                              ? ` • Rumah No. ${selectedResident.noRumah}`
                              : ''}
                            {` • RT ${selectedResident.rt}`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400">
                          Cari &amp; pilih warga / anggota KK {isSemuaRT ? '' : `RT ${effectiveTargetRT}`}...
                        </span>
                      )}
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-slate-400 transition-transform ${
                          isResidentDropdownOpen ? 'rotate-180 text-[#0B5D3F]' : ''
                        }`}
                      />
                    </button>

                    {isResidentDropdownOpen && (
                      <div className="mt-1.5 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden z-20">
                        <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                          <div className="relative">
                            <Search
                              size={14}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                              ref={residentSearchInputRef}
                              type="text"
                              value={residentSearch}
                              onChange={(e) => setResidentSearch(e.target.value)}
                              placeholder="Cari nama warga, Kepala Keluarga, No. KK, NIK, atau No. Rumah..."
                              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                            />
                          </div>
                        </div>

                        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                          {filteredResidentOptions.length === 0 ? (
                            <div className="px-4 py-5 text-center text-xs text-slate-500">
                              Warga &ldquo;{residentSearch}&rdquo; tidak ditemukan di daftar KK {rtLabel}.
                            </div>
                          ) : (
                            filteredResidentOptions.map((opt) => {
                              const isSelected = selectedResident?.optionKey === opt.optionKey;
                              return (
                                <button
                                  key={opt.optionKey}
                                  type="button"
                                  onClick={() => handleSelectResident(opt)}
                                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#E8F5EE] text-[#0B5D3F]'
                                      : 'hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold truncate">{opt.nama}</span>
                                      <span
                                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                          opt.isKepalaKeluarga
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {opt.hubungan}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                      KK: {opt.noKK || '-'}
                                      {!opt.isKepalaKeluarga ? ` (${opt.kkHeadName})` : ''}
                                      {opt.nik ? ` • NIK: ${opt.nik}` : ''}
                                      {opt.noRumah && opt.noRumah !== '-' ? ` • No. ${opt.noRumah}` : ''}
                                      {` • RT ${opt.rt}`}
                                    </p>
                                  </div>
                                  {isSelected && <Check size={15} className="shrink-0 text-[#0B5D3F]" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Jenis Program Bantuan
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomJenis(!isCustomJenis);
                        if (!isCustomJenis) {
                          setCustomJenisText('');
                        }
                      }}
                      className="text-[10px] font-bold text-[#0B5D3F] hover:underline cursor-pointer"
                    >
                      {isCustomJenis ? '&larr; Pilih Pilihan Cepat' : '+ Ketik Nama Manual'}
                    </button>
                  </div>

                  {!isCustomJenis ? (
                    <select
                      value={jenisBantuan}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomJenis(true);
                          setCustomJenisText('');
                        } else {
                          setJenisBantuan(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#0B5D3F] focus:border-[#0B5D3F] outline-hidden cursor-pointer"
                    >
                      <option value="BPNT (Bantuan Pangan Non Tunai)">BPNT (Bantuan Pangan Non Tunai)</option>
                      <option value="PKH (Program Keluarga Harapan)">PKH (Program Keluarga Harapan)</option>
                      <option value="Bansos Tunai / BLT Desa">Bansos Tunai / BLT Desa</option>
                      <option value="Sembako Beras & Pangan">Sembako Beras & Pangan</option>
                      <option value="Bantuan Lansia Disabilitas">Bantuan Lansia Disabilitas</option>
                      <option value="KIP / PIP Siswa">KIP / PIP Siswa</option>
                      <option value="Bantuan RTLH (Bedah Rumah)">Bantuan RTLH (Bedah Rumah)</option>
                      <option value="Bansos Minyak Goreng & Sembako">Bansos Minyak Goreng & Sembako</option>
                      <option value="Bantuan Pangan Cadangan Beras (CPP)">Bantuan Pangan Cadangan Beras (CPP)</option>
                      <option value="BLT Mitigasi Risiko Pangan / El Nino">BLT Mitigasi Risiko Pangan / El Nino</option>
                      <option value="__custom__">+ Tulis Nama Program Lainnya (Ketik Manual)...</option>
                    </select>
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        value={customJenisText}
                        onChange={(e) => setCustomJenisText(e.target.value)}
                        placeholder="Ketik nama program (misal: Bantuan Bedah Rumah RTLH, BLT El Nino, dll)"
                        className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-50/40 px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#0B5D3F] outline-hidden placeholder:font-normal placeholder:text-slate-400"
                        autoFocus
                      />
                      <p className="text-[10px] text-emerald-800 font-medium">
                        Nama program bantuan manual akan tersimpan akurat & rapi.
                      </p>
                    </div>
                  )}
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

              {bantuanFormError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{bantuanFormError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetModalForm();
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={residentOptions.length === 0}
                  className="rounded-xl bg-[#0B5D3F] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Simpan Bantuan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteBantuan(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        title="Hapus Data Bantuan Pemerintah"
        targetName={
          deleteTarget
            ? `${deleteTarget.namaPenerima} — ${deleteTarget.jenisBantuan}`
            : undefined
        }
        message={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus data bantuan ${deleteTarget.jenisBantuan} untuk ${deleteTarget.namaPenerima} (No. KK: ${deleteTarget.noKK || '-'})? Data akan dihapus dari Cloud Firestore.`
            : ''
        }
        confirmText="Ya, Hapus Data"
        variant="danger"
      />
    </div>
  );
};
