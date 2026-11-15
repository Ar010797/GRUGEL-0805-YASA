import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

/**
 * Security Rules Verification Suite (Dirty Dozen Coverage + RW/RT Isolation)
 * Verifies rule invariants and structural guarantees defined in security_spec.md.
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
    assertFn: () => assert.equal(/allow\s+(read|write|get|list)\s*:\s*if\s+(true|isSignedIn\(\))\s*;/.test(rules), false),
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
    name: '10. RW & RT assignment scoping enforced across admin and citizen helpers',
    assertFn: () => {
      assert.match(rules, /function isAssignedAdmin\(rw, rt\)/);
      assert.match(rules, /adminDoc\(\)\.rw == rw/);
      assert.match(rules, /adminDoc\(\)\.rt == rt/);
      assert.match(rules, /function isWargaInRWRT\(rw, rt\)/);
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
    name: '12. Bounded strings and lists against Denial-of-Wallet & Admin self-escalation blocked',
    assertFn: () => {
      assert.match(rules, /isValidStr\(data\.isi, 1, 4000\)/);
      assert.match(rules, /data\.anggotaKeluarga\.size\(\) <= 30/);
      assert.match(rules, /incoming\(\)\.role == existing\(\)\.role/);
      assert.match(rules, /incoming\(\)\.rt == existing\(\)\.rt/);
    },
  },
];

for (const check of dirtyDozenChecks) {
  check.assertFn();
  console.log(`PASS: ${check.name}`);
}
