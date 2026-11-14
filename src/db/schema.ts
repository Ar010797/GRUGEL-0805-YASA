import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  AnggotaKeluarga,
  ProfilRT,
  RiwayatPerubahanKK,
} from '../types';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('warga'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  tahunAktif: integer('tahun_aktif').notNull().default(2026),
  nominalJimpitanTahunan: bigint('nominal_jimpitan_tahunan', { mode: 'number' }).notNull().default(300000),
  nominalJimpitanBulanan: bigint('nominal_jimpitan_bulanan', { mode: 'number' }).notNull().default(25000),
  nominalKematianTahunan: bigint('nominal_kematian_tahunan', { mode: 'number' }).notNull().default(120000),
  nominalKematianBulanan: bigint('nominal_kematian_bulanan', { mode: 'number' }).notNull().default(10000),
  saldoAwalKasUmum: bigint('saldo_awal_kas_umum', { mode: 'number' }).notNull().default(0),
  saldoAwalKasKematian: bigint('saldo_awal_kas_kematian', { mode: 'number' }).notNull().default(0),
  keteranganSaldoAwal: text('keterangan_saldo_awal').notNull().default('Sisa Kas RT Periode Lalu'),
  tanggalSaldoAwal: text('tanggal_saldo_awal').notNull().default('2026-01-01'),
  kontakKetuaRT: jsonb('kontak_ketua_rt').$type<{ nama: string; telp: string }>().notNull(),
  kontakBendahara: jsonb('kontak_bendahara').$type<{ nama: string; telp: string }>().notNull(),
  saldoBerlanjutPerTahun: jsonb('saldo_berlanjut_per_tahun').$type<
    Record<number, { kasUmum: number; kasKematian: number }>
  >(),
  profilRT: jsonb('profil_rt').$type<ProfilRT>(),
  updatedAt: text('updated_at').notNull(),
});

export const adminAccounts = pgTable('admin_accounts', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  nama: text('nama').notNull(),
  rt: text('rt').notNull().default('08'),
  rw: text('rw').notNull().default('05'),
  kontak: text('kontak').notNull().default(''),
  jabatan: text('jabatan').notNull().default('Ketua RT'),
  status: text('status').notNull().default('aktif'),
  terakhirLogin: text('terakhir_login'),
  terakhirSinkronisasi: text('terakhir_sinkronisasi'),
  updatedAt: text('updated_at').notNull(),
});

