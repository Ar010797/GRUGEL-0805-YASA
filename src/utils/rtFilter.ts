import {
  AdminRTAccount,
  BantuanPemerintah,
  PembaruanBulananRT,
  PengaturanKas,
  Transaction,
  Warga,
} from '../types';

export interface RegisteredRTInfo {
  rt: string;
  rw: string;
  label: string;
  adminNames: string[];
  adminAccounts: AdminRTAccount[];
  totalKK: number;
  totalJiwa: number;
  lunasKK: number;
  belumKK: number;
  totalMasuk: number;
  totalKeluar: number;
  totalKematian: number;
  saldoKas: number;
  totalBansos: number;
  latestLaporan?: PembaruanBulananRT;
}

export function normalizeRTCode(value?: string | null): string {
  if (!value) return '';
  const cleaned = value.trim();
  if (!cleaned) return '';
  const rtMatch = cleaned.match(/RT\s*0*([0-9]+)/i);
  if (rtMatch) {
    return rtMatch[1].padStart(2, '0');
  }
  const numMatch = cleaned.match(/^0*([0-9]+)$/);
  if (numMatch) {
    return numMatch[1].padStart(2, '0');
  }
  return cleaned.toUpperCase();
}

export function normalizeRWCode(value?: string | null, fallback = '05'): string {
  if (!value) return fallback;
  const cleaned = value.trim();
  if (!cleaned) return fallback;
  const rwMatch = cleaned.match(/RW\s*0*([0-9]+)/i);
  if (rwMatch) {
    return rwMatch[1].padStart(2, '0');
  }
  const numMatch = cleaned.match(/^0*([0-9]+)$/);
  if (numMatch) {
    return numMatch[1].padStart(2, '0');
  }
  return cleaned.toUpperCase();
}

export function getWargaRTCode(warga: Warga, defaultRT = '08'): string {
  return normalizeRTCode(warga.rt) || normalizeRTCode(defaultRT) || '08';
}

export function getTransactionRTCode(
  tx: Transaction,
  wargaList: Warga[],
  defaultRT = '08'
): string {
  const explicit = normalizeRTCode(tx.rtScope);
  if (explicit) return explicit;

  if (tx.noKK) {
    const cleanKK = tx.noKK.replace(/\s+/g, '');
    const matched = wargaList.find(
      (w) => (w.noKK || '').replace(/\s+/g, '') === cleanKK
    );
    if (matched) return getWargaRTCode(matched, defaultRT);
  }

  if (tx.namaWarga) {
    const cleanName = tx.namaWarga.trim().toLowerCase();
    const matched = wargaList.find(
      (w) => w.nama.trim().toLowerCase() === cleanName
    );
    if (matched) return getWargaRTCode(matched, defaultRT);
  }

  return normalizeRTCode(defaultRT) || '08';
}

export function getBantuanRTCode(
  bantuan: BantuanPemerintah,
  wargaList: Warga[],
  defaultRT = '08'
): string {
  const explicit = normalizeRTCode(bantuan.rtScope);
  if (explicit) return explicit;

  if (bantuan.noKK) {
    const cleanKK = bantuan.noKK.replace(/\s+/g, '');
    const matched = wargaList.find(
      (w) => (w.noKK || '').replace(/\s+/g, '') === cleanKK
    );
    if (matched) return getWargaRTCode(matched, defaultRT);
  }

  if (bantuan.namaPenerima) {
    const cleanName = bantuan.namaPenerima.trim().toLowerCase();
    const matched = wargaList.find(
      (w) => w.nama.trim().toLowerCase() === cleanName
    );
    if (matched) return getWargaRTCode(matched, defaultRT);
  }

  return normalizeRTCode(defaultRT) || '08';
}

