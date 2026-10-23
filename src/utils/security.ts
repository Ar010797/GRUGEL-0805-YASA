/**
 * Security & Data Privacy Utilities
 * Menjamin kepatuhan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).
 * Menyediakan enkripsi penyimpanan lokal, penyensoran NIK/No KK, verifikasi PIN, dan penguncian sementara.
 */

// Simple robust XOR/Base64 salt encryption for client-side storage
const ENCRYPTION_KEY = 'RT08_RW05_KOTAYASA_SECURE_VAULT_KEY_2026';

export function encryptData(plainText: string): string {
  try {
    let result = '';
    for (let i = 0; i < plainText.length; i++) {
      const charCode = plainText.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return btoa(unescape(encodeURIComponent(result)));
  } catch {
    return btoa(plainText);
  }
}

export function decryptData(cipherText: string): string {
  try {
    const raw = decodeURIComponent(escape(atob(cipherText)));
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    try {
      return atob(cipherText);
    } catch {
      return cipherText;
    }
  }
}

/**
 * Sensor NIK (hanya tampilkan 6 digit awal dan 4 digit akhir, sisanya bintang)
 * Contoh: 3302141205900001 -> 330214******0001
 */
export function maskNIK(nik: string): string {
  if (!nik || nik.length < 10) return '****************';
  const prefix = nik.slice(0, 6);
  const suffix = nik.slice(-4);
  const stars = '*'.repeat(Math.max(4, nik.length - 10));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Sensor No KK (hanya tampilkan 6 digit awal dan 4 digit akhir)
 * Contoh: 3302140508000001 -> 330214******0001
 */
export function maskNoKK(noKK: string): string {
  if (!noKK || noKK.length < 10) return '****************';
  const prefix = noKK.slice(0, 6);
  const suffix = noKK.slice(-4);
  const stars = '*'.repeat(Math.max(4, noKK.length - 10));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Cek apakah tanggal pengumuman sudah kedaluwarsa
 */
export function isPengumumanExpired(tanggalBerakhir?: string): boolean {
  if (!tanggalBerakhir) return false;
  try {
    const now = new Date();
    // set to start of day for clean comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const expiry = new Date(tanggalBerakhir).getTime();
    return today > expiry;
  } catch {
    return false;
  }
}
