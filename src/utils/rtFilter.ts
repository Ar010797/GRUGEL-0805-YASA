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
  if (/^semua(\s+rt)?$/i.test(cleaned)) {
    return 'SEMUA';
  }
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

export interface ResidentOption {
  optionKey: string;
  residentId: string;
  nama: string;
  hubungan: string;
  isKepalaKeluarga: boolean;
  kkHeadName: string;
  noKK: string;
  nik?: string;
  noRumah: string;
  rt: string;
  rw: string;
  rtScope: string;
}

export function getWargaRTCode(warga: Warga, defaultRT = '08'): string {
  return normalizeRTCode(warga.rt) || normalizeRTCode(defaultRT) || '08';
}

export function getSelectableResidentsForRT(params: {
  wargaList: Warga[];
  targetRT?: string | null;
  activeRole?: 'server' | 'admin' | 'warga';
  defaultRW?: string;
}): ResidentOption[] {
  const { wargaList, targetRT, activeRole, defaultRW = '05' } = params;
  const normalizedTarget = normalizeRTCode(targetRT);

  // Admin RT MUST always be restricted to a single concrete RT; never leak cross-RT records
  if (activeRole === 'admin' && (!normalizedTarget || normalizedTarget === 'SEMUA')) {
    return [];
  }

  const scopedWarga =
    normalizedTarget && normalizedTarget !== 'SEMUA'
      ? wargaList.filter((w) => getWargaRTCode(w, '') === normalizedTarget)
      : wargaList;

  const sortedWarga = [...scopedWarga].sort((a, b) => {
    const rtCmp = getWargaRTCode(a, '08').localeCompare(getWargaRTCode(b, '08'), 'id', {
      numeric: true,
    });
    if (rtCmp !== 0) return rtCmp;
    const noA = Number(a.no) || 0;
    const noB = Number(b.no) || 0;
    if (noA !== noB) return noA - noB;
    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
  });

  const options: ResidentOption[] = [];

  for (const w of sortedWarga) {
    const headName = String(w.nama || '').trim();
    if (!headName) continue;
    const rt = getWargaRTCode(w, normalizedTarget || '08');
    const rw = normalizeRWCode(w.rw, defaultRW);
    const rtScope = `RT ${rt} RW ${rw}`;
    const matchedHeadMemberNik = Array.isArray(w.anggotaKeluarga)
      ? w.anggotaKeluarga.find(
          (m) =>
            m?.hubungan === 'Kepala Keluarga' ||
            String(m?.nama || '').trim().toLowerCase() === headName.toLowerCase()
        )?.nik
      : undefined;
    const headNik = String(w.nik || matchedHeadMemberNik || '').trim();

    options.push({
      optionKey: `${w.id}::kk`,
      residentId: w.id,
      nama: headName,
      hubungan: 'Kepala Keluarga',
      isKepalaKeluarga: true,
      kkHeadName: headName,
      noKK: String(w.noKK || '').trim(),
      nik: headNik,
      noRumah: String(w.noRumah || '-').trim(),
      rt,
      rw,
      rtScope,
    });

    const seenNames = new Set<string>([headName.toLowerCase()]);
    if (Array.isArray(w.anggotaKeluarga)) {
      w.anggotaKeluarga.forEach((member, idx) => {
        const mName = String(member?.nama || '').trim();
        if (!mName) return;
        const lower = mName.toLowerCase();
        if (seenNames.has(lower)) return;
        seenNames.add(lower);
        options.push({
          optionKey: `${w.id}::m_${idx}`,
          residentId: w.id,
          nama: mName,
          hubungan: String(member?.hubungan || 'Anggota Keluarga').trim(),
          isKepalaKeluarga: false,
          kkHeadName: headName,
          noKK: String(w.noKK || '').trim(),
          nik: String(member?.nik || '').trim(),
          noRumah: String(w.noRumah || '-').trim(),
          rt,
          rw,
          rtScope,
        });
      });
    }
  }

  return options;
}

