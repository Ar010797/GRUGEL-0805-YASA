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
  rt: string;
  rw?: string;
  alamat?: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  jumlahJiwa: number;
  statusIuran: 'Sudah' | 'Belum';
  anggotaKeluarga?: AnggotaKeluarga[];
  // Status Iuran per Bulan (1 = Jan, 12 = Des)
  riwayatIuran?: Record<number, boolean>;
  riwayatKematian?: Record<number, boolean>;
  iuranUmumTerbayar?: number; // total nominal rupiah yang sudah dibayar tahun ini
  iuranKematianTerbayar?: number; // total nominal rupiah yang sudah dibayar tahun ini
  pilihanSkema?: 'bulanan' | 'tahunan';
  telepon?: string;
  pin?: string; // 6 digit PIN (default: 123456)
  pinAttempts?: number;
  pinLockedUntil?: number; // timestamp jika salah 3x
}

export interface AuthUser {
  role: 'admin' | 'warga';
  username: string;
  nama: string;
  noKK?: string;
  wargaId?: string;
  isPinAuthenticated?: boolean;
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
}

export interface BantuanPemerintah {
  id: string;
  jenisBantuan: 'BPNT' | 'PKH' | 'Bansos Tunai / BLT Desa' | 'Sembako Beras' | 'Bantuan Lansia' | 'KIP / PIP' | 'Lainnya';
  namaPenerima: string;
  noKK: string;
  nik?: string;
  nominalAtauBarang: string;
  tanggal: string;
  status: 'Sudah Disalurkan' | 'Baru Diusulkan' | 'Proses Verifikasi' | 'Ditolak';
  sumberDana?: string;
  keterangan?: string;
}

export interface DokumenPdfWarga {
  id: string;
  judul: string;
  namaFile: string;
  ukuranKb: number;
  tanggalUpload: string;
  kategori: string;
  keterangan?: string;
  dataBase64?: string;
}
