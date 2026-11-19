import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  buildBantuanFirestorePayload,
  buildScopeIds,
  buildTransactionFirestorePayload,
  buildWargaFirestorePayload,
  resolveEntityDocId,
  RW05_RT_CODES,
} from './src/utils/firebaseSync';
import * as XLSX from 'xlsx';
import { parseExcelWargaAndBantuan } from './src/utils/excelWargaImport';
import {
  buildServerFilteredViewData,
  collectRegisteredRTs,
  doesTransactionBelongToWarga,
  getKasKematianBalanceSummary,
  getSelectableResidentsForRT,
  getTransactionRTCode,
  getWargaRTCode,
  hasWargaCashDiff,
  isKasKematianOutflow,
  isTransactionInflow,
  normalizeRTCode,
  normalizeRWCode,
  reconcileWargaCashFromTransactions,
  resolveTransactionResidentId,
  resolveTransactionWargaName,
} from './src/utils/rtFilter';
import { dedupeEntityList } from './src/utils/cloudSync';
import {
  computeBackoffDelayMs,
  formatFriendlyFirestoreError,
  isTerminalFirestoreError,
  isTransientFirestoreError,
  removePendingSyncOpsByKey,
  SYNC_BACKOFF_STEPS_MS,
  upsertPendingSyncOp,
  type PendingSyncOp,
} from './src/utils/syncQueue';
import type { PengaturanKas, Transaction, Warga } from './src/types';

/**
 * Security Rules & 8-RT Isolation Verification Suite
 * 1. Verifies Dirty Dozen security invariants & rwId/rtId constraints in firestore.rules.
 * 2. Verifies 8-RT (RT 01-08, RW 05) isolation, scope IDs, and deduplication logic.
 */
const rules = readFileSync('./firestore.rules', 'utf8');

