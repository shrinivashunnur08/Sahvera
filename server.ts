import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_TEXT_MODEL,
  getQuotaBackendLabel,
  isGeminiConfigured,
  runGeminiAudioUnderstanding,
  runGeminiPhotoInspection,
  runGeminiTextExtraction,
} from './src/server/geminiAdapter';
import {
  assertTenantBoundary,
  getConfiguredFirebaseProjectId,
  verifyBearerToken,
} from './src/server/authGuard';
import {
  applyOperatorDecision,
  interpretVendorMessageOffline,
  validateDependencyAdd,
} from './src/core/engine';
import { EVALUATION_CASES } from './src/core/evalCases';
import { gradeCaseResult, summarizeEvalOutcomes } from './src/core/evalRunner';
import { logSafeServerEvent } from './src/server/logger';

const PORT = Number(process.env.PORT || 3000);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  // Basic security headers for preview & Cloud Run
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    const firebaseProjectId = getConfiguredFirebaseProjectId();
    res.json({
      status: 'ok',
      app: 'Sahvera — Room Ready, With Proof',
      geminiConfigured: isGeminiConfigured(),
      textModelId: DEFAULT_TEXT_MODEL,
      audioModelId: DEFAULT_AUDIO_MODEL,
      firebaseConfigured: Boolean(firebaseProjectId),
      firebaseProjectId: firebaseProjectId ? 'configured' : null,
      quotaBackend: getQuotaBackendLabel(),
      cloudRunStatus:
        process.env.SAHVERA_DEPLOY_ENV === 'cloud_run_staging'
          ? 'cloud_run_staging_deployed'
          : 'NOT DEPLOYED (AI Studio Preview / Local only)',
    });
  });

  app.post('/api/ai/interpret-text', async (req, res) => {
    const {
      rawText,
      taskTitle,
      timezone,
      propertyId,
      consentGranted,
      mode,
    } = req.body ?? {};

    if (consentGranted !== true) {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Explicit AI consent is required before sending any vendor message to Gemini.',
      });
    }

    if (mode === 'real') {
      const authResult = await verifyBearerToken(req.headers.authorization);
      if (!authResult.ok) {
        return res.status(authResult.status).json({
          ok: false,
          category: 'invalid_request',
          safeMessage: authResult.error,
        });
      }
    }

    if (typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Vendor message text is required.',
      });
    }

    const started = Date.now();
    const result = await runGeminiTextExtraction({
      rawText,
      taskTitle: typeof taskTitle === 'string' ? taskTitle : 'Room task',
      timezone: typeof timezone === 'string' ? timezone : 'Asia/Kolkata',
      propertyId: typeof propertyId === 'string' ? propertyId : 'demo-prop',
    });

    logSafeServerEvent('ai_interpret_text', {
      mode: mode === 'real' ? 'real' : 'demo',
      ok: result.ok,
      category: result.ok ? 'none' : result.category,
      latencyMs: Date.now() - started,
    });

    if (!result.ok) {
      return res.status(result.category === 'invalid_request' ? 400 : 502).json(result);
    }

    return res.json({
      ok: true,
      source: 'real_gemini',
      modelId: result.modelId,
      data: result.data,
    });
  });

  app.post('/api/ai/interpret-audio', async (req, res) => {
    const {
      audioBase64,
      mimeType,
      taskTitle,
      timezone,
      propertyId,
      consentGranted,
      mode,
    } = req.body ?? {};

    if (consentGranted !== true) {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Explicit AI audio consent is required before uploading a voice note.',
      });
    }

    if (mode === 'real') {
      const authResult = await verifyBearerToken(req.headers.authorization);
      if (!authResult.ok) {
        return res.status(authResult.status).json({
          ok: false,
          category: 'invalid_request',
          safeMessage: authResult.error,
        });
      }
    }

    if (typeof audioBase64 !== 'string' || typeof mimeType !== 'string') {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Audio base64 payload and MIME type are required.',
      });
    }

    const started = Date.now();
    const result = await runGeminiAudioUnderstanding({
      audioBase64,
      mimeType,
      taskTitle: typeof taskTitle === 'string' ? taskTitle : 'Room task',
      timezone: typeof timezone === 'string' ? timezone : 'Asia/Kolkata',
      propertyId: typeof propertyId === 'string' ? propertyId : 'demo-prop',
    });

    logSafeServerEvent('ai_interpret_audio', {
      mode: mode === 'real' ? 'real' : 'demo',
      ok: result.ok,
      category: result.ok ? 'none' : result.category,
      latencyMs: Date.now() - started,
    });

    if (!result.ok) {
      return res.status(result.category === 'invalid_request' ? 400 : 502).json(result);
    }

    return res.json({
      ok: true,
      source: 'real_gemini',
      audioModelId: result.audioModelId,
      textModelId: result.textModelId,
      transcript: result.transcript,
      data: result.extraction,
    });
  });

  app.post('/api/ai/inspect-room-photo', async (req, res) => {
    const {
      imageBase64,
      mimeType,
      roomIdentifier,
      taskTitles,
      propertyId,
      consentGranted,
      mode,
    } = req.body ?? {};

    if (consentGranted !== true) {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Explicit AI consent is required before sending room photos to Gemini Vision.',
      });
    }

    if (mode === 'real') {
      const authResult = await verifyBearerToken(req.headers.authorization);
      if (!authResult.ok) {
        return res.status(authResult.status).json({
          ok: false,
          category: 'invalid_request',
          safeMessage: authResult.error,
        });
      }
    }

    if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage: 'Room photo base64 payload and MIME type are required.',
      });
    }

    const started = Date.now();
    const result = await runGeminiPhotoInspection({
      imageBase64,
      mimeType,
      roomIdentifier: typeof roomIdentifier === 'string' ? roomIdentifier : 'Room',
      taskTitles: Array.isArray(taskTitles) ? taskTitles.map(String).slice(0, 12) : [],
      propertyId: typeof propertyId === 'string' ? propertyId : 'demo-prop',
    });

    logSafeServerEvent('ai_inspect_room_photo', {
      mode: mode === 'real' ? 'real' : 'demo',
      ok: result.ok,
      category: result.ok ? 'none' : result.category,
      latencyMs: Date.now() - started,
    });

    if (!result.ok) {
      return res.status(result.category === 'invalid_request' ? 400 : 502).json(result);
    }

    return res.json({
      ok: true,
      source: 'real_gemini',
      modelId: result.modelId,
      result: result.result,
    });
  });

  // Explicitly approved comparative live Gemini evaluation batch (never mocked)
  app.post('/api/ai/run-eval-batch', async (req, res) => {
    const { approvalGranted, limit } = req.body ?? {};
    if (approvalGranted !== true) {
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        safeMessage:
          'Explicit approval is required before executing a batch of live Gemini API calls.',
      });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({
        ok: false,
        category: 'missing_or_invalid_key',
        safeMessage:
          'GEMINI_API_KEY is not configured on the server. Live Gemini evaluation unavailable.',
      });
    }

    const boundedLimit = Math.min(
      EVALUATION_CASES.length,
      Math.max(1, Number.isInteger(limit) ? Number(limit) : EVALUATION_CASES.length)
    );
    const targetCases = EVALUATION_CASES.slice(0, boundedLimit);
    const started = Date.now();

    const outcomes = new Array(targetCases.length);
    const CONCURRENCY = 8;
    let cursor = 0;

    async function evalWorker() {
      while (true) {
        const idx = cursor++;
        if (idx >= targetCases.length) break;
        const c = targetCases[idx];
        const result = await runGeminiTextExtraction({
          rawText: c.rawText,
          taskTitle: c.taskTitle,
          timezone: 'Asia/Kolkata',
          propertyId: 'eval-batch-runner',
          maxQuotaOverride: 128,
        });

        if (!result.ok) {
          outcomes[idx] = gradeCaseResult(c, 'ai_unavailable', {
            ok: false,
            error: `${result.category}: ${result.safeMessage}`,
          });
        } else {
          outcomes[idx] = gradeCaseResult(c, 'real_gemini', {
            ok: true,
            eventKind: result.data.event_kind,
            reportedDelayMinutes: result.data.reported_delay_minutes,
            newDatetimeIso: result.data.new_datetime_iso,
            costDeltaInr: result.data.cost_delta_inr,
            providerCommitment: result.data.provider_commitment,
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targetCases.length) }, () => evalWorker())
    );

    const report = summarizeEvalOutcomes('real_gemini', outcomes);
    logSafeServerEvent('ai_eval_batch', {
      totalCases: report.totalCases,
      passedAllCount: report.passedAllCount,
      errorCount: report.errorCount,
      latencyMs: Date.now() - started,
    });

    return res.json({
      ok: true,
      modelId: DEFAULT_TEXT_MODEL,
      report,
    });
  });

  // Server-side deterministic invariant & authorization validation endpoint
  app.post('/api/workspace/validate-mutation', async (req, res) => {
    const { action, payload, mode } = req.body ?? {};
    if (mode === 'real') {
      const authResult = await verifyBearerToken(req.headers.authorization);
      if (!authResult.ok) {
        return res.status(authResult.status).json({ ok: false, reason: authResult.error });
      }
      const boundary = assertTenantBoundary({
        authenticatedUid: authResult.user.uid,
        requestedOwnerUid: payload?.ownerUid ?? '',
        requestedOrgId: payload?.orgId ?? '',
        expectedOrgId: payload?.expectedOrgId ?? '',
      });
      if (!boundary.ok) {
        return res.status(403).json({ ok: false, reason: boundary.reason });
      }
    }

    if (action === 'validate_dependency') {
      const check = validateDependencyAdd(payload);
      return res.status(check.ok ? 200 : 400).json(check);
    }

    if (action === 'validate_approval') {
      const result = applyOperatorDecision(payload);
      return res.status(result.ok ? 200 : 409).json(result);
    }

    if (action === 'offline_interpret') {
      const interp = interpretVendorMessageOffline(payload);
      return res.json({ ok: true, interpretation: interp });
    }

    return res.status(400).json({ ok: false, reason: 'Unknown validation action.' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const enableHmr = process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true';
    if (!enableHmr && process.env.DISABLE_HMR !== 'true') {
      process.env.DISABLE_HMR = 'true';
    }
    if (!enableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(
          `export function createHotContext() {
  return { accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, data: {} };
}
export function updateStyle(id, content) {
  let el = document.querySelector(\`style[data-vite-dev-id="\${CSS.escape(String(id))}"]\`);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', String(id));
    document.head.appendChild(el);
  }
  el.textContent = content;
}
export function removeStyle(id) {
  const el = document.querySelector(\`style[data-vite-dev-id="\${CSS.escape(String(id))}"]\`);
  if (el) el.remove();
}
export class ErrorOverlay {}
export const injectQuery = (url) => url;
`
        );
      });
    }
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: enableHmr ? { server: httpServer } : false,
        ws: enableHmr ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sahvera server listening on http://0.0.0.0:${PORT}`);
  });
}

// Start HTTP server only when executed directly (allows importing createApp in tests)
const isDirectRun =
  process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start Sahvera server:', err);
    process.exit(1);
  });
}
