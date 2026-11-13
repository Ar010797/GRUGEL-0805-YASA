import { PengumumanRT, PengaturanKas } from '../types';

export const formatPengumumanWhatsApp = (
  p: PengumumanRT,
  pengaturanKas?: PengaturanKas
): string => {
  const profilRT = pengaturanKas?.profilRT;
  const rtStr = profilRT?.namaRT || '08';
  const rwStr = profilRT?.namaRW || '05';
  const desaStr = profilRT?.desa || 'Desa Kotayasa';
  const kecStr = profilRT?.kecamatan || 'Kecamatan Sumbang';
  const kabStr = profilRT?.kabupaten || 'Kabupaten Banyumas';

  const namaKetua = pengaturanKas?.kontakKetuaRT?.nama?.trim() || '';
  const namaBendahara = pengaturanKas?.kontakBendahara?.nama?.trim() || '';
  const jabatanTtd = p.jabatanPengurus?.trim() || `Ketua RT ${rtStr}`;

  let resolvedNama = p.namaPengurus?.trim() || '';
  const isLegacyPlaceholder =
    !resolvedNama || resolvedNama === 'Bpk. Suwardi' || resolvedNama === 'Bapak Suwardi';
  if (isLegacyPlaceholder) {
    if (jabatanTtd.toLowerCase().includes('bendahara') && namaBendahara) {
      resolvedNama = namaBendahara;
    } else if (namaKetua) {
      resolvedNama = namaKetua;
    }
  }

  const tertanda = resolvedNama
    ? `${jabatanTtd} (${resolvedNama})`
    : p.penulis || `Pengurus RT ${rtStr} RW ${rwStr}`;

  return `📢 *PENGUMUMAN RESMI RT ${rtStr} RW ${rwStr} ${desaStr.toUpperCase()}* 📢
-----------------------------------------------
📌 *Perihal:* ${p.judul.toUpperCase()}
📅 *Tanggal:* ${p.tanggal}
🏷️ *Kategori:* ${p.kategori} ${p.penting ? '⚠️ *(PEMBERITAHUAN PENTING)*' : ''}

📝 *Isi Pengumuman:*
${p.isi}

-----------------------------------------------
Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja sama warga RT ${rtStr} RW ${rwStr}, kami ucapkan terima kasih.

Tertanda,
*${tertanda}*
_${desaStr}, ${kecStr}, ${kabStr}_`;
};

export const kirimWhatsAppPengumuman = (
  p: PengumumanRT,
  pengaturanKas?: PengaturanKas
) => {
  const text = formatPengumumanWhatsApp(p, pengaturanKas);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const salinTeksPengumuman = async (
  p: PengumumanRT,
  pengaturanKas?: PengaturanKas
): Promise<boolean> => {
  const text = formatPengumumanWhatsApp(p, pengaturanKas);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
};
