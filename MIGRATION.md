# Migration & Compatibility Notes (FastAPI/SQLite → TypeScript/Firestore)

This web application is a **fresh TypeScript/Node + React + Cloud Firestore implementation** created for cloud preview and multi-tenant deployment. Keep your original Windows Python/FastAPI repository, local SQLite databases, and existing 100-test Python suite completely intact.

## Gap & Feature Mapping Matrix

| Original Python/FastAPI + SQLite Capability | TypeScript/Node + Firestore Equivalent | Compatibility & Caveats |
|---|---|---|
| Local owner accounts & SQLite tables | Firebase Authentication (Google Sign-In) + Cloud Firestore `/orgs/{orgId}/...` | **Not auto-migrated.** Never automatically read, upload, or modify local SQLite files. |
| Daily work board & room checklists | `TodayView.tsx`, `RoomsListView.tsx`, `RoomDetailView.tsx` | Truthful record-derived queues and zero states; no fabricated occupancy. |
| Task dependency graph (DAG) | `src/core/engine.ts` (`detectCycle`, `validateDependencyAdd`, `calculateCandidateImpact`) | Enforces cycle detection and blocks cross-property/cross-room edges. |
| Offline Hindi/Hinglish/Marathi/English rules | `interpretVendorMessageOffline` in `src/core/engine.ts` | Always labeled `Offline rules — NOT Gemini`; never guesses calendar dates from `"11 AM"`. |
| Optional Gemini structured extraction | `src/server/geminiAdapter.ts` (`gemini-4-hydrogen`) + `validateGeminiExtraction` | Requires explicit consent; adds `gemini-3.5-transcribe` voice note intake. |
| Operator approvals & handover checklist | `applyOperatorDecision` (idempotency keys) & `evaluateHandoverReadiness` | Separates `ProviderConfirmation`, `OwnerApproval`, and `HandoverEvidence`. |
| Synthetic walkthrough & reset | `src/core/demoSeed.ts` + `src/lib/demoStore.ts` | Isolated under `sahvera_synthetic_demo_v1`; cannot mutate Firestore orgs. |
| Backup / restore practices | JSON Backup export in `LegacyAdvancedView.tsx` | Read-only export implemented; automated bulk SQLite import omitted to prevent corrupting tenant boundaries. |

## Test Provenance Honesty

- The prior isolated Python test suite's 100 tests apply ONLY to the Python codebase and **do not** prove compatibility with this TypeScript codebase.
- This TypeScript codebase has its own independent automated test suite (`npm test` running `src/tests/*.test.ts` via `tsx --test`).
