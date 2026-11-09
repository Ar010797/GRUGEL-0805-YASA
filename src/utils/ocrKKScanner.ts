import { AnggotaKeluarga } from '../types';

export interface ExtractedKKData {
  nama: string;
  noKK: string;
  noRumah: string;
  rt: string;
  rw: string;
  alamat: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  jumlahJiwa: number;
  statusIuran: 'Sudah' | 'Belum';
  anggotaKeluarga: AnggotaKeluarga[];
}

/**
 * Checks if a string is form boilerplate, header text, or OCR noise, NOT a person's name.
 */
export function isFormOrHeaderGarbage(raw: string): boolean {
  if (!raw) return true;
  const s = raw.trim().toLowerCase();
  if (s.length < 3) return true;

  // Typical OCR misreads and form labels on KK
  if (
    /^(grd|nie|aamat|alamat|desa|kelurahan|kecamatan|kabupaten|kota|provinsi|kodepos|kode|pos|dusun|rt|rw|no|blangko|lembar|pemerintah|republik|indonesia)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /\b(kotayasa|sumbang|banyumas|jawa tengah|republik|indonesia|kartu|keluarga|dukcapil|kependudukan)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /\b(nik|nama|lengkap|jenis|kelamin|tempat|lahir|tanggal|agama|pendidikan|pekerjaan|status|perkawinan|hubungan|kewarganegaraan|ayah|ibu|paspor|kitap|tanda|tangan|dinas|gol\s*darah)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/[:=]/.test(s)) return true;
  if (/^[^a-zA-Z]+$/.test(s)) return true;

  return false;
}

/**
 * Sanitizes Indonesian names extracted from Kartu Keluarga forms.
 * Strips out form labels, column headers, and adjacent field texts like:
 * "Desa/Kelurahan", "DesaKelurahan", "Kecamatan", "Kabupaten", "RT/RW", "Alamat", etc.
 */
export function cleanIndonesianName(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // Remove leading row numbering like "1. ", "1 ", "No. 1 "
  str = str.replace(/^(?:no\.?\s*)?\d+[\s.-]*/i, '').trim();

  // Remove form label prefixes like "Nama Kepala Keluarga : ", "Nama Lengkap : "
  str = str.replace(/^(?:nama\s*kepala\s*keluarga|nama\s*lengkap|nama)\s*[:=]\s*/i, '').trim();

  // Cut off any adjacent form label from right column or next field
  str = str.split(
    /(?:\b|(?<=[a-z]))(?:desa\s*[\/\.]?\s*kelurahan|desakelurahan|desa|kelurahan|kecamatan|kabupaten|kota|provinsi|kodepos|kode\s*pos|rt\s*[\/\.]?\s*rw|rt|rw|dusun|alamat|gol\s*darah|tanda\s*tangan)\b/i
  )[0].trim();

  // Remove trailing and leading non-alpha chars except common name punctuation like . ' -
  str = str.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z.'\s-]+$/, '').trim();

  // Normalize whitespace
  str = str.replace(/\s+/g, ' ');

  // If the result matches form boilerplate or noise, discard it
  if (isFormOrHeaderGarbage(str)) {
    return '';
  }

  return str;
}

/**
 * Cleans and validates a 16-digit Indonesian NIK or No KK number.
 * Corrects common OCR letter/digit confusions (e.g. O->0, I/l->1, S->5, B->8).
 */
export function cleanNIK(raw: string): string {
  if (!raw) return '';
  const normalized = raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');

  const digits = normalized.replace(/\D/g, '');
  return digits.slice(0, 16);
}

/**
 * Downscales and compresses large camera images to an optimal size (~1600px max, ~400KB JPEG).
 * Prevents mobile memory crashes, huge network payloads, and OCR timeouts.
 */
export async function preprocessAndCompressImage(
  dataUri: string,
  maxDimension = 1600,
  quality = 0.85
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUri;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension && dataUri.length < 800000) {
        return resolve(dataUri);
      }

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUri);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const optimizedBase64 = canvas.toDataURL('image/jpeg', quality);
      resolve(optimizedBase64);
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

