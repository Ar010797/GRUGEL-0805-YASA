import React from 'react';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  Calendar,
  FileText,
  Download,
  Info,
  ShieldAlert,
  ArrowUpRight,
  Clock,
  Heart,
  Users,
} from 'lucide-react';
import { AuthUser, Transaction, Warga, PengumumanRT } from '../types';
import { LeafIcon } from '../components/HouseLogo';
import { exportRekapTahunanPDF, exportPengeluaranPDF } from '../utils/pdfExport';

interface DasborWargaViewProps {
  currentUser: AuthUser;
  wargaList: Warga[];
  transactions: Transaction[];
  pengumumanList: PengumumanRT[];
}

export const DasborWargaView: React.FC<DasborWargaViewProps> = ({
  currentUser,
  wargaList,
  transactions,
  pengumumanList,
}) => {
  // Find current resident data
  const wargaData = wargaList.find(
    (w) =>
      w.id === currentUser.wargaId ||
      w.nama.toLowerCase() === currentUser.username.toLowerCase()
  );

  const formatRp = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  // Overall RT cash transparency stats
  const totalMasuk = transactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKeluar = transactions
    .filter((t) => t.tipe === 'keluar')
    .reduce((acc, t) => acc + t.nominal, 0);

  const saldoKasRT = totalMasuk - totalKeluar;

  // Personal status
  const isLunas = wargaData ? wargaData.statusIuran === 'Sudah' : false;
  // Standard monthly fee is Rp 20.000 iuran RT + Rp 10.000 iuran kematian = Rp 30.000 if belum bayar
  const kekuranganKas = isLunas ? 0 : 30000;

  // Personal transaction history for this resident
  const personalTx = transactions.filter(
    (t) =>
      t.namaWarga &&
      (t.namaWarga.toLowerCase().includes(currentUser.username.toLowerCase()) ||
        (wargaData && t.namaWarga.toLowerCase().includes(wargaData.nama.toLowerCase())))
  );

  return (
    <div className="space-y-6">
      {/* Banner Sapaan Warga */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0B5D3F] via-[#094E34] to-[#063F2A] p-6 lg:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-200 border border-emerald-400/30">
                Dasbor Akun Warga
              </span>
              <span className="text-xs text-emerald-200">• RT 08 RW 05 Desa Kotayasa</span>
            </div>

            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
              Assalamu'alaikum, {currentUser.nama}
            </h1>
            <p className="mt-1 text-sm text-emerald-100/90">
              {wargaData
                ? `Kepala Keluarga • No. Rumah ${wargaData.noRumah} • Jumlah Anggota: ${wargaData.jumlahJiwa} Jiwa`
                : 'Akun Warga RT 08 RW 05 Desa Kotayasa'}
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-black/20 p-2.5 text-xs text-emerald-100 border border-white/10 max-w-xl">
              <ShieldAlert size={16} className="text-emerald-300 shrink-0" />
              <span>
                <strong>Mode Tinjau Warga (Read-Only):</strong> Anda hanya dapat melihat informasi kekurangan kas pribadi dan pengumuman RT. Administrasi dikelola oleh Pengurus RT.
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <span className="text-xs text-emerald-200">Keterbukaan Saldo Kas RT</span>
            <div className="rounded-2xl bg-white/10 px-4 py-2 border border-white/15 text-left md:text-right">
              <span className="text-[10px] font-semibold text-emerald-300 uppercase block">Saldo Total RT 08</span>
              <p className="text-xl font-black text-white">{formatRp(saldoKasRT)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KARTU UTAMA: INFORMASI KEKURANGAN KAS AKUN PRIBADI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Tagihan Kas Warga */}
        <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${
                  isLunas ? 'bg-[#10B981]' : 'bg-[#F97316]'
                }`}
              >
                {isLunas ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Status Iuran Kas Akun Anda
                </h2>
                <p className="text-xs text-slate-500">
                  Periode Kas Aktif (Oktober 2026)
                </p>
              </div>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isLunas
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-orange-50 text-orange-700 border border-orange-200'
              }`}
            >
              {isLunas ? 'LUNAS' : 'BELUM LUNAS'}
            </span>
          </div>

          {/* Rincian Kekurangan */}
          {isLunas ? (
            <div className="rounded-2xl bg-[#E8F5EE] p-5 border border-emerald-200/80">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#10B981] text-white">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Kekurangan Kas Saat Ini
                  </span>
                  <p className="text-2xl font-black text-[#0B5D3F]">Rp 0 (Tidak Ada Tunggakan)</p>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Alhamdulillah, seluruh kewajiban iuran kas warga dan kas kematian bulan ini telah terbayar lunas.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#FFF4ED] p-5 border border-orange-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-orange-950 uppercase tracking-wider">
                    Total Kekurangan Kas yang Harus Dibayar
                  </span>
                  <p className="text-3xl font-black text-orange-700 mt-0.5">
                    {formatRp(kekuranganKas)}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316] text-white shadow-xs">
                  <Clock size={24} />
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-xl bg-white p-3 border border-orange-200 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-700">
                  <span>1. Iuran Kebersihan & Kas RT (Bulan Ini)</span>
                  <span className="font-bold text-slate-900">Rp 20.000</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>2. Iuran Kas Kematian & Sosial</span>
                  <span className="font-bold text-slate-900">Rp 10.000</span>
                </div>
                <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-orange-800">
                  <span>Total Kewajiban</span>
                  <span>Rp 30.000</span>
                </div>
              </div>

              <p className="text-[11px] text-orange-800 italic">
                * Pembayaran iuran dapat diserahkan langsung kepada Bendahara RT (Bapak Bambang S.) atau melalui koordinator gang masing-masing.
              </p>
            </div>
          )}

          {/* Histori Setoran Akun Warga */}
          <div className="pt-2">
            <h3 className="text-xs font-bold text-slate-800 mb-2">
              Histori Pembayaran Iuran Akun Ini:
            </h3>

            {personalTx.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 border border-slate-200">
                Belum ada histori catatan setoran iuran atas nama ini di buku kas RT.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden text-xs">
                {personalTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-white">
                    <div>
                      <span className="font-bold text-slate-800 block">{tx.keterangan}</span>
                      <span className="text-[10px] text-slate-400">{tx.tanggal}</span>
                    </div>
                    <span className="font-extrabold text-emerald-700">+{formatRp(tx.nominal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel Informasi & Pengesahan Download PDF Rekap */}
        <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText size={18} className="text-[#0B5D3F]" />
              <h3 className="text-sm font-bold text-slate-900">
                Download Laporan Transparansi
              </h3>
            </div>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Sebagai bentuk akuntabilitas, warga RT 08 RW 05 Desa Kotayasa dapat mengunduh dokumen resmi rekap tahunan dan rekap pengeluaran kas dalam format PDF.
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                onClick={() => exportRekapTahunanPDF(transactions, wargaList, '2026')}
                className="w-full flex items-center justify-between rounded-xl bg-[#E8F5EE] p-3 text-xs font-bold text-[#0B5D3F] border border-emerald-300 hover:bg-[#d8efe2] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download size={16} />
                  <span>Download Rekap Tahunan (.PDF)</span>
                </div>
                <ArrowUpRight size={14} />
              </button>

              <button
                onClick={() => exportPengeluaranPDF(transactions, '2026')}
                className="w-full flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download size={16} />
                  <span>Download Rekap Pengeluaran (.PDF)</span>
                </div>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#E8F5EE] p-4 text-center border border-emerald-200">
            <p className="text-xs font-medium text-[#0B5D3F] italic">
              &ldquo;Jaga Kekompakan — Jaga Keberkahan RT 08 RW 05&rdquo;
            </p>
            <div className="mt-1 flex items-center justify-center text-[#0B5D3F]">
              <LeafIcon size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* PAPAN INFORMASI & PENGUMUMAN DARI RT */}
      <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#0B5D3F]">
              <Megaphone size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Papan Informasi & Pengumuman RT
              </h2>
              <p className="text-xs text-slate-500">
                Warta kegiatan dan himbauan resmi Pengurus RT 08 RW 05 Desa Kotayasa
              </p>
            </div>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#0B5D3F] border border-emerald-200">
            {pengumumanList.length} Pengumuman
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pengumumanList.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl p-4 border flex flex-col justify-between transition-all hover:shadow-md ${
                item.penting
                  ? 'bg-amber-50/60 border-amber-300'
                  : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      item.kategori === 'Kegiatan'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.kategori === 'Iuran'
                        ? 'bg-blue-100 text-blue-800'
                        : item.kategori === 'Keamanan'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {item.kategori}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.tanggal}</span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  {item.judul}
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  {item.isi}
                </p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
                <span>Pengirim: <strong>{item.penulis}</strong></span>
                {item.penting && (
                  <span className="font-bold text-amber-700">★ Penting</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
