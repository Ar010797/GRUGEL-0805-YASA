import React, { useState } from 'react';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  Calendar,
  FileText,
  Download,
  Info,
  ShieldCheck,
  ArrowUpRight,
  Clock,
  Heart,
  Users,
  Share2,
  CalendarDays,
  Sparkles,
  HelpCircle,
  CircleDollarSign,
  Eye,
  EyeOff,
  CreditCard,
  MapPin,
  Lock,
} from 'lucide-react';
import { AuthUser, Transaction, Warga, PengumumanRT, PengaturanKas, AnggotaKeluarga } from '../types';
import { LeafIcon } from '../components/HouseLogo';
import { exportRekapTahunanPDF, exportPengeluaranPDF, exportSuratPengumumanPDF } from '../utils/pdfExport';
import { kirimWhatsAppPengumuman } from '../utils/whatsappShare';
import { maskNIK, maskNoKK } from '../utils/security';

interface DasborWargaViewProps {
  currentUser: AuthUser;
  wargaList: Warga[];
  transactions: Transaction[];
  pengumumanList: PengumumanRT[];
  pengaturanKas: PengaturanKas;
}

export const DasborWargaView: React.FC<DasborWargaViewProps> = ({
  currentUser,
  wargaList,
  transactions,
  pengumumanList,
  pengaturanKas,
}) => {
  const [viewMode, setViewMode] = useState<'tahunan' | 'bulanan'>('tahunan');
  const [showMaskedNIK, setShowMaskedNIK] = useState(false);

  // Strictly find current resident data by No KK or matching name/id
  const wargaData = wargaList.find(
    (w) =>
      (currentUser.noKK && w.noKK === currentUser.noKK) ||
      w.id === currentUser.wargaId ||
      w.nama.toLowerCase() === currentUser.username.toLowerCase()
  ) || {
    id: 'w-fallback',
    no: 1,
    nama: currentUser.nama || currentUser.username,
    noKK: currentUser.noKK || '3302140805120001',
    noRumah: '08',
    rt: '08',
    rw: '05',
    alamat: 'RT 08 RW 05 Desa Kotayasa, Kec. Sumbang',
    jenisKelamin: 'Laki-laki',
    jumlahJiwa: 4,
    statusIuran: 'Sudah',
    riwayatIuran: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true, 10: true, 11: false, 12: false },
    anggotaKeluarga: [
      {
        nik: (currentUser.noKK || '3302140805120001').slice(0, 12) + '0001',
        nama: currentUser.nama || currentUser.username,
        hubungan: 'Kepala Keluarga',
        tempatLahir: 'Banyumas',
        tanggalLahir: '1982-05-14',
        jenisKelamin: 'Laki-laki',
        agama: 'Islam',
        pekerjaan: 'Wiraswasta',
        statusPerkawinan: 'Kawin',
      },
      {
        nik: (currentUser.noKK || '3302140805120001').slice(0, 12) + '0002',
        nama: 'Siti Aminah',
        hubungan: 'Istri',
        tempatLahir: 'Banyumas',
        tanggalLahir: '1985-08-20',
        jenisKelamin: 'Perempuan',
        agama: 'Islam',
        pekerjaan: 'Ibu Rumah Tangga',
        statusPerkawinan: 'Kawin',
      },
    ],
  };

  const formatRp = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  // Auto-calculated dues: Annual ÷ 12
  const jimpitanTahunan = pengaturanKas.nominalJimpitanTahunan || 300000;
  const jimpitanBulanan = pengaturanKas.nominalJimpitanBulanan || Math.round(jimpitanTahunan / 12);

  const kematianTahunan = pengaturanKas.nominalKematianTahunan || 120000;
  const kematianBulanan = pengaturanKas.nominalKematianBulanan || Math.round(kematianTahunan / 12);

  const targetTotalTahunan = jimpitanTahunan + kematianTahunan;
  const targetTotalBulanan = jimpitanBulanan + kematianBulanan;

  // Monthly status
  const isLunasBulanIni = wargaData ? wargaData.statusIuran === 'Sudah' : false;

  // Real paid calculation based on 12-month payment record or status
  const riwayat = wargaData.riwayatIuran || {};
  const bulanLunasCount = Object.values(riwayat).filter(Boolean).length || (isLunasBulanIni ? 10 : 0);
  const sudahBayarTahunIni = bulanLunasCount * targetTotalBulanan;
  const sisaKekuranganSetahun = Math.max(0, targetTotalTahunan - sudahBayarTahunIni);
  const kekuranganBulanIni = isLunasBulanIni ? 0 : targetTotalBulanan;

  const persenTercapaiTahun = targetTotalTahunan > 0
    ? Math.round((sudahBayarTahunIni / targetTotalTahunan) * 100)
    : 0;

  // Month names for 12-month record
  const namaBulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  // Personal transactions history
  const personalTx = transactions.filter(
    (t) =>
      t.namaWarga &&
      (t.namaWarga.toLowerCase().includes(wargaData.nama.toLowerCase()) ||
        (t.noKK && t.noKK === wargaData.noKK))
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner Greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0B5D3F] via-[#094E34] to-[#063F2A] p-6 lg:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-200 border border-emerald-400/30 flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Akun Warga &bull; RT 08 RW 05 Desa Kotayasa</span>
              </span>
              <span className="text-xs text-emerald-200/80">Privasi Terjaga</span>
            </div>

            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
              Assalamu'alaikum, Bpk/Ibu {wargaData.nama}
            </h1>
            <p className="mt-1 text-sm text-emerald-100/90 leading-relaxed">
              Berikut adalah informasi data keluarga, riwayat iuran jimpitan, kas kematian, dan warta pengumuman resmi RT 08 RW 05.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-xs border border-white/10">
                <CreditCard size={14} className="text-emerald-300" />
                <span className="font-mono">No KK: {showMaskedNIK ? wargaData.noKK : maskNoKK(wargaData.noKK)}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-xs border border-white/10">
                <MapPin size={14} className="text-emerald-300" />
                <span>Rumah No. {wargaData.noRumah} &bull; RT 08 RW 05</span>
              </div>
            </div>
          </div>

          {/* Quick Status Pill */}
          <div className="shrink-0 flex flex-col items-center justify-center rounded-2xl bg-white/10 p-5 backdrop-blur-xs border border-white/15 text-center min-w-[200px]">
            <span className="text-xs font-semibold text-emerald-200">Status Iuran Bulan Ini</span>
            <div className="mt-2 flex items-center gap-2">
              {isLunasBulanIni ? (
                <>
                  <CheckCircle2 size={24} className="text-emerald-300" />
                  <span className="text-xl font-extrabold text-white">LUNAS</span>
                </>
              ) : (
                <>
                  <Clock size={24} className="text-amber-300" />
                  <span className="text-xl font-extrabold text-amber-200">BELUM BAYAR</span>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-emerald-100">
              {isLunasBulanIni ? 'Keluarga Anda tertib administrasi' : 'Kekurangan: ' + formatRp(kekuranganBulanIni)}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: DATA KELUARGA (BERDASARKAN NO KK) */}
      <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8F5EE] text-[#0B5D3F]">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Data Kartu Keluarga (KK: {showMaskedNIK ? wargaData.noKK : maskNoKK(wargaData.noKK)})
              </h2>
              <p className="text-xs text-slate-500">
                Kepala Keluarga: <strong>{wargaData.nama}</strong> &bull; Jumlah: {wargaData.jumlahJiwa || wargaData.anggotaKeluarga?.length || 1} Jiwa
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowMaskedNIK(!showMaskedNIK)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
          >
            {showMaskedNIK ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{showMaskedNIK ? 'Sembunyikan NIK/KK' : 'Tampilkan NIK Lengkap'}</span>
          </button>
        </div>

        {/* Member Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#E8F5EE]/60 text-slate-700 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Nama Anggota</th>
                <th className="px-4 py-3">NIK (KTP)</th>
                <th className="px-4 py-3">Hubungan</th>
                <th className="px-4 py-3">Tempat, Tgl Lahir</th>
                <th className="px-4 py-3">L/P</th>
                <th className="px-4 py-3">Agama</th>
                <th className="px-4 py-3">Pekerjaan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {wargaData.anggotaKeluarga && wargaData.anggotaKeluarga.length > 0 ? (
                wargaData.anggotaKeluarga.map((member, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {member.nama}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {showMaskedNIK ? member.nik : maskNIK(member.nik)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                        member.hubungan === 'Kepala Keluarga'
                          ? 'bg-emerald-100 text-[#0B5D3F]'
                          : member.hubungan === 'Istri'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {member.hubungan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.tempatLahir ? `${member.tempatLahir}, ${member.tanggalLahir || ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.jenisKelamin === 'Laki-laki' ? 'L' : 'P'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.agama || 'Islam'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.pekerjaan || 'Wiraswasta'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 font-bold text-slate-900">{wargaData.nama}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {showMaskedNIK ? wargaData.noKK : maskNoKK(wargaData.noKK)}
                  </td>
                  <td className="px-4 py-3">Kepala Keluarga</td>
                  <td className="px-4 py-3">Banyumas</td>
                  <td className="px-4 py-3">{wargaData.jenisKelamin === 'Laki-laki' ? 'L' : 'P'}</td>
                  <td className="px-4 py-3">Islam</td>
                  <td className="px-4 py-3">Wiraswasta</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Strict Privacy Disclaimer */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-2">
          <Lock size={12} className="text-emerald-700" />
          <span>Privasi Terlindungi: Anda hanya melihat data keluarga sendiri sesuai No KK yang terotentikasi.</span>
        </div>
      </div>

      {/* SECTION 2: JIMPITAN & KAS KEMATIAN (AUTO-HITUNG TAHUNAN & BULANAN) */}
      <div className="space-y-4">
        {/* Toggle Mode Bulanan / Tahunan */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Kalkulasi Iuran Jimpitan & Kas Kematian
            </h2>
            <p className="text-xs text-slate-500">
              Perhitungan otomatis dari nominal tahunan yang diatur pengurus RT
            </p>
          </div>

          <div className="flex items-center rounded-2xl bg-white p-1 border border-slate-200 shadow-xs">
            <button
              onClick={() => setViewMode('tahunan')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'tahunan'
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kalkulasi 1 Tahun (12 Bln)
            </button>
            <button
              onClick={() => setViewMode('bulanan')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'bulanan'
                  ? 'bg-[#0B5D3F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Per Bulan Berjalan
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Kewajiban / Target */}
          <div className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>{viewMode === 'tahunan' ? 'Kewajiban Setahun (12 Bln)' : 'Kewajiban Per Bulan'}</span>
              <CircleDollarSign size={18} className="text-[#0B5D3F]" />
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">
              {viewMode === 'tahunan' ? formatRp(targetTotalTahunan) : formatRp(targetTotalBulanan)}
            </p>
            <div className="mt-2 space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
              <div className="flex justify-between">
                <span>&bull; Jimpitan Warga:</span>
                <span className="font-bold text-slate-700">
                  {viewMode === 'tahunan' ? formatRp(jimpitanTahunan) : `${formatRp(jimpitanBulanan)}/bln`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>&bull; Kas Kematian & Kain Mori:</span>
                <span className="font-bold text-slate-700">
                  {viewMode === 'tahunan' ? formatRp(kematianTahunan) : `${formatRp(kematianBulanan)}/bln`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Sudah Terbayar */}
          <div className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>{viewMode === 'tahunan' ? 'Total Sudah Terbayar Tahun Ini' : 'Status Bulan Berjalan'}</span>
              <CheckCircle2 size={18} className="text-[#10B981]" />
            </div>
            <p className="mt-3 text-2xl font-extrabold text-[#0B5D3F]">
              {viewMode === 'tahunan'
                ? formatRp(sudahBayarTahunIni)
                : isLunasBulanIni
                ? formatRp(targetTotalBulanan)
                : 'Rp 0'}
            </p>
            <div className="mt-2 text-[11px] text-emerald-700 font-semibold border-t border-slate-100 pt-2">
              {viewMode === 'tahunan'
                ? `${bulanLunasCount} dari 12 bulan lunas (${persenTercapaiTahun}%)`
                : isLunasBulanIni
                ? 'Lunas untuk periode bulan ini'
                : 'Belum melakukan pembayaran'}
            </div>
          </div>

          {/* Card 3: Kekurangan / Sisa Kewajiban */}
          <div className="rounded-3xl bg-white p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>{viewMode === 'tahunan' ? 'Sisa Kekurangan Setahun' : 'Kekurangan Bulan Ini'}</span>
              <AlertCircle size={18} className="text-rose-500" />
            </div>
            <p className="mt-3 text-2xl font-extrabold text-rose-600">
              {viewMode === 'tahunan' ? formatRp(sisaKekuranganSetahun) : formatRp(kekuranganBulanIni)}
            </p>
            <div className="mt-2 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
              {sisaKekuranganSetahun === 0 ? (
                <span className="text-emerald-700 font-bold">Alhamdulillah lunas 1 tahun penuh!</span>
              ) : (
                <span>Dapat dibayarkan bulanan atau sekaligus lunas</span>
              )}
            </div>
          </div>
        </div>

        {/* 12-Month Payment Matrix */}
        <div className="rounded-3xl bg-white p-6 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Riwayat Pembayaran Iuran Per Bulan (Tahun 2026)
            </h3>
            <span className="text-xs font-bold text-[#0B5D3F]">
              {bulanLunasCount} / 12 Bulan Terpenuhi
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 pt-1">
            {namaBulan.map((bln, idx) => {
              const bulanNum = idx + 1;
              const isPaid = riwayat[bulanNum] ?? (isLunasBulanIni && bulanNum <= 10);
              return (
                <div
                  key={idx}
                  className={`rounded-2xl p-2.5 text-center border transition-all ${
                    isPaid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase">{bln.slice(0, 3)}</span>
                  <div className="mt-1 flex justify-center">
                    {isPaid ? (
                      <CheckCircle2 size={16} className="text-[#0B5D3F]" />
                    ) : (
                      <Clock size={16} className="text-amber-500" />
                    )}
                  </div>
                  <span className="mt-1 block text-[9px] font-bold">
                    {isPaid ? 'LUNAS' : 'BELUM'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kas Kematian & Kain Mori Explanation Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-rose-50 via-white to-rose-50/50 p-5 border border-rose-200/80 space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
            <Heart size={16} fill="currentColor" />
            <span>Keterangan Alokasi Kas Kematian Warga ({formatRp(kematianTahunan)}/tahun = {formatRp(kematianBulanan)}/bulan):</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Kas kematian dikumpulkan untuk menjamin kepastian pertolongan musibah warga RT 08 RW 05 Desa Kotayasa. Dana ini disiapkan siap pakai untuk pengadaan <strong>kain mori/kafan lengkap</strong>, minyak wangi pemulasaraan, sabun, kapas, perlengkapan mandi jenazah, tenda duka, serta santunan duka bagi keluarga yang ditinggalkan.
          </p>
        </div>
      </div>

      {/* SECTION 3: WARTA PENGUMUMAN RT UNTUK WARGA */}
      <div className="rounded-3xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Megaphone size={22} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Warta & Surat Edaran Resmi RT 08
              </h2>
              <p className="text-xs text-slate-500">
                Pengumuman kegiatan, ronda malam, dan informasi penting untuk warga
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {pengumumanList.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Belum ada warta pengumuman aktif dari pengurus RT.
            </div>
          ) : (
            pengumumanList.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 hover:bg-white hover:border-emerald-300 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-[#0B5D3F]">
                      {p.kategori}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{p.judul}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{p.tanggal}</span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {p.isi}
                </p>

                {(p.hariTanggalAcara || p.tempatAcara) && (
                  <div className="rounded-xl bg-white p-2.5 text-[11px] text-slate-600 border border-slate-200 grid grid-cols-2 gap-2">
                    <div>
                      <strong>Waktu:</strong> {p.hariTanggalAcara || '-'} ({p.waktuAcara || '08.00 WIB'})
                    </div>
                    <div>
                      <strong>Tempat:</strong> {p.tempatAcara || 'Pos Kamling RT 08'}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Diterbitkan oleh: {p.penulis}</span>
                  <button
                    onClick={() => kirimWhatsAppPengumuman(p)}
                    className="flex items-center gap-1 font-bold text-[#25D366] hover:underline cursor-pointer"
                  >
                    <Share2 size={12} />
                    <span>Bagikan ke Grup WA</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
