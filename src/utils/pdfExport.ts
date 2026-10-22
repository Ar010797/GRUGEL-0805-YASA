import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, Warga, PengumumanRT } from '../types';

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
 * Generates an official Formal Indonesian Announcement Letter (Surat Edaran RT)
 */
export const exportSuratPengumumanPDF = (pengumuman: PengumumanRT) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Top header border
  doc.setFillColor(11, 93, 63);
  doc.rect(0, 0, 210, 7, 'F');

  // Letterhead (Kop Surat Resmi)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(11, 93, 63);
  doc.text('PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05', 105, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text('DESA KOTAYASA KECAMATAN SUMBANG KABUPATEN BANYUMAS', 105, 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Alamat: RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas Kode Pos 53183', 105, 31, { align: 'center' });

  // Double line kop surat
  doc.setDrawColor(11, 93, 63);
  doc.setLineWidth(0.9);
  doc.line(18, 34, 192, 34);
  doc.setLineWidth(0.3);
  doc.line(18, 35.5, 192, 35.5);

  // Metadata Surat (Nomor, Lampiran, Perihal, Tanggal)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  const cleanId = pengumuman.id.replace(/[^0-9]/g, '') || '01';
  const noSurat = `0${cleanId}/EDR/RT08-RW05/X/2026`;

  doc.text(`Nomor     : ${noSurat}`, 20, 44);
  doc.text('Lampiran : -', 20, 50);
  doc.text(`Perihal     : PENGUMUMAN - ${pengumuman.judul.toUpperCase()}`, 20, 56);

  doc.text(`Kotayasa, ${pengumuman.tanggal || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 140, 44);

  // Kepada Yth
  doc.text('Kepada Yth.', 20, 66);
  doc.setFont('helvetica', 'bold');
  doc.text('Seluruh Warga RT 08 RW 05', 20, 71);
  doc.setFont('helvetica', 'normal');
  doc.text('Desa Kotayasa, Kec. Sumbang', 20, 76);
  doc.text('di Tempat', 20, 81);

  // Salam Pembuka
  doc.text('Assalamu’alaikum Warahmatullahi Wabarakatuh,', 20, 91);
  doc.text('Salam sejahtera untuk kita semua.', 20, 96);

  // Isi Surat
  const pembuka = 'Sehubungan dengan agenda kemaslahatan dan ketertiban lingkungan di wilayah RT 08 RW 05 Desa Kotayasa, melalui surat ini Pengurus RT menyampaikan pemberitahuan sebagai berikut:';
  const splitPembuka = doc.splitTextToSize(pembuka, 170);
  doc.text(splitPembuka, 20, 104);

  // Kotak Penegasan Pengumuman
  doc.setFillColor(243, 249, 245);
  doc.roundedRect(20, 116, 170, 48, 3, 3, 'F');
  doc.setDrawColor(11, 93, 63);
  doc.roundedRect(20, 116, 170, 48, 3, 3, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(11, 93, 63);
  doc.text(pengumuman.judul, 25, 124);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  const splitIsi = doc.splitTextToSize(pengumuman.isi, 160);
  doc.text(splitIsi, 25, 131);

  // Kategori & Status Penting
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Kategori: ${pengumuman.kategori} ${pengumuman.penting ? '• [PEMBERITAHUAN PENTING]' : ''}`, 25, 158);

  // Penutup
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const penutup = 'Demikian surat pengumuman ini kami sampaikan. Atas perhatian, dukungan, dan kerja sama yang baik dari seluruh warga RT 08 RW 05, kami ucapkan terima kasih yang sebesar-besarnya.';
  const splitPenutup = doc.splitTextToSize(penutup, 170);
  doc.text(splitPenutup, 20, 174);

  doc.text('Wassalamu’alaikum Warahmatullahi Wabarakatuh.', 20, 190);

  // Tanda Tangan & Stempel Digital
  const signY = 202;
  doc.text('Pengurus RT 08 RW 05 Desa Kotayasa', 130, signY);
  doc.text('Ketua RT 08,', 130, signY + 6);

  // Stempel Digital Bulat RT 08 RW 05
  doc.setDrawColor(11, 93, 63);
  doc.setLineWidth(0.6);
  doc.circle(138, signY + 22, 13);
  doc.circle(138, signY + 22, 11.5);

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 93, 63);
  doc.text('RUKUN TETANGGA 08', 138, signY + 16, { align: 'center' });
  doc.text('★ RW 05 ★', 138, signY + 22, { align: 'center' });
  doc.text('DESA KOTAYASA', 138, signY + 28, { align: 'center' });

  // Nama Terang
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text('Bapak Suwardi', 130, signY + 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`Tembusan: Ketua RW 05 Desa Kotayasa`, 20, signY + 45);

  // Save the PDF
  const safeTitle = pengumuman.judul.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  doc.save(`Surat_Pengumuman_RT08_${safeTitle}.pdf`);
};
