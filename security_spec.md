# Security Specification — Sistem Kas Warga & Server Desa Kotayasa

## 1. Data Invariants (RW/RT Isolation & Zero-Trust RBAC)
1. **Master Source of Truth & Assignment Scoping**:
   - Roles are stored in `/admins/{uid}` (`role`: `'server'` | `'admin'`, `rw`, `rt`, `rwId`, `rtId`, `status`: `'aktif'` | `'nonaktif'`) and `/wargaProfiles/{uid}` (`role`: `'warga'`, `rw`, `rt`, `rwId`, `rtId`, `noKK`, `wargaId`). Client claims alone are never trusted (only Google-verified `ar01071997@gmail.com` with `email_verified == true` is bootstrapped admin).
   - **Canonical Hierarchy IDs (`rwId` & `rtId`)**:
     - Every RW-scoped document enforces `rwId == 'rw_' + data.rw` (e.g., `'rw_05'`).
     - Every RT-scoped document (plus `'SEMUA'` for RW-wide settings/announcements) enforces `rtId == (data.rt == 'SEMUA' ? 'SEMUA' : 'rt_' + data.rt)` (e.g., `'rt_01'`..`'rt_08'`).
     - Both `rwId` and `rtId` are mandatory on document creation (`hasRequiredScopeIds`) and validated on updates (`isValidRwRtScope`).
   - **Server RW (`role == 'server'`)** may read and manage documents across all 8 RTs (`01`..`08`) and RW-wide `'SEMUA'` announcements/settings matching their assigned `rw`.
   - **Admin RT (`role == 'admin'`)** may only read, create, update, and delete documents matching BOTH their assigned `rw` AND their assigned `rt` (except reading RW-wide `'SEMUA'` announcements/settings). Admin RT accounts cannot read or mutate records belonging to another RT (`01`..`08`) or RW, and cannot elevate their own `role`, `rw`, `rt`, or `status`.
   - **Warga (`wargaProfiles/{uid}`)** may ONLY read their own `/warga/{wargaId}` record (`linkedUid == request.auth.uid`) and read `/rtPublicSummaries/{scopeId}` matching their exact `rw` and `rt`. Warga cannot read `/bantuan`, `/dokumen`, `/adminAccounts`, `/laporanBulanan`, or other families' PII.
2. **Ownership, Access List, Null-Safe Get & Temporal Integrity**:
   - Every created document enforces `incoming().ownerUid == request.auth.uid`, `createdAt == request.time`, and `updatedAt == request.time`.
   - Every updated document preserves immutable `ownerUid` and `createdAt`, enforces `updatedAt == request.time`, and restricts mutations via `affectedKeys().hasOnly(...)` inside `isValid[Entity](incoming())`-guarded update rules.
   - Single-document `allow get` checks safely handle `resource == null` for authorized active admins (`(resource == null && isActiveAdmin())`) before evaluating `existing().rw` / `existing().rt` so probing non-existent metadata/config docs never triggers a false NullPointer/permission crash.
3. **Zero `get()` Inside `allow list` & Bounded Payloads**:
   - Every `allow list` rule evaluates `resource.data` (`ownerUid`, `serverUid`, `rtAdminUid`, `linkedUid`, `accessUids` bounded `<= 15`) without `get()` or `exists()` lookups and without blanket `isSignedIn()`.
   - Every single-document `get`, `create`, `update`, and `delete` enforces `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `1..128` chars) and strict `.size()` bounds on all strings and lists.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read on Warga PII**: `{ auth: null, op: "get", path: "/warga/w1" }`
2. **Unverified Email Spoof of Bootstrapped Admin**: `{ auth: { uid: "atk1", token: { email: "ar01071997@gmail.com", email_verified: false } }, op: "list", path: "/bantuan" }`
3. **Cross-RT Access Attempt by Admin RT**: `{ auth: adminRT01_RW05, op: "get", path: "/warga/warga_rt08_rw05" }`
4. **Cross-RW Access Attempt by Server**: `{ auth: server_RW05, op: "get", path: "/transactions/tx_rt01_rw02" }`
5. **Non-Admin Listing Confidential Bantuan**: `{ auth: warga_RT08_RW05, op: "list", path: "/bantuan" }`
6. **Admin RT Self-Escalating Role or Switching Assigned RT**: `{ auth: adminRT08_RW05, op: "update", path: "/admins/adminRT08Uid", data: { role: "server", rt: "SEMUA" } }`
7. **Unauthorized Self-Creation of Server Admin After Lock**: `{ auth: { uid: "atk2" }, op: "create", path: "/admins/atk2", data: { uid: "atk2", role: "server", rw: "05", rt: "SEMUA" } }`
8. **Shadow Field Injection (Ghost Field)**: `{ auth: adminRT08, op: "create", path: "/pengumuman/p1", data: { ..., ghostField: true } }`
9. **ID Poisoning (>128 chars or path traversal)**: `{ auth: adminRT08, op: "create", path: "/transactions/../../bad_id", data: { ... } }`
10. **Spoofed ownerUid or Client-Backdated createdAt on Create**: `{ auth: adminRT08, op: "create", path: "/transactions/tx1", data: { ..., ownerUid: "other", createdAt: "2020-01-01T00:00:00Z" } }`
11. **Non-Owner Resident Reading Another Resident PII**: `{ auth: warga1, op: "get", path: "/warga/warga2" }`
12. **Denial of Wallet Oversized String (>4000 chars) or Forged `rwId`/`rtId` Mismatch**: `{ auth: adminRT01, op: "create", path: "/warga/w1", data: { rt: "01", rw: "05", rtId: "rt_08", rwId: "rw_05", ... } }`
