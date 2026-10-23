import React from 'react';
import {
  Wallet,
  ArrowUp,
  ArrowDown,
  Heart,
  Users,
  Check,
  Clock,
  ChevronRight,
  Plus,
  Receipt,
  Sparkles,
  ArrowUpRight,
  CalendarCheck,
  FileText,
  Settings,
  HelpCircle,
  Inbox,
  Megaphone,
  History,
} from 'lucide-react';
import { HouseLogo, LeafIcon } from '../components/HouseLogo';
import { GreetingVillageIllustration } from '../components/VillageLandscape';
import { Transaction, Warga } from '../types';

interface BerandaViewProps {
  transactions: Transaction[];
  wargaList: Warga[];
  onNavigate: (view: string) => void;
  onOpenTxModal: (type?: 'masuk' | 'keluar' | 'kematian') => void;
  onOpenWargaModal: () => void;
  onOpenPengumumanModal?: () => void;
  onOpenSaldoAwalModal?: () => void;
}

export const BerandaView: React.FC<BerandaViewProps> = ({
  transactions,
  wargaList,
  onNavigate,
  onOpenTxModal,
  onOpenWargaModal,
  onOpenPengumumanModal,
  onOpenSaldoAwalModal,
}) => {
  // Calculate real balances
  const totalMasuk = transactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKeluar = transactions
    .filter((t) => t.tipe === 'keluar')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKematian = transactions
    .filter((t) => t.tipe === 'kematian')
    .reduce((acc, t) => acc + t.nominal, 0);

  const saldoKas = totalMasuk - totalKeluar;

  const totalKK = wargaList.length;
  const sudahBayarCount = wargaList.filter((w) => w.statusIuran === 'Sudah').length;
  const belumBayarCount = totalKK - sudahBayarCount;
  const persenSudah = totalKK > 0 ? Math.round((sudahBayarCount / totalKK) * 100) : 0;
  const persenBelum = totalKK > 0 ? 100 - persenSudah : 0;

  const formatRupiah = (val: number) => {
    return 'Rp ' + val.toLocaleString('id-ID');
  };

  const menuItems = [
    {
      id: 'kas-warga',
      title: 'Kas Warga',
      desc: 'Melihat seluruh arus kas RT',
      icon: <Wallet size={24} className="text-white" />,
      color: 'bg-[#10B981]',
      badge: 'Semua Kas',
    },
    {
      id: 'kas-masuk',
      title: 'Kas Masuk',
      desc: 'Rekap pemasukan & iuran',
      icon: <ArrowUp size={24} strokeWidth={2.5} className="text-white" />,
      color: 'bg-[#10B981]',
      badge: 'Pemasukan',
    },
    {
      id: 'kas-keluar',
      title: 'Kas Keluar',
      desc: 'Rekap pengeluaran kegiatan',
      icon: <ArrowDown size={24} strokeWidth={2.5} className="text-white" />,
      color: 'bg-[#EF4444]',
      badge: 'Pengeluaran',
    },
    {
      id: 'kas-kematian',
      title: 'Kas Kematian',
      desc: 'Data dana & santunan duka',
      icon: <Heart size={24} fill="currentColor" className="text-white" />,
      color: 'bg-[#F43F5E]',
      badge: 'Sosial',
    },
    {
      id: 'status-iuran',
      title: 'Status Iuran',
      desc: 'Sudah & belum bayar warga',
      icon: <CalendarCheck size={24} className="text-white" />,
      color: 'bg-[#059669]',
      badge: 'Iuran Bulanan',
    },
    {
      id: 'data-warga',
      title: 'Data Warga',
      desc: 'Daftar seluruh warga RT 08',
      icon: <Users size={24} className="text-white" />,
      color: 'bg-[#0D9488]',
      badge: 'Data KK & Jiwa',
    },
    {
      id: 'laporan',
      title: 'Laporan',
      desc: 'Rekapitulasi lengkap & cetak',
      icon: <FileText size={24} className="text-white" />,
      color: 'bg-[#0284C7]',
      badge: 'Laporan Kas',
    },
    {
      id: 'pengaturan',
      title: 'Pengaturan',
      desc: 'Kelola kas, tarif & pengurus',
      icon: <Settings size={24} className="text-white" />,
      color: 'bg-[#475569]',
      badge: 'Konfigurasi',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Hero Banner & Greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0B5D3F] via-[#094E34] to-[#063F2A] p-6 lg:p-8 text-white shadow-lg">
        {/* Decorative elements */}
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-15 pointer-events-none">
          <HouseLogo size={320} variant="white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-200 border border-emerald-400/30">
                Aplikasi Pengelolaan Kas Warga
              </span>
              <span className="text-xs text-emerald-200/80">• Desa Kotayasa</span>
            </div>
            
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
              Assalamu'alaikum, Warga RT 08 RW 05
            </h1>
            <p className="mt-1 text-sm text-emerald-100/90 leading-relaxed">
              Semoga selalu sehat dan mendapat keberkahan. Sistem keuangan transparan dan terbuka untuk kemaslahatan bersama warga.
            </p>

            {/* Quick Actions */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onOpenTxModal('masuk')}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#0B5D3F] shadow-sm hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>Catat Kas Masuk</span>
              </button>

              <button
                onClick={() => onOpenTxModal('keluar')}
                className="flex items-center gap-2 rounded-xl bg-emerald-800/80 px-4 py-2.5 text-xs font-bold text-white border border-emerald-600/50 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={16} strokeWidth={2.5} />
                <span>Catat Kas Keluar</span>
              </button>

              <button
                onClick={onOpenWargaModal}
                className="flex items-center gap-2 rounded-xl bg-emerald-900/60 px-4 py-2.5 text-xs font-bold text-emerald-200 border border-emerald-700/40 hover:bg-emerald-800/80 active:scale-95 transition-all cursor-pointer"
              >
                <Users size={16} />
                <span>+ Warga (Scan KK)</span>
              </button>

              <button
                onClick={() => onOpenPengumumanModal ? onOpenPengumumanModal() : onNavigate('pengumuman')}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-900 shadow-sm hover:bg-amber-300 active:scale-95 transition-all cursor-pointer"
              >
                <Megaphone size={16} />
                <span>+ Buat Pengumuman & WA</span>
              </button>

              {onOpenSaldoAwalModal && (
                <button
                  onClick={onOpenSaldoAwalModal}
                  className="flex items-center gap-2 rounded-xl bg-emerald-950/70 px-4 py-2.5 text-xs font-bold text-emerald-200 border border-emerald-600/40 hover:bg-emerald-900 active:scale-95 transition-all cursor-pointer"
                  title="Pencatatan sisa kas terdahulu yang belum dimasukkan ke aplikasi"
                >
                  <History size={16} />
                  <span>+ Kas Masa Lalu</span>
                </button>
              )}
            </div>
          </div>

          {/* Village Artwork Miniature */}
          <div className="hidden lg:block w-[180px] h-[100px] shrink-0 rounded-2xl overflow-hidden shadow-md border-2 border-emerald-400/30">
            <GreetingVillageIllustration className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Main Financial Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Kas RT (Dominant Card) */}
        <div 
          onClick={() => onNavigate('kas-warga')}
          className="lg:col-span-2 group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B5D3F] to-[#06422C] p-6 text-white shadow-md hover:shadow-xl transition-all cursor-pointer border border-emerald-800"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-emerald-200 uppercase">
              Total Kas RT 08 RW 05
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 group-hover:translate-x-1 transition-transform">
              <ChevronRight size={16} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs shadow-inner">
              <Wallet size={30} className="text-emerald-100" />
            </div>
            <div>
              <div className="text-3xl font-extrabold tracking-tight text-white">
                {formatRupiah(saldoKas)}
              </div>
              <p className="mt-0.5 text-xs text-emerald-200/90 font-medium">
                {saldoKas === 0 ? 'Belum ada transaksi — Kas masih kosong' : 'Saldo Kas Bersih Saat Ini'}
              </p>
            </div>
          </div>
        </div>

        {/* 1. Kas Masuk */}
        <div 
          onClick={() => onNavigate('kas-masuk')}
          className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Kas Masuk</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981] text-white">
              <ArrowUp size={16} strokeWidth={2.5} />
            </div>
          </div>
          <p className="mt-3 text-xl font-bold text-slate-900 truncate">
            {formatRupiah(totalMasuk)}
          </p>
          <span className="mt-1 block text-[11px] font-medium text-emerald-700">
            {totalMasuk === 0 ? 'Belum ada pemasukan' : 'Iuran & donasi warga'}
          </span>
        </div>

        {/* 2. Kas Keluar */}
        <div 
          onClick={() => onNavigate('kas-keluar')}
          className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Kas Keluar</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EF4444] text-white">
              <ArrowDown size={16} strokeWidth={2.5} />
            </div>
          </div>
          <p className="mt-3 text-xl font-bold text-slate-900 truncate">
            {formatRupiah(totalKeluar)}
          </p>
          <span className="mt-1 block text-[11px] font-medium text-rose-600">
            {totalKeluar === 0 ? 'Belum ada pengeluaran' : 'Kegiatan RT & operasional'}
          </span>
        </div>

        {/* 3. Kas Kematian */}
        <div 
          onClick={() => onNavigate('kas-kematian')}
          className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Kas Kematian</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F43F5E] text-white">
              <Heart size={16} fill="currentColor" />
            </div>
          </div>
          <p className="mt-3 text-xl font-bold text-slate-900 truncate">
            {formatRupiah(totalKematian)}
          </p>
          <span className="mt-1 block text-[11px] font-medium text-rose-600">
            {totalKematian === 0 ? 'Belum ada data duka' : 'Santunan keluarga duka'}
          </span>
        </div>
      </div>

      {/* Status Pembayaran Iuran & Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Iuran Warga */}
        <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F5EE] text-[#0B5D3F]">
                <CalendarCheck size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Status Pembayaran Iuran Warga</h3>
                <p className="text-xs text-slate-500">Periode Kas RT 08 RW 05 Desa Kotayasa</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('status-iuran')}
              className="text-xs font-bold text-[#0B5D3F] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Lihat Detail</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Warga */}
            <div 
              onClick={() => onNavigate('data-warga')}
              className="rounded-2xl bg-slate-50 p-4 border border-slate-200/70 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B5D3F] text-white">
                  <Users size={18} />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Jumlah Warga</span>
                  <p className="text-base font-extrabold text-slate-900">{totalKK} KK</p>
                </div>
              </div>
            </div>

            {/* Sudah Bayar */}
            <div className="rounded-2xl bg-[#E8F5EE] p-4 border border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981] text-white">
                  <Check size={18} strokeWidth={3} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-950">Sudah Bayar</span>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-base font-extrabold text-[#0B5D3F]">{sudahBayarCount} KK</p>
                    <span className="text-xs font-bold text-emerald-700">({persenSudah}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Belum Bayar */}
            <div className="rounded-2xl bg-[#FFF4ED] p-4 border border-orange-200">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316] text-white">
                  <Clock size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-orange-950">Belum Bayar</span>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-base font-extrabold text-orange-700">{belumBayarCount} KK</p>
                    <span className="text-xs font-bold text-orange-600">({persenBelum}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
              <span>Kelengkapan Iuran Bulan Ini</span>
              <span>{persenSudah}% Tercapai</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#10B981] transition-all duration-500"
                style={{ width: `${persenSudah}%` }}
              />
            </div>
          </div>
        </div>

        {/* Motivational Card */}
        <div className="rounded-3xl bg-gradient-to-b from-[#E8F5EE] to-[#DCEDE5] p-6 border border-emerald-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B5D3F] uppercase tracking-wider mb-2">
              <LeafIcon size={16} />
              <span>Amanah & Kebersamaan</span>
            </div>
            <blockquote className="text-sm font-medium text-slate-800 italic leading-relaxed">
              &ldquo;Setiap rupiah yang dikelola dengan baik, akan kembali menjadi manfaat untuk kita semua.&rdquo;
            </blockquote>
          </div>

          <div className="mt-4 pt-4 border-t border-emerald-900/10 flex items-center justify-between text-xs text-[#0B5D3F] font-semibold">
            <span>RT 08 RW 05 Desa Kotayasa</span>
            <span className="italic">Kec. Sumbang</span>
          </div>
        </div>
      </div>

      {/* 8 MENU UTAMA (Direct Access Section) */}
      <div className="rounded-3xl bg-white p-6 lg:p-8 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Menu Layanan Utama
            </h2>
            <p className="text-xs text-slate-500">
              Akses cepat ke 8 modul pengelolaan kas dan administrasi RT
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#0B5D3F] border border-emerald-200">
            8 Modul Siap Digunakan
          </span>
        </div>

        {/* Grid of 8 Menu Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {menuItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group relative flex flex-col justify-between rounded-2xl bg-slate-50 p-5 border border-slate-200/80 hover:bg-white hover:border-emerald-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-xs transition-transform group-hover:scale-105 ${item.color}`}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#0B5D3F]">
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B5D3F] transition-colors">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-snug">
                  {item.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-[#0B5D3F] opacity-80 group-hover:opacity-100">
                <span>Buka Menu</span>
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Transaksi Terakhir & Fitur Unggulan Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List */}
        <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Arus Transaksi Terkini</h3>
              <p className="text-xs text-slate-500">Catatan mutasi pemasukan dan pengeluaran kas</p>
            </div>
            <button
              onClick={() => onNavigate('kas-warga')}
              className="text-xs font-bold text-[#0B5D3F] hover:underline cursor-pointer"
            >
              Lihat Semua
            </button>
          </div>

          {transactions.length === 0 ? (
            /* Empty State as requested: Belum ada transaksi */
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-[#FBFDFB] px-4 py-10 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F5EE] text-[#0B5D3F]">
                <Inbox size={26} strokeWidth={1.75} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Belum ada transaksi</h4>
              <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
                Data kas warga saat ini masih kosong (Rp 0). Transaksi kas masuk dan kas keluar akan otomatis tercatat di sini setelah Anda melakukan input data.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => onOpenTxModal('masuk')}
                  className="rounded-xl bg-[#0B5D3F] px-4 py-2 text-xs font-bold text-white hover:bg-[#084831] transition-all cursor-pointer"
                >
                  + Tambah Transaksi Pertama
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
                        tx.tipe === 'masuk'
                          ? 'bg-[#10B981]'
                          : tx.tipe === 'keluar'
                          ? 'bg-[#EF4444]'
                          : 'bg-[#F43F5E]'
                      }`}
                    >
                      {tx.tipe === 'masuk' && <ArrowUp size={18} strokeWidth={2.5} />}
                      {tx.tipe === 'keluar' && <ArrowDown size={18} strokeWidth={2.5} />}
                      {tx.tipe === 'kematian' && <Heart size={18} fill="currentColor" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{tx.keterangan}</h4>
                      <p className="text-[11px] text-slate-400">
                        {tx.tanggal} {tx.namaWarga ? `• ${tx.namaWarga}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-bold ${
                        tx.tipe === 'masuk' ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {tx.tipe === 'masuk' ? '+' : '-'} {formatRupiah(tx.nominal)}
                    </p>
                    <span className="text-[10px] text-slate-400 capitalize">{tx.kategori}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Fitur Unggulan (Direct In-Screen Component) */}
        <div className="rounded-3xl bg-gradient-to-b from-[#F3F9F5] via-[#EAF4EE] to-[#E3EFE8] p-6 border border-emerald-900/10 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-emerald-900/10">
              <h3 className="font-script text-2xl font-bold text-[#0B5D3F]">
                Fitur Unggulan
              </h3>
              <LeafIcon size={20} className="text-[#0B5D3F]" />
            </div>

            <div className="mt-4 space-y-3">
              {[
                { title: 'Kas Warga', desc: 'Melihat total kas RT', color: 'bg-[#0B5D3F]' },
                { title: 'Kas Masuk', desc: 'Rekap pemasukan', color: 'bg-[#10B981]' },
                { title: 'Kas Keluar', desc: 'Rekap pengeluaran', color: 'bg-[#EF4444]' },
                { title: 'Kas Kematian', desc: 'Data dana kematian', color: 'bg-[#F43F5E]' },
                { title: 'Status Iuran', desc: 'Sudah / belum bayar', color: 'bg-[#059669]' },
                { title: 'Data Warga', desc: 'Daftar seluruh warga', color: 'bg-[#0D9488]' },
                { title: 'Laporan', desc: 'Rekapitulasi lengkap', color: 'bg-[#0284C7]' },
                { title: 'Pengaturan', desc: 'Kelola aplikasi', color: 'bg-[#334155]' },
              ].map((feat, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${feat.color}`} />
                  <div>
                    <span className="text-xs font-bold text-slate-800">{feat.title}</span>
                    <span className="text-[11px] text-slate-500 ml-1.5">— {feat.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-emerald-900/10 text-center font-script text-xl font-bold text-[#0B5D3F]">
            <p>Transparan — Mudah Diakses — Untuk Semua Warga</p>
          </div>
        </div>
      </div>
    </div>
  );
};