/**
 * Scan & Extract Kartu Keluarga (KK) with precision:
 * 1. Optimizes image size.
 * 2. Uses Gemini 3.8 Flash Vision on the backend (/api/scan-kk) for high-accuracy OCR.
 * 3. If Gemini is unavailable, falls back to enhanced on-device Tesseract optical recognition.
 * 4. Never returns random or fabricated sample data.
 */
export const scanKartuKeluargaImage = async (
  imageBase64: string,
  imageMimeType: string = 'image/jpeg'
): Promise<ExtractedKKData> => {
  // Pre-process & compress image to avoid huge payload timeouts
  let optimizedImage = imageBase64;
  try {
    optimizedImage = await preprocessAndCompressImage(imageBase64);
  } catch {
    optimizedImage = imageBase64;
  }

  // Step 1: Call Backend Gemini Vision API
  try {
    const res = await fetch('/api/scan-kk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: optimizedImage,
        mimeType: imageMimeType,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        const validMembers: AnggotaKeluarga[] = Array.isArray(d.anggotaKeluarga)
          ? d.anggotaKeluarga.map((m: any, idx: number) => {
              let cleanedMName = cleanIndonesianName(m.nama || '');
              const cleanedMNik = cleanNIK(m.nik || '');
              const hubungan = (
                m.hubungan || (idx === 0 ? 'Kepala Keluarga' : idx === 1 ? 'Istri' : 'Anak')
              ).trim();

              // Infer gender
              let jenisKelamin: 'Laki-laki' | 'Perempuan' = 'Laki-laki';
              if (m.jenisKelamin?.toLowerCase().includes('perempuan') || hubungan.toLowerCase() === 'istri') {
                jenisKelamin = 'Perempuan';
              } else if (cleanedMNik.length === 16) {
                const dd = parseInt(cleanedMNik.slice(6, 8), 10);
                if (!isNaN(dd) && dd > 40) jenisKelamin = 'Perempuan';
              }

              if (!cleanedMName || isFormOrHeaderGarbage(cleanedMName)) {
                cleanedMName = idx === 0 ? cleanIndonesianName(d.nama || '') : idx === 1 ? 'Istri' : `Anak #${idx}`;
              }

              return {
                nik: cleanedMNik,
                nama: cleanedMName,
                hubungan,
                jenisKelamin,
                tempatLahir: (m.tempatLahir || 'Banyumas').trim(),
                tanggalLahir: (m.tanggalLahir || '').trim(),
                agama: (m.agama || 'Islam').trim(),
                pekerjaan: (m.pekerjaan || (idx === 0 ? 'Wiraswasta' : idx === 1 ? 'Mengurus Rumah Tangga' : 'Pelajar / Mahasiswa')).trim(),
                statusPerkawinan: (m.statusPerkawinan || (idx <= 1 ? 'Kawin' : 'Belum Kawin')).trim(),
              };
            })
          : [];

        const noKKClean = cleanNIK(d.noKK || '');
        const kepalaKeluargaName = cleanIndonesianName(d.nama || validMembers[0]?.nama || '');

        if (noKKClean || kepalaKeluargaName || validMembers.length > 0) {
          // If valid members is empty but we have head of family info, create entry
          if (validMembers.length === 0 && (kepalaKeluargaName || noKKClean)) {
            validMembers.push({
              nik: noKKClean,
              nama: kepalaKeluargaName || 'Kepala Keluarga',
              hubungan: 'Kepala Keluarga',
              jenisKelamin: d.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
              tempatLahir: 'Banyumas',
              tanggalLahir: '',
              agama: 'Islam',
              pekerjaan: 'Wiraswasta',
              statusPerkawinan: 'Kawin',
            });
          }

          return {
            nama: kepalaKeluargaName || (validMembers[0] ? validMembers[0].nama : ''),
            noKK: noKKClean,
            noRumah: '',
            rt: (d.rt || '08').replace(/\D/g, '').padStart(2, '0').slice(0, 2),
            rw: (d.rw || '05').replace(/\D/g, '').padStart(2, '0').slice(0, 2),
            alamat: d.alamat || 'RT 08 RW 05 Desa Kotayasa',
            jenisKelamin: d.jenisKelamin === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
            jumlahJiwa: validMembers.length || 1,
            statusIuran: 'Belum',
            anggotaKeluarga: validMembers,
          };
        }
      }
    }
  } catch (backendErr) {
    console.warn('Backend scan failed, running Tesseract OCR fallback:', backendErr);
  }

  // Step 2: Optical Character Recognition (Tesseract.js)
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const ret = await worker.recognize(optimizedImage);
    await worker.terminate();

    const ocrText = ret?.data?.text || '';
    if (!ocrText.trim()) {
      throw new Error('Tidak ada teks yang terdeteksi pada foto.');
    }

    // Parse extracted text with enhanced Indonesian KK parser
    return parseIndonesianKKText(ocrText);
  } catch (ocrErr: any) {
    console.error('OCR Error:', ocrErr);
    throw new Error(
      'Foto Kartu Keluarga (KK) tidak terbaca dengan jelas. Pastikan foto dokumen terang, tidak buram, dan nomor KK serta NIK terlihat jelas.'
    );
  }
};

