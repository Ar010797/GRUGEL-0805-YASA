import { PengumumanRT } from '../types';

export const formatPengumumanWhatsApp = (p: PengumumanRT): string => {
  return `📢 *PENGUMUMAN RESMI RT 08 RW 05 DESA KOTAYASA* 📢
-----------------------------------------------
📌 *Perihal:* ${p.judul.toUpperCase()}
📅 *Tanggal:* ${p.tanggal}
🏷️ *Kategori:* ${p.kategori} ${p.penting ? '⚠️ *(PEMBERITAHUAN PENTING)*' : ''}

📝 *Isi Pengumuman:*
${p.isi}

-----------------------------------------------
Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerja sama warga RT 08 RW 05, kami ucapkan terima kasih.

Tertanda,
*${p.penulis || 'Pengurus RT 08 RW 05'}*
_Desa Kotayasa, Kec. Sumbang, Kab. Banyumas_`;
};

export const kirimWhatsAppPengumuman = (p: PengumumanRT) => {
  const text = formatPengumumanWhatsApp(p);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const salinTeksPengumuman = async (p: PengumumanRT): Promise<boolean> => {
  const text = formatPengumumanWhatsApp(p);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
};
