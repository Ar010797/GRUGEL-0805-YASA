import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  buildScopeIds,
  RW05_RT_CODES,
} from './src/utils/firebaseSync';
import {
  buildServerFilteredViewData,
  collectRegisteredRTs,
  getTransactionRTCode,
  getWargaRTCode,
  normalizeRTCode,
  normalizeRWCode,
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
];

for (const check of [...dirtyDozenChecks, ...unitLogicChecks]) {
  check.assertFn();
  console.log(`PASS: ${check.name}`);
}