export function resolveTransactionWargaName(
  tx: Transaction,
  wargaList: Warga[] = []
): string {
  if (tx.residentId && wargaList.length > 0) {
    const matched = wargaList.find((w) => w.id === tx.residentId);
    if (matched) {
      const storedLower = String(tx.namaWarga || '').trim().toLowerCase();
      if (storedLower && Array.isArray(matched.anggotaKeluarga)) {
        const matchedMember = matched.anggotaKeluarga.find(
          (m) =>
            m?.hubungan !== 'Kepala Keluarga' &&
            String(m?.nama || '').trim().toLowerCase() === storedLower
        );
        if (matchedMember?.nama) {
          return matchedMember.nama;
        }
      }
      if (matched.nama) {
        return matched.nama;
      }
    }
  }

  if (tx.namaWarga && tx.namaWarga.trim()) {
    return tx.namaWarga.trim();
  }

  if (tx.noKK && wargaList.length > 0) {
    const cleanKK = tx.noKK.replace(/\s+/g, '');
    const matchedByKK = wargaList.find(
      (w) => (w.noKK || '').replace(/\s+/g, '') === cleanKK
    );
    if (matchedByKK?.nama) return matchedByKK.nama;
  }

  return '';
}

export function isKasKematianOutflow(tx: Transaction): boolean {
  if (tx.tipe !== 'kematian') return false;
  if (tx.isSaldoAwal) return false;
  const kat = String(tx.kategori || '').toLowerCase();
  if (
    kat.includes('iuran') ||
    kat.includes('setoran') ||
    kat.includes('pemasukan') ||
    kat.includes('saldo') ||
    kat.includes('masuk')
  ) {
    return false;
  }
  return (
    kat.includes('santunan') ||
    kat.includes('pengeluaran') ||
    kat.includes('keluar') ||
    kat.includes('duka') ||
    kat.includes('pemakaman') ||
    kat.includes('kafan') ||
    kat.includes('mori')
  );
}

export function isTransactionInflow(tx: Transaction): boolean {
  if (tx.tipe === 'masuk') return true;
  if (tx.tipe === 'keluar') return false;
  if (tx.tipe === 'kematian') return !isKasKematianOutflow(tx);
  return true;
}

export function getKasKematianBalanceSummary(transactions: Transaction[]): {
  totalMasukKematian: number;
  totalKeluarKematian: number;
  saldoKematian: number;
  masukCount: number;
  keluarCount: number;
} {
  let totalMasukKematian = 0;
  let totalKeluarKematian = 0;
  let masukCount = 0;
  let keluarCount = 0;

  for (const t of transactions) {
    if (t.tipe !== 'kematian') continue;
    if (isKasKematianOutflow(t)) {
      totalKeluarKematian += t.nominal;
      keluarCount += 1;
    } else {
      totalMasukKematian += t.nominal;
      masukCount += 1;
    }
  }

  return {
    totalMasukKematian,
    totalKeluarKematian,
    saldoKematian: totalMasukKematian - totalKeluarKematian,
    masukCount,
    keluarCount,
  };
}

