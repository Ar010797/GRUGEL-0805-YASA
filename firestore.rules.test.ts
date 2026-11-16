import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  buildScopeIds,
  RW05_RT_CODES,
} from './src/utils/firebaseSync';
import {
  buildServerFilteredViewData,
  collectRegisteredRTs,
  getKasKematianBalanceSummary,
  getSelectableResidentsForRT,
  getTransactionRTCode,
  getWargaRTCode,
  isKasKematianOutflow,
  isTransactionInflow,
  normalizeRTCode,
  normalizeRWCode,
  resolveTransactionWargaName,
} from './src/utils/rtFilter';
import { dedupeEntityList } from './src/utils/cloudSync';
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
    name: '3. Bootstrapped admin email included cleanly',
    assertFn: () => assert.match(rules, /request\.auth\.token\.email == 'ar01071997@gmail\.com'/),
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
];

for (const check of [...dirtyDozenChecks, ...unitLogicChecks]) {
  check.assertFn();
  console.log(`PASS: ${check.name}`);
}
