/**
 * Helpers for cleaning and normalizing Indonesian Kartu Keluarga (KK) and Citizen data.
 */

export function isFormOrHeaderGarbage(raw: string): boolean {
  if (!raw) return true;
  const s = raw.trim();
  if (s.length < 2) return true;

  if (
    /^(?:grd\s*no\.?|nie\s*a?lamat|aamat|desa\s*[\/\.]?\s*kelurahan|desakelurahan|kecamatan|kabupaten|provinsi|kodepos|kode\s*pos|rt\s*[\/\.]?\s*rw|blangko|lembar|pemerintah|republik\s*indonesia|kartu\s*keluarga|dukcapil|kepala\s*dinas|catatan\s*sipil|tanda\s*tangan)$/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /^(?:nik|nama\s*kepala\s*keluarga|nama\s*lengkap|jenis\s*kelamin|tempat\s*lahir|tanggal\s*lahir|agama|pendidikan|pekerjaan|status\s*perkawinan|status\s*hubungan|kewarganegaraan|nama\s*ayah|nama\s*ibu|paspor|kitap|tanda\s*tangan|gol\s*darah)$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^[^a-zA-Z]+$/.test(s)) return true;

  return false;
}

export function cleanIndonesianName(raw: string): string {
  if (!raw) return '';
  let str = String(raw).trim();

  // Remove leading row numbering like "1. ", "1 ", "No. 1 "
  str = str.replace(/^(?:\[?(?:no\.?\s*)?\d+[\s|\]\.-]*)/i, '').trim();

  // Remove form label prefixes
  str = str.replace(/^(?:nama\s*kepala\s*keluarga|nama\s*lengkap|nama)\s*[:=~-]*\s*/i, '').trim();

  // Remove trailing and leading non-alpha chars except common name punctuation like . ' -
  str = str.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z.'\s-]+$/, '').trim();

  // Normalize whitespace
  str = str.replace(/\s+/g, ' ');

  if (isFormOrHeaderGarbage(str)) {
    return '';
  }

  return str;
}

export function cleanNIK(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  const normalized = str
    .replace(/^'/, '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');

  const digits = normalized.replace(/\D/g, '');
  return digits.slice(0, 16);
}

export function inferGenderFromNIK(nik: string): 'Laki-laki' | 'Perempuan' {
  if (nik && nik.length === 16) {
    const dd = parseInt(nik.slice(6, 8), 10);
    if (!isNaN(dd) && dd > 40) {
      return 'Perempuan';
    }
  }
  return 'Laki-laki';
}
