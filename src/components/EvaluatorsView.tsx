import React, { useState } from 'react';
import { Download, Play, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { runOfflineBaselineEvaluation, type EvalSuiteReport } from '../core/evalRunner';

interface EvaluatorsViewProps {
  health: {
    geminiConfigured: boolean;
    textModelId: string;
    audioModelId: string;
    firebaseConfigured: boolean;
    cloudRunStatus: string;
    quotaBackend?: string;
  };
}

interface CriterionAudit {
  title: string;
  demonstrates: string;
  incomplete: string;
  strengthenNext: string;
  howToVerify: string;
}

const BUILDATHON_CRITERIA: CriterionAudit[] = [
  {
    title: '1. Founder profile',
    demonstrates:
      'Systems-engineering depth prioritizing Indian ground-reality failure modes (verbal vendor evasion, silent subcontractors, safety invariants, idempotent human sign-off) and strict zero-fabrication integrity.',
    incomplete:
      'Live field-pilot interviews and multi-property operator traction metrics still need real founder execution outside the codebase.',
    strengthenNext:
      'Complete 5–10 Pune/Mumbai/Bengaluru PG operator interviews using the 5-question script, attach anonymized pilot logs, and finalize the 7-minute Stage 1 pitch deck.',
    howToVerify:
      'Inspect MIGRATION.md, automated unit tests, and the zero-fake-MRR policy across ROI Calculator & Design Partner Log.',
  },
  {
    title: '2. Product potential',
    demonstrates:
      'Installable Android PWA + Web Share Target (share directly from WhatsApp into Room Intake), Hinglish/voice/1-tap silent-vendor updates, 1-tap wa.me vendor clarification links, Move-In vs Move-Out photo proof, and WhatsApp Move-In Proof Card.',
    incomplete:
      'Vendor clarification & Move-In Proof Card use wa.me sharing and manual copy by design (no unattended WhatsApp Business API sending yet).',
    strengthenNext:
      'Measure first-session room handover turnaround time and Move-In vs Move-Out Proof Card adoption with real PG operators.',
    howToVerify:
      'Test /workspace?share=1&share_text=..., toggle English + Hinglish mode, click Assess impact, inspect "Send on WhatsApp", and preview the Move-In/Move-Out Proof Card.',
  },
  {
    title: '3. Market viability',
    demonstrates:
      'Specific buyer hypothesis (20–150 bed independent PGs & high-churn hostels), explicit RentOk differentiation, two-sided deposit-dispute protection, ICP presets, and baseline-gated ROI calculator.',
    incomplete:
      'Market size, conversion rate, churn, and INR 999–2,499/mo willingness to pay remain unvalidated until live operator interviews are logged.',
    strengthenNext:
      'Record consenting operator willingness-to-pay data inside ROI Calculator → Design Partner Research Log.',
    howToVerify:
      'Open ROI Calculator, test the 3 ICP presets, toggle "Measured operator baseline exists" off to verify admin & deposit value drop to INR 0.',
  },
  {
    title: '4. Technical architecture',
    demonstrates:
      'Installable offline-capable PWA, modular React + Express backend, pure deterministic TypeScript DAG engine, Firebase Auth & deployed tenant-isolated Firestore rules, Warden vs Owner role guardrails, disk-backed quota store, and Docker packaging.',
    incomplete:
      'Cloud Run production URL is NOT DEPLOYED from this preview sandbox; disk-backed quota store persists locally on a single node until shared Redis/Firestore counters are wired.',
    strengthenNext:
      'Deploy to Cloud Run via gcloud run deploy with Secret Manager and move per-property quota counters into shared Firestore transactions.',
    howToVerify:
      'Inspect firestore.rules (linted clean & deployed), run npm test, test Role switcher (Owner vs Warden) in Workspace Context Bar, and check /api/health.',
  },
  {
    title: '5. Use of Google AI',
    demonstrates:
      'Tri-modal consented @google/genai integration: structured multilingual text extraction (gemini-4-hydrogen), live mic & file voice-note transcription (gemini-3.5-transcribe), and Gemini Vision Room Photo Proof inspection (/api/ai/inspect-room-photo), backed by a 32-case comparative eval harness.',
    incomplete:
      'Live Gemini batch & Vision accuracy depend on server Gemini API key configuration and quota; offline rules and manual physical checks remain active when unconfigured.',
    strengthenNext:
      'Run the approved 32-case live Gemini benchmark with a funded key and benchmark Vision photo precision on real PG turnover photos.',
    howToVerify:
      'Run the 32-case offline baseline below, inspect validateGeminiPhotoInspection & prompt-injection stripping tests, and test opt-in Gemini text/photo inspection.',
  },
];

const JURY_QAS = [
  {
    q: 'Why would a PG owner open Sahvera instead of just managing vendors on WhatsApp?',
    a: 'WhatsApp shows scattered chats and voice notes ("bas 10 min mein aa raha hoon") but never propagates a 2-hour electrical delay onto Cleaning and Final Inspection slots. Sahvera converts voice/text updates or silent-vendor calls into clear downstream risk and a verifiable Move-In Proof Card.',
  },
  {
    q: 'Isn’t RentOk or MyGate already doing PG management?',
    a: 'Yes—RentOk already handles room rosters, rent reminders, and maintenance tickets. Sahvera does not try to replace rent ledgers; it targets the unhandled pre-move-in exception chain and visual handover proof between third-party contractors, wardens, and incoming residents.',
  },
  {
    q: 'Why can’t Gemini just reschedule tasks automatically when a vendor texts?',
    a: 'Vendors frequently say "kal 11 baje koshish karunga, confirm nahi hai" or "raste mein hoon". Auto-rescheduling from hedged messages breaks booked cleaners and risks a 7 PM arrival failure. Gemini extracts facts and inspects photos; deterministic rules and humans own state mutations.',
  },
  {
    q: 'Why is Google AI genuinely necessary here instead of simple regex rules?',
    a: 'Regex cannot inspect a room handover photo for exposed switchboard wires, wet paint, or dirty floors (Gemini Vision), nor transcribe noisy Marathi/Hinglish voice notes recorded live on-site (gemini-3.5-transcribe). Meanwhile, deterministic rules act as a zero-latency local fallback and safety guardrail.',
  },
  {
    q: 'How many paying PG properties do you have today?',
    a: 'Zero paying customers claimed. This submission proves the working multimodal product, safety invariants, deployed Firestore tenant rules, and transparent economics model; live operator pilots and Cloud Run staging deployment are the explicit next steps.',
  },
];

export const EvaluatorsView: React.FC<EvaluatorsViewProps> = ({ health }) => {
  const [offlineReport, setOfflineReport] = useState<EvalSuiteReport | null>(null);
  const [geminiReport, setGeminiReport] = useState<EvalSuiteReport | null>(null);
  const [evalApproval, setEvalApproval] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [showAllCases, setShowAllCases] = useState(false);

  const handleRunOfflineEval = () => {
    setOfflineReport(runOfflineBaselineEvaluation());
  };

  const handleRunLiveGeminiEval = async () => {
    setEvalError(null);
    if (!evalApproval) {
      setEvalError('Check explicit API cost approval before executing the 32-case Gemini batch.');
      return;
    }
    setEvalBusy(true);
    try {
      const resp = await fetch('/api/ai/run-eval-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalGranted: true }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        setEvalError(json.safeMessage || 'Live Gemini evaluation batch failed.');
        return;
      }
      setGeminiReport(json.report as EvalSuiteReport);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Network error running live Gemini eval.');
    } finally {
      setEvalBusy(false);
    }
  };

  const displayedCases = (geminiReport ?? offlineReport)?.outcomes ?? [];
  const visibleRows = showAllCases ? displayedCases : displayedCases.slice(0, 10);

  const handleDownloadEvalJson = () => {
    const activeReport = geminiReport ?? offlineReport;
    if (!activeReport) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      textModelId: health.textModelId,
      offlineReport,
      geminiReport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahvera-eval-32cases-${geminiReport ? 'gemini' : 'offline'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* 5 Buildathon Criteria Audit (no invented weights) */}
      <section className="rounded-lg border border-[#DEDBD2] bg-white p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#111C1B]">
            Buildathon Evaluation Alignment (No Invented Weights)
          </h2>
          <p className="text-sm text-[#4A5957]">
            Fresh TypeScript + React + Express + Cloud Firestore implementation inspired by an
            earlier local Python/FastAPI prototype. Audited honestly against all five published
            evaluation areas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {BUILDATHON_CRITERIA.map((item, idx) => (
            <article
              key={item.title}
              className={`rounded-md border border-[#DEDBD2] p-4 space-y-2 text-xs ${
                idx === BUILDATHON_CRITERIA.length - 1 ? 'md:col-span-2' : ''
              }`}
            >
              <h3 className="font-display text-sm font-semibold text-[#111C1B]">{item.title}</h3>
              <div>
                <span className="font-semibold text-[#15803D]">Demonstrated: </span>
                <span className="text-[#111C1B]">{item.demonstrates}</span>
              </div>
              <div>
                <span className="font-semibold text-[#B45309]">Incomplete: </span>
                <span className="text-[#4A5957]">{item.incomplete}</span>
              </div>
              <div>
                <span className="font-semibold text-[#0F4C4C]">Evidence next: </span>
                <span className="text-[#4A5957]">{item.strengthenNext}</span>
              </div>
              <div className="border-t border-[#DEDBD2] pt-1.5 text-[11px] text-[#4A5957]">
                <strong>Verify:</strong> {item.howToVerify}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 32-Case Comparative Evaluation Harness */}
      <section className="rounded-lg border border-[#DEDBD2] bg-white p-6 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              Comparative Evaluation Harness (32 Diverse Multilingual &amp; Adversarial Cases)
            </h2>
            <p className="text-xs text-[#4A5957]">
              Tests English, Hinglish, Hindi/Marathi Devanagari &amp; Romanized updates, bare times,
              cancellations, price changes, contradictions, noisy voice transcripts, and prompt injections.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRunOfflineEval}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#0F4C4C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A3838]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Run 32-case offline baseline</span>
            </button>
            {(offlineReport || geminiReport) && (
              <button
                type="button"
                onClick={handleDownloadEvalJson}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#DEDBD2] bg-white px-3.5 py-2 text-xs font-semibold text-[#111C1B] hover:bg-[#F7F6F2]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download Eval JSON</span>
              </button>
            )}
          </div>
        </div>

        {/* Explicitly gated Live Gemini batch trigger */}
        <div className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs">
          <label className="flex items-start gap-2 text-[#111C1B]">
            <input
              type="checkbox"
              checked={evalApproval}
              onChange={(e) => setEvalApproval(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#0F4C4C]"
            />
            <span>
              <strong>Approve live Gemini API batch:</strong> Execute 32 real server-side{' '}
              <code className="font-mono-num">{health.textModelId}</code> calls to benchmark against
              offline rules (never mocked).
            </span>
          </label>
          <button
            type="button"
            disabled={evalBusy || !evalApproval || !health.geminiConfigured}
            onClick={handleRunLiveGeminiEval}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-[#0F4C4C] bg-white px-3 py-1.5 font-semibold text-[#0F4C4C] hover:bg-[#F0F5F4] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {evalBusy
                ? 'Running 32 Gemini calls…'
                : health.geminiConfigured
                ? 'Run live Gemini 32-case batch'
                : 'Gemini key not configured'}
            </span>
          </button>
        </div>

        {evalError && (
          <div
            role="alert"
            className="rounded-md border border-[#B91C1C]/30 bg-red-50 px-3 py-2 text-xs text-[#991B1B]"
          >
            {evalError}
          </div>
        )}

        {(offlineReport || geminiReport) && (
          <div className="grid gap-4 md:grid-cols-2">
            {offlineReport && (
              <div className="rounded-md border border-[#DEDBD2] p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <strong className="text-[#111C1B]">Offline rules — NOT Gemini</strong>
                  <span className="font-mono-num text-[#92400E]">
                    {offlineReport.passedAllCount}/{offlineReport.totalCases} passed all
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#4A5957]">
                  <div>
                    Intent match:{' '}
                    <strong className="font-mono-num text-[#111C1B]">
                      {offlineReport.intentMatchCount}/{offlineReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    Delay accuracy:{' '}
                    <strong className="font-mono-num text-[#111C1B]">
                      {offlineReport.delayMatchCount}/{offlineReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    Safety invariants:{' '}
                    <strong className="font-mono-num text-[#15803D]">
                      {offlineReport.safetyInvariantCount}/{offlineReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    Abstentions (unclear):{' '}
                    <strong className="font-mono-num text-[#111C1B]">
                      {offlineReport.abstentionCount}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {geminiReport && (
              <div className="rounded-md border border-[#0F4C4C]/40 bg-[#F0F5F4]/40 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <strong className="text-[#0F4C4C]">Real Gemini ({health.textModelId})</strong>
                  <span className="font-mono-num text-[#0F4C4C]">
                    {geminiReport.passedAllCount}/{geminiReport.totalCases} passed all
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#4A5957]">
                  <div>
                    Intent match:{' '}
                    <strong className="font-mono-num text-[#111C1B]">
                      {geminiReport.intentMatchCount}/{geminiReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    Delay accuracy:{' '}
                    <strong className="font-mono-num text-[#111C1B]">
                      {geminiReport.delayMatchCount}/{geminiReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    Safety invariants:{' '}
                    <strong className="font-mono-num text-[#15803D]">
                      {geminiReport.safetyInvariantCount}/{geminiReport.totalCases}
                    </strong>
                  </div>
                  <div>
                    AI errors:{' '}
                    <strong className="font-mono-num text-[#B91C1C]">
                      {geminiReport.errorCount}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {displayedCases.length > 0 && (
          <div className="space-y-2">
            <div className="overflow-x-auto border border-[#DEDBD2] rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F6F2] border-b border-[#DEDBD2] text-[#4A5957]">
                  <tr>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Predicted</th>
                    <th className="px-3 py-2">Safety</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DEDBD2]">
                  {visibleRows.map((o) => (
                    <tr key={o.caseId}>
                      <td className="px-3 py-2 font-mono-num text-[#111C1B]">
                        {o.caseId}
                        <div className="font-sans text-[11px] text-[#4A5957] max-w-xs truncate">
                          {o.rawText}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[#4A5957]">{o.category}</td>
                      <td className="px-3 py-2 font-mono-num">
                        {o.predictedEventKind} / {o.predictedDelayMinutes ?? 'null'}m /{' '}
                        {o.predictedCommitment}
                      </td>
                      <td className="px-3 py-2">
                        {o.noHallucinatedDate && o.neverAutoConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[#15803D]">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Safe
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#B91C1C]">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Unsafe
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {o.passedAll ? (
                          <span className="font-medium text-[#15803D]">Pass</span>
                        ) : (
                          <span className="text-[#B45309]">{o.failureReason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {displayedCases.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllCases((v) => !v)}
                className="text-xs font-medium text-[#0F4C4C] hover:underline"
              >
                {showAllCases
                  ? 'Show first 10 cases'
                  : `Show all ${displayedCases.length} evaluation cases`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Three-column Google services matrix */}
      <section className="rounded-lg border border-[#DEDBD2] bg-white p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-[#111C1B]">
          Google services integration matrix (live server check)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#DEDBD2] bg-[#F7F6F2] text-[#4A5957]">
              <tr>
                <th className="px-3 py-2.5">Truly connected</th>
                <th className="px-3 py-2.5">Simulated / Local fallback</th>
                <th className="px-3 py-2.5">Not configured / Not deployed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DEDBD2]">
              <tr>
                <td className="px-3 py-3 align-top text-[#111C1B]">
                  <ul className="space-y-1">
                    <li>
                      • Firebase Auth + Cloud Firestore:{' '}
                      <strong>
                        {health.firebaseConfigured ? 'Provisioned & Rules Deployed' : 'Not configured'}
                      </strong>
                    </li>
                    <li>
                      • Server-side Gemini SDK (`@google/genai`):{' '}
                      <strong>
                        {health.geminiConfigured ? 'Key configured on server' : 'Awaiting server key'}
                      </strong>
                    </li>
                    <li>
                      • AI quota store: <strong>{health.quotaBackend ?? 'File-backed sliding window'}</strong>
                    </li>
                  </ul>
                </td>
                <td className="px-3 py-3 align-top text-[#4A5957]">
                  <ul className="space-y-1">
                    <li>• Synthetic Room 203 demo (isolated localStorage/in-memory)</li>
                    <li>• Offline deterministic rule baseline (`Offline rules — NOT Gemini`)</li>
                    <li>• Compressed on-device Move-In/Move-Out room thumbnails</li>
                  </ul>
                </td>
                <td className="px-3 py-3 align-top text-[#4A5957]">
                  <ul className="space-y-1">
                    <li>
                      • Cloud Run staging: <strong>{health.cloudRunStatus}</strong>
                    </li>
                    <li>• Live WhatsApp Business API sending (manual copy only)</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Jury Narrative Pack: 30s Intro, 2-min Hero Demo Script, 6-Slide Outline & 5 Jury Q&As */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4 text-xs">
          <h2 className="font-display text-base font-semibold text-[#111C1B]">
            Jury narrative, 30s intro &amp; 2-minute Hero demo script
          </h2>
          <div className="rounded-md bg-[#F7F6F2] p-3 space-y-1">
            <div className="font-semibold text-[#0F4C4C]">30-second intro</div>
            <p className="text-[#111C1B] leading-relaxed">
              &ldquo;In Indian PGs and hostels, residents do not arrive at 7 PM to an unready room
              because owners lack dashboards—they arrive to surprises because a vendor sends a
              tentative Hinglish WhatsApp update and nobody propagates that delay across dependent
              cleaning and inspection teams. Sahvera is an AI-assisted room-handover exception
              engine that turns messy updates into clear downstream risk, clarification questions,
              and human-approved actions.&rdquo;
            </p>
          </div>
          <ol className="list-decimal pl-4 space-y-1.5 text-[#4A5957]">
            <li>
              Click <strong>Try Interactive Sandbox</strong> to open Room 203 (Painting → Electrical →
              Cleaning → Inspection + independent Wi-Fi).
            </li>
            <li>
              Select <strong>Hinglish Delay (Electrician)</strong>:{' '}
              <em>&ldquo;Bhai, kal 11 baje aane ki koshish karunga. Aaj 2 ghante late ho gaya. Confirm nahi hai.&rdquo;</em>
            </li>
            <li>
              Click <strong>Assess impact</strong> (offline or opt-in Gemini): verify{' '}
              <strong>120 min</strong> delay, <strong>tentative</strong> commitment,{' '}
              <strong>null</strong> timestamp (refuses to invent date from &ldquo;kal 11 baje&rdquo;),
              plain-language risk, Cleaning &amp; Inspection flagged <strong>At risk</strong>, and
              Wi-Fi <strong>Unchanged</strong>.
            </li>
            <li>
              Record human decision (idempotent), save an unverified follow-up to the Today queue,
              and verify physical handover remains blocked until provider confirmation &amp; safety checks exist.
            </li>
          </ol>

          <div className="border-t border-[#DEDBD2] pt-3 space-y-1.5">
            <div className="font-semibold text-[#111C1B]">Six-slide pitch outline</div>
            <ol className="list-decimal pl-4 space-y-1 text-[#4A5957]">
              <li>7 PM move-in failure &amp; scattered Hinglish coordination problem</li>
              <li>Defensible wedge: Pre-move-in dependency exception engine (not another rent ledger)</li>
              <li>Live Room 203 Hero walkthrough (messy update → DAG impact → human sign-off)</li>
              <li>Essential Google AI + Cloud Firestore safety architecture</li>
              <li>Target buyer (20–150 bed PGs) &amp; transparent unit-economics hypothesis</li>
              <li>Validation plan: 32-case eval benchmark + 5-question operator field study</li>
            </ol>
          </div>
        </section>

        <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-[#111C1B]">
            Five difficult jury questions &amp; grounded answers
          </h2>
          <dl className="space-y-3 text-xs">
            {JURY_QAS.map((qa) => (
              <div key={qa.q} className="rounded-md border border-[#DEDBD2] p-3 space-y-1">
                <dt className="font-semibold text-[#111C1B]">{qa.q}</dt>
                <dd className="text-[#4A5957] leading-relaxed">{qa.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
};
