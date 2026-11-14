# Deployment & Staging Guide (Cloud Run — NOT DEPLOYED)

> **Current Status:** `NOT DEPLOYED` to Cloud Run. Running in AI Studio / local Node.js preview mode only. Do not deploy automatically or alter billing without explicit owner authorization.

## Environments

1. **Localhost (`http://localhost:3000`)**: `npm run dev` (`tsx server.ts` + Vite middleware). Synthetic demo uses `localStorage`; real mode connects to provisioned Firebase project `gen-lang-client-0778329070`.
2. **AI Studio Preview**: Serves Express + Vite on port 3000 with `GEMINI_API_KEY` injected server-side from AI Studio Secrets.
3. **Private Cloud Run Staging (Proposed — Requires Owner Approval)**:
   - Use **Cloud Firestore** (already provisioned) — **never** use a writable local SQLite file on Cloud Run because container filesystems are ephemeral and do not scale across instances.
   - Store `GEMINI_API_KEY` in **Google Cloud Secret Manager** and mount as an environment variable at runtime; never bake into Docker layers or `dist/`.
   - Attach a **least-privilege IAM service account** (Secret Manager Secret Accessor only; client auth uses Firebase ID tokens).
   - Deploy with `--no-allow-unauthenticated` (private staging) or IAP/Cloud Armor + Cloud Run max-instances cap (`--max-instances=3`) and billing budget alerts.

## Example Private Staging Commands (For Explicit Owner Execution Only)

A multi-stage, non-root `Dockerfile` and `.dockerignore` are included in the repository root. Neither bakes `.env` or API secrets into image layers.

```bash
# 1. Build production bundle locally
npm run build

# 2. Optional local container sanity build (does not deploy)
docker build -t sahvera-staging .

# 3. Deploy to private Cloud Run staging (requires owner gcloud auth & billing confirmation)
gcloud run deploy sahvera-staging \
  --source . \
  --region asia-south1 \
  --no-allow-unauthenticated \
  --max-instances 3 \
  --set-env-vars="SAHVERA_DEPLOY_ENV=cloud_run_staging" \
  --set-secrets="GEMINI_API_KEY=sahvera-gemini-key:latest"
```

## Cost & Security Caveats

- **Per-property AI quota:** Currently enforced per server instance in memory (`25 calls/hour/property`, with explicit `64/hr` override for approved 32-case eval batches). For multi-instance Cloud Run, back this counter with Firestore transactions or Memorystore.
- **No billing changes made:** This agent did not enable Cloud Run billing, purchase domains, or create public endpoints.

