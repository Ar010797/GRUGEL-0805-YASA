import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

/**
 * Security Rules Verification Suite (Dirty Dozen Coverage)
 * Verifies rule invariants and structural guarantees defined in security_spec.md.
 */
const rules = readFileSync('./firestore.rules', 'utf8');

const dirtyDozenChecks: { name: string; assertFn: () => void }[] = [
  {
    name: '1. Global default-deny safety net present',
    assertFn: () => assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/),
  },
  {
    name: '2. Verified email requirement enforced (Anti-Spoofing)',
    assertFn: () => assert.match(rules, /request\.auth\.token\.email_verified == true/),
  },
  {
    name: '3. Bootstrapped admin email included cleanly',
    assertFn: () => assert.match(rules, /request\.auth\.token\.email == 'ar01071997@gmail\.com'/),
  },
  {
    name: '4. No blanket allow read/write on any collection',
    assertFn: () => assert.equal(/allow\s+(read|write)\s*:\s*if\s+(true|isSignedIn\(\))\s*;/.test(rules), false),
  },
  {
    name: '5. Strict ID poisoning guard on single-doc operations',
    assertFn: () => assert.match(rules, /function isValidId\(id\)[\s\S]*id\.size\(\) <= 128[\s\S]*\^\[a-zA-Z0-9_\\\\-\]\+\$/),
  },
  {
    name: '6. Strict keys hasAll + hasOnly on every entity validator',
    assertFn: () => {
      const hasAllCount = (rules.match(/data\.keys\(\)\.hasAll\(/g) || []).length;
      const hasOnlyCount = (rules.match(/data\.keys\(\)\.hasOnly\(/g) || []).length;
      assert.ok(hasAllCount >= 9 && hasOnlyCount >= 9);
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
    name: '8. Immutable ownerUid and createdAt enforced on updates',
    assertFn: () => {
      assert.match(rules, /incoming\(\)\.ownerUid == existing\(\)\.ownerUid/);
      assert.match(rules, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
    },
  },
  {
    name: '9. Action-based affectedKeys().hasOnly() on updates',
    assertFn: () => {
      const affectedCount = (rules.match(/affectedKeys\(\)\.hasOnly\(/g) || []).length;
      assert.ok(affectedCount >= 9);
    },
  },
  {
    name: '10. Warga PII get/list restricted to Admin or linkedUid',
    assertFn: () => {
      assert.match(rules, /match \/warga\/\{wargaId\}[\s\S]*existing\(\)\.linkedUid == request\.auth\.uid/);
      assert.match(rules, /allow list: if isBootstrappedAdmin\(\) \|\|[\s\S]*resource\.data\.linkedUid == request\.auth\.uid/);
    },
  },
  {
    name: '11. Confidential Bantuan/Dokumen/AdminAccounts/Laporan strictly Admin only',
    assertFn: () => {
      assert.match(rules, /match \/bantuan\/\{bantuanId\}[\s\S]*allow get: if isValidId\(bantuanId\) && isAdmin\(\);/);
      assert.match(rules, /match \/dokumen\/\{dokumenId\}[\s\S]*allow get: if isValidId\(dokumenId\) && isAdmin\(\);/);
      assert.match(rules, /match \/adminAccounts\/\{accountId\}[\s\S]*allow get: if isValidId\(accountId\) && isAdmin\(\);/);
      assert.match(rules, /match \/laporanBulanan\/\{laporanId\}[\s\S]*allow get: if isValidId\(laporanId\) && isAdmin\(\);/);
    },
  },
  {
    name: '12. Bounded strings and lists against Denial-of-Wallet',
    assertFn: () => {
      assert.match(rules, /isValidStr\(data\.isi, 1, 4000\)/);
      assert.match(rules, /data\.anggotaKeluarga\.size\(\) <= 30/);
    },
  },
];

for (const check of dirtyDozenChecks) {
  check.assertFn();
  console.log(`PASS: ${check.name}`);
}
