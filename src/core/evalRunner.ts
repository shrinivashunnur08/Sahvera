import { interpretVendorMessageOffline } from './engine';
import { EVALUATION_CASES, type EvalCase } from './evalCases';
import type { EventKind, ProviderCommitment } from './types';

export interface EvalCaseOutcome {
  caseId: string;
  category: EvalCase['category'];
  rawText: string;
  engine: 'offline_rules' | 'real_gemini' | 'ai_unavailable';
  predictedEventKind: EventKind | 'error';
  predictedDelayMinutes: number | null;
  predictedCommitment: ProviderCommitment | 'error';
  predictedDatetimeIso: string | null;
  predictedCostDeltaInr: number | null;
  intentMatched: boolean;
  delayMatched: boolean;
  noHallucinatedDate: boolean;
  neverAutoConfirmed: boolean;
  abstained: boolean;
  passedAll: boolean;
  failureReason?: string;
}

export interface EvalSuiteReport {
  engine: 'offline_rules' | 'real_gemini';
  executedAt: string;
  totalCases: number;
  passedAllCount: number;
  intentMatchCount: number;
  delayMatchCount: number;
  safetyInvariantCount: number;
  abstentionCount: number;
  errorCount: number;
  outcomes: EvalCaseOutcome[];
}

export function gradeCaseResult(
  testCase: EvalCase,
  engine: 'offline_rules' | 'real_gemini' | 'ai_unavailable',
  prediction:
    | {
        ok: true;
        eventKind: EventKind;
        reportedDelayMinutes: number | null;
        newDatetimeIso: string | null;
        costDeltaInr: number | null;
        providerCommitment: ProviderCommitment;
      }
    | { ok: false; error: string }
): EvalCaseOutcome {
  if (!prediction.ok) {
    return {
      caseId: testCase.id,
      category: testCase.category,
      rawText: testCase.rawText,
      engine,
      predictedEventKind: 'error',
      predictedDelayMinutes: null,
      predictedCommitment: 'error',
      predictedDatetimeIso: null,
      predictedCostDeltaInr: null,
      intentMatched: false,
      delayMatched: false,
      noHallucinatedDate: true,
      neverAutoConfirmed: true,
      abstained: false,
      passedAll: false,
      failureReason: prediction.error,
    };
  }

  const intentMatched = testCase.expectedEventKinds.includes(prediction.eventKind);
  const delayMatched =
    testCase.expectedDelayMinutes === null
      ? prediction.reportedDelayMinutes === null
      : prediction.reportedDelayMinutes !== null &&
        Math.abs(prediction.reportedDelayMinutes - testCase.expectedDelayMinutes) <= 5;

  const noHallucinatedDate = testCase.hasExplicitCalendarDate
    ? true
    : prediction.newDatetimeIso === null;

  const neverAutoConfirmed = testCase.mustNotAutoConfirm
    ? prediction.providerCommitment !== 'confirmed'
    : true;

  const abstained = prediction.eventKind === 'unclear';
  const passedAll = intentMatched && delayMatched && noHallucinatedDate && neverAutoConfirmed;

  const reasons: string[] = [];
  if (!intentMatched) {
    reasons.push(
      `Expected intent [${testCase.expectedEventKinds.join(' | ')}], got "${prediction.eventKind}"`
    );
  }
  if (!delayMatched) {
    reasons.push(
      `Expected delay ${testCase.expectedDelayMinutes ?? 'null'} min, got ${prediction.reportedDelayMinutes ?? 'null'} min`
    );
  }
  if (!noHallucinatedDate) {
    reasons.push(`Invented ISO timestamp "${prediction.newDatetimeIso}" without calendar date`);
  }
  if (!neverAutoConfirmed) {
    reasons.push('Auto-confirmed an unconfirmed/hedged update');
  }

  return {
    caseId: testCase.id,
    category: testCase.category,
    rawText: testCase.rawText,
    engine,
    predictedEventKind: prediction.eventKind,
    predictedDelayMinutes: prediction.reportedDelayMinutes,
    predictedCommitment: prediction.providerCommitment,
    predictedDatetimeIso: prediction.newDatetimeIso,
    predictedCostDeltaInr: prediction.costDeltaInr,
    intentMatched,
    delayMatched,
    noHallucinatedDate,
    neverAutoConfirmed,
    abstained,
    passedAll,
    ...(reasons.length > 0 ? { failureReason: reasons.join('; ') } : {}),
  };
}

export function runOfflineBaselineEvaluation(cases: EvalCase[] = EVALUATION_CASES): EvalSuiteReport {
  const outcomes: EvalCaseOutcome[] = cases.map((c) => {
    const interp = interpretVendorMessageOffline({
      id: `eval_${c.id}`,
      orgId: 'eval-org',
      ownerUid: 'eval-user',
      roomId: 'eval-room',
      vendorUpdateId: `eval_upd_${c.id}`,
      rawText: c.rawText,
      timezone: 'Asia/Kolkata',
    });

    return gradeCaseResult(c, 'offline_rules', {
      ok: true,
      eventKind: interp.eventKind,
      reportedDelayMinutes: interp.reportedDelayMinutes,
      newDatetimeIso: interp.newDatetimeIso,
      costDeltaInr: interp.costDeltaInr,
      providerCommitment: interp.providerCommitment,
    });
  });

  return summarizeEvalOutcomes('offline_rules', outcomes);
}

export function summarizeEvalOutcomes(
  engine: 'offline_rules' | 'real_gemini',
  outcomes: EvalCaseOutcome[]
): EvalSuiteReport {
  return {
    engine,
    executedAt: new Date().toISOString(),
    totalCases: outcomes.length,
    passedAllCount: outcomes.filter((o) => o.passedAll).length,
    intentMatchCount: outcomes.filter((o) => o.intentMatched).length,
    delayMatchCount: outcomes.filter((o) => o.delayMatched).length,
    safetyInvariantCount: outcomes.filter((o) => o.noHallucinatedDate && o.neverAutoConfirmed).length,
    abstentionCount: outcomes.filter((o) => o.abstained).length,
    errorCount: outcomes.filter((o) => o.predictedEventKind === 'error').length,
    outcomes,
  };
}
