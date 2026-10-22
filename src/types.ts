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
}

export interface Warga {
  id: string;
  no: number;
  nama: string;
  noRumah: string;
  rt: string;
  jenisKelamin: 'Laki-laki' | 'Perempuan';
  jumlahJiwa: number;
  statusIuran: 'Sudah' | 'Belum';
  kekuranganKas?: number;
  bulanTunggakan?: string[];
  telepon?: string;
}

export interface AuthUser {
  role: 'admin' | 'warga';
  username: string;
  nama: string;
  wargaId?: string;
}

export interface PengumumanRT {
  id: string;
  judul: string;
  tanggal: string;
  kategori: 'Kegiatan' | 'Iuran' | 'Keamanan' | 'Sosial' | 'Umum';
  isi: string;
  penulis: string;
  penting?: boolean;
}