export function collectRegisteredRTs(params: {
  adminAccounts: AdminRTAccount[];
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  laporanBulananRT: PembaruanBulananRT[];
  pengaturanKas: PengaturanKas;
}): RegisteredRTInfo[] {
  const {
    adminAccounts,
    wargaList,
    transactions,
    bantuanList,
    laporanBulananRT,
    pengaturanKas,
  } = params;

  const defaultRT = normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08';
  const defaultRW = normalizeRWCode(pengaturanKas.profilRT?.namaRW, '05');

  const rtSet = new Set<string>();
  rtSet.add(defaultRT);

  adminAccounts.forEach((acc) => {
    const code = normalizeRTCode(acc.rt);
    if (code) rtSet.add(code);
  });

  wargaList.forEach((w) => {
    const code = normalizeRTCode(w.rt);
    if (code) rtSet.add(code);
  });

  transactions.forEach((t) => {
    const code = normalizeRTCode(t.rtScope);
    if (code) rtSet.add(code);
  });

  laporanBulananRT.forEach((rep) => {
    const code = normalizeRTCode(rep.rt);
    if (code) rtSet.add(code);
  });

  const sortedRTs = Array.from(rtSet).sort((a, b) =>
    a.localeCompare(b, 'id', { numeric: true })
  );

  return sortedRTs.map((rt) => {
    const rtAdmins = adminAccounts.filter((acc) => normalizeRTCode(acc.rt) === rt);
    const rtWarga = wargaList.filter((w) => getWargaRTCode(w, defaultRT) === rt);
    const rtTx = transactions.filter(
      (t) => getTransactionRTCode(t, wargaList, defaultRT) === rt
    );
    const rtBansos = bantuanList.filter(
      (b) => getBantuanRTCode(b, wargaList, defaultRT) === rt
    );
    const rtLaporans = laporanBulananRT.filter(
      (rep) => normalizeRTCode(rep.rt) === rt
    );
    const latestLaporan = rtLaporans[0];

    const rw =
      normalizeRWCode(rtAdmins[0]?.rw, '') ||
      normalizeRWCode(rtWarga[0]?.rw, '') ||
      normalizeRWCode(latestLaporan?.rw, '') ||
      defaultRW;

    const totalMasuk = rtTx
      .filter((t) => t.tipe === 'masuk')
      .reduce((acc, t) => acc + t.nominal, 0);
    const totalKeluar = rtTx
      .filter((t) => t.tipe === 'keluar')
      .reduce((acc, t) => acc + t.nominal, 0);
    const totalKematian = rtTx
      .filter((t) => t.tipe === 'kematian')
      .reduce((acc, t) => acc + t.nominal, 0);

    const hasLiveTx = rtTx.length > 0;
    const totalKK = rtWarga.length > 0 ? rtWarga.length : latestLaporan?.totalKK || 0;
    const totalJiwa =
      rtWarga.length > 0
        ? rtWarga.reduce(
            (acc, w) => acc + (w.anggotaKeluarga?.length || w.jumlahJiwa || 1),
            0
          )
        : latestLaporan?.totalJiwa || 0;
    const lunasKK =
      rtWarga.length > 0
        ? rtWarga.filter((w) => w.statusIuran === 'Sudah').length
        : latestLaporan?.totalLunasIuran || 0;
    const belumKK = Math.max(0, totalKK - lunasKK);

    const saldoKas =
      hasLiveTx || !latestLaporan
        ? totalMasuk - totalKeluar
        : latestLaporan.saldoKasUmumBerjalan;

    const effectiveKematian =
      hasLiveTx || !latestLaporan
        ? totalKematian
        : latestLaporan.saldoKasKematianBerjalan;

    return {
      rt,
      rw,
      label: `RT ${rt} RW ${rw}`,
      adminNames: rtAdmins.map((a) => a.nama).filter(Boolean),
      adminAccounts: rtAdmins,
      totalKK,
      totalJiwa,
      lunasKK,
      belumKK,
      totalMasuk,
      totalKeluar,
      totalKematian: effectiveKematian,
      saldoKas,
      totalBansos: rtBansos.length > 0 ? rtBansos.length : latestLaporan?.totalPenerimaBansos || 0,
      latestLaporan,
    };
  });
}