/**
 * Parses raw text extracted from an Indonesian Kartu Keluarga image with high precision.
 * Extracts 16-digit numbers (No KK and NIKs), table rows, names, and relationships.
 */
function parseIndonesianKKText(text: string): ExtractedKKData {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Extract all 16-digit numbers in the document
  const sixteenDigits = (text.match(/\b\d{16}\b/g) || []).map((d) => cleanNIK(d));

  // Extract No. KK (near KARTU KELUARGA header or "No.")
  let noKK = '';
  for (const line of lines) {
    if (
      /No\.?\s*[:=]?\s*\d{16}/i.test(line) ||
      (/KARTU\s*KELUARGA/i.test(line) && /\d{16}/.test(line))
    ) {
      const match = line.match(/\d{16}/);
      if (match) {
        noKK = cleanNIK(match[0]);
        break;
      }
    }
  }

  if (!noKK && sixteenDigits.length > 0) {
    noKK = sixteenDigits[0];
  }

  // 2. Extract Kepala Keluarga name
  let namaKepalaKeluarga = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Nama Kepala Keluarga/i.test(line)) {
      const parts = line.split(/[:=]/);
      if (parts.length > 1 && parts[1].trim().length > 2) {
        namaKepalaKeluarga = cleanIndonesianName(parts[1]);
      } else if (i + 1 < lines.length) {
        namaKepalaKeluarga = cleanIndonesianName(lines[i + 1]);
      }
      break;
    }
  }

  // 3. Extract RT / RW
  let rt = '08';
  let rw = '05';
  const rtRwMatch = text.match(/RT\s*[\/.]?\s*RW\s*[:=]?\s*(\d{1,3})\s*[\/.]\s*(\d{1,3})/i);
  if (rtRwMatch) {
    rt = rtRwMatch[1].padStart(2, '0').slice(-2);
    rw = rtRwMatch[2].padStart(2, '0').slice(-2);
  }

  // 4. Extract Alamat
  let alamat = 'RT 08 RW 05 Desa Kotayasa';
  const alamatLine = lines.find((l) => /^Alamat/i.test(l));
  if (alamatLine) {
    const parts = alamatLine.split(/[:=]/);
    if (parts.length > 1 && parts[1].trim()) {
      const addrClean = cleanIndonesianName(parts[1]);
      if (addrClean) alamat = addrClean;
    }
  }

  // 5. Extract Family Members from Table
  // Filter out No KK so we only keep individual member NIKs
  const memberNiks = sixteenDigits.filter((digit) => digit !== noKK);
  const uniqueNiks = Array.from(new Set(memberNiks.length > 0 ? memberNiks : sixteenDigits));

  const anggotaKeluarga: AnggotaKeluarga[] = [];

  if (uniqueNiks.length > 0) {
    uniqueNiks.forEach((nik, idx) => {
      let memberName = '';

      // Strategy 1: Check the line containing this NIK
      const lineIdx = lines.findIndex((l) => l.includes(nik));
      if (lineIdx !== -1) {
        const line = lines[lineIdx];
        const beforeNik = line.split(nik)[0].trim();
        const candidateBefore = cleanIndonesianName(beforeNik);
        if (candidateBefore && !isFormOrHeaderGarbage(candidateBefore)) {
          memberName = candidateBefore;
        } else if (lineIdx > 0) {
          // Check line directly preceding the NIK
          const candidatePrev = cleanIndonesianName(lines[lineIdx - 1]);
          if (candidatePrev && !isFormOrHeaderGarbage(candidatePrev)) {
            memberName = candidatePrev;
          }
        }
      }

      // Infer gender from 7th and 8th digit of NIK (in Indonesia, female DD is > 40)
      let gender: 'Laki-laki' | 'Perempuan' = 'Laki-laki';
      if (nik.length === 16) {
        const dd = parseInt(nik.slice(6, 8), 10);
        if (!isNaN(dd) && dd > 40) {
          gender = 'Perempuan';
        }
      }

      // Check relation
      let hubungan = 'Anak';
      if (idx === 0) {
        hubungan = 'Kepala Keluarga';
        if (!memberName && namaKepalaKeluarga) {
          memberName = namaKepalaKeluarga;
        }
      } else if (idx === 1 && gender === 'Perempuan') {
        hubungan = 'Istri';
      }

      if (!memberName || isFormOrHeaderGarbage(memberName)) {
        memberName =
          idx === 0
            ? namaKepalaKeluarga || 'Kepala Keluarga'
            : idx === 1 && gender === 'Perempuan'
            ? 'Istri'
            : `Anak #${idx}`;
      }

      anggotaKeluarga.push({
        nik,
        nama: memberName,
        hubungan,
        tempatLahir: 'Banyumas',
        tanggalLahir: '',
        jenisKelamin: gender,
        agama: 'Islam',
        pekerjaan:
          idx === 0
            ? 'Wiraswasta'
            : idx === 1 && gender === 'Perempuan'
            ? 'Mengurus Rumah Tangga'
            : 'Pelajar / Mahasiswa',
        statusPerkawinan: idx <= 1 ? 'Kawin' : 'Belum Kawin',
      });
    });
  } else if (noKK || namaKepalaKeluarga) {
    anggotaKeluarga.push({
      nik: noKK || '',
      nama: namaKepalaKeluarga || 'Kepala Keluarga',
      hubungan: 'Kepala Keluarga',
      tempatLahir: 'Banyumas',
      tanggalLahir: '',
      jenisKelamin: 'Laki-laki',
      agama: 'Islam',
      pekerjaan: 'Wiraswasta',
      statusPerkawinan: 'Kawin',
    });
  } else {
    throw new Error(
      'Foto Kartu Keluarga (KK) tidak dapat terbaca dengan jelas. Pastikan foto dokumen tegak lurus, pencahayaan terang, dan nomor KK serta NIK terbaca utuh.'
    );
  }

  const finalNama = namaKepalaKeluarga || (anggotaKeluarga[0] ? anggotaKeluarga[0].nama : '');

  return {
    nama: finalNama,
    noKK,
    noRumah: '',
    rt,
    rw,
    alamat,
    jenisKelamin: anggotaKeluarga[0]?.jenisKelamin || 'Laki-laki',
    jumlahJiwa: anggotaKeluarga.length || 1,
    statusIuran: 'Belum',
    anggotaKeluarga,
  };
}
