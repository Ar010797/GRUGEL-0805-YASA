import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ArrowUp,
  ArrowDown,
  Heart,
  Check,
  Search,
  ChevronDown,
  Users,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Transaction, TransactionType, PengaturanKas, Warga } from '../types';
import {
  getSelectableResidentsForRT,
  normalizeRTCode,
  type ResidentOption,
} from '../utils/rtFilter';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id'>) => Promise<void> | void;
  defaultType?: TransactionType;
  pengaturanKas?: PengaturanKas;
  wargaList?: Warga[];
  targetRT?: string;
  activeRole?: 'server' | 'admin' | 'warga';
  onGoToDataWarga?: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultType = 'masuk',
  pengaturanKas,
  wargaList = [],
  targetRT,
  activeRole = 'admin',
  onGoToDataWarga,
}) => {
  const [tipe, setTipe] = useState<TransactionType>(defaultType);
  const [kategori, setKategori] = useState('Iuran Warga');
  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);

  const [selectedOption, setSelectedOption] = useState<ResidentOption | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const defaultCategoryForType = (t: TransactionType) =>
    t === 'masuk' ? 'Iuran Warga' : t === 'keluar' ? 'Kegiatan RT' : 'Santunan Kematian';

  // Reset form cleanly whenever modal opens or defaultType changes
  useEffect(() => {
    if (!isOpen) return;
    setTipe(defaultType);
    setKategori(defaultCategoryForType(defaultType));
    setKeterangan('');
    setNominal('');
    setTanggal(new Date().toISOString().split('T')[0]);
    setSelectedOption(null);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsSubmitting(false);
    setFormError(null);
  }, [isOpen, defaultType]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDropdownOpen) {
          setIsDropdownOpen(false);
        } else if (!isSubmitting) {
          onClose();
        }
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isDropdownOpen, isSubmitting, onClose]);

  const effectiveTargetRT = useMemo(() => {
    const raw = targetRT || pengaturanKas?.profilRT?.namaRT || '08';
    return normalizeRTCode(raw) || '08';
  }, [targetRT, pengaturanKas?.profilRT?.namaRT]);

  const residentOptions = useMemo(() => {
    return getSelectableResidentsForRT({
      wargaList,
      targetRT: effectiveTargetRT,
      activeRole,
      defaultRW: pengaturanKas?.profilRT?.namaRW || '05',
    });
  }, [wargaList, effectiveTargetRT, activeRole, pengaturanKas?.profilRT?.namaRW]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return residentOptions;
    return residentOptions.filter(
      (opt) =>
        opt.nama.toLowerCase().includes(q) ||
        opt.noRumah.toLowerCase().includes(q) ||
        opt.noKK.toLowerCase().includes(q) ||
        opt.hubungan.toLowerCase().includes(q) ||
        opt.kkHeadName.toLowerCase().includes(q) ||
        `rt ${opt.rt}`.includes(q)
    );
  }, [residentOptions, searchQuery]);

  if (!isOpen) return null;

  const isSemuaRT = effectiveTargetRT === 'SEMUA';
  const rtLabel = isSemuaRT
    ? `Semua RT RW ${pengaturanKas?.profilRT?.namaRW || '05'}`
    : `RT ${effectiveTargetRT} RW ${pengaturanKas?.profilRT?.namaRW || '05'}`;

  const handleOpenDropdown = () => {
    if (isSubmitting || residentOptions.length === 0) return;
    setIsDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 20);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const num = parseFloat(nominal.replace(/[^0-9]/g, '')) || 0;
    if (num <= 0) {
      setFormError('Masukkan nominal transaksi yang valid (minimal Rp 1.000).');
      return;
    }

    if (!selectedOption) {
      setFormError(
        residentOptions.length === 0
          ? `Belum ada data warga terdaftar di ${rtLabel}. Tambahkan warga terlebih dahulu di menu Data Warga.`
          : 'Pilih warga dari daftar warga RT terlebih dahulu.'
      );
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await onSave({
        tanggal,
        kategori,
        keterangan:
          keterangan.trim() ||
          (tipe === 'masuk'
            ? 'Iuran Warga'
            : tipe === 'keluar'
            ? 'Pengeluaran Kegiatan'
            : 'Santunan Kematian'),
        nominal: num,
        tipe,
        residentId: selectedOption.residentId,
        namaWarga: selectedOption.nama,
        nomorRumah: selectedOption.noRumah !== '-' ? selectedOption.noRumah : undefined,
        noKK: selectedOption.noKK || undefined,
        rtScope: selectedOption.rtScope,
      });
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Gagal menyimpan transaksi ke database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-emerald-900/10 animate-in fade-in zoom-in-95 duration-150">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-[#E8F5EE] px-5 sm:px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#0B5D3F]">Catat Transaksi Kas</h3>
            <p className="text-xs text-slate-600">
              {rtLabel} • {pengaturanKas?.profilRT?.desa || 'Desa Kotayasa'}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Tipe Transaksi */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Jenis Transaksi</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setTipe('masuk');
                  setKategori('Iuran Warga');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'masuk'
                    ? 'bg-[#10B981] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
                <span>Kas Masuk</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setTipe('keluar');
                  setKategori('Kegiatan RT');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'keluar'
                    ? 'bg-[#EF4444] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowDown size={14} strokeWidth={2.5} />
                <span>Kas Keluar</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setTipe('kematian');
                  setKategori('Santunan Kematian');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'kematian'
                    ? 'bg-[#F43F5E] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Heart size={14} fill="currentColor" />
                <span>Kematian</span>
              </button>
            </div>
          </div>

          {/* Nominal */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nominal (Rupiah)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                Rp
              </span>
              <input
                type="number"
                required
                min="1000"
                step="1000"
                disabled={isSubmitting}
                value={nominal}
                onChange={(e) => {
                  setNominal(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="50000"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Dropdown Warga Terdaftar (Searchable, Strictly Scoped per RT) */}
          <div ref={dropdownRef} className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                Pilih Nama Warga ({isSemuaRT ? 'Semua RT' : `RT ${effectiveTargetRT}`})
              </label>
              <span className="text-[10px] font-semibold text-emerald-700">
                {residentOptions.length} Nama Terdaftar
              </span>
            </div>

            {residentOptions.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                <div className="flex items-start gap-2">
                  <Users size={15} className="shrink-0 mt-0.5 text-amber-700" />
                  <div>
                    <p className="font-bold">
                      Belum ada warga terdaftar di {isSemuaRT ? 'RW ini' : `RT ${effectiveTargetRT}`}
                    </p>
                    <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                      Input manual dinonaktifkan untuk menjaga konsistensi pembukuan. Silakan tambahkan data warga di menu Data Warga terlebih dahulu.
                    </p>
                  </div>
                </div>
                {onGoToDataWarga && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToDataWarga();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D3F] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#084831] transition-colors cursor-pointer"
                  >
                    <Users size={12} />
                    <span>Buka Data Warga</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleOpenDropdown}
                  aria-expanded={isDropdownOpen}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                    isDropdownOpen
                      ? 'border-[#0B5D3F] ring-1 ring-[#0B5D3F] bg-white'
                      : selectedOption
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                >
                  {selectedOption ? (
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">{selectedOption.nama}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {selectedOption.hubungan}
                        {selectedOption.noRumah && selectedOption.noRumah !== '-'
                          ? ` • Rumah No. ${selectedOption.noRumah}`
                          : ''}
                        {` • RT ${selectedOption.rt}`}
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      Cari &amp; pilih warga terdaftar {isSemuaRT ? '' : `RT ${effectiveTargetRT}`}...
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-400 transition-transform ${
                      isDropdownOpen ? 'rotate-180 text-[#0B5D3F]' : ''
                    }`}
                  />
                </button>

                {isDropdownOpen && (
                  <div className="mt-1.5 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden z-20">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Ketik nama warga, No. Rumah, atau No. KK..."
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {filteredOptions.length === 0 ? (
                        <div className="px-4 py-5 text-center text-xs text-slate-500">
                          Warga &ldquo;{searchQuery}&rdquo; tidak ditemukan di daftar {rtLabel}.
                        </div>
                      ) : (
                        filteredOptions.map((opt) => {
                          const isSelected = selectedOption?.optionKey === opt.optionKey;
                          return (
                            <button
                              key={opt.optionKey}
                              type="button"
                              onClick={() => {
                                setSelectedOption(opt);
                                setIsDropdownOpen(false);
                                setFormError(null);
                              }}
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
                                  {opt.isKepalaKeluarga
                                    ? `KK: ${opt.noKK || '-'}`
                                    : `KK ${opt.kkHeadName}`}
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

          {/* Keterangan */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Keterangan Tambahan
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Iuran Kas Warga Bulan Oktober"
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          {/* Tanggal */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Tanggal Transaksi
            </label>
            <input
              type="date"
              disabled={isSubmitting}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:outline-hidden"
            />
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || residentOptions.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#084831] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>Simpan Transaksi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