export function getTransactionRTCode(
  tx: Transaction,
  wargaList: Warga[],
  defaultRT = '08'
): string {
  const explicit = normalizeRTCode(tx.rtScope);
  if (explicit) return explicit;

  if (tx.residentId) {
    const matchedById = wargaList.find((w) => w.id === tx.residentId);
    if (matchedById) return getWargaRTCode(matchedById, defaultRT);
  }

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
    const totalKematian = getKasKematianBalanceSummary(rtTx).saldoKematian;

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

export function normalizePersonName(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function getTransactionYear(tx: Transaction, fallbackYear = 2026): number {
  if (typeof tx.tahun === 'number' && Number.isFinite(tx.tahun) && tx.tahun >= 2000 && tx.tahun <= 2100) {
    return tx.tahun;
  }
  const raw = String(tx.tanggal || '').trim();
  const isoMatch = raw.match(/^(\d{4})[-/]/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    if (y >= 2000 && y <= 2100) return y;
  }
  const dmyMatch = raw.match(/[-/](\d{4})$/);
  if (dmyMatch) {
    const y = Number(dmyMatch[1]);
    if (y >= 2000 && y <= 2100) return y;
  }
  return fallbackYear;
}

export function getTransactionMonth(tx: Transaction): number | null {
  const raw = String(tx.tanggal || '').trim();
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (isoMatch) {
    const m = Number(isoMatch[2]);
    return m >= 1 && m <= 12 ? m : null;
  }
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const m = Number(dmyMatch[2]);
    return m >= 1 && m <= 12 ? m : null;
  }
  return null;
}

function getAllNormalizedNamesForWarga(warga: Warga): Set<string> {
  const names = new Set<string>();
  const head = normalizePersonName(warga.nama);
  if (head) names.add(head);
  if (Array.isArray(warga.anggotaKeluarga)) {
    for (const member of warga.anggotaKeluarga) {
      const mName = normalizePersonName(member?.nama);
      if (mName) names.add(mName);
    }
  }
  return names;
}

export function doesTransactionBelongToWarga(
  tx: Transaction,
  warga: Warga,
  _allWarga: Warga[] = []
): boolean {
  if (!tx || !warga || tx.isSaldoAwal) return false;

  if (tx.residentId) {
    return tx.residentId === warga.id;
  }

  const txKK = String(tx.noKK || '').replace(/\s+/g, '');
  const wargaKK = String(warga.noKK || '').replace(/\s+/g, '');
  if (txKK && wargaKK) {
    return txKK === wargaKK;
  }

  const txRt = normalizeRTCode(tx.rtScope);
  const wargaRt = normalizeRTCode(warga.rt);
  if (txRt && txRt !== 'SEMUA' && wargaRt && txRt !== wargaRt) {
    return false;
  }

  const txName = normalizePersonName(tx.namaWarga);
  if (!txName) return false;

  const familyNames = getAllNormalizedNamesForWarga(warga);
  return familyNames.has(txName);
}

export function resolveTransactionResidentId(
  tx: Transaction,
  wargaList: Warga[],
  fallbackRT = '08'
): string | undefined {
  if (!tx || tx.isSaldoAwal || wargaList.length === 0) {
    return tx?.residentId || undefined;
  }

  if (tx.residentId) {
    const direct = wargaList.find((w) => w.id === tx.residentId);
    if (direct) return direct.id;
  }

  const txKK = String(tx.noKK || '').replace(/\s+/g, '');
  if (txKK) {
    const matchedKK = wargaList.find((w) => String(w.noKK || '').replace(/\s+/g, '') === txKK);
    if (matchedKK) return matchedKK.id;
  }

  const txName = normalizePersonName(tx.namaWarga);
  if (txName) {
    const txRt = normalizeRTCode(tx.rtScope) || normalizeRTCode(fallbackRT);
    const sameRtCandidates = wargaList.filter(
      (w) => !txRt || txRt === 'SEMUA' || getWargaRTCode(w, txRt) === txRt
    );
    const searchPool = sameRtCandidates.length > 0 ? sameRtCandidates : wargaList;

    const matchedHead = searchPool.find((w) => normalizePersonName(w.nama) === txName);
    if (matchedHead) return matchedHead.id;

    const matchedMember = searchPool.find((w) =>
      Array.isArray(w.anggotaKeluarga)
        ? w.anggotaKeluarga.some((m) => normalizePersonName(m?.nama) === txName)
        : false
    );
    if (matchedMember) return matchedMember.id;
  }

  return tx.residentId || undefined;
}

function buildMonthMapFromInflows(
  inflows: Transaction[],
  totalNominal: number,
  annualTarget: number
): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  for (const tx of inflows) {
    const month = getTransactionMonth(tx);
    if (month !== null) {
      map[month] = true;
    }
  }
  if (annualTarget > 0 && totalNominal >= annualTarget) {
    for (let m = 1; m <= 12; m++) {
      map[m] = true;
    }
  }
  return map;
}

function areBooleanMonthMapsEqual(
  a?: Record<number, boolean>,
  b?: Record<number, boolean>
): boolean {
  const keysA = Object.entries(a || {})
    .filter(([, v]) => Boolean(v))
    .map(([k]) => String(k))
    .sort();
  const keysB = Object.entries(b || {})
    .filter(([, v]) => Boolean(v))
    .map(([k]) => String(k))
    .sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, idx) => k === keysB[idx]);
}

