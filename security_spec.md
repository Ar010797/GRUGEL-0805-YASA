# Security Specification — Kas Warga RT 08 RW 05 Desa Kotayasa

## 1. Data Invariants
1. **Master Source of Truth & Role Isolation**:
   - Only verified admins (`ar01071997@gmail.com` or UIDs listed in `/admins/{uid}`) may create, update, or delete administrative records (`/settings`, `/warga`, `/transactions`, `/bantuan`, `/pengumuman`, `/dokumen`, `/adminAccounts`, `/laporanBulanan`).
   - Citizens (`/warga/{wargaId}`) contain PII (`nik`, `noKK`, `alamat`, `telepon`) and can ONLY be read/listed by Admins or the specific resident whose UID matches `linkedUid`.
   - Confidential social aid (`/bantuan/{bantuanId}`), PDF archives (`/dokumen/{dokumenId}`), RT admin credentials (`/adminAccounts/{accountId}`), and monthly reports (`/laporanBulanan/{laporanId}`) are strictly Admin-only.
   - Public-within-community read collections (`/settings`, `/transactions`, `/pengumuman`) require `isSignedIn()` + `isVerified()`.
2. **Ownership & Temporal Integrity**:
   - Every created document must match `incoming().ownerUid == request.auth.uid`, enforce `createdAt == request.time`, and enforce `updatedAt == request.time`.
   - Every updated document must preserve `incoming().ownerUid == existing().ownerUid`, `incoming().createdAt == existing().createdAt`, and enforce `updatedAt == request.time`.
3. **Strict Path & Schema Validation**:
   - Every single-document `get`, `create`, `update`, `delete` validates `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, max length 128).
   - Every string validates `is string && val.size() <= MAX`.
   - Every `create` enforces `hasAll([...]) && hasOnly([...])`.
   - Every `update` validates `isValid[Entity](incoming())` AND `incoming().diff(existing()).affectedKeys().hasOnly([...])`.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read on Warga PII**: `{ auth: null, op: "get", path: "/warga/w1" }`
2. **Unverified Email Spoof Admin**: `{ auth: { uid: "atk1", token: { email: "ar01071997@gmail.com", email_verified: false } }, op: "list", path: "/bantuan" }`
3. **Non-Admin Reading Confidential Bantuan**: `{ auth: { uid: "warga1", token: { email: "warga@example.com", email_verified: true } }, op: "list", path: "/bantuan" }`
4. **Non-Admin Reading Other Resident PII**: `{ auth: { uid: "warga1", token: { email_verified: true } }, op: "get", path: "/warga/warga2" }`
5. **Non-Admin Listing All Warga Without Owner Filter**: `{ auth: { uid: "warga1", token: { email_verified: true } }, op: "list", path: "/warga" }`
6. **Self-Privilege Escalation into /admins**: `{ auth: { uid: "atk1", token: { email_verified: true } }, op: "create", path: "/admins/atk1", data: { uid: "atk1", email: "atk@x.com", role: "server" } }`
7. **Shadow Field Injection (Ghost Field)**: `{ auth: adminAuth, op: "create", path: "/pengumuman/p1", data: { id: "p1", judul: "Info", isi: "Isi", kategori: "Umum", tanggal: "2026-11-13", ownerUid: adminUid, createdAt: serverTime, updatedAt: serverTime, ghostAdminOverride: true } }`
8. **ID Poisoning (>128 chars or invalid chars)**: `{ auth: adminAuth, op: "create", path: "/transactions/../../bad_id", data: { ... } }`
9. **Spoofed ownerUid on Create**: `{ auth: adminAuth, op: "create", path: "/transactions/tx1", data: { ..., ownerUid: "someone_else" } }`
10. **Client-Spoofed Timestamp**: `{ auth: adminAuth, op: "create", path: "/pengumuman/p2", data: { ..., createdAt: "2020-01-01T00:00:00Z" } }`
11. **Mutating Immortal ownerUid/createdAt on Update**: `{ auth: adminAuth, op: "update", path: "/warga/w1", data: { ownerUid: "other", updatedAt: serverTime } }`
12. **Denial of Wallet Oversized String (>4000 chars in pengumuman.isi)**: `{ auth: adminAuth, op: "create", path: "/pengumuman/p3", data: { ..., isi: "A".repeat(5000) } }`
