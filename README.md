# Sahvera — Room Ready, With Proof

Pre-move-in room readiness, vendor dependency coordination, and evidence-backed handover sign-off for independent PG, hostel, and co-living operators in India.

> **Important provenance note:** This TypeScript + React + Express + Cloud Firestore application is a **fresh cloud-preview implementation** built to match the Sahvera product invariants. It does not claim automatic lossless database migration from the earlier local Python/FastAPI + SQLite Windows version (`MIGRATION.md` documents the compatibility matrix).

## Architecture Overview

```
Browser (React + Tailwind v4)
 ├── / (ProductIntro) ──> "Try fictional case" (Zero sign-in, isolated localStorage)
 └── /workspace
      ├── Fictional walkthrough (Room 203 Pune · Offline rules or opt-in AI)
      ├── Today / My rooms (Firebase Auth Google Sign-In + Cloud Firestore)
      ├── Economics & Pilot (Transparent hypothesis calculator + empty-default research log)
      ├── For evaluators (5-part Buildathon brief + live Google services matrix)
      └── Advanced / Legacy (JSON backup, FastAPI migration matrix, org purge)

Express Backend (server.ts, Port 3000)
 ├── GET  /api/health                  -> Safe configuration booleans (never exposes secrets)
 ├── POST /api/ai/interpret-text       -> Explicit consent + Auth JWKS check + @google/genai (gemini-4-hydrogen) + Semantic Validator
 ├── POST /api/ai/interpret-audio      -> Explicit consent + <=2MB MIME check + gemini-3.5-transcribe + structured extraction
 ├── POST /api/ai/inspect-room-photo   -> Explicit consent + <=4MB JPEG/PNG/WebP check + gemini-4-hydrogen Vision readiness check
 ├── POST /api/ai/run-eval-batch       -> Explicitly approved 32-case live Gemini comparative benchmark
 └── POST /api/workspace/validate-mutation -> Tenant boundary + DAG cycle + approval idempotency checks
```

## Quick Start

1. Install dependencies: `npm install`
2. Set environment secrets (in `.env` locally or AI Studio Secrets panel — never commit real keys):
   - `GEMINI_API_KEY` (optional; app runs fully offline using `Offline rules — NOT Gemini` when absent)
3. Run automated tests: `npm test`
4. Run TypeScript check: `npm run lint`
5. Start development server: `npm run dev` (serves on port `3000`)

## Hero Demo & Evaluation Harness

- **Hero Scenario (Public Synthetic Room 203):** Click **Try fictional case** at `/` → select **Hero Scenario (Electrician Hinglish)** (`"Bhai, kal 11 baje aane ki koshish karunga. Aaj 2 ghante late ho gaya. Confirm nahi hai."`) → press **Assess impact** → verify `120 min` delay, `tentative` commitment, `null` timestamp (refuses to invent date from `"kal 11 baje"`), plain-language handover risk explanation, Cleaning & Inspection flagged `At risk`, Independent Wi-Fi `Unchanged`, and `Manual interpretation` override support.
- **32-Case Comparative Evaluation (`For evaluators`):** Run the deterministic offline baseline across 32 diverse English, Hinglish, Hindi/Marathi, contradictory, voice-transcript, and prompt-injection cases, or explicitly approve a live Gemini comparison batch.

## Security & Privacy Highlights

- Explicit consent checkboxes before any vendor message or audio clip leaves the browser.
- Untrusted `<untrusted_vendor_message>` framing + server-side semantic validation stripping hallucinated ISO dates & prompt-injection commitment overrides.
- Redacted server logging (`src/server/logger.ts`) that strips raw vendor messages, audio payloads, API keys, emails, and Indian phone numbers.
- Multi-tenant Cloud Firestore security rules (`firestore.rules`) audited via `@firebase/eslint-plugin-security-rules`.
- No compliance certification claimed; remaining threats are documented under **Advanced / Legacy**.