export const warga = pgTable('warga', {
  id: text('id').primaryKey(),
  no: integer('no').notNull().default(0),
  nama: text('nama').notNull(),
  noKK: text('no_kk').notNull().default(''),
  nik: text('nik'),
  noRumah: text('no_rumah').notNull().default(''),
  rt: text('rt').notNull().default('08'),
  rw: text('rw').default('05'),
  alamat: text('alamat'),
  kodePos: text('kode_pos'),
  tanggalDikeluarkan: text('tanggal_dikeluarkan'),
  jenisKelamin: text('jenis_kelamin').notNull().default('Laki-laki'),
  jumlahJiwa: integer('jumlah_jiwa').notNull().default(1),
  statusIuran: text('status_iuran').notNull().default('Belum'),
  anggotaKeluarga: jsonb('anggota_keluarga').$type<AnggotaKeluarga[]>(),
  riwayatIuran: jsonb('riwayat_iuran').$type<Record<number, boolean>>(),
  riwayatKematian: jsonb('riwayat_kematian').$type<Record<number, boolean>>(),
  riwayatIuranPerTahun: jsonb('riwayat_iuran_per_tahun').$type<Record<number, Record<number, boolean>>>(),
  riwayatKematianPerTahun: jsonb('riwayat_kematian_per_tahun').$type<Record<number, Record<number, boolean>>>(),
  statusIuranPerTahun: jsonb('status_iuran_per_tahun').$type<Record<number, 'Sudah' | 'Belum'>>(),
  iuranUmumTerbayar: bigint('iuran_umum_terbayar', { mode: 'number' }),
  iuranKematianTerbayar: bigint('iuran_kematian_terbayar', { mode: 'number' }),
  pilihanSkema: text('pilihan_skema'),
  telepon: text('telepon'),
  pin: text('pin'),
  pinAttempts: integer('pin_attempts'),
  pinLockedUntil: bigint('pin_locked_until', { mode: 'number' }),
  riwayatPerubahanKK: jsonb('riwayat_perubahan_kk').$type<RiwayatPerubahanKK[]>(),
  updatedAt: text('updated_at').notNull(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  tanggal: text('tanggal').notNull(),
  kategori: text('kategori').notNull(),
  keterangan: text('keterangan').notNull().default(''),
  nominal: bigint('nominal', { mode: 'number' }).notNull().default(0),
  tipe: text('tipe').notNull().default('masuk'),
  namaWarga: text('nama_warga'),
  nomorRumah: text('nomor_rumah'),
  noKK: text('no_kk'),
  isSaldoAwal: boolean('is_saldo_awal'),
  tahun: integer('tahun').default(2026),
  rtScope: text('rt_scope'),
  updatedAt: text('updated_at').notNull(),
});

export const bantuan = pgTable('bantuan', {
  id: text('id').primaryKey(),
  jenisBantuan: text('jenis_bantuan').notNull(),
  namaPenerima: text('nama_penerima').notNull(),
  noKK: text('no_kk').notNull().default(''),
  nik: text('nik'),
  nominalAtauBarang: text('nominal_atau_barang').notNull().default(''),
  tanggal: text('tanggal').notNull().default(''),
  status: text('status').notNull().default('Sudah Disalurkan'),
  sumberDana: text('sumber_dana'),
  keterangan: text('keterangan'),
  rtScope: text('rt_scope'),
  updatedAt: text('updated_at').notNull(),
});

export const pengumuman = pgTable('pengumuman', {
  id: text('id').primaryKey(),
  judul: text('judul').notNull(),
  tanggal: text('tanggal').notNull(),
  tanggalBerakhir: text('tanggal_berakhir').notNull().default(''),
  kategori: text('kategori').notNull().default('Umum'),
  isi: text('isi').notNull(),
  penulis: text('penulis').notNull().default(''),
  namaPengurus: text('nama_pengurus'),
  jabatanPengurus: text('jabatan_pengurus'),
  penting: boolean('penting'),
  tentang: text('tentang'),
  hariTanggalAcara: text('hari_tanggal_acara'),
  waktuAcara: text('waktu_acara'),
  tempatAcara: text('tempat_acara'),
  keteranganTambahan: text('keterangan_tambahan'),
  rtScope: text('rt_scope'),
  updatedAt: text('updated_at').notNull(),
});

export const dokumen = pgTable('dokumen', {
  id: text('id').primaryKey(),
  judul: text('judul').notNull(),
  namaFile: text('nama_file').notNull(),
  ukuranKb: integer('ukuran_kb').notNull().default(0),
  tanggalUpload: text('tanggal_upload').notNull().default(''),
  kategori: text('kategori').notNull().default('Lainnya'),
  keterangan: text('keterangan'),
  dataBase64: text('data_base64'),
  rtScope: text('rt_scope'),
  updatedAt: text('updated_at').notNull(),
});

export const laporanBulanan = pgTable('laporan_bulanan', {
  id: text('id').primaryKey(),
  rt: text('rt').notNull(),
  rw: text('rw').notNull(),
  namaAdminPengirim: text('nama_admin_pengirim').notNull(),
  tanggalKirim: text('tanggal_kirim').notNull(),
  bulanTahun: text('bulan_tahun').notNull(),
  tahun: integer('tahun').notNull().default(2026),
  totalKK: integer('total_kk').notNull().default(0),
  totalJiwa: integer('total_jiwa').notNull().default(0),
  totalLunasIuran: integer('total_lunas_iuran').notNull().default(0),
  totalBelumLunas: integer('total_belum_lunas').notNull().default(0),
  totalKasMasukBulanIni: bigint('total_kas_masuk_bulan_ini', { mode: 'number' }).notNull().default(0),
  totalKasKeluarBulanIni: bigint('total_kas_keluar_bulan_ini', { mode: 'number' }).notNull().default(0),
  saldoKasUmumBerjalan: bigint('saldo_kas_umum_berjalan', { mode: 'number' }).notNull().default(0),
  saldoKasKematianBerjalan: bigint('saldo_kas_kematian_berjalan', { mode: 'number' }).notNull().default(0),
  totalPenerimaBansos: integer('total_penerima_bansos').notNull().default(0),
  catatanKhusus: text('catatan_khusus'),
  statusVerifikasi: text('status_verifikasi').notNull().default('Menunggu Verifikasi'),
  updatedAt: text('updated_at').notNull(),
});

export const deletedEntities = pgTable('deleted_entities', {
  id: text('id').primaryKey(), // `${entityType}:${entityId}`
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  deletedAt: text('deleted_at').notNull(),
});

export const syncMeta = pgTable('sync_meta', {
  id: text('id').primaryKey(), // 'global'
  revision: bigint('revision', { mode: 'number' }).notNull().default(1),
  lastUpdated: text('last_updated').notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  role: text('role').notNull(), // 'server' | 'admin' | 'warga'
  username: text('username').notNull(),
  nama: text('nama').notNull(),
  noKK: text('no_kk'),
  wargaId: text('warga_id'),
  rtScope: text('rt_scope'),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: text('created_at').notNull(),
});
