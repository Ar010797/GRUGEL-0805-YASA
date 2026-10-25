export type TransactionType = 'masuk' | 'keluar' | 'kematian';

export interface Transaction {
  id: string;
  tanggal: string;
  kategori: string;
  keterangan: string;
  nominal: number;
  tipe: TransactionType;
  namaWarga?: string;
  nomorRumah?: string;
  noKK?: string;
  isSaldoAwal?: boolean;
  tahun?: number; // Tahun pembukuan (default: 2026)
  rtScope?: string; // Scope RT (misal 'RT 08')
}

export interface AnggotaKeluarga {
  nik: string;
  nama: string;
  hubungan: 'Kepala Keluarga' | 'Istri' | 'Anak' | 'Orang Tua' | 'Famili Lain' | string;
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  agama?: string;
  pekerjaan?: string;
  statusPerkawinan?: string;
}

export interface Warga {
  id: string;
  no: number;
  nama: string; // Nama Kepala Keluarga
  noKK: string; // Nomor Kartu Keluarga 16 digit (digunakan sebagai Password Login Warga)
  nik?: string; // NIK Kepala Keluarga
  noRumah: string;
  rt: string; // misal '08'
  rw?: string; // misal '05'
  alamat?: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  jumlahJiwa: number;
  statusIuran: 'Sudah' | 'Belum'; // status tahun aktif
  anggotaKeluarga?: AnggotaKeluarga[];
  // Riwayat Iuran per Bulan untuk tahun aktif (1 = Jan, 12 = Des)
  riwayatIuran?: Record<number, boolean>;
  riwayatKematian?: Record<number, boolean>;
  // Riwayat Iuran per Tahun untuk pergantian tahun otomatis (multi-tahun)
  riwayatIuranPerTahun?: Record<number, Record<number, boolean>>;
  riwayatKematianPerTahun?: Record<number, Record<number, boolean>>;
  statusIuranPerTahun?: Record<number, 'Sudah' | 'Belum'>;
  iuranUmumTerbayar?: number; // total nominal rupiah yang sudah dibayar tahun ini
  iuranKematianTerbayar?: number; // total nominal rupiah yang sudah dibayar tahun ini
  pilihanSkema?: 'bulanan' | 'tahunan';
  telepon?: string;
  pin?: string; // 6 digit PIN (default: 123456)
  pinAttempts?: number;
  pinLockedUntil?: number; // timestamp jika salah 3x
}

export interface AuthUser {
  role: 'server' | 'admin' | 'warga';
  username: string;
  nama: string;
  noKK?: string;
  wargaId?: string;
  isPinAuthenticated?: boolean;
  rtScope?: string; // 'Semua RT' untuk server, 'RT 08 RW 05' untuk admin RT
}

// Akun Admin RT yang dikelola oleh Server (Super Admin Desa)
export interface AdminRTAccount {
  id: string;
  username: string;
  passwordHash: string; // kata sandi login admin RT
  nama: string;
  rt: string; // misal '08'
  rw: string; // misal '05'
  kontak: string;
  jabatan: string; // misal 'Ketua RT 08'
  status: 'aktif' | 'nonaktif';
  terakhirLogin?: string;
  terakhirSinkronisasi?: string;
}

// Data pembaruan bulanan yang dikirimkan Admin RT ke Server Pusat Desa
export interface PembaruanBulananRT {
  id: string;
  rt: string;
  rw: string;
  namaAdminPengirim: string;
  tanggalKirim: string;
  bulanTahun: string; // misal 'Oktober 2026'
  tahun: number;
  totalKK: number;
  totalJiwa: number;
  totalLunasIuran: number;
  totalBelumLunas: number;
  totalKasMasukBulanIni: number;
  totalKasKeluarBulanIni: number;
  saldoKasUmumBerjalan: number;
  saldoKasKematianBerjalan: number;
  totalPenerimaBansos: number;
  catatanKhusus?: string;
  statusVerifikasi: 'Diterima' | 'Menunggu Verifikasi' | 'Perlu Klarifikasi';
}

