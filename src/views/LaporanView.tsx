import React from 'react';
import { ArrowLeft, FileText, Download, Printer, ShieldCheck, CheckCircle2, ArrowDown, Users } from 'lucide-react';
import { Transaction, Warga, BantuanPemerintah } from '../types';
import { exportRekapTahunanPDF, exportPengeluaranPDF, exportDataWargaPerKK_PDF } from '../utils/pdfExport';

interface LaporanViewProps {
  transactions: Transaction[];
  wargaList: Warga[];
  bantuanList?: BantuanPemerintah[];
  onBack: () => void;
}

export const LaporanView: React.FC<LaporanViewProps> = ({
  transactions,
  wargaList,
  bantuanList = [],
  onBack,
}) => {
  const totalMasuk = transactions
    .filter((t) => t.tipe === 'masuk')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKeluar = transactions
    .filter((t) => t.tipe === 'keluar')
    .reduce((acc, t) => acc + t.nominal, 0);

  const totalKematian = transactions
    .filter((t) => t.tipe === 'kematian')
    .reduce((acc, t) => acc + t.nominal, 0);

  const saldoAkhir = totalMasuk - totalKeluar;

  const totalKK = wargaList.length;
  const sudahBayar = wargaList.filter((w) => w.statusIuran === 'Sudah').length;
  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Laporan Kas & Rekapitulasi</h1>
            <p className="text-xs text-slate-500">Transparansi Keuangan RT 08 RW 05 Desa Kotayasa</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Download Rekap Tahunan PDF */}
          <button
            onClick={() => exportRekapTahunanPDF(transactions, wargaList, '2026')}
            className="flex items-center gap-1.5 rounded-xl bg-[#0B5D3F] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#084831] transition-all cursor-pointer"
            title="Download Dokumen PDF Rekapitulasi Tahunan Lengkap"
          >
            <Download size={14} />
            <span>PDF Rekap Tahunan</span>
          </button>

          {/* Download PDF Data Warga Per KK & Bansos */}
          <button
            onClick={() => exportDataWargaPerKK_PDF(wargaList, bantuanList)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition-all cursor-pointer"
            title="Download Dokumen PDF Data Seluruh Warga Per Kartu Keluarga Lengkap dengan Bantuan Sosial"
          >
            <Users size={14} />
            <span>PDF Data Warga Per-KK</span>
          </button>

          {/* Download Rekap Pengeluaran PDF */}
          <button
            onClick={() => exportPengeluaranPDF(transactions, '2026')}
            className="flex items-center gap-1.5 rounded-xl bg-[#EF4444] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#DC2626] transition-all cursor-pointer"
            title="Download Dokumen PDF Khusus Pengeluaran Kas"
          >
            <Download size={14} />
            <span>PDF Pengeluaran</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Printer size={15} />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* Official Report Card */}
      <div className="rounded-3xl bg-white p-8 shadow-xs border border-slate-200/80 space-y-6">
        {/* Header Instansi */}
        <div className="border-b-2 border-[#0B5D3F] pb-4 text-center">
          <h2 className="text-lg font-black tracking-wider text-slate-900 uppercase">
            RUKUN TETANGGA 08 RUKUN WARGA 05
          </h2>
          <h3 className="text-base font-bold text-[#0B5D3F]">
            DESA KOTAYASA, KECAMATAN SUMBANG, KABUPATEN BANYUMAS
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Laporan Rekapitulasi Kas Warga Periode Aktif 2026
          </p>
        </div>

        {/* Ringkasan Saldo Eksekutif */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Pemasukan</span>
            <p className="text-lg font-extrabold text-emerald-700 mt-1">{formatRupiah(totalMasuk)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Pengeluaran</span>
            <p className="text-lg font-extrabold text-rose-600 mt-1">{formatRupiah(totalKeluar)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Kas Kematian</span>
            <p className="text-lg font-extrabold text-pink-600 mt-1">{formatRupiah(totalKematian)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#E8F5EE] border border-emerald-300">
            <span className="text-[11px] font-bold text-[#0B5D3F] uppercase">Saldo Kas Akhir</span>
            <p className="text-xl font-black text-[#0B5D3F] mt-1">{formatRupiah(saldoAkhir)}</p>
          </div>
        </div>

        {/* Status Iuran */}
        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
            Status Partisipasi Iuran Warga
          </h4>
          <div className="flex flex-wrap gap-6 text-xs text-slate-600">
            <div>Jumlah KK Terdaftar: <strong>{totalKK} KK</strong></div>
            <div>Sudah Membayar: <strong className="text-emerald-700">{sudahBayar} KK</strong></div>
            <div>Belum Membayar: <strong className="text-orange-600">{totalKK - sudahBayar} KK</strong></div>
            <div>Persentase Kepatuhan: <strong>{totalKK > 0 ? Math.round((sudahBayar / totalKK) * 100) : 0}%</strong></div>
          </div>
        </div>

        {/* Rincian Transaksi */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 border-b border-slate-200">
            Daftar Catatan Mutasi Kas RT
          </div>
          {transactions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Belum ada transaksi (Data kas masih kosong).
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Tanggal</th>
                  <th className="py-2.5 px-4">Keterangan</th>
                  <th className="py-2.5 px-4">Warga / Pihak</th>
                  <th className="py-2.5 px-4">Tipe</th>
                  <th className="py-2.5 px-4 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 px-4 text-slate-500">{t.tanggal}</td>
                    <td className="py-2 px-4 font-bold text-slate-800">{t.keterangan}</td>
                    <td className="py-2 px-4 text-slate-600">{t.namaWarga || '—'}</td>
                    <td className="py-2 px-4 capitalize">{t.tipe}</td>
                    <td className="py-2 px-4 text-right font-bold">
                      <span className={t.tipe === 'masuk' ? 'text-emerald-700' : 'text-rose-600'}>
                        {t.tipe === 'masuk' ? '+' : '-'} {formatRupiah(t.nominal)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tanda Tangan Pengurus */}
        <div className="pt-6 grid grid-cols-2 text-center text-xs text-slate-700">
          <div>
            <p>Mengetahui,</p>
            <p className="font-bold text-slate-900 mt-1">Ketua RT 08 RW 05</p>
            <div className="h-14 flex items-center justify-center">
              <span className="text-slate-300 italic">(Tanda Tangan)</span>
            </div>
            <p className="font-bold border-t border-slate-300 inline-block px-8 pt-1">
              Bapak Suwardi
            </p>
          </div>

          <div>
            <p>Kotayasa, 2026</p>
            <p className="font-bold text-slate-900 mt-1">Bendahara RT 08</p>
            <div className="h-14 flex items-center justify-center">
              <span className="text-slate-300 italic">(Tanda Tangan)</span>
            </div>
            <p className="font-bold border-t border-slate-300 inline-block px-8 pt-1">
              Bapak Bambang S.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
