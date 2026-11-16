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
  PlusCircle,
} from 'lucide-react';
import { Transaction, TransactionType, PengaturanKas, Warga } from '../types';
import {
  getSelectableResidentsForRT,
  isKasKematianOutflow,
  normalizeRTCode,
  normalizeRWCode,
  type ResidentOption,
} from '../utils/rtFilter';

type KematianFlowMode = 'setoran' | 'santunan';
type KematianPeriodMode = 'bulanan' | 'tahunan' | 'bebas';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id'> | Omit<Transaction, 'id'>[]) => Promise<void> | void;
  onUpdate?: (tx: Transaction) => Promise<void> | void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
  pengaturanKas?: PengaturanKas;
  wargaList?: Warga[];
  targetRT?: string;
  activeRole?: 'server' | 'admin' | 'warga';
  onGoToDataWarga?: () => void;
}

const BULANAN_PRESETS = [3000, 4000, 5000, 10000];
const TAHUNAN_PRESETS = [1000, 12000, 36000, 45000, 60000];

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  editingTransaction = null,
  defaultType = 'masuk',
  pengaturanKas,
  wargaList = [],
  targetRT,
  activeRole = 'admin',
  onGoToDataWarga,
}) => {
  const isEditing = Boolean(editingTransaction);
  const [tipe, setTipe] = useState<TransactionType>(defaultType);
  const [kematianFlow, setKematianFlow] = useState<KematianFlowMode>('setoran');
  const [kematianPeriod, setKematianPeriod] = useState<KematianPeriodMode>('bulanan');
  const [kategori, setKategori] = useState('Iuran Warga');
  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);

  // Optional paired Kas Kematian contribution when recording Kas Masuk from a resident
  const [includeKasKematian, setIncludeKasKematian] = useState(false);
  const [pairedKematianPeriod, setPairedKematianPeriod] = useState<KematianPeriodMode>('bulanan');
  const [pairedKematianNominal, setPairedKematianNominal] = useState('');

  const [selectedOption, setSelectedOption] = useState<ResidentOption | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  const defaultCategoryForState = (t: TransactionType, flow: KematianFlowMode) => {
    if (t === 'masuk') return 'Iuran Warga';
    if (t === 'keluar') return 'Kegiatan RT';
    return flow === 'setoran' ? 'Iuran Kas Kematian' : 'Santunan Kematian';
  };

  // Reset or populate form cleanly whenever modal opens or editingTransaction changes
  useEffect(() => {
    if (!isOpen) return;

    if (editingTransaction) {
      const flow: KematianFlowMode = isKasKematianOutflow(editingTransaction)
        ? 'santunan'
        : 'setoran';
      const ketLower = (editingTransaction.keterangan || '').toLowerCase();
      const period: KematianPeriodMode = ketLower.includes('tahunan')
        ? 'tahunan'
        : ketLower.includes('bulanan')
        ? 'bulanan'
        : 'bebas';

      setTipe(editingTransaction.tipe);
      setKematianFlow(flow);
      setKematianPeriod(period);
      setKategori(
        editingTransaction.kategori || defaultCategoryForState(editingTransaction.tipe, flow)
      );
      setKeterangan(editingTransaction.keterangan || '');
      setNominal(
        typeof editingTransaction.nominal === 'number'
          ? String(editingTransaction.nominal)
          : ''
      );
      setTanggal(editingTransaction.tanggal || new Date().toISOString().split('T')[0]);
      setIncludeKasKematian(false);
      setPairedKematianPeriod('bulanan');
      setPairedKematianNominal('');

      const txNameLower = (editingTransaction.namaWarga || '').trim().toLowerCase();
      const txCleanKK = (editingTransaction.noKK || '').replace(/\s+/g, '');
      const matchedOpt =
        (editingTransaction.residentId
          ? residentOptions.find(
              (o) =>
                o.residentId === editingTransaction.residentId &&
                (!txNameLower || o.nama.toLowerCase() === txNameLower)
            ) || residentOptions.find((o) => o.residentId === editingTransaction.residentId)
          : undefined) ||
        (txCleanKK
          ? residentOptions.find(
              (o) =>
                o.noKK.replace(/\s+/g, '') === txCleanKK &&
                (!txNameLower || o.nama.toLowerCase() === txNameLower)
            ) || residentOptions.find((o) => o.noKK.replace(/\s+/g, '') === txCleanKK)
          : undefined) ||
        (txNameLower
          ? residentOptions.find((o) => o.nama.toLowerCase() === txNameLower)
          : undefined) ||
        null;

      if (matchedOpt) {
        setSelectedOption(matchedOpt);
      } else {
        const rwFallback = normalizeRWCode(pengaturanKas?.profilRT?.namaRW, '05');
        const rtFallback =
          normalizeRTCode(editingTransaction.rtScope) ||
          (effectiveTargetRT !== 'SEMUA' ? effectiveTargetRT : '08');
        const legacyLabel =
          editingTransaction.namaWarga?.trim() ||
          (editingTransaction.isSaldoAwal
            ? 'Pindahan Kas Masa Lalu'
            : editingTransaction.tipe === 'keluar'
            ? 'Operasional / Pihak Luar'
            : 'Data Transaksi Lama');
        setSelectedOption({
          optionKey: `legacy::${editingTransaction.id}`,
          residentId: editingTransaction.residentId || '',
          nama: legacyLabel,
          hubungan: editingTransaction.isSaldoAwal ? 'Saldo Awal' : 'Data Tercatat',
          isKepalaKeluarga: false,
          kkHeadName: legacyLabel,
          noKK: editingTransaction.noKK || '',
          noRumah: editingTransaction.nomorRumah || '-',
          rt: rtFallback,
          rw: rwFallback,
          rtScope: editingTransaction.rtScope || `RT ${rtFallback} RW ${rwFallback}`,
        });
      }
    } else {
      setTipe(defaultType);
      setKematianFlow('setoran');
      setKematianPeriod('bulanan');
      setKategori(defaultCategoryForState(defaultType, 'setoran'));
      setKeterangan('');
      setNominal('');
      setIncludeKasKematian(false);
      setPairedKematianPeriod('bulanan');
      setPairedKematianNominal('');
      setTanggal(new Date().toISOString().split('T')[0]);
      setSelectedOption(null);
    }

    setSearchQuery('');
    setIsDropdownOpen(false);
    setIsSubmitting(false);
    setFormError(null);
  }, [isOpen, defaultType, editingTransaction]);

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

  const tarifBulananKematian = pengaturanKas?.nominalKematianBulanan || 0;
  const tarifTahunanKematian = pengaturanKas?.nominalKematianTahunan || 0;
  const tarifBulananJimpitan = pengaturanKas?.nominalJimpitanBulanan || 0;

  const activeKematianPresets = (period: KematianPeriodMode) => {
    const base = period === 'tahunan' ? [...TAHUNAN_PRESETS] : [...BULANAN_PRESETS];
    const configured = period === 'tahunan' ? tarifTahunanKematian : tarifBulananKematian;
    if (configured > 0 && !base.includes(configured)) {
      base.push(configured);
      base.sort((a, b) => a - b);
    }
    return base;
  };

  const numPrimary = parseFloat(nominal.replace(/[^0-9]/g, '')) || 0;
  const numPairedKematian =
    tipe === 'masuk' && includeKasKematian
      ? parseFloat(pairedKematianNominal.replace(/[^0-9]/g, '')) || 0
      : 0;
  const totalGabunganMasuk = numPrimary + numPairedKematian;

  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

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

  const buildPeriodSuffix = (period: KematianPeriodMode) =>
    period === 'bulanan' ? 'Bulanan' : period === 'tahunan' ? 'Tahunan' : 'Setoran Warga';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedOption) {
      setFormError(
        residentOptions.length === 0
          ? `Belum ada data warga terdaftar di ${rtLabel}. Tambahkan warga terlebih dahulu di menu Data Warga.`
          : 'Pilih warga dari daftar warga RT terlebih dahulu.'
      );
      return;
    }

    if (isEditing && editingTransaction && onUpdate) {
      if (numPrimary < 100) {
        setFormError('Masukkan nominal transaksi yang valid (minimal Rp 100).');
        return;
      }

      setFormError(null);
      setIsSubmitting(true);
      try {
        const isLegacySynthetic = selectedOption?.optionKey.startsWith('legacy::');
        const resolvedKategori =
          tipe === 'kematian'
            ? kematianFlow === 'setoran'
              ? editingTransaction.isSaldoAwal
                ? editingTransaction.kategori || 'Kas Kematian'
                : 'Iuran Kas Kematian'
              : 'Santunan Kematian'
            : kategori || (tipe === 'masuk' ? 'Iuran Warga' : 'Kegiatan RT');

        const periodLabel = buildPeriodSuffix(kematianPeriod);
        const resolvedKeterangan =
          keterangan.trim() ||
          (tipe === 'masuk'
            ? 'Setoran Iuran Kas Warga'
            : tipe === 'keluar'
            ? 'Pengeluaran Kegiatan RT'
            : kematianFlow === 'setoran'
            ? `Setoran Iuran Kas Kematian (${periodLabel})`
            : 'Pengeluaran / Santunan Kas Kematian');

        const updatedTx: Transaction = {
          ...editingTransaction,
          tanggal,
          kategori: resolvedKategori,
          keterangan: resolvedKeterangan,
          nominal: numPrimary,
          tipe,
          residentId: isLegacySynthetic
            ? editingTransaction.residentId
            : selectedOption.residentId || editingTransaction.residentId,
          namaWarga: isLegacySynthetic
            ? editingTransaction.namaWarga
            : selectedOption.nama,
          nomorRumah: isLegacySynthetic
            ? editingTransaction.nomorRumah
            : selectedOption.noRumah !== '-'
            ? selectedOption.noRumah
            : undefined,
          noKK: isLegacySynthetic
            ? editingTransaction.noKK
            : selectedOption.noKK || undefined,
          rtScope: isLegacySynthetic
            ? editingTransaction.rtScope || selectedOption.rtScope
            : selectedOption.rtScope || editingTransaction.rtScope,
        };

        await onUpdate(updatedTx);
        onClose();
      } catch (err: any) {
        setFormError(err?.message || 'Gagal memperbarui transaksi ke database.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (tipe === 'masuk') {
      if (numPrimary <= 0 && numPairedKematian <= 0) {
        setFormError('Masukkan nominal Kas Warga atau Kas Kematian yang valid (minimal Rp 100).');
        return;
      }
      if (includeKasKematian && numPairedKematian <= 0 && numPrimary <= 0) {
        setFormError('Masukkan nominal Kas Kematian yang valid.');
        return;
      }
      if (includeKasKematian && pairedKematianNominal.trim() !== '' && numPairedKematian < 100) {
        setFormError('Nominal Kas Kematian minimal Rp 100.');
        return;
      }
    } else if (numPrimary < 100) {
      setFormError('Masukkan nominal transaksi yang valid (minimal Rp 100).');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const baseResidentFields = {
        tanggal,
        residentId: selectedOption.residentId || undefined,
        namaWarga: selectedOption.nama,
        nomorRumah: selectedOption.noRumah !== '-' ? selectedOption.noRumah : undefined,
        noKK: selectedOption.noKK || undefined,
        rtScope: selectedOption.rtScope,
      };

      const batch: Omit<Transaction, 'id'>[] = [];

      if (tipe === 'masuk') {
        if (numPrimary > 0) {
          batch.push({
            ...baseResidentFields,
            kategori: kategori || 'Iuran Warga',
            keterangan: keterangan.trim() || 'Setoran Iuran Kas Warga',
            nominal: numPrimary,
            tipe: 'masuk',
          });
        }
        if (includeKasKematian && numPairedKematian > 0) {
          const periodLabel = buildPeriodSuffix(pairedKematianPeriod);
          batch.push({
            ...baseResidentFields,
            kategori: 'Iuran Kas Kematian',
            keterangan: keterangan.trim()
              ? `Iuran Kas Kematian (${periodLabel}) — ${keterangan.trim()}`
              : `Setoran Iuran Kas Kematian (${periodLabel})`,
            nominal: numPairedKematian,
            tipe: 'kematian',
          });
        }
      } else if (tipe === 'kematian') {
        const isSetoran = kematianFlow === 'setoran';
        const periodLabel = buildPeriodSuffix(kematianPeriod);
        batch.push({
          ...baseResidentFields,
          kategori: isSetoran ? 'Iuran Kas Kematian' : 'Santunan Kematian',
          keterangan:
            keterangan.trim() ||
            (isSetoran
              ? `Setoran Iuran Kas Kematian (${periodLabel})`
              : 'Pengeluaran / Santunan Kas Kematian'),
          nominal: numPrimary,
          tipe: 'kematian',
        });
      } else {
        batch.push({
          ...baseResidentFields,
          kategori: kategori || 'Kegiatan RT',
          keterangan: keterangan.trim() || 'Pengeluaran Kegiatan RT',
          nominal: numPrimary,
          tipe: 'keluar',
        });
      }

      await onSave(batch.length === 1 ? batch[0] : batch);
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
            <h3 className="text-base font-bold text-[#0B5D3F]">
              {isEditing ? 'Edit Transaksi Kas' : 'Catat Transaksi Kas'}
            </h3>
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
                  setFormError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
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
                  setIncludeKasKematian(false);
                  setFormError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
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
                  setKategori(defaultCategoryForState('kematian', kematianFlow));
                  setIncludeKasKematian(false);
                  setFormError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-bold transition-all cursor-pointer ${
                  tipe === 'kematian'
                    ? 'bg-[#F43F5E] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Heart size={14} fill="currentColor" />
                <span>Kas Kematian</span>
              </button>
            </div>
          </div>

          {/* Sub-mode khusus tab Kas Kematian: Iuran Warga (Masuk) vs Pengeluaran/Santunan (Keluar) */}
          {tipe === 'kematian' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 space-y-2.5">
              <span className="text-[11px] font-bold text-rose-900 block">
                Jenis Pencatatan Kas Kematian
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setKematianFlow('setoran');
                    setKategori('Iuran Kas Kematian');
                    setFormError(null);
                  }}
                  className={`rounded-xl px-3 py-2 text-[11px] font-bold border transition-all cursor-pointer text-left ${
                    kematianFlow === 'setoran'
                      ? 'bg-[#0B5D3F] text-white border-[#0B5D3F] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="block">+ Setoran Iuran Warga</span>
                  <span
                    className={`text-[10px] font-normal ${
                      kematianFlow === 'setoran' ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    Menambah saldo kas kematian
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setKematianFlow('santunan');
                    setKategori('Santunan Kematian');
                    setFormError(null);
                  }}
                  className={`rounded-xl px-3 py-2 text-[11px] font-bold border transition-all cursor-pointer text-left ${
                    kematianFlow === 'santunan'
                      ? 'bg-[#F43F5E] text-white border-[#F43F5E] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="block">- Pengeluaran / Santunan</span>
                  <span
                    className={`text-[10px] font-normal ${
                      kematianFlow === 'santunan' ? 'text-rose-100' : 'text-slate-500'
                    }`}
                  >
                    Mengurangi saldo kas kematian
                  </span>
                </button>
              </div>

              {kematianFlow === 'setoran' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">Periode Setoran:</span>
                    <div className="inline-flex rounded-lg bg-white p-0.5 border border-rose-200">
                      {(
                        [
                          { id: 'bulanan', label: 'Bulanan' },
                          { id: 'tahunan', label: 'Tahunan' },
                          { id: 'bebas', label: 'Lainnya' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setKematianPeriod(p.id)}
                          className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                            kematianPeriod === p.id
                              ? 'bg-rose-600 text-white'
                              : 'text-slate-600 hover:bg-rose-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                      Pilih Cepat Nominal Kas Kematian ({buildPeriodSuffix(kematianPeriod)}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeKematianPresets(kematianPeriod).map((amt) => {
                        const active = numPrimary === amt;
                        return (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => {
                              setNominal(String(amt));
                              setFormError(null);
                            }}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border transition-colors cursor-pointer ${
                              active
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-100/70'
                            }`}
                          >
                            {formatRupiah(amt)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nominal Utama */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                {tipe === 'masuk'
                  ? 'Nominal Kas Iuran Warga (Rupiah)'
                  : tipe === 'kematian'
                  ? kematianFlow === 'setoran'
                    ? 'Nominal Setoran Kas Kematian (Rupiah)'
                    : 'Nominal Pengeluaran / Santunan Duka (Rupiah)'
                  : 'Nominal Kas Keluar (Rupiah)'}
              </label>
              {tipe === 'masuk' && tarifBulananJimpitan > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setNominal(String(tarifBulananJimpitan));
                    setFormError(null);
                  }}
                  className="text-[10px] font-bold text-[#0B5D3F] hover:underline cursor-pointer"
                >
                  Isi Tarif RT ({formatRupiah(tarifBulananJimpitan)})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                Rp
              </span>
              <input
                type="number"
                required={!(tipe === 'masuk' && includeKasKematian && numPairedKematian > 0)}
                min={tipe === 'masuk' && includeKasKematian ? 0 : 100}
                step="any"
                disabled={isSubmitting}
                value={nominal}
                onChange={(e) => {
                  setNominal(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={
                  tipe === 'masuk'
                    ? '30000'
                    : tipe === 'kematian' && kematianFlow === 'setoran'
                    ? '3000'
                    : '50000'
                }
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm font-bold text-slate-900 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Sekalian Setor Kas Kematian (Khusus Tab Kas Masuk saat tambah baru) */}
          {tipe === 'masuk' && !isEditing && (
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Heart size={15} className="text-rose-600 shrink-0" fill="currentColor" />
                  <div>
                    <p className="text-xs font-bold text-rose-950">
                      Setoran Kas Kematian Warga (Opsional)
                    </p>
                    <p className="text-[10px] text-rose-800/80">
                      Tercatat ke saldo Kas Kematian bersamaan dengan Kas Warga
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIncludeKasKematian((prev) => {
                      const next = !prev;
                      if (next && !pairedKematianNominal) {
                        setPairedKematianNominal(
                          String(tarifBulananKematian > 0 ? tarifBulananKematian : 3000)
                        );
                      }
                      return next;
                    });
                    setFormError(null);
                  }}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold border transition-colors cursor-pointer ${
                    includeKasKematian
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-100/70'
                  }`}
                >
                  {includeKasKematian ? (
                    <>
                      <Check size={12} strokeWidth={3} />
                      <span>Aktif</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle size={12} />
                      <span>+ Tambah</span>
                    </>
                  )}
                </button>
              </div>

              {includeKasKematian && (
                <div className="space-y-2.5 pt-1 border-t border-rose-200/70">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">Periode:</span>
                    <div className="inline-flex rounded-lg bg-white p-0.5 border border-rose-200">
                      {(
                        [
                          { id: 'bulanan', label: 'Bulanan' },
                          { id: 'tahunan', label: 'Tahunan' },
                          { id: 'bebas', label: 'Lainnya' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPairedKematianPeriod(p.id)}
                          className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                            pairedKematianPeriod === p.id
                              ? 'bg-rose-600 text-white'
                              : 'text-slate-600 hover:bg-rose-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {activeKematianPresets(pairedKematianPeriod).map((amt) => {
                      const active = numPairedKematian === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setPairedKematianNominal(String(amt));
                            setFormError(null);
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-100/70'
                          }`}
                        >
                          {formatRupiah(amt)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                      Rp
                    </span>
                    <input
                      type="number"
                      min="100"
                      step="any"
                      disabled={isSubmitting}
                      value={pairedKematianNominal}
                      onChange={(e) => {
                        setPairedKematianNominal(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder="Nominal lain, misal 3000 atau 45000"
                      className="w-full rounded-xl border border-rose-300 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-900 focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>

                  {totalGabunganMasuk > 0 && (
                    <div className="rounded-xl bg-white/90 px-3 py-2 border border-rose-200 text-[11px] flex items-center justify-between">
                      <span className="text-slate-600">
                        Kas Warga ({formatRupiah(numPrimary)}) + Kas Kematian ({formatRupiah(numPairedKematian)})
                      </span>
                      <span className="font-extrabold text-[#0B5D3F]">
                        {formatRupiah(totalGabunganMasuk)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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

            {residentOptions.length === 0 && !selectedOption ? (
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
              placeholder={
                tipe === 'kematian' && kematianFlow === 'setoran'
                  ? 'Contoh: Iuran Kas Kematian Bulan Ini'
                  : 'Contoh: Iuran Kas Warga Bulan Ini'
              }
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
              disabled={isSubmitting || (residentOptions.length === 0 && !selectedOption)}
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
                  <span>
                    {isEditing
                      ? 'Simpan Perubahan'
                      : tipe === 'masuk' && includeKasKematian && numPrimary > 0 && numPairedKematian > 0
                      ? 'Simpan Kas & Kematian'
                      : 'Simpan Transaksi'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