const dirtyDozenChecks: { name: string; assertFn: () => void }[] = [
  {
    name: '1. Global default-deny safety net present',
    assertFn: () => assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/),
  },
  {
    name: '2. Verified email requirement enforced on bootstrapped admin claim (Anti-Spoofing)',
    assertFn: () => assert.match(rules, /request\.auth\.token\.email_verified == true/),
  },
  {
    name: '3. Bootstrapped admin email included cleanly with case-insensitive string guard',
    assertFn: () => {
      assert.match(rules, /request\.auth\.token\.email is string/);
      assert.match(rules, /request\.auth\.token\.email\.lower\(\) == 'ar01071997@gmail\.com'/);
    },
  },
  {
    name: '4. No blanket allow read/write on any collection',
    assertFn: () =>
      assert.equal(/allow\s+(read|write|get|list)\s*:\s*if\s+(true|isSignedIn\(\))\s*;/.test(rules), false),
  },
  {
    name: '5. Strict ID poisoning guard on single-doc operations',
    assertFn: () =>
      assert.match(rules, /function isValidId\(id\)[\s\S]*id\.size\(\) <= 128[\s\S]*\^\[a-zA-Z0-9_\\\\-\]\+\$/),
  },
  {
    name: '6. Strict keys hasAll + hasOnly on every entity validator',
    assertFn: () => {
      const hasAllCount = (rules.match(/data\.keys\(\)\.hasAll\(/g) || []).length;
      const hasOnlyCount = (rules.match(/data\.keys\(\)\.hasOnly\(/g) || []).length;
      assert.ok(hasAllCount >= 14 && hasOnlyCount >= 14);
    },
  },
  {
    name: '7. Strict server timestamp validation on create and update',
    assertFn: () => {
      assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
      assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
    },
  },
  {
    name: '8. Immutable ownerUid, rw, and createdAt enforced on updates',
    assertFn: () => {
      assert.match(rules, /incoming\(\)\.ownerUid == existing\(\)\.ownerUid/);
      assert.match(rules, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
      assert.match(rules, /incoming\(\)\.rw == existing\(\)\.rw/);
    },
  },
  {
    name: '9. Action-based affectedKeys().hasOnly() on updates',
    assertFn: () => {
      const affectedCount = (rules.match(/affectedKeys\(\)\.hasOnly\(/g) || []).length;
      assert.ok(affectedCount >= 14);
    },
  },
  {
    name: '10. RW & RT assignment + rwId/rtId canonical scope enforced across rules',
    assertFn: () => {
      assert.match(rules, /function isAssignedAdmin\(rw, rt\)/);
      assert.match(rules, /adminDoc\(\)\.rw == rw/);
      assert.match(rules, /adminDoc\(\)\.rt == rt/);
      assert.match(rules, /function isWargaInRWRT\(rw, rt\)/);
      assert.match(rules, /function isValidRwScope\(data\)/);
      assert.match(rules, /function isValidRwRtScope\(data\)/);
      assert.match(rules, /function hasRequiredScopeIds\(data\)/);
      const reqScopeCalls = (rules.match(/hasRequiredScopeIds\(incoming\(\)\)/g) || []).length;
      assert.ok(reqScopeCalls >= 11, `Expected >= 11 hasRequiredScopeIds calls, got ${reqScopeCalls}`);
    },
  },
  {
    name: '11. Warga PII & Confidential collections strictly isolated (no get/exists inside allow list)',
    assertFn: () => {
      assert.match(rules, /match \/warga\/\{wargaId\}[\s\S]*existing\(\)\.linkedUid == request\.auth\.uid/);
      assert.match(rules, /match \/bantuan\/\{bantuanId\}[\s\S]*isAssignedAdmin\(existing\(\)\.rw, existing\(\)\.rt\)/);
      assert.match(rules, /match \/dokumen\/\{dokumenId\}[\s\S]*isAssignedAdmin\(existing\(\)\.rw, existing\(\)\.rt\)/);
      assert.match(rules, /match \/adminAccounts\/\{accountId\}[\s\S]*isAssignedAdmin\(existing\(\)\.rw, existing\(\)\.rt\)/);
      assert.match(rules, /match \/laporanBulanan\/\{laporanId\}[\s\S]*isAssignedAdmin\(existing\(\)\.rw, existing\(\)\.rt\)/);
    },
  },
  {
    name: '12. Bounded strings, null-safe get guards & Admin self-escalation blocked',
    assertFn: () => {
      assert.match(rules, /isValidStr\(data\.isi, 1, 4000\)/);
      assert.match(rules, /data\.anggotaKeluarga\.size\(\) <= 30/);
      assert.match(rules, /incoming\(\)\.role == existing\(\)\.role/);
      assert.match(rules, /incoming\(\)\.rt == existing\(\)\.rt/);
      const nullSafeGetCount = (rules.match(/\(resource == null &&/g) || []).length;
      assert.ok(nullSafeGetCount >= 11, `Expected >= 11 null-safe resource checks, got ${nullSafeGetCount}`);
    },
  },
  {
    name: '13. Pengumuman SEMUA allows Server RW write & Admin RT own-RT/read-SEMUA',
    assertFn: () => {
      assert.match(rules, /match \/pengumuman\/\{pengumumanId\}[\s\S]*isServerInRW\(incoming\(\)\.rw\)/);
      assert.match(rules, /match \/adminAccounts\/\{accountId\}[\s\S]*existing\(\)\.authUid == request\.auth\.uid/);
    },
  },
];

const basePengaturan: PengaturanKas = {
  nominalJimpitanTahunan: 300000,
  nominalJimpitanBulanan: 25000,
  nominalKematianTahunan: 120000,
  nominalKematianBulanan: 10000,
  saldoAwalKasUmum: 0,
  saldoAwalKasKematian: 0,
  keteranganSaldoAwal: 'Test',
  tanggalSaldoAwal: '2026-01-01',
  kontakKetuaRT: { nama: 'Ketua', telp: '0812' },
  kontakBendahara: { nama: 'Bendahara', telp: '0813' },
  tahunAktif: 2026,
  profilRT: {
    namaRT: '08',
    namaRW: '05',
    desa: 'Desa Kotayasa',
    kecamatan: 'Sumbang',
    kabupaten: 'Banyumas',
  },
};

const unitLogicChecks: { name: string; assertFn: () => void }[] = [
  {
    name: '14. Canonical rwId & rtId generation for all 8 RTs (01-08) and RW-wide SEMUA',
    assertFn: () => {
      assert.deepEqual([...RW05_RT_CODES], ['01', '02', '03', '04', '05', '06', '07', '08']);
      for (const rt of RW05_RT_CODES) {
        assert.deepEqual(buildScopeIds(rt, '05'), { rwId: 'rw_05', rtId: `rt_${rt}` });
        assert.deepEqual(buildScopeIds(String(Number(rt)), '5'), { rwId: 'rw_05', rtId: `rt_${rt}` });
      }
      assert.deepEqual(buildScopeIds('SEMUA', '05'), { rwId: 'rw_05', rtId: 'SEMUA' });
      assert.equal(normalizeRWCode('RW 05'), '05');
      assert.equal(normalizeRTCode('RT 03 / RW 05'), '03');
    },
  },
  {
    name: '15. Strict cross-RT isolation for Warga & Transactions across RT 01-08 + Server RW SEMUA',
    assertFn: () => {
      const mockWarga: Warga[] = RW05_RT_CODES.map((rt, idx) => ({
        id: `w_${rt}`,
        no: idx + 1,
        nama: `Warga RT ${rt}`,
        noKK: `330200000000000${idx + 1}`,
        noRumah: `A-${idx + 1}`,
        rt,
        rw: '05',
        alamat: `Kotayasa RT ${rt}`,
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 3,
        statusIuran: 'Belum',
      }));
      const mockTxs: Transaction[] = RW05_RT_CODES.map((rt, idx) => ({
        id: `tx_${rt}`,
        tanggal: '2026-10-01',
        kategori: 'Iuran Warga',
        keterangan: `Iuran RT ${rt}`,
        nominal: 50000 + idx * 1000,
        tipe: 'masuk',
        rtScope: `RT ${rt} RW 05`,
      }));

      for (const rt of RW05_RT_CODES) {
        const scoped = buildServerFilteredViewData({
          selectedRT: rt,
          adminAccounts: [],
          wargaList: mockWarga,
          transactions: mockTxs,
          bantuanList: [],
          pengaturanKas: basePengaturan,
        });
        assert.equal(scoped.wargaList.length, 1);
        assert.equal(getWargaRTCode(scoped.wargaList[0]), rt);
        assert.equal(scoped.transactions.length, 1);
        assert.equal(getTransactionRTCode(scoped.transactions[0], mockWarga), rt);
      }

      const serverAll = buildServerFilteredViewData({
        selectedRT: 'SEMUA',
        adminAccounts: [],
        wargaList: mockWarga,
        transactions: mockTxs,
        bantuanList: [],
        pengaturanKas: basePengaturan,
      });
      assert.equal(serverAll.wargaList.length, 8);
      assert.equal(serverAll.transactions.length, 8);

      const collected = collectRegisteredRTs({
        adminAccounts: [],
        wargaList: mockWarga,
        transactions: mockTxs,
        bantuanList: [],
        laporanBulananRT: [],
        pengaturanKas: basePengaturan,
      });
      assert.equal(collected.length, 8);
    },
  },
  {
    name: '16. Deduplication guarantees no duplicate records on reconnect or offline queue replay',
    assertFn: () => {
      const older: Warga = {
        id: 'w_rt01_1',
        no: 1,
        nama: 'Budi Lama',
        noKK: '3302111122223333',
        noRumah: '01',
        rt: '01',
        rw: '05',
        alamat: 'Kotayasa',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 4,
        statusIuran: 'Belum',
        updatedAt: '2026-10-01T10:00:00.000Z',
      };
      const newer: Warga = {
        ...older,
        statusIuran: 'Sudah',
        updatedAt: '2026-10-01T10:05:00.000Z',
      };
      const merged = dedupeEntityList([older, newer], [], (a, b) => a.noKK === b.noKK);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].statusIuran, 'Sudah');
    },
  },
  {
    name: '17. Optional field helpers safely tolerate legacy null values on existing doc updates',
    assertFn: () => {
      assert.match(rules, /function isOptStr\(data, key, maxLen\)[\s\S]*data\[key\] == null/);
      assert.match(rules, /function isOptNum\(data, key\)[\s\S]*data\[key\] == null/);
      assert.match(rules, /function isOptBool\(data, key\)[\s\S]*data\[key\] == null/);
      assert.match(rules, /function isOptMap\(data, key\)[\s\S]*data\[key\] == null/);
    },
  },
  {
    name: '18. Allow list predicates support array-contains accessUids and ownerUid queries for RT Admins',
    assertFn: () => {
      assert.match(rules, /function canListOwnOrScoped\(\)[\s\S]*request\.auth\.uid in resource\.data\.accessUids/);
      assert.match(rules, /function canListOwnOrScoped\(\)[\s\S]*resource\.data\.ownerUid == request\.auth\.uid/);
      assert.equal(/\('accessUids' in data\) && data\.accessUids is list/.test(rules), false);
    },
  },
  {
    name: '19. Transaction rules allow optional bounded residentId on create/update while preserving hasOnly shadow-field guard',
    assertFn: () => {
      assert.match(
        rules,
        /function isValidTransaction\(data\)[\s\S]*data\.keys\(\)\.hasOnly\([\s\S]*'residentId'[\s\S]*isOptStr\(data, 'residentId', 128\)/
      );
      assert.match(
        rules,
        /match \/transactions\/\{txId\}[\s\S]*affectedKeys\(\)\.hasOnly\([\s\S]*'residentId'[\s\S]*\)/
      );
    },
  },
  {
    name: '20. getSelectableResidentsForRT strictly isolates RT, blocks SEMUA/empty for admin role, includes KK + anggotaKeluarga, and has zero mock data',
    assertFn: () => {
      const wargaSample: Warga[] = [
        {
          id: 'w_rt01_a',
          no: 1,
          nama: 'Ahmad RT01',
          noKK: '3302010101010001',
          noRumah: '01',
          rt: '01',
          rw: '05',
          alamat: 'Kotayasa RT 01',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 2,
          statusIuran: 'Belum',
          anggotaKeluarga: [
            { nama: 'Ahmad RT01', nik: '3302010101010001', hubungan: 'Kepala Keluarga', jenisKelamin: 'Laki-laki' },
            { nama: 'Siti RT01', nik: '3302010101010002', hubungan: 'Istri', jenisKelamin: 'Perempuan' },
          ],
        },
        {
          id: 'w_rt08_b',
          no: 1,
          nama: 'Budi RT08',
          noKK: '3302010101010008',
          noRumah: '08',
          rt: '08',
          rw: '05',
          alamat: 'Kotayasa RT 08',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 1,
          statusIuran: 'Sudah',
        },
      ];

      const rt01Options = getSelectableResidentsForRT({
        wargaList: wargaSample,
        targetRT: '01',
        activeRole: 'admin',
      });
      assert.equal(rt01Options.length, 2);
      assert.deepEqual(
        rt01Options.map((o) => o.nama),
        ['Ahmad RT01', 'Siti RT01']
      );
      assert.equal(rt01Options.some((o) => o.nama.includes('RT08')), false);

      // Admin must NEVER see cross-RT data if targetRT is SEMUA or empty
      assert.deepEqual(
        getSelectableResidentsForRT({ wargaList: wargaSample, targetRT: 'SEMUA', activeRole: 'admin' }),
        []
      );
      assert.deepEqual(
        getSelectableResidentsForRT({ wargaList: wargaSample, targetRT: '', activeRole: 'admin' }),
        []
      );

      // Empty RT with zero residents must return [] (zero mock fallback)
      assert.deepEqual(
        getSelectableResidentsForRT({ wargaList: wargaSample, targetRT: '03', activeRole: 'admin' }),
        []
      );
      assert.deepEqual(
        getSelectableResidentsForRT({ wargaList: [], targetRT: '08', activeRole: 'server' }),
        []
      );
    },
  },
  {
    name: '21. resolveTransactionWargaName resolves KK rename dynamically, preserves anggotaKeluarga selection, and falls back for legacy tx',
    assertFn: () => {
      const updatedWargaList: Warga[] = [
        {
          id: 'w_kk_01',
          no: 1,
          nama: 'Slamet Raharjo (Diperbarui)',
          noKK: '3302050000000001',
          noRumah: '12',
          rt: '08',
          rw: '05',
          alamat: 'Kotayasa RT 08',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 2,
          statusIuran: 'Sudah',
          anggotaKeluarga: [
            { nama: 'Slamet Raharjo (Diperbarui)', nik: '3302050000000001', hubungan: 'Kepala Keluarga', jenisKelamin: 'Laki-laki' },
            { nama: 'Rina Raharjo', nik: '3302050000000002', hubungan: 'Istri', jenisKelamin: 'Perempuan' },
          ],
        },
      ];

      const kkTx: Transaction = {
        id: 'tx_kk',
        tanggal: '2026-10-05',
        kategori: 'Iuran Warga',
        keterangan: 'Iuran bulanan',
        nominal: 25000,
        tipe: 'masuk',
        residentId: 'w_kk_01',
        namaWarga: 'Slamet Raharjo',
      };
      assert.equal(resolveTransactionWargaName(kkTx, updatedWargaList), 'Slamet Raharjo (Diperbarui)');

      const memberTx: Transaction = {
        id: 'tx_member',
        tanggal: '2026-10-05',
        kategori: 'Iuran Warga',
        keterangan: 'Iuran bulanan',
        nominal: 25000,
        tipe: 'masuk',
        residentId: 'w_kk_01',
        namaWarga: 'Rina Raharjo',
      };
      assert.equal(resolveTransactionWargaName(memberTx, updatedWargaList), 'Rina Raharjo');

      const legacyTx: Transaction = {
        id: 'tx_legacy',
        tanggal: '2026-09-01',
        kategori: 'Iuran Warga',
        keterangan: 'Data lama tanpa residentId',
        nominal: 25000,
        tipe: 'masuk',
        namaWarga: 'Warga Lama Manual',
      };
      assert.equal(resolveTransactionWargaName(legacyTx, updatedWargaList), 'Warga Lama Manual');
    },
  },
  {
    name: '22. getTransactionRTCode resolves RT via tx.residentId when rtScope is absent',
    assertFn: () => {
      const wargaList: Warga[] = [
        {
          id: 'w_rt04_99',
          no: 1,
          nama: 'Hendra',
          noKK: '3302040000000099',
          noRumah: '04',
          rt: '04',
          rw: '05',
          alamat: 'Kotayasa RT 04',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 1,
          statusIuran: 'Belum',
        },
      ];
      const txWithoutScope: Transaction = {
        id: 'tx_no_scope',
        tanggal: '2026-10-06',
        kategori: 'Iuran Warga',
        keterangan: 'Tanpa rtScope',
        nominal: 15000,
        tipe: 'masuk',
        residentId: 'w_rt04_99',
      };
      assert.equal(getTransactionRTCode(txWithoutScope, wargaList, '08'), '04');
    },
  },
  {
    name: '23. Kas Kematian resident contributions & saldo awal count as positive inflows (+), separate from Santunan outflows (-)',
    assertFn: () => {
      const txs: Transaction[] = [
        {
          id: 'tx_km_saldo',
          tanggal: '2026-01-01',
          kategori: 'Kas Kematian',
          keterangan: 'Saldo Kas Kematian Masa Lalu',
          nominal: 500000,
          tipe: 'kematian',
          isSaldoAwal: true,
        },
        {
          id: 'tx_km_bln1',
          tanggal: '2026-10-01',
          kategori: 'Iuran Kas Kematian',
          keterangan: 'Setoran Iuran Kas Kematian (Bulanan)',
          nominal: 3000,
          tipe: 'kematian',
          residentId: 'w_1',
          namaWarga: 'Budi',
        },
        {
          id: 'tx_km_thn1',
          tanggal: '2026-10-02',
          kategori: 'Iuran Kas Kematian',
          keterangan: 'Setoran Iuran Kas Kematian (Tahunan)',
          nominal: 45000,
          tipe: 'kematian',
          residentId: 'w_2',
          namaWarga: 'Siti',
        },
        {
          id: 'tx_km_out',
          tanggal: '2026-10-10',
          kategori: 'Santunan Kematian',
          keterangan: 'Pengeluaran / Santunan Duka',
          nominal: 200000,
          tipe: 'kematian',
          residentId: 'w_3',
          namaWarga: 'Ahli Waris',
        },
      ];

      assert.equal(isKasKematianOutflow(txs[0]), false);
      assert.equal(isTransactionInflow(txs[0]), true);

      assert.equal(isKasKematianOutflow(txs[1]), false);
      assert.equal(isTransactionInflow(txs[1]), true);

      assert.equal(isKasKematianOutflow(txs[2]), false);
      assert.equal(isTransactionInflow(txs[2]), true);

      assert.equal(isKasKematianOutflow(txs[3]), true);
      assert.equal(isTransactionInflow(txs[3]), false);

      const summary = getKasKematianBalanceSummary(txs);
      assert.equal(summary.totalMasukKematian, 548000);
      assert.equal(summary.totalKeluarKematian, 200000);
      assert.equal(summary.saldoKematian, 348000);
      assert.equal(summary.masukCount, 3);
      assert.equal(summary.keluarCount, 1);
    },
  },
  {
    name: '24. Bantuan & Transaction resident picker includes NIK per KK head & family members and isolates RT scope',
    assertFn: () => {
      const wargaList: Warga[] = [
        {
          id: 'w_rt08_kk1',
          no: 1,
          nama: 'Slamet Riyadi',
          noKK: '3302140101800001',
          nik: '3302140101800010',
          noRumah: '12',
          rt: '08',
          rw: '05',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 3,
          statusIuran: 'Sudah',
          anggotaKeluarga: [
            {
              nik: '3302140101800010',
              nama: 'Slamet Riyadi',
              hubungan: 'Kepala Keluarga',
              jenisKelamin: 'Laki-laki',
            },
            {
              nik: '3302145205850002',
              nama: 'Sri Rahayu',
              hubungan: 'Istri',
              jenisKelamin: 'Perempuan',
            },
            {
              nik: '3302141203100003',
              nama: 'Bagas Pratama',
              hubungan: 'Anak',
              jenisKelamin: 'Laki-laki',
            },
          ],
        },
        {
          id: 'w_rt03_kk1',
          no: 1,
          nama: 'Warga RT 03',
          noKK: '3302140202900009',
          nik: '3302140202900099',
          noRumah: '04',
          rt: '03',
          rw: '05',
          jenisKelamin: 'Laki-laki',
          jumlahJiwa: 1,
          statusIuran: 'Belum',
        },
      ];

      const optionsRT08 = getSelectableResidentsForRT({
        wargaList,
        targetRT: '08',
        activeRole: 'admin',
        defaultRW: '05',
      });

      assert.equal(optionsRT08.length, 3);
      assert.equal(optionsRT08[0].nama, 'Slamet Riyadi');
      assert.equal(optionsRT08[0].nik, '3302140101800010');
      assert.equal(optionsRT08[0].noKK, '3302140101800001');
      assert.equal(optionsRT08[1].nama, 'Sri Rahayu');
      assert.equal(optionsRT08[1].hubungan, 'Istri');
      assert.equal(optionsRT08[1].nik, '3302145205850002');
      assert.equal(optionsRT08[2].nama, 'Bagas Pratama');
      assert.equal(optionsRT08[2].nik, '3302141203100003');
      assert.equal(
        optionsRT08.some((o) => o.rt === '03'),
        false,
        'Admin RT 08 must never see RT 03 residents in Bantuan or Transaction picker'
      );

      // Verify firestore.rules permits update & delete for transactions by assigned admin
      assert.match(rules, /match \/transactions\/\{txId\}[\s\S]*allow update:[\s\S]*allow delete:/);
    },
  },
  {
    name: '25. reconcileWargaCashFromTransactions updates & reverts Warga cash/dues on Add/Edit/Delete',
    assertFn: () => {
      const targetWarga: Warga = {
        id: 'w_ali',
        no: 1,
        nama: 'Ali Mustofa',
        noKK: '3302140101010001',
        noRumah: '01',
        rt: '08',
        rw: '05',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 3,
        statusIuran: 'Belum',
        anggotaKeluarga: [
          {
            nik: '3302140101010001',
            nama: 'Ali Mustofa',
            hubungan: 'Kepala Keluarga',
            jenisKelamin: 'Laki-laki',
          },
          {
            nik: '3302140202020002',
            nama: 'Siti Aminah',
            hubungan: 'Istri',
            jenisKelamin: 'Perempuan',
          },
        ],
      };

      const settings: PengaturanKas = {
        nominalJimpitanTahunan: 360000,
        nominalJimpitanBulanan: 30000,
        nominalKematianTahunan: 36000,
        nominalKematianBulanan: 3000,
        saldoAwalKasUmum: 0,
        saldoAwalKasKematian: 0,
        keteranganSaldoAwal: '',
        tanggalSaldoAwal: '2026-01-01',
        kontakKetuaRT: { nama: 'Ketua', telp: '0812' },
        kontakBendahara: { nama: 'Bendahara', telp: '0813' },
        tahunAktif: 2026,
      };

      // Add Kas Masuk (Rp 30.000) + Kas Kematian (Rp 3.000) paid by family member Siti Aminah
      const txsAdded: Transaction[] = [
        {
          id: 'tx_1',
          tanggal: '2026-10-15',
          kategori: 'Iuran Warga',
          keterangan: 'Setoran Iuran Kas Warga',
          nominal: 30000,
          tipe: 'masuk',
          residentId: 'w_ali',
          namaWarga: 'Siti Aminah',
          noKK: '3302140101010001',
          tahun: 2026,
          rtScope: 'RT 08 RW 05',
        },
        {
          id: 'tx_2',
          tanggal: '2026-10-15',
          kategori: 'Iuran Kas Kematian',
          keterangan: 'Setoran Iuran Kas Kematian (Bulanan)',
          nominal: 3000,
          tipe: 'kematian',
          residentId: 'w_ali',
          namaWarga: 'Siti Aminah',
          noKK: '3302140101010001',
          tahun: 2026,
          rtScope: 'RT 08 RW 05',
        },
      ];

      const afterAdd = reconcileWargaCashFromTransactions({
        warga: targetWarga,
        transactions: txsAdded,
        tahunAktif: 2026,
        pengaturanKas: settings,
        allWarga: [targetWarga],
      });

      assert.equal(afterAdd.statusIuran, 'Sudah');
      assert.equal(afterAdd.iuranUmumTerbayar, 30000);
      assert.equal(afterAdd.iuranKematianTerbayar, 3000);
      assert.equal(afterAdd.riwayatIuran?.[10], true);
      assert.equal(afterAdd.riwayatKematian?.[10], true);
      assert.equal(hasWargaCashDiff(targetWarga, afterAdd, 2026), true);

      // Edit Kas Masuk to annual lump-sum & change month to 11
      const txsEdited: Transaction[] = [
        { ...txsAdded[0], nominal: 360000, tanggal: '2026-11-05' },
        txsAdded[1],
      ];
      const afterEdit = reconcileWargaCashFromTransactions({
        warga: afterAdd,
        transactions: txsEdited,
        tahunAktif: 2026,
        pengaturanKas: settings,
        allWarga: [targetWarga],
        forceClearIfZero: true,
      });
      assert.equal(afterEdit.iuranUmumTerbayar, 360000);
      assert.equal(afterEdit.riwayatIuran?.[1], true);
      assert.equal(afterEdit.riwayatIuran?.[12], true);

      // Delete all transactions -> reverts cleanly to Belum & 0
      const afterDelete = reconcileWargaCashFromTransactions({
        warga: afterEdit,
        transactions: [],
        tahunAktif: 2026,
        pengaturanKas: settings,
        allWarga: [targetWarga],
        forceClearIfZero: true,
      });
      assert.equal(afterDelete.statusIuran, 'Belum');
      assert.equal(afterDelete.iuranUmumTerbayar, 0);
      assert.equal(afterDelete.iuranKematianTerbayar, 0);
      assert.deepEqual(afterDelete.riwayatIuran, {});
      assert.deepEqual(afterDelete.riwayatKematian, {});
    },
  },
  {
    name: '26. doesTransactionBelongToWarga & resolveTransactionResidentId avoid substring false matches',
    assertFn: () => {
      const wargaAli: Warga = {
        id: 'w_ali',
        no: 1,
        nama: 'Ali',
        noKK: '3302140101010001',
        noRumah: '01',
        rt: '08',
        rw: '05',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 1,
        statusIuran: 'Belum',
      };
      const wargaKhalid: Warga = {
        id: 'w_khalid',
        no: 2,
        nama: 'Khalid Saputra',
        noKK: '3302140101010002',
        noRumah: '02',
        rt: '08',
        rw: '05',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 2,
        statusIuran: 'Belum',
        anggotaKeluarga: [
          {
            nik: '3302140303030003',
            nama: 'Dewi Sartika',
            hubungan: 'Istri',
            jenisKelamin: 'Perempuan',
          },
        ],
      };

      const txKhalid: Transaction = {
        id: 'tx_khalid',
        tanggal: '2026-10-15',
        kategori: 'Iuran Warga',
        keterangan: 'Setoran Khalid',
        nominal: 30000,
        tipe: 'masuk',
        namaWarga: 'Khalid Saputra',
        rtScope: 'RT 08 RW 05',
      };
      const txDewiLegacy: Transaction = {
        id: 'tx_dewi',
        tanggal: '2026-10-16',
        kategori: 'Iuran Kas Kematian',
        keterangan: 'Setoran Dewi',
        nominal: 3000,
        tipe: 'kematian',
        namaWarga: 'Dewi Sartika',
        rtScope: 'RT 08 RW 05',
      };

      // Must NOT match 'Ali' as substring of 'Khalid Saputra'
      assert.equal(doesTransactionBelongToWarga(txKhalid, wargaAli, [wargaAli, wargaKhalid]), false);
      assert.equal(doesTransactionBelongToWarga(txKhalid, wargaKhalid, [wargaAli, wargaKhalid]), true);
      assert.equal(doesTransactionBelongToWarga(txDewiLegacy, wargaKhalid, [wargaAli, wargaKhalid]), true);
      assert.equal(resolveTransactionResidentId(txDewiLegacy, [wargaAli, wargaKhalid], '08'), 'w_khalid');
    },
  },
  {
    name: '27. Security rules tolerate unpadded legacy codes (sameCode), null-safe deletes, and admin self-linking unset authUid',
    assertFn: () => {
      assert.match(rules, /function sameCode\(a, b\)/);
      assert.match(rules, /function isServerAnyRW\(\)/);
      const nullSafeDeleteOrGet = (rules.match(/\(resource == null &&/g) || []).length;
      assert.ok(
        nullSafeDeleteOrGet >= 24,
        `Expected >= 24 null-safe resource guards across get & delete rules, got ${nullSafeDeleteOrGet}`
      );
      assert.match(
        rules,
        /match \/adminAccounts\/\{accountId\}[\s\S]*existing\(\)\.authUid == null[\s\S]*incoming\(\)\.authUid == request\.auth\.uid/
      );
    },
  },
  {
    name: '28. syncQueue deduplicates repeated edits/deletes, applies stepped backoff, and separates terminal vs transient errors',
    assertFn: () => {
      assert.deepEqual([...SYNC_BACKOFF_STEPS_MS], [2000, 4000, 8000, 16000, 30000]);
      assert.equal(computeBackoffDelayMs(0), 2000);
      assert.equal(computeBackoffDelayMs(1), 4000);
      assert.equal(computeBackoffDelayMs(2), 8000);
      assert.equal(computeBackoffDelayMs(3), 16000);
      assert.equal(computeBackoffDelayMs(4), 30000);
      assert.equal(computeBackoffDelayMs(9), 30000);

      const tx1: Transaction = {
        id: 'tx_100',
        tanggal: '2026-10-10',
        kategori: 'Iuran Warga',
        keterangan: 'Versi 1',
        nominal: 25000,
        tipe: 'masuk',
        rtScope: 'RT 08 RW 05',
      };
      const tx1Edited: Transaction = { ...tx1, keterangan: 'Versi 2', nominal: 30000 };

      let queue: PendingSyncOp[] = [];
      queue = upsertPendingSyncOp(queue, { opKey: 'tx:tx_100', kind: 'saveTx', payload: tx1 });
      queue = upsertPendingSyncOp(queue, { opKey: 'tx:tx_100', kind: 'saveTx', payload: tx1Edited });
      assert.equal(queue.length, 1);
      assert.equal(queue[0].kind, 'saveTx');
      if (queue[0].kind === 'saveTx') {
        assert.equal(queue[0].payload.nominal, 30000);
      }

      // Delete supersedes queued save for the same entity
      queue = upsertPendingSyncOp(queue, { opKey: 'tx:tx_100', kind: 'deleteTx', targetId: 'tx_100' });
      assert.equal(queue.length, 1);
      assert.equal(queue[0].kind, 'deleteTx');

      queue = removePendingSyncOpsByKey(queue, ['tx:tx_100']);
      assert.equal(queue.length, 0);

      // Error classification & friendly message formatting
      assert.equal(isTerminalFirestoreError({ code: 'permission-denied' }), true);
      assert.equal(isTerminalFirestoreError('Missing or insufficient permissions.'), true);
      assert.equal(isTransientFirestoreError({ code: 'permission-denied' }), false);
      assert.equal(isTransientFirestoreError({ code: 'unavailable' }), true);
      assert.equal(isTransientFirestoreError('Failed to get document because the client is offline.'), true);

      const friendly = formatFriendlyFirestoreError('{"error":"Missing or insufficient permissions.","operationType":"write"}');
      assert.match(friendly, /Akses ditolak Firestore/i);
      assert.equal(friendly.includes('{'), false);
    },
  },
  {
    name: '29. Hardened normCodeStr & sameCode rules handle RT/RW prefixes without cross-RT leak and enforce wargaProfiles rw immutability',
    assertFn: () => {
      assert.match(rules, /function normCodeStr\(val\)/);
      assert.match(rules, /function sameCode\(a, b\)/);
      assert.match(
        rules,
        /match \/wargaProfiles\/\{uid\}[\s\S]*allow update:[\s\S]*incoming\(\)\.rw == existing\(\)\.rw[\s\S]*isAssignedAdmin\(existing\(\)\.rw, existing\(\)\.rt\)[\s\S]*isAssignedAdmin\(incoming\(\)\.rw, incoming\(\)\.rt\)/
      );
      assert.match(
        rules,
        /function isValidRwScope\(data\)[\s\S]*sameCode\(data\.rwId\.replace\('\^rw_', ''\), data\.rw\)/
      );
      assert.match(
        rules,
        /function isValidRwRtScope\(data\)[\s\S]*sameCode\(data\.rtId\.replace\('\^rt_', ''\), data\.rt\)/
      );
    },
  },
  {
    name: '30. resolveEntityDocId preserves exact valid Firestore doc IDs up to 128 chars',
    assertFn: () => {
      const exact125 = 'w_' + 'a'.repeat(123);
      assert.equal(exact125.length, 125);
      assert.equal(resolveEntityDocId(exact125, 'w'), exact125);
      assert.equal(resolveEntityDocId('warga-rt03_kk_001', 'w'), 'warga-rt03_kk_001');
      assert.match(resolveEntityDocId('id with spaces!', 'w'), /^id_with_spaces_$/);
    },
  },
  {
    name: '31. Server RW payload builders preserve non-default RT (e.g. RT 03) on linked Transaction and Bantuan updates',
    assertFn: () => {
      const serverCtx = {
        uid: 'server_uid_1',
        role: 'server' as const,
        rt: 'SEMUA',
        rw: '05',
        email: 'ar01071997@gmail.com',
        username: 'server',
        displayName: 'Super Admin RW 05',
        serverUid: 'server_uid_1',
        adminsByRt: {},
      };
      const txRt03: Transaction = {
        id: 'tx_rt03_001',
        tanggal: '2026-10-18',
        kategori: 'Iuran Warga',
        keterangan: 'Iuran RT 03',
        nominal: 30000,
        tipe: 'masuk',
        residentId: 'w_rt03_1',
        namaWarga: 'Suharto',
        noKK: '3302030000000001',
        rtScope: 'RT 03 RW 05',
      };
      const builtTx = buildTransactionFirestorePayload(txRt03, null, serverCtx);
      assert.equal(builtTx.rt, '03');
      assert.equal(builtTx.rtId, 'rt_03');
      assert.equal(builtTx.rw, '05');
      assert.equal(builtTx.rwId, 'rw_05');
      assert.equal(builtTx.rtScope, 'RT 03 RW 05');

      const bantuanRt03 = {
        id: 'b_rt03_001',
        jenisBantuan: 'BLT Desa',
        namaPenerima: 'Suharto',
        noKK: '3302030000000001',
        nominalAtauBarang: 'Rp 300.000',
        tanggal: '2026-10-18',
        status: 'Sudah Disalurkan' as const,
        rtScope: 'RT 03 RW 05',
      };
      const builtBantuan = buildBantuanFirestorePayload(bantuanRt03, null, serverCtx);
      assert.equal(builtBantuan.rt, '03');
      assert.equal(builtBantuan.rtId, 'rt_03');
      assert.equal(builtBantuan.rw, '05');
      assert.equal(builtBantuan.rwId, 'rw_05');
    },
  },
  {
    name: '32. Anggota KK add/remove & Kepala Keluarga edit keep member count, NIK cleanliness, and linked records consistent',
    assertFn: () => {
      const warga: Warga = {
        id: 'w_kk_edit_test',
        no: 1,
        nama: 'Hendra Wijaya',
        noKK: '3302080101850001',
        nik: '3302080101850011',
        noRumah: '08',
        rt: '08',
        rw: '05',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 2,
        statusIuran: 'Sudah',
        anggotaKeluarga: [
          { nik: '3302080101850011', nama: 'Hendra Wijaya', hubungan: 'Kepala Keluarga', jenisKelamin: 'Laki-laki' },
          { nik: '3302085205880012', nama: 'Dewi Lestari', hubungan: 'Istri', jenisKelamin: 'Perempuan' },
        ],
      };

      // Simulate add member + remove member -> jumlahJiwa reflects active member count
      const afterAdd = [
        ...(warga.anggotaKeluarga || []),
        { nik: '3302081010150013', nama: 'Rafi Wijaya', hubungan: 'Anak', jenisKelamin: 'Laki-laki' as const },
      ];
      assert.equal(afterAdd.length, 3);
      const afterRemove = afterAdd.filter((m) => m.nama !== 'Hendra Wijaya');
      assert.equal(afterRemove.length, 2);
      assert.equal(afterRemove.some((m) => m.nama === 'Dewi Lestari'), true);
      assert.equal(afterRemove.some((m) => m.nama === 'Rafi Wijaya'), true);
    },
  },
  {
    name: '33. normalizeRTCode & normalizeRWCode sanitize dots, slashes, and spaces so rwId/rtId always pass Firestore regex',
    assertFn: () => {
      assert.equal(normalizeRTCode('RT 08/05'), '08');
      assert.equal(normalizeRTCode('rt.03'), '03');
      assert.equal(normalizeRTCode('RT-07'), '07');
      assert.equal(normalizeRTCode('Semua RT'), 'SEMUA');
      assert.equal(normalizeRTCode('A-1.B'), 'A1B');
      assert.equal(normalizeRWCode('RW. 05'), '05');
      assert.equal(normalizeRWCode('RW 05/Kota'), '05');
      assert.equal(normalizeRWCode('05/Kota'), '05KOTA');
      const { rwId, rtId } = buildScopeIds('08', 'RW. 05');
      assert.match(rwId, /^rw_[a-zA-Z0-9]+$/);
      assert.match(rtId, /^rt_[a-zA-Z0-9]+$/);
    },
  },
  {
    name: '34. parseExcelWargaAndBantuan handles "Semua RT" Super Admin default without emitting invalid RT 00',
    assertFn: () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['No KK', 'NIK', 'Nama Lengkap', 'Hubungan', 'Alamat'],
        ['3302080101900001', '3302080101900011', 'Budi Santoso', 'Kepala Keluarga', 'Jl. Mawar'],
        ['3302080101900002', '3302080101900012', 'Slamet Riyadi', 'Kepala Keluarga', ''],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Warga');
      const arrayBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const mockFile = {
        arrayBuffer: async () => arrayBuf,
      } as unknown as File;

      return parseExcelWargaAndBantuan(mockFile, {
        rt: 'Semua RT',
        rw: '05',
        alamat: 'Semua RT Desa Kotayasa',
      }).then((parsed) => {
        assert.equal(parsed.wargaList.length, 2);
        assert.equal(parsed.wargaList[0].rt, '08');
        assert.equal(parsed.wargaList[0].rw, '05');
        assert.equal(parsed.wargaList[0].alamat, 'Jl. Mawar');
        assert.equal(parsed.wargaList[1].rt, '08');
        assert.match(parsed.wargaList[1].alamat || '', /RT 08 RW 05/);
      });
    },
  },
  {
    name: '35. buildWargaFirestorePayload for bulk Excel-imported Warga produces all required valid isValidWarga fields',
    assertFn: () => {
      const serverCtx = {
        uid: 'ak49V3uyONMqWdqWOeVViDaQ4nu2',
        role: 'server' as const,
        rt: 'SEMUA',
        rw: '05',
        email: 'ar01071997@gmail.com',
        username: 'server',
        displayName: 'Super Admin RW 05',
        serverUid: 'ak49V3uyONMqWdqWOeVViDaQ4nu2',
        adminsByRt: {},
      };
      const imported: Warga = {
        id: 'w_1794912162578_0_uhrb',
        no: 1,
        nama: 'Budi Santoso',
        noKK: '3302080101900001',
        nik: '3302080101900011',
        noRumah: '01',
        rt: '08',
        rw: '05',
        alamat: 'RT 08 RW 05 Desa Kotayasa',
        jenisKelamin: 'Laki-laki',
        jumlahJiwa: 1,
        statusIuran: 'Belum',
        statusIuranPerTahun: { 2026: 'Belum' },
        pin: '123456',
        anggotaKeluarga: [
          {
            nik: '3302080101900011',
            nama: 'Budi Santoso',
            hubungan: 'Kepala Keluarga',
            jenisKelamin: 'Laki-laki',
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      const payload = buildWargaFirestorePayload(imported, null, serverCtx);
      assert.equal(payload.id, 'w_1794912162578_0_uhrb');
      assert.equal(payload.rt, '08');
      assert.equal(payload.rw, '05');
      assert.equal(payload.rtId, 'rt_08');
      assert.equal(payload.rwId, 'rw_05');
      assert.equal(payload.ownerUid, serverCtx.uid);
      assert.equal(Array.isArray(payload.accessUids), true);
      assert.equal(payload.accessUids.includes(serverCtx.uid), true);
      assert.equal(Array.isArray(payload.anggotaKeluarga), true);
      assert.equal(Boolean(payload.createdAt), true);
      assert.equal(Boolean(payload.updatedAt), true);
    },
  },
  {
    name: '36. Security rules support punctuated RT/RW normalization and Server RW repair on /admins/{uid}',
    assertFn: () => {
      assert.match(rules, /function normCodeStr\(val\)[\s\S]*\^\(RT\|RW\)\[\\\\s\.:_-\]\*/);
      assert.match(rules, /match \/admins\/\{uid\}[\s\S]*sameCode\(incoming\(\)\.rw, existing\(\)\.rw\)/);
      assert.match(rules, /match \/admins\/\{uid\}[\s\S]*affectedKeys\(\)\.hasOnly\(\['email', 'displayName', 'username', 'role', 'rt', 'rw', 'rtId', 'rwId', 'rtScope', 'status', 'updatedAt'\]\)/);
    },
  },
  {
    name: '37. Admin RT 08 buildWargaFirestorePayload avoids "null" strings and preserves existing ownerUid/rw/rt on Excel-imported Warga updates',
    assertFn: () => {
      const adminRt08Ctx = {
        uid: 'brXUxS9dzRhF0T5L6i4I7FXtB2N2',
        role: 'admin' as const,
        rt: '08',
        rw: '05',
        email: 'admin.adminrt08@rt.kotayasa.desa.id',
        username: 'AdminRT08',
        displayName: 'Admin RT 08',
        serverUid: 'ak49V3uyONMqWdqWOeVViDaQ4nu2',
        adminsByRt: { '08': ['brXUxS9dzRhF0T5L6i4I7FXtB2N2'] },
      };
      const existingMeta = {
        ownerUid: 'ak49V3uyONMqWdqWOeVViDaQ4nu2',
        createdAt: { seconds: 1794993675, nanoseconds: 0 },
        rw: '05',
        rt: '08',
        serverConfirmed: true,
      };
      const wargaUpdate = {
        id: 'w_1794993675714_0_acbd',
        no: 1,
        nama: 'Budi Santoso',
        noKK: '3302080101900001',
        nik: null as unknown as string,
        noRumah: '01',
        rt: '08',
        rw: '05',
        alamat: null as unknown as string,
        jenisKelamin: 'Laki-laki' as const,
        jumlahJiwa: 1,
        statusIuran: 'Sudah' as const,
      };
      const payload = buildWargaFirestorePayload(wargaUpdate, existingMeta, adminRt08Ctx);
      assert.equal(payload.id, 'w_1794993675714_0_acbd');
      assert.equal(payload.ownerUid, 'ak49V3uyONMqWdqWOeVViDaQ4nu2');
      assert.equal('nik' in payload, false);
      assert.equal('alamat' in payload, false);
      assert.equal(payload.rt, '08');
      assert.equal(payload.rw, '05');
      assert.equal(payload.rtId, 'rt_08');
      assert.equal(payload.rwId, 'rw_05');
      assert.equal(payload.accessUids.includes('brXUxS9dzRhF0T5L6i4I7FXtB2N2'), true);
      assert.equal(payload.accessUids.includes('ak49V3uyONMqWdqWOeVViDaQ4nu2'), true);
    },
  },
  {
    name: '38. Security rules normCodeStr strips trailing RW/RT suffixes without cross-RT match',
    assertFn: () => {
      assert.equal(
        rules.includes(".replace('\\\\s*[/,-]?\\\\s*(RW|RT)[\\\\s.:_-]*.*$', '')"),
        true
      );
      const jsNormCodeStr = (val: string) =>
        val
          .trim()
          .toUpperCase()
          .replace(/^(RT|RW)[\s.:_-]*/i, '')
          .replace(/\s*[/,-]?\s*(RW|RT)[\s.:_-]*.*$/i, '')
          .replace(/^0+/, '');
      assert.equal(jsNormCodeStr('RT 08 RW 05'), '8');
      assert.equal(jsNormCodeStr('RT 08 / RW 05'), '8');
      assert.equal(jsNormCodeStr('RT.08 - RW.05'), '8');
      assert.equal(jsNormCodeStr('RT 01 RW 08'), '1');
      assert.notEqual(jsNormCodeStr('RT 01 RW 08'), jsNormCodeStr('RT 08 RW 05'));
    },
  },
  {
    name: '39. buildWargaFirestorePayload ignores unconfirmed or permissionDenied meta ownerUid/createdAt',
    assertFn: () => {
      const adminRt08Ctx = {
        uid: 'brXUxS9dzRhF0T5L6i4I7FXtB2N2',
        role: 'admin' as const,
        rt: '08',
        rw: '05',
        email: 'admin.adminrt08@rt.kotayasa.desa.id',
        username: 'AdminRT08',
        displayName: 'Admin RT 08',
        serverUid: 'ak49V3uyONMqWdqWOeVViDaQ4nu2',
        adminsByRt: { '08': ['brXUxS9dzRhF0T5L6i4I7FXtB2N2'] },
      };
      const wargaSample: Warga = {
        id: 'w_1794993675714_1_acbd',
        no: 2,
        nama: 'Siti Aminah',
        noKK: '3302080101900002',
        noRumah: '02',
        rt: '08',
        rw: '05',
        jenisKelamin: 'Perempuan',
        jumlahJiwa: 2,
        statusIuran: 'Belum',
      };
      const staleCreated = { seconds: 1700000000, nanoseconds: 0 };
      const unconfirmedPayload = buildWargaFirestorePayload(
        wargaSample,
        {
          ownerUid: 'someone_else_uid',
          createdAt: staleCreated,
          serverConfirmed: false,
        } as any,
        adminRt08Ctx
      );
      assert.equal(unconfirmedPayload.ownerUid, 'brXUxS9dzRhF0T5L6i4I7FXtB2N2');
      assert.notDeepEqual(unconfirmedPayload.createdAt, staleCreated);

      const deniedPayload = buildWargaFirestorePayload(
        wargaSample,
        {
          ownerUid: 'someone_else_uid',
          createdAt: staleCreated,
          serverConfirmed: true,
          permissionDenied: true,
        } as any,
        adminRt08Ctx
      );
      assert.equal(deniedPayload.ownerUid, 'brXUxS9dzRhF0T5L6i4I7FXtB2N2');
      assert.notDeepEqual(deniedPayload.createdAt, staleCreated);
    },
  },
  {
    name: '40. firebaseSync guards permissionDenied metadata and validates scope across edit, delete, batch, and bulk writes',
    assertFn: () => {
      const syncSource = readFileSync('./src/utils/firebaseSync.ts', 'utf8');
      assert.match(syncSource, /async function resolveExistingMeta[\s\S]*permissionDenied:\s*true/);
      assert.match(syncSource, /function buildCreateSafePayload/);
      assert.match(syncSource, /saveScopedEntityDoc[\s\S]*effectiveExisting\?\.permissionDenied/);
      assert.match(syncSource, /deleteScopedEntityDoc[\s\S]*resolvedMeta\?\.permissionDenied/);
      assert.match(syncSource, /saveWargaWithLinkedSyncBatch[\s\S]*validateAdminWriteScope/);
      assert.match(syncSource, /bulkSaveWargaAndBantuanDocs[\s\S]*permissionDenied/);
    },
  },
];

Promise.resolve().then(async () => {
  for (const check of [...dirtyDozenChecks, ...unitLogicChecks]) {
    await check.assertFn();
    console.log(`PASS: ${check.name}`);
  }
});