export function buildServerFilteredViewData(params: {
  selectedRT: string; // 'SEMUA' or normalized RT e.g. '08', '01'
  adminAccounts: AdminRTAccount[];
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengaturanKas: PengaturanKas;
}): {
  wargaList: Warga[];
  transactions: Transaction[];
  bantuanList: BantuanPemerintah[];
  pengaturanKas: PengaturanKas;
  scopeTitle: string;
} {
  const {
    selectedRT,
    adminAccounts,
    wargaList,
    transactions,
    bantuanList,
    pengaturanKas,
  } = params;

  const defaultRT = normalizeRTCode(pengaturanKas.profilRT?.namaRT) || '08';
  const defaultRW = normalizeRWCode(pengaturanKas.profilRT?.namaRW, '05');
  const desaStr = pengaturanKas.profilRT?.desa || 'Desa Kotayasa';

  if (!selectedRT || selectedRT === 'SEMUA') {
    const allPengaturan: PengaturanKas = {
      ...pengaturanKas,
      profilRT: {
        ...(pengaturanKas.profilRT || {
          namaRT: 'Semua RT',
          namaRW: defaultRW,
          desa: desaStr,
          kecamatan: 'Kecamatan Sumbang',
          kabupaten: 'Kabupaten Banyumas',
        }),
        namaRT: 'Semua RT',
        judulKopSurat: `PEMERINTAH ${desaStr.toUpperCase()} - REKAPITULASI SELURUH RT`,
        sebutanWilayah: `Seluruh Admin RT Terdaftar • ${desaStr}`,
      },
    };
    return {
      wargaList,
      transactions,
      bantuanList,
      pengaturanKas: allPengaturan,
      scopeTitle: `Seluruh Admin RT Terdaftar (${desaStr})`,
    };
  }

  const targetRT = normalizeRTCode(selectedRT);
  const matchedAdmin = adminAccounts.find(
    (a) => normalizeRTCode(a.rt) === targetRT
  );
  const filteredWarga = wargaList.filter(
    (w) => getWargaRTCode(w, defaultRT) === targetRT
  );
  const filteredTransactions = transactions.filter(
    (t) => getTransactionRTCode(t, wargaList, defaultRT) === targetRT
  );
  const filteredBantuan = bantuanList.filter(
    (b) => getBantuanRTCode(b, wargaList, defaultRT) === targetRT
  );

  const targetRW =
    normalizeRWCode(matchedAdmin?.rw, '') ||
    normalizeRWCode(filteredWarga[0]?.rw, '') ||
    defaultRW;

  const rtPengaturan: PengaturanKas = {
    ...pengaturanKas,
    kontakKetuaRT: matchedAdmin
      ? { nama: matchedAdmin.nama, telp: matchedAdmin.kontak || pengaturanKas.kontakKetuaRT.telp }
      : targetRT === defaultRT
      ? pengaturanKas.kontakKetuaRT
      : { nama: `Pengurus RT ${targetRT}`, telp: '-' },
    profilRT: {
      ...(pengaturanKas.profilRT || {
        namaRT: targetRT,
        namaRW: targetRW,
        desa: desaStr,
        kecamatan: 'Kecamatan Sumbang',
        kabupaten: 'Kabupaten Banyumas',
      }),
      namaRT: targetRT,
      namaRW: targetRW,
      judulKopSurat: `PENGURUS RUKUN TETANGGA ${targetRT} RUKUN WARGA ${targetRW}`,
      sebutanWilayah: `RT ${targetRT} RW ${targetRW} ${desaStr}`,
    },
  };

  return {
    wargaList: filteredWarga,
    transactions: filteredTransactions,
    bantuanList: filteredBantuan,
    pengaturanKas: rtPengaturan,
    scopeTitle: `RT ${targetRT} RW ${targetRW}${matchedAdmin ? ` • ${matchedAdmin.nama}` : ''}`,
  };
}
