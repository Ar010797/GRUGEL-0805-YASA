import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, X, Shield, FileText, DollarSign, Users, Building2 } from 'lucide-react';
import { PembaruanBulananRT, Warga, Transaction, BantuanPemerintah } from '../types';

interface KirimLaporanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKirim: (laporan: PembaruanBulananRT) => void;
  adminName: string;
  rtScope: string;
  wargaList: Warga[];
  transaksiList: Transaction[];
  bantuanList: BantuanPemerintah[];
  saldoKasUmum: number;
  saldoKasKematian: number;
  tahunAktif: number;
  rw?: string;
  desa?: string;
}

export const KirimLaporanModal: React.FC<KirimLaporanModalProps> = ({
  isOpen,
  onClose,
  onKirim,
  adminName,
  rtScope,
  wargaList,
  transaksiList,
  bantuanList,
  saldoKasUmum,
  saldoKasKematian,
  tahunAktif,
  rw,
  desa,
}) => {
  const rwNumber = rw?.trim() || rtScope.match(/RW\s*(\d+)/i)?.[1] || '05';
  const desaStr = desa?.trim() || 'Desa Kotayasa';
  const [catatan, setCatatan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const now = new Date();
  const currentMonthName = monthNames[now.getMonth()];
  const bulanTahun = `${currentMonthName} ${tahunAktif}`;

  // Filter warga in this RT if rtScope specified
  const rtNumber = rtScope.match(/\d+/)?.[0] || '08';
  const wargaInRT = wargaList.filter((w) => !w.rt || w.rt.includes(rtNumber) || rtScope.includes(w.rt));
  const activeWarga = wargaInRT.length > 0 ? wargaInRT : wargaList;

  const totalKK = activeWarga.length;
  const totalJiwa = activeWarga.reduce((acc, curr) => acc + (curr.jumlahJiwa || 1), 0);
  const totalLunas = activeWarga.filter((w) => w.statusIuran === 'Sudah').length;
  const totalBelumLunas = totalKK - totalLunas;

  // Monthly transactions
  const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
  const thisMonthTrans = transaksiList.filter((t) => {
    return t.tanggal && (t.tanggal.includes(`-${currentMonthStr}-`) || t.tanggal.startsWith(`${tahunAktif}-${currentMonthStr}`));
  });

  const kasMasukBulanIni = thisMonthTrans
    .filter((t) => t.tipe === 'masuk')
    .reduce((sum, t) => sum + t.nominal, 0);

  const kasKeluarBulanIni = thisMonthTrans
    .filter((t) => t.tipe === 'keluar')
    .reduce((sum, t) => sum + t.nominal, 0);

  const totalBansos = bantuanList.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const laporan: PembaruanBulananRT = {
      id: 'lap_' + Date.now(),
      rt: rtNumber,
      rw: rwNumber,
      namaAdminPengirim: adminName || `Admin RT ${rtNumber}`,
      tanggalKirim: new Date().toISOString(),
      bulanTahun: bulanTahun,
      tahun: tahunAktif,
      totalKK: totalKK,
      totalJiwa: totalJiwa,
      totalLunasIuran: totalLunas,
      totalBelumLunas: totalBelumLunas,
      totalKasMasukBulanIni: kasMasukBulanIni,
      totalKasKeluarBulanIni: kasKeluarBulanIni,
      saldoKasUmumBerjalan: saldoKasUmum,
      saldoKasKematianBerjalan: saldoKasKematian,
      totalPenerimaBansos: totalBansos,
      catatanKhusus: catatan.trim(),
      statusVerifikasi: 'Menunggu Verifikasi',
    };

    setTimeout(() => {
      onKirim(laporan);
      setIsSubmitting(false);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1800);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-emerald-950/10 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0B5D3F] via-[#0d6e4a] to-[#084831] px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-emerald-200">
              <Send size={22} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                Sinkronisasi Antar Tingkat
              </span>
              <h2 className="text-base font-extrabold tracking-tight">
                Kirim Laporan Bulanan ke Server Desa
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {isSuccess ? (
            <div className="py-10 text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-lg font-black text-slate-800">
                Laporan Berhasil Terkirim ke Server Desa!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Pembaruan data RT Anda untuk periode <strong>{bulanTahun}</strong> telah masuk ke antrean Server Pusat {desaStr} dan tersimpan permanen.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-2xl bg-emerald-50/80 p-4 border border-emerald-100 text-xs text-emerald-900 flex items-start gap-3">
                <Building2 size={20} className="shrink-0 text-[#0B5D3F] mt-0.5" />
                <div>
                  <p className="font-bold">Alur Pengiriman Data Terpadu:</p>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Data rekap dari <strong>{rtScope}</strong> akan otomatis dikompilasi ke dashboard Server Pusat {desaStr} untuk pengawasan dana kas dan monitoring bansos desa.
                  </p>
                </div>
              </div>

              {/* Ringkasan Data yang Dikirim */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-700">Periode Pelaporan</span>
                  <span className="text-xs font-black text-[#0B5D3F] px-2.5 py-0.5 rounded-full bg-emerald-100">
                    {bulanTahun}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">KEPENDUDUKAN</span>
                    <span className="font-extrabold text-slate-800">{totalKK} KK ({totalJiwa} Jiwa)</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">STATUS IURAN</span>
                    <span className="font-extrabold text-emerald-700">{totalLunas} Lunas</span> / <span className="text-rose-600 font-bold">{totalBelumLunas} Belum</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">SALDO KAS UMUM</span>
                    <span className="font-extrabold text-slate-800">Rp {saldoKasUmum.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-bold">SALDO KAS KEMATIAN</span>
                    <span className="font-extrabold text-slate-800">Rp {saldoKasKematian.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-xs flex justify-between items-center">
                  <span className="text-[11px] font-medium text-slate-500">Penerima Bantuan Terdata di RT:</span>
                  <span className="font-bold text-indigo-700">{totalBansos} Penerima</span>
                </div>
              </div>

              {/* Catatan Admin RT */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Catatan / Keterangan Khusus dari Admin RT (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Contoh: Saldo kas bertambah dari iuran warga, ada 2 usulan bansos baru yang butuh verifikasi kantor desa..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:border-[#0B5D3F] focus:ring-1 focus:ring-[#0B5D3F] outline-hidden font-medium"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-[#0B5D3F] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#084831] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{isSubmitting ? 'Mengirim Data...' : 'Kirim Pembaruan ke Server'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
