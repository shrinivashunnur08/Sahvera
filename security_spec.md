# Sahvera Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every operational record (`Property`, `Room`, `Task`, `TaskDependency`, `VendorUpdate`, `Interpretation`, `ImpactProposal`, `ProviderConfirmation`, `OwnerApproval`, `FollowUp`, `HandoverEvidence`, `AuditEvent`, `PilotFeedback`) belongs to exactly one `orgId` under `/orgs/{orgId}/...`.
2. **Membership Master Gate**: Single-document access (`get`, `create`, `update`, `delete`) requires an active membership document at `/orgs/{orgId}/members/$(request.auth.uid)` and `request.auth.token.email_verified == true`.
3. **Query Enforcer Without `get()` Fan-out**: All `allow list` rules check `resource.data.ownerUid == request.auth.uid` and `resource.data.orgId == orgId` directly against `resource.data` without `get()` or `exists()` lookups.
4. **Immutable Ownership & Temporal Integrity**: `id`, `orgId`, `ownerUid`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time` (Firestore `serverTimestamp()`).
5. **Audit Trail Append-Only**: `AuditEvent` documents are immutable once created (`allow update, delete: if false;`).
6. **Terminal State Locking**: Once a `Room` reaches `readinessStage == 'verified_physical_handover'` or an `ImpactProposal` reaches `'approved'` or `'rejected'`, client updates cannot mutate it back to a prior state.
7. **No Self-Assigned Admin/Role Escalation**: Users cannot create or modify another user's membership or promote themselves to `owner` on an existing organization they did not create.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Tenant Read**: User B (`uid_B`) calls `get(/orgs/org_A/rooms/room_1)`.
2. **Cross-Tenant List Scraping**: User B queries `collection('/orgs/org_A/rooms')` without `ownerUid == uid_B`.
3. **Shadow Field Injection**: User A creates a `Room` with an extra ghost field `{ isVerified: true, adminBypass: true }`.
4. **Unverified Email Bypass**: User A with `email_verified: false` attempts to write to `/orgs/org_A/rooms/room_1`.
5. **Identity Spoofing on Create**: User B sets `ownerUid: "uid_A"` when creating a `Property` inside `/orgs/org_B/properties/prop_1`.
6. **Role Self-Escalation**: A `viewer` member updates `/orgs/org_A/members/uid_viewer` to `{ role: "owner" }`.
7. **ID Poisoning**: Attacker writes a 1.5KB junk string or slash-injected ID as `{roomId}` (`/orgs/org_A/rooms/bad..id`).
8. **Backdated Timestamp Forgery**: User A creates an `OwnerApproval` with a client-forged `createdAt` instead of `request.time`.
9. **Audit Log Tampering**: User A attempts `update` or `delete` on `/orgs/org_A/auditEvents/evt_1` to erase evidence.
10. **Terminal State Reversal**: User A updates an already `'approved'` `ImpactProposal` back to `'pending_review'`.
11. **Value Poisoning (Oversized String)**: User A updates `FollowUp.messageDraft` with a 50,000-character string exceeding `.size() <= 1000`.
12. **Orphaned Cross-Property Task Write**: User A updates `Task.orgId` or `Task.propertyId` during an update to link across organizations.

## 3. Verification Runner
- Automated ESLint rules check via `@firebase/eslint-plugin-security-rules` on `DRAFT_firestore.rules` and `firestore.rules`.
- Server-side & pure-logic invariant tests in `src/tests/security-and-isolation.test.ts` verifying cross-tenant isolation, RBAC rejection, cycle/cross-property rejection, and idempotency.
