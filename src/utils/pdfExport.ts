import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, Warga, PengumumanRT, BantuanPemerintah } from '../types';

export const exportRekapTahunanPDF = (
  transactions: Transaction[],
  wargaList: Warga[],
  tahun: string = '2026'
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

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

  const formatRp = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  // Letterhead / Kop Surat
  doc.setFillColor(11, 93, 63); // Dark green #0B5D3F
  doc.rect(0, 0, 210, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 93, 63);
  doc.text('RUKUN TETANGGA 08 RUKUN WARGA 05', 105, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('DESA KOTAYASA, KECAMATAN SUMBANG, KABUPATEN BANYUMAS', 105, 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Sekretariat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183', 105, 31, { align: 'center' });

  doc.setDrawColor(11, 93, 63);
  doc.setLineWidth(1);
  doc.line(14, 34, 196, 34);
  doc.setLineWidth(0.3);
  doc.line(14, 35.5, 196, 35.5);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(`LAPORAN PERTANGGUNGJAWABAN REKAPITULASI KAS TAHUN ${tahun}`, 105, 43, { align: 'center' });

  // Summary Box
  doc.setFillColor(232, 245, 238); // #E8F5EE
  doc.roundedRect(14, 48, 182, 24, 3, 3, 'F');
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(14, 48, 182, 24, 3, 3, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 93, 63);
  doc.text('RINGKASAN POSISI KEUANGAN KAS RT:', 20, 54);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.text(`Total Pemasukan Kas: ${formatRp(totalMasuk)}`, 20, 60);
  doc.text(`Total Pengeluaran Kas: ${formatRp(totalKeluar)}`, 20, 66);
  doc.text(`Kas Kematian / Sosial: ${formatRp(totalKematian)}`, 110, 60);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 93, 63);
  doc.text(`SALDO KAS BERSIH: ${formatRp(saldoAkhir)}`, 110, 66);

  // Table of Transactions
  const tableData = transactions.length > 0
    ? transactions.map((t, index) => [
        (index + 1).toString(),
        t.tanggal,
        t.keterangan,
        t.namaWarga || '—',
        t.tipe === 'masuk' ? 'Kas Masuk' : t.tipe === 'keluar' ? 'Kas Keluar' : 'Kas Kematian',
        (t.tipe === 'masuk' ? '+' : '-') + formatRp(t.nominal),
      ])
    : [
        ['-', '-', 'Belum ada transaksi (Data Kas Masih Kosong)', '—', '—', 'Rp 0'],
      ];

  autoTable(doc, {
    startY: 76,
    head: [['No', 'Tanggal', 'Keterangan Transaksi', 'Pihak / Warga', 'Jenis', 'Nominal']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [11, 93, 63],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 68 },
      3: { cellWidth: 32 },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  // Status Iuran Note
  const sudahCount = wargaList.filter((w) => w.statusIuran === 'Sudah').length;
  const totalKK = wargaList.length;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(90, 90, 90);
  doc.text(
    `* Catatan Kependudukan: Terdaftar ${totalKK} KK (${sudahCount} KK telah lunas iuran, ${totalKK - sudahCount} KK belum bayar).`,
    14,
    finalY + 8
  );

  // Signatures
  const signY = finalY + 22 > 240 ? 245 : finalY + 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  doc.text('Mengetahui,', 40, signY, { align: 'center' });
  doc.text('Ketua RT 08 RW 05', 40, signY + 5, { align: 'center' });
  doc.text('( Bapak Suwardi )', 40, signY + 26, { align: 'center' });

  doc.text(`Kotayasa, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 160, signY, { align: 'center' });
  doc.text('Bendahara RT 08', 160, signY + 5, { align: 'center' });
  doc.text('( Bapak Bambang S. )', 160, signY + 26, { align: 'center' });

  // Save the PDF
  doc.save(`Rekap_Tahunan_Kas_RT08_RW05_Kotayasa_${tahun}.pdf`);
};

export const exportPengeluaranPDF = (
  transactions: Transaction[],
  tahun: string = '2026'
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const keluarList = transactions.filter((t) => t.tipe === 'keluar' || t.tipe === 'kematian');
  const totalKeluar = keluarList.reduce((acc, t) => acc + t.nominal, 0);

  const formatRp = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  // Letterhead
  doc.setFillColor(220, 38, 38); // Red
  doc.rect(0, 0, 210, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 93, 63);
  doc.text('RUKUN TETANGGA 08 RUKUN WARGA 05', 105, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(50, 50, 50);
  doc.text('DESA KOTAYASA, KECAMATAN SUMBANG, KABUPATEN BANYUMAS', 105, 26, { align: 'center' });

  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.8);
  doc.line(14, 32, 196, 32);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(`LAPORAN REKAPITULASI PENGELUARAN KAS RT (${tahun})`, 105, 40, { align: 'center' });

  // Summary Box
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(14, 45, 182, 16, 2, 2, 'F');
  doc.setDrawColor(239, 68, 68);
  doc.roundedRect(14, 45, 182, 16, 2, 2, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text(`TOTAL PENGELUARAN YANG TERCATAT: ${formatRp(totalKeluar)} (${keluarList.length} Transaksi)`, 20, 55);

  const tableData = keluarList.length > 0
    ? keluarList.map((t, idx) => [
        (idx + 1).toString(),
        t.tanggal,
        t.keterangan,
        t.namaWarga || 'Operasional RT',
        t.kategori,
        formatRp(t.nominal),
      ])
    : [
        ['-', '-', 'Belum ada transaksi pengeluaran (Kas Masih Kosong)', '—', '—', 'Rp 0'],
      ];

  autoTable(doc, {
    startY: 66,
    head: [['No', 'Tanggal', 'Keperluan Pengeluaran', 'Penerima / Toko', 'Kategori', 'Nominal']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 70 },
      3: { cellWidth: 32 },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  const signY = finalY + 20 > 240 ? 245 : finalY + 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  doc.text('Mengetahui,', 40, signY, { align: 'center' });
  doc.text('Ketua RT 08 RW 05', 40, signY + 5, { align: 'center' });
  doc.text('( Bapak Suwardi )', 40, signY + 25, { align: 'center' });

  doc.text(`Kotayasa, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 160, signY, { align: 'center' });
  doc.text('Bendahara RT 08', 160, signY + 5, { align: 'center' });
  doc.text('( Bapak Bambang S. )', 160, signY + 25, { align: 'center' });

  doc.save(`Laporan_Pengeluaran_Kas_RT08_RW05_${tahun}.pdf`);
};

/**
 * Generates an official Formal Indonesian Announcement Letter (Surat Edaran Resmi RT 08 RW 05)
 * With authentic Kop Surat, Double-Line separator, letter number, digital stamp, and signatures.
 */
export const exportSuratPengumumanPDF = (pengumuman: PengumumanRT) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Top header border strip
  doc.setFillColor(11, 93, 63);
  doc.rect(0, 0, 210, 6, 'F');

  // Letterhead (KOP SURAT RESMI)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('PEMERINTAH KABUPATEN BANYUMAS', 105, 15, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('KECAMATAN SUMBANG - DESA KOTAYASA', 105, 20, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(11, 93, 63);
  doc.text('PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05', 105, 27, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Sekretariat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas Kode Pos 53183 | WA: 0812-3456-7890', 105, 32, { align: 'center' });

  // Double horizontal line (Garis Ganda Kop Surat)
  doc.setDrawColor(11, 93, 63);
  doc.setLineWidth(1.1);
  doc.line(16, 35, 194, 35);
  doc.setLineWidth(0.3);
  doc.line(16, 36.3, 194, 36.3);

  // Metadata Surat (Nomor, Lampiran, Perihal, Tanggal)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);

  const cleanId = pengumuman.id.replace(/[^0-9]/g, '') || '01';
  const noSurat = `0${cleanId}/EDR/RT08-RW05/X/2026`;

  doc.text(`Nomor     : ${noSurat}`, 20, 44);
  doc.text('Lampiran : -', 20, 49);
  doc.text(`Perihal     : PENGUMUMAN - ${pengumuman.judul.toUpperCase()}`, 20, 54);

  const tglSurat = pengumuman.tanggal || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Kotayasa, ${tglSurat}`, 140, 44);

  // Kepada Yth
  doc.text('Kepada Yth.', 20, 64);
  doc.setFont('helvetica', 'bold');
  doc.text('Bapak/Ibu/Sdr Seluruh Warga RT 08 RW 05', 20, 69);
  doc.setFont('helvetica', 'normal');
  doc.text('Desa Kotayasa, Kec. Sumbang', 20, 74);
  doc.text('di Tempat', 20, 79);

  // Salam Pembuka
  doc.text('Assalamu’alaikum Warahmatullahi Wabarakatuh,', 20, 89);
  doc.text('Salam sejahtera bagi kita semua.', 20, 94);

  // Isi Pengantar Surat
  const pembuka = 'Sehubungan dengan agenda kemaslahatan, ketertiban, dan kebersamaan warga di lingkungan RT 08 RW 05 Desa Kotayasa, melalui surat edaran resmi ini kami sampaikan pemberitahuan penting sebagai berikut:';
  const splitPembuka = doc.splitTextToSize(pembuka, 170);
  doc.text(splitPembuka, 20, 102);

  // Kotak Penegasan Pengumuman
  doc.setFillColor(243, 249, 245);
  doc.roundedRect(20, 114, 170, 58, 3, 3, 'F');
  doc.setDrawColor(11, 93, 63);
  doc.roundedRect(20, 114, 170, 58, 3, 3, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(11, 93, 63);
  doc.text(pengumuman.judul, 25, 122);

  // Details
  if (pengumuman.hariTanggalAcara || pengumuman.waktuAcara || pengumuman.tempatAcara) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(`• Hari / Tanggal    : ${pengumuman.hariTanggalAcara || 'Sesuai jadwal'}`, 25, 130);
    doc.text(`• Waktu Pelaksanaan: ${pengumuman.waktuAcara || 'Waktu setempat'}`, 25, 136);
    doc.text(`• Tempat / Lokasi  : ${pengumuman.tempatAcara || 'Wilayah RT 08 RW 05'}`, 25, 142);
    if (pengumuman.keteranganTambahan) {
      doc.text(`• Catatan Khusus  : ${pengumuman.keteranganTambahan}`, 25, 148);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    const splitIsi = doc.splitTextToSize(pengumuman.isi, 160);
    doc.text(splitIsi.slice(0, 5), 25, 130);
  }

  // Kategori & Masa Berlaku
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  const masaBerlaku = pengumuman.tanggalBerakhir ? ` • Berlaku s/d: ${pengumuman.tanggalBerakhir}` : '';
  doc.text(`Kategori: ${pengumuman.kategori}${masaBerlaku} ${pengumuman.penting ? '• [PEMBERITAHUAN PENTING]' : ''}`, 25, 165);

  // Penutup
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const penutup = 'Demikian surat pengumuman resmi ini kami sampaikan. Atas perhatian, kesadaran, dan partisipasi aktif dari seluruh kepala keluarga atau perwakilan warga, kami sampaikan terima kasih yang sebesar-besarnya.';
  const splitPenutup = doc.splitTextToSize(penutup, 170);
  doc.text(splitPenutup, 20, 180);

  doc.text('Wassalamu’alaikum Warahmatullahi Wabarakatuh.', 20, 192);

  // Tanda Tangan & Stempel Digital
  const signY = 205;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Pengurus RT 08 RW 05 Desa Kotayasa', 130, signY);
  doc.text('Ketua RT 08,', 130, signY + 6);

  // Stempel Digital Bulat RT 08 RW 05
  doc.setDrawColor(11, 93, 63);
  doc.setLineWidth(0.6);
  doc.circle(140, signY + 22, 13);
  doc.circle(140, signY + 22, 11.5);

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 93, 63);
  doc.text('RUKUN TETANGGA 08', 140, signY + 16, { align: 'center' });
  doc.text('★ RW 05 ★', 140, signY + 22, { align: 'center' });
  doc.text('DESA KOTAYASA', 140, signY + 28, { align: 'center' });

  // Nama Terang
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text('Bapak Suwardi', 130, signY + 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Tembusan: Ketua RW 05 Desa Kotayasa', 20, signY + 44);

  // Footer note
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text('Surat resmi ini diterbitkan secara sah melalui Sistem Informasi RT 08 RW 05 Desa Kotayasa', 105, 285, { align: 'center' });

  const safeTitle = pengumuman.judul.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  doc.save(`Surat_Pengumuman_RT08_${safeTitle}.pdf`);
};

/**
 * EXPORT DATA WARGA PER KARTU KELUARGA (KK) LENGKAP DENGAN DATA BANTUAN PEMERINTAH (BANSOS)
 * Menghasilkan file PDF standar, valid, rapi, dan terstruktur per KK agar tidak tercecer.
 */
export const exportDataWargaPerKK_PDF = (
  wargaList: Warga[],
  bantuanList: BantuanPemerintah[] = []
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Helper: Draw Official Kop Surat
  const drawKopSurat = (d: jsPDF) => {
    d.setFillColor(11, 93, 63);
    d.rect(0, 0, pageWidth, 6, 'F');

    d.setFont('helvetica', 'bold');
    d.setFontSize(10);
    d.setTextColor(40, 40, 40);
    d.text('PEMERINTAH KABUPATEN BANYUMAS', pageWidth / 2, 14, { align: 'center' });

    d.setFontSize(10);
    d.text('KECAMATAN SUMBANG - DESA KOTAYASA', pageWidth / 2, 19, { align: 'center' });

    d.setFontSize(13);
    d.setTextColor(11, 93, 63);
    d.text('PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05', pageWidth / 2, 25, { align: 'center' });

    d.setFont('helvetica', 'normal');
    d.setFontSize(8);
    d.setTextColor(90, 90, 90);
    d.text('Sekretariat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183 | Layanan: 0812-3456-7890', pageWidth / 2, 29.5, { align: 'center' });

    d.setDrawColor(11, 93, 63);
    d.setLineWidth(1);
    d.line(margin, 32, pageWidth - margin, 32);
    d.setLineWidth(0.3);
    d.line(margin, 33.2, pageWidth - margin, 33.2);
  };

  // Draw Kop on first page
  drawKopSurat(doc);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('BUKU REGISTER DATA WARGA PER KARTU KELUARGA (KK)', pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setTextColor(11, 93, 63);
  doc.text('DAN REKAPITULASI PENERIMA BANTUAN PEMERINTAH (BANSOS)', pageWidth / 2, 45, { align: 'center' });

  // Calculation Metrics
  const totalKK = wargaList.length;
  const totalJiwa = wargaList.reduce((acc, w) => acc + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1), 0);
  const totalLunas = wargaList.filter((w) => w.statusIuran === 'Sudah').length;
  const totalBantuan = bantuanList.length;

  // Summary Metrics Banner
  doc.setFillColor(232, 245, 238);
  doc.roundedRect(margin, 49, contentWidth, 16, 2.5, 2.5, 'F');
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(margin, 49, contentWidth, 16, 2.5, 2.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(11, 93, 63);
  doc.text(`TOTAL KEPENDUDUKAN: ${totalKK} KK (${totalJiwa} Jiwa)`, margin + 5, 55);
  doc.text(`STATUS IURAN JIMPITAN: ${totalLunas} Lunas / ${totalKK - totalLunas} Belum`, margin + 5, 61);

  doc.text(`TOTAL ALOKASI BANTUAN SOSIAL: ${totalBantuan} Penerima Bantuan`, margin + 95, 55);
  doc.text(`TANGGAL CETAK: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin + 95, 61);

  let currentY = 70;

  // Process Each Kartu Keluarga (Per KK)
  wargaList.forEach((w, index) => {
    // Check remaining vertical space. If less than 65mm, start a new page
    if (currentY > pageHeight - 65) {
      doc.addPage();
      currentY = 20;
    }

    // KK Header Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.roundedRect(margin, currentY, contentWidth, 18, 2, 2, 'FD');

    // Accent left stripe
    doc.setFillColor(11, 93, 63);
    doc.roundedRect(margin, currentY, 4, 18, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(11, 93, 63);
    doc.text(`${index + 1}. KEPALA KELUARGA: ${w.nama.toUpperCase()}`, margin + 7, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(`Nomor KK : ${w.noKK || '330214050800000' + (index + 1)}`, margin + 7, currentY + 11);
    doc.text(`Alamat   : ${w.alamat || 'RT 08 RW 05 Desa Kotayasa'} (Rumah No. ${w.noRumah})`, margin + 7, currentY + 15.5);

    doc.setFont('helvetica', 'bold');
    doc.text(`Status Iuran: ${w.statusIuran === 'Sudah' ? 'LUNAS' : 'BELUM BAYAR'}`, margin + 115, currentY + 11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Jumlah Jiwa : ${w.anggotaKeluarga?.length || w.jumlahJiwa || 1} orang`, margin + 115, currentY + 15.5);

    currentY += 21;

    // Table of Family Members
    const anggota = w.anggotaKeluarga && w.anggotaKeluarga.length > 0
      ? w.anggotaKeluarga
      : [
          {
            nik: w.nik || '3302140000000001',
            nama: w.nama,
            hubungan: 'Kepala Keluarga',
            tempatLahir: 'Banyumas',
            tanggalLahir: '—',
            jenisKelamin: w.jenisKelamin || 'Laki-laki',
            agama: 'Islam',
            pekerjaan: 'Wiraswasta',
            statusPerkawinan: 'Kawin',
          },
        ];

    const memberTableData = anggota.map((m, mIdx) => [
      (mIdx + 1).toString(),
      m.nik || '—',
      m.nama,
      m.hubungan || 'Anggota',
      `${m.tempatLahir || ''} ${m.tanggalLahir || ''}`.trim() || '—',
      m.jenisKelamin === 'Laki-laki' ? 'L' : m.jenisKelamin === 'Perempuan' ? 'P' : '—',
      m.agama || 'Islam',
      m.pekerjaan || '—',
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['No', 'NIK', 'Nama Lengkap', 'Hubungan', 'TTL', 'L/P', 'Agama', 'Pekerjaan']],
      body: memberTableData,
      theme: 'grid',
      headStyles: {
        fillColor: [11, 93, 63],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 1.6,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 32 },
        2: { cellWidth: 44, fontStyle: 'bold' },
        3: { cellWidth: 26 },
        4: { cellWidth: 30 },
        5: { cellWidth: 10, halign: 'center' },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 18 },
      },
    });

    currentY = (doc as any).lastAutoTable?.finalY || (currentY + 20);

    // Bantuan Pemerintah Data for this specific KK
    const bansosKeluarga = bantuanList.filter(
      (b) =>
        (b.noKK && b.noKK === w.noKK) ||
        b.namaPenerima.toLowerCase() === w.nama.toLowerCase()
    );

    if (bansosKeluarga.length > 0) {
      currentY += 2;
      const bansosRows = bansosKeluarga.map((b, bIdx) => [
        (bIdx + 1).toString(),
        b.jenisBantuan,
        b.namaPenerima,
        b.nominalAtauBarang,
        b.tanggal,
        b.status,
        b.sumberDana || 'Kemensos / APBD',
      ]);

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [['No', 'Jenis Bantuan Sosial', 'Penerima Terdaftar', 'Nominal / Wujud Bantuan', 'Tgl Salur', 'Status', 'Sumber Dana']],
        body: bansosRows,
        theme: 'grid',
        headStyles: {
          fillColor: [180, 83, 9], // amber-700
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center',
        },
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 36 },
          3: { cellWidth: 42 },
          4: { cellWidth: 22 },
          5: { cellWidth: 24, halign: 'center' },
          6: { cellWidth: 22 },
        },
      });

      currentY = (doc as any).lastAutoTable?.finalY || (currentY + 15);
    } else {
      // Clear note if no aid received
      currentY += 2;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text('• Catatan Bantuan: Keluarga ini belum tercatat menerima bantuan sosial pemerintah.', margin + 2, currentY + 3);
      currentY += 6;
    }

    // Spacing between KKs
    currentY += 6;
  });

  // Final Signatures
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = 20;
  }

  const signY = currentY + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  doc.text('Mengetahui,', 45, signY, { align: 'center' });
  doc.text('Ketua RT 08 RW 05 Desa Kotayasa', 45, signY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('( Bapak Suwardi )', 45, signY + 25, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text(`Kotayasa, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 165, signY, { align: 'center' });
  doc.text('Sekretaris / Bendahara RT 08', 165, signY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('( Bapak Bambang S. )', 165, signY + 25, { align: 'center' });

  // Add Page Numbers to all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Halaman ${i} dari ${totalPages} • Dokumen Resmi Register Warga RT 08 RW 05 Desa Kotayasa (UU PDP No. 27/2022)`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Save the PDF
  doc.save(`Data_Warga_PerKK_Bansos_RT08_RW05_Kotayasa.pdf`);
};

/**
 * Export single KK PDF for individual inspection & print
 */
export const exportSingleKK_PDF = (
  warga: Warga,
  bantuanList: BantuanPemerintah[] = []
) => {
  exportDataWargaPerKK_PDF([warga], bantuanList);
};