export interface PengumumanRT {
  id: string;
  judul: string;
  tanggal: string; // tanggal terbit
  tanggalBerakhir: string; // tanggal berakhir / kedaluwarsa (otomatis hilang jika lewat)
  kategori: 'Kegiatan' | 'Iuran' | 'Keamanan' | 'Sosial' | 'Umum';
  isi: string;
  penulis: string;
  penting?: boolean;
  tentang?: string;
  hariTanggalAcara?: string;
  waktuAcara?: string;
  tempatAcara?: string;
  keteranganTambahan?: string;
  rtScope?: string; // 'Semua RT' atau RT tertentu
}

// Profil Identitas RT & Format Kop Surat Resmi
export interface ProfilRT {
  namaRT: string; // misal "08"
  namaRW: string; // misal "05"
  dusun?: string; // misal "Dusun III"
  desa: string; // misal "Desa Kotayasa"
  kecamatan: string; // misal "Kecamatan Sumbang"
  kabupaten: string; // misal "Kabupaten Banyumas"
  provinsi?: string; // misal "Jawa Tengah"
  kodePos?: string; // misal "53183"
  alamatSekretariat?: string; // misal "RT 08 RW 05 Desa Kotayasa, Kec. Sumbang, Kab. Banyumas 53183"
  judulKopSurat?: string; // misal "PENGURUS RUKUN TETANGGA 08 RUKUN WARGA 05"
  sebutanWilayah?: string; // misal "RT 08 RW 05 Desa Kotayasa"
}

export interface PengaturanKas {
  // Jimpitan / Iuran Warga (diatur tahunan -> auto hitung bulanan = tahunan / 12)
  nominalJimpitanTahunan: number;
  nominalJimpitanBulanan: number;
  // Kas Kematian / Kain Mori (diatur tahunan -> auto hitung bulanan = tahunan / 12)
  nominalKematianTahunan: number;
  nominalKematianBulanan: number;
  // Sisa Kas Masa Lalu
  saldoAwalKasUmum: number;
  saldoAwalKasKematian: number;
  keteranganSaldoAwal: string;
  tanggalSaldoAwal: string;
  // Kontak RT untuk Bantuan Akun / Lupa Password
  kontakKetuaRT: { nama: string; telp: string };
  kontakBendahara: { nama: string; telp: string };
  // Tahun aktif pembukuan
  tahunAktif: number;
  // Catatan saldo berlanjut per tahun
  saldoBerlanjutPerTahun?: Record<number, { kasUmum: number; kasKematian: number }>;
  // Profil RT & Pengaturan Kop Surat Resmi
  profilRT?: ProfilRT;
}

// Bantuan Pemerintah fleksibel: pilihan preset + input manual bebas
export interface BantuanPemerintah {
  id: string;
  jenisBantuan: string; // Fleksibel: BPNT, PKH, atau nama program bantuan custom yang diketik manual
  namaPenerima: string;
  noKK: string;
  nik?: string;
  nominalAtauBarang: string;
  tanggal: string;
  status: 'Sudah Disalurkan' | 'Baru Diusulkan' | 'Proses Verifikasi' | 'Ditolak';
  sumberDana?: string;
  keterangan?: string;
  rtScope?: string;
}

export const PRESET_JENIS_BANTUAN = [
  'BPNT (Bantuan Pangan Non Tunai)',
  'PKH (Program Keluarga Harapan)',
  'Bansos Tunai / BLT Desa',
  'Sembako Beras & Pangan',
  'Bantuan Lansia Disabilitas',
  'KIP / PIP Siswa & Pelajar',
  'Bantuan RTLH (Bedah Rumah)',
  'Bansos Minyak Goreng & Sembako',
  'Bantuan Pangan Cadangan Beras (CPP)',
  'BLT Mitigasi Risiko Pangan / El Nino',
] as const;

export interface DokumenPdfWarga {
  id: string;
  judul: string;
  namaFile: string;
  ukuranKb: number;
  tanggalUpload: string;
  kategori: string;
  keterangan?: string;
  dataBase64?: string;
  rtScope?: string;
}