export function reconcileWargaCashFromTransactions(params: {
  warga: Warga;
  transactions: Transaction[];
  tahunAktif: number;
  pengaturanKas?: PengaturanKas;
  allWarga?: Warga[];
  nowIso?: string;
  forceClearIfZero?: boolean;
}): Warga {
  const {
    warga,
    transactions,
    tahunAktif,
    pengaturanKas,
    allWarga = [],
    nowIso = new Date().toISOString(),
    forceClearIfZero = false,
  } = params;

  const matchingYearTxs = transactions.filter(
    (t) =>
      !t.isSaldoAwal &&
      getTransactionYear(t, tahunAktif) === tahunAktif &&
      doesTransactionBelongToWarga(t, warga, allWarga)
  );

  const umumInflows = matchingYearTxs.filter((t) => t.tipe === 'masuk');
  const kematianInflows = matchingYearTxs.filter(
    (t) => t.tipe === 'kematian' && !isKasKematianOutflow(t)
  );

  const iuranUmumTerbayar = umumInflows.reduce(
    (sum, t) => sum + (Number.isFinite(Number(t.nominal)) ? Number(t.nominal) : 0),
    0
  );
  const iuranKematianTerbayar = kematianInflows.reduce(
    (sum, t) => sum + (Number.isFinite(Number(t.nominal)) ? Number(t.nominal) : 0),
    0
  );

  const annualUmumTarget = Number(pengaturanKas?.nominalJimpitanTahunan) || 0;
  const annualKematianTarget = Number(pengaturanKas?.nominalKematianTahunan) || 0;

  const hasAnyRecordedPayment = umumInflows.length > 0 || kematianInflows.length > 0;
  const existingYearUmumMap =
    (warga.riwayatIuranPerTahun && warga.riwayatIuranPerTahun[tahunAktif]) ||
    warga.riwayatIuran ||
    {};
  const existingYearKematianMap =
    (warga.riwayatKematianPerTahun && warga.riwayatKematianPerTahun[tahunAktif]) ||
    warga.riwayatKematian ||
    {};

  const nextRiwayatIuran =
    umumInflows.length > 0
      ? buildMonthMapFromInflows(umumInflows, iuranUmumTerbayar, annualUmumTarget)
      : forceClearIfZero
      ? {}
      : { ...existingYearUmumMap };

  const nextRiwayatKematian =
    kematianInflows.length > 0
      ? buildMonthMapFromInflows(kematianInflows, iuranKematianTerbayar, annualKematianTarget)
      : forceClearIfZero
      ? {}
      : { ...existingYearKematianMap };

  const prevYearStatus =
    (warga.statusIuranPerTahun && warga.statusIuranPerTahun[tahunAktif]) ||
    warga.statusIuran ||
    'Belum';

  const nextStatusIuran: 'Sudah' | 'Belum' =
    iuranUmumTerbayar > 0 || iuranKematianTerbayar > 0
      ? 'Sudah'
      : forceClearIfZero
      ? 'Belum'
      : prevYearStatus === 'Sudah' && !hasAnyRecordedPayment
      ? 'Sudah'
      : 'Belum';

  return {
    ...warga,
    statusIuran: nextStatusIuran,
    iuranUmumTerbayar,
    iuranKematianTerbayar,
    riwayatIuran: nextRiwayatIuran,
    riwayatKematian: nextRiwayatKematian,
    riwayatIuranPerTahun: {
      ...(warga.riwayatIuranPerTahun || {}),
      [tahunAktif]: nextRiwayatIuran,
    },
    riwayatKematianPerTahun: {
      ...(warga.riwayatKematianPerTahun || {}),
      [tahunAktif]: nextRiwayatKematian,
    },
    statusIuranPerTahun: {
      ...(warga.statusIuranPerTahun || {}),
      [tahunAktif]: nextStatusIuran,
    },
    updatedAt: nowIso,
  };
}

export function hasWargaCashDiff(a: Warga, b: Warga, tahunAktif = 2026): boolean {
  if (a.statusIuran !== b.statusIuran) return true;
  if ((Number(a.iuranUmumTerbayar) || 0) !== (Number(b.iuranUmumTerbayar) || 0)) return true;
  if ((Number(a.iuranKematianTerbayar) || 0) !== (Number(b.iuranKematianTerbayar) || 0)) return true;
  if (!areBooleanMonthMapsEqual(a.riwayatIuran, b.riwayatIuran)) return true;
  if (!areBooleanMonthMapsEqual(a.riwayatKematian, b.riwayatKematian)) return true;
  const aStatusYr = a.statusIuranPerTahun?.[tahunAktif] || a.statusIuran;
  const bStatusYr = b.statusIuranPerTahun?.[tahunAktif] || b.statusIuran;
  if (aStatusYr !== bStatusYr) return true;
  if (
    !areBooleanMonthMapsEqual(
      a.riwayatIuranPerTahun?.[tahunAktif],
      b.riwayatIuranPerTahun?.[tahunAktif]
    )
  ) {
    return true;
  }
  if (
    !areBooleanMonthMapsEqual(
      a.riwayatKematianPerTahun?.[tahunAktif],
      b.riwayatKematianPerTahun?.[tahunAktif]
    )
  ) {
    return true;
  }
  return false;
}

