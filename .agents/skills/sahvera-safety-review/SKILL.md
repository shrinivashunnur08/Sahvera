---
name: sahvera-safety-review
description: >
  Scoped safety, privacy, and invariant review checklist for Sahvera
  (Room Ready, With Proof) in Antigravity IDE/CLI.
---

# Sahvera Safety & Invariant Review Skill

Use this checklist before approving any code change, prompt edit, or schema update in Sahvera:

1. **Data Classification & Synthetic Isolation**
   - Confirm synthetic walkthrough records (`demo-*`) remain strictly isolated from live Firestore organization collections.
   - Verify `Reset fictional demo` only mutates the synthetic in-memory/local demo state and cannot delete or overwrite authenticated org records.
   - Verify no real resident identity documents, OTPs, payment credentials, or live WhatsApp tokens are stored or displayed.

2. **Explicit AI Consent & Source Labeling**
   - Verify neither text nor voice audio is sent to `/api/ai/*` unless `consentGranted === true`.
   - Confirm `Real Gemini` is displayed ONLY when a live server-side Gemini call returned semantically validated JSON; offline fallback must always display `Offline rules — NOT Gemini`.
   - Confirm API keys exist only in server environment (`process.env.GEMINI_API_KEY`) and never appear in client bundles, URLs, or logs.

3. **Prompt Injection & Temporal Safety**
   - Confirm vendor messages are wrapped inside `<untrusted_vendor_message>` delimiters and treated strictly as data.
   - Verify relative phrases (`11 AM`, `tomorrow`, `shaam tak`, `kal`) without an explicit calendar date never produce a silent `new_datetime_iso` timestamp.

4. **Human Approval & Idempotency Gates**
   - Confirm no vendor message or AI extraction directly mutates booked task slots, prices, or `verified_physical_handover` status.
   - Confirm `applyOperatorDecision` requires a unique `idempotencyKey` and rejects duplicate submissions.
   - Confirm `ProviderConfirmation`, `OwnerApproval`, and `HandoverEvidence` remain distinct objects.

5. **Cross-Tenant & Cross-Property Isolation**
   - Confirm `firestore.rules` enforces `isVerified()`, `isOrgMember(orgId)`, `resource.data.ownerUid == request.auth.uid`, and `affectedKeys().hasOnly(...)` on every collection.
   - Confirm `validateDependencyAdd` rejects cycles and cross-property/cross-room edges.
