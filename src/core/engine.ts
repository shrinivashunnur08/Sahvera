import type {
  AffectedTaskImpact,
  ApprovalDecision,
  EconomicsInputs,
  EconomicsOutputs,
  FollowUp,
  GeminiStructuredExtraction,
  HandoverEvidence,
  HandoverReadinessReport,
  ImpactProposal,
  Interpretation,
  OperatorRole,
  OwnerApproval,
  PhotoInspectionResult,
  PhotoInspectionVerdict,
  ProviderConfirmation,
  Room,
  SevenStageStep,
  Task,
  TaskDependency,
  VendorUpdate,
} from './types';

// ---------------------------------------------------------------------------
// 1. Dependency Graph Validation (DAG + Cross-Property Guard)
// ---------------------------------------------------------------------------

export function detectCycle(tasks: Task[], dependencies: TaskDependency[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const t of tasks) {
    adjacency.set(t.id, []);
  }
  for (const dep of dependencies) {
    const list = adjacency.get(dep.fromTaskId) ?? [];
    list.push(dep.toTaskId);
    adjacency.set(dep.fromTaskId, list);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (dfs(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const t of tasks) {
    if (dfs(t.id)) return true;
  }
  return false;
}

export function validateDependencyAdd(params: {
  tasks: Task[];
  dependencies: TaskDependency[];
  fromTaskId: string;
  toTaskId: string;
}): { ok: boolean; reason?: string } {
  const { tasks, dependencies, fromTaskId, toTaskId } = params;

  if (fromTaskId === toTaskId) {
    return { ok: false, reason: 'A task cannot depend on itself.' };
  }

  const fromTask = tasks.find((t) => t.id === fromTaskId);
  const toTask = tasks.find((t) => t.id === toTaskId);
  if (!fromTask || !toTask) {
    return { ok: false, reason: 'Both prerequisite and dependent tasks must exist.' };
  }

  if (fromTask.orgId !== toTask.orgId || fromTask.propertyId !== toTask.propertyId) {
    return {
      ok: false,
      reason: 'Cross-property and cross-organization task dependencies are forbidden.',
    };
  }

  if (fromTask.roomId !== toTask.roomId) {
    return {
      ok: false,
      reason: 'Dependencies must belong to tasks in the same room.',
    };
  }

  const duplicate = dependencies.some(
    (d) => d.fromTaskId === fromTaskId && d.toTaskId === toTaskId
  );
  if (duplicate) {
    return { ok: false, reason: 'This dependency link already exists.' };
  }

  const candidateDeps: TaskDependency[] = [
    ...dependencies,
    {
      id: 'candidate-edge',
      orgId: fromTask.orgId,
      ownerUid: fromTask.ownerUid,
      propertyId: fromTask.propertyId,
      roomId: fromTask.roomId,
      fromTaskId,
      toTaskId,
      createdAt: new Date().toISOString(),
    },
  ];

  if (detectCycle(tasks, candidateDeps)) {
    return {
      ok: false,
      reason: `Adding "${fromTask.title}" -> "${toTask.title}" creates a circular dependency cycle.`,
    };
  }

  return { ok: true };
}

export function getDownstreamTaskIds(
  sourceTaskId: string,
  dependencies: TaskDependency[]
): string[] {
  const adjacency = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = adjacency.get(dep.fromTaskId) ?? [];
    list.push(dep.toTaskId);
    adjacency.set(dep.fromTaskId, list);
  }

  const downstream: string[] = [];
  const visited = new Set<string>([sourceTaskId]);
  const queue: string[] = [...(adjacency.get(sourceTaskId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    downstream.push(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return downstream;
}

// ---------------------------------------------------------------------------
// 2. Date-Time Explicitness Guard & Offline Deterministic Rule Parser
// ---------------------------------------------------------------------------

const FULL_DATE_REGEX =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)\b/i;

export function hasExplicitCalendarDate(text: string): boolean {
  return FULL_DATE_REGEX.test(text);
}

export function detectLanguageHint(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) {
    if (/\b(उशिरा|तास|उद्या|संध्याकाळ|येणार|नाही)\b/.test(text) || /आहे|होईल/.test(text)) {
      return 'Marathi (Devanagari)';
    }
    return 'Hindi (Devanagari)';
  }
  const hinglishCues =
    /\b(bhai|ghante|ghanta|baje|kal|aaj|shaam|subah|dopahar|hoga|nahi|kar|raha|zyada|paise|rupay|band|ho gaya|ushira|tas|udya)\b/i;
  if (hinglishCues.test(text)) {
    if (/\b(ushira|tas|udya|sandhyakali)\b/i.test(text)) {
      return 'Marathi/Romanized';
    }
    return 'Hinglish';
  }
  return 'English';
}

function extractDelayMinutes(text: string): { minutes: number | null; spans: string[] } {
  const spans: string[] = [];

  const hourMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|ghante|ghanta|ghantey|tas|तास|घंटे)\b/i
  );
  if (hourMatch) {
    const val = parseFloat(hourMatch[1]);
    if (Number.isFinite(val) && val >= 0) {
      spans.push(hourMatch[0]);
      return { minutes: Math.round(val * 60), spans };
    }
  }

  const minMatch = text.match(/(\d+)\s*(?:minutes?|mins?|min|minute|मिनट)\b/i);
  if (minMatch) {
    const val = parseInt(minMatch[1], 10);
    if (Number.isFinite(val) && val >= 0) {
      spans.push(minMatch[0]);
      return { minutes: val, spans };
    }
  }

  const halfHourMatch = text.match(/\b(aadha ghanta|half an hour|30 min)\b/i);
  if (halfHourMatch) {
    spans.push(halfHourMatch[0]);
    return { minutes: 30, spans };
  }

  return { minutes: null, spans };
}

function extractPriceDeltaInr(text: string): { amount: number | null; spans: string[] } {
  const spans: string[] = [];
  const priceCues =
    /(?:extra|additional|more|zyada|jyada|cost|charge|rate|badh|rs\.?|inr|₹)\s*[:\-]?\s*₹?\s*(\d[\d,]*)/i;
  const reverseCues = /(\d[\d,]*)\s*(?:rs\.?|rupees|rupay|rupaye|inr|₹)\s*(?:extra|more|zyada|jyada|additional)/i;

  const m1 = text.match(priceCues);
  if (m1) {
    const num = parseFloat(m1[1].replace(/,/g, ''));
    if (Number.isFinite(num) && num > 0) {
      spans.push(m1[0]);
      return { amount: num, spans };
    }
  }

  const m2 = text.match(reverseCues);
  if (m2) {
    const num = parseFloat(m2[1].replace(/,/g, ''));
    if (Number.isFinite(num) && num > 0) {
      spans.push(m2[0]);
      return { amount: num, spans };
    }
  }

  return { amount: null, spans };
}

export function interpretVendorMessageOffline(params: {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  vendorUpdateId: string;
  rawText: string;
  timezone?: string;
}): Interpretation {
  const { id, orgId, ownerUid, roomId, vendorUpdateId, rawText, timezone = 'Asia/Kolkata' } = params;
  const text = rawText.trim();
  const originalLanguage = detectLanguageHint(text);
  const missingFacts: string[] = [];
  const evidenceSpans: string[] = [];

  if (!text) {
    return {
      id,
      orgId,
      ownerUid,
      roomId,
      vendorUpdateId,
      source: 'offline_rules',
      engineLabel: 'Offline rules — NOT Gemini',
      eventKind: 'unclear',
      originalLanguage,
      summary: 'Message is empty. Manual clarification required.',
      evidenceSpans: [],
      reportedDelayMinutes: null,
      newDatetimeIso: null,
      costDeltaInr: null,
      providerCommitment: 'unknown',
      missingFacts: ['Vendor statement text is missing'],
      uncertaintyReason: 'No message content provided to interpret.',
      createdAt: new Date().toISOString(),
    };
  }

  const hasCancelCue =
    /\b(cancel|cancelled|canceled|nahi aa|nhi aa|not coming|won't come|wont come|can't come|cant come|cannot come|band hai|aaj nahi|udya yeto|drop it|नहीं आ|रद्द)\b/i.test(
      text
    );
  const hasDelayCue =
    /\b(delay|delayed|late|ushira|postpone|reschedule|shift|baad mein|shaam tak|thoda time|देर|तास|उशिरा)\b/i.test(
      text
    );
  const hasCompletionCue =
    /\b(done|completed|finished|ho gaya|hogaya|complete ho|ready hai|kaam khatam|zala)\b/i.test(
      text
    );
  const hasPendingWorkCue =
    /\b(pending|baaki|baki|left|remaining|incomplete|half|adhura)\b/i.test(text);
  const hasPriceCue =
    /\b(extra|zyada|jyada|rate badh|price|cost|rs\.?|inr|₹|rupay|rupees|charge|kharcha)\b/i.test(
      text
    );
  const hasTentativeCue =
    /\b(confirm nahi|not confirmed|unconfirmed|koshish|try karunga|will try|shaayad|shayad|probably)\b/i.test(
      text
    );
  const hasSilenceCue =
    /\b(no reply|not picking|not answering|phone off|switch off|switched off|unreachable|call nahi utha|missed call|koi jawab nahi)\b/i.test(
      text
    );
  const hasEvasionCue =
    /\b(aa raha|aa rha|nikal raha|nikal rha|raste mein|raaste mein|on the way|bas \d+\s*min|dekh ke batata|dekhkar batata)\b/i.test(
      text
    );
  const hasContradictionCue =
    /\b(or cancel|ya cancel|not sure|pata nahi|dekhte hain)\b/i.test(text) ||
    (/\bmaybe\b/i.test(text) && (hasCancelCue || !hasDelayCue));

  const delay = extractDelayMinutes(text);
  const price = extractPriceDeltaInr(text);
  evidenceSpans.push(...delay.spans, ...price.spans);

  // Check for bare clock times or relative words without a calendar date
  const timeMention = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje))\b/i);
  const relativeDayMention = text.match(/\b(tomorrow|today|aaj|kal|shaam|subah|udya|parso)\b/i);
  const explicitDatePresent = hasExplicitCalendarDate(text);

  if (timeMention) {
    evidenceSpans.push(timeMention[0]);
    if (!explicitDatePresent) {
      missingFacts.push(
        `Mentioned time "${timeMention[0]}" lacks a full calendar date (YYYY-MM-DD) in ${timezone}; not converted to a timestamp.`
      );
    }
  }
  if (relativeDayMention && !explicitDatePresent) {
    evidenceSpans.push(relativeDayMention[0]);
    missingFacts.push(
      `Relative cue "${relativeDayMention[0]}" lacks an explicit calendar date and confirmed slot in ${timezone}.`
    );
  }

  const asksConfirmation = /\b(please confirm|confirm|batao|theek hai|chalega)\b/i.test(text);
  if (hasTentativeCue) {
    evidenceSpans.push(
      text.match(/\b(confirm nahi hai|confirm nahi|koshish karunga|will try|not confirmed)\b/i)?.[0] ??
        'tentative'
    );
    missingFacts.push('Vendor explicitly stated arrival is NOT confirmed ("confirm nahi" / tentative try).');
  } else if (asksConfirmation) {
    missingFacts.push('Provider requested confirmation — slot is NOT confirmed yet.');
  }

  if (hasEvasionCue) {
    const evMatch = text.match(
      /\b(aa raha|aa rha|nikal raha|nikal rha|raste mein|raaste mein|on the way|bas \d+\s*min|dekh ke batata|dekhkar batata)\b/i
    );
    if (evMatch) evidenceSpans.push(evMatch[0]);
    missingFacts.push(
      'Verbal "on the way" / evasion cue without live check-in — ask for exact IST gate arrival or photo before holding housekeeping.'
    );
  }

  let eventKind: Interpretation['eventKind'] = 'unclear';
  let summary = '';
  let uncertaintyReason = '';
  let providerCommitment: Interpretation['providerCommitment'] = 'unknown';

  // Contradiction check takes precedence over single-intent heuristics
  if (
    (hasCancelCue && (hasDelayCue || hasCompletionCue)) ||
    (hasCompletionCue && hasPendingWorkCue) ||
    hasContradictionCue
  ) {
    eventKind = 'unclear';
    providerCommitment = 'unknown';
    missingFacts.push('Conflicting or uncertain availability/completion cues require direct vendor call.');
    summary = 'Unclear or contradictory vendor update — manual clarification required.';
    uncertaintyReason =
      'Message contains conflicting signals (e.g., delay vs. cancel, or claimed done with pending work).';
  } else if (hasSilenceCue && !hasCancelCue && !hasDelayCue && !hasCompletionCue && !(hasPriceCue && price.amount !== null)) {
    eventKind = 'unclear';
    providerCommitment = 'unknown';
    const silMatch = text.match(
      /\b(no reply|not picking|not answering|phone off|switch off|switched off|unreachable|call nahi utha|missed call|koi jawab nahi)\b/i
    );
    if (silMatch) evidenceSpans.push(silMatch[0]);
    missingFacts.push('Vendor unreachable / silent — confirm backup technician or escalate before holding cleaning.');
    summary = 'Vendor not picking up / silent — manual callback or backup vendor check required.';
    uncertaintyReason =
      'No vendor response received; downstream housekeeping & handover remain unconfirmed.';
  } else if (hasCancelCue) {
    eventKind = 'cancellation';
    providerCommitment = 'unknown';
    missingFacts.push('Replacement vendor or rescheduled full date/time needed.');
    summary = 'Vendor indicated cancellation / inability to attend. Never auto-confirmed.';
    uncertaintyReason =
      'Cancellation risk requires operator confirmation and alternative task assignment.';
  } else if (hasPriceCue && price.amount !== null) {
    eventKind = 'price_change';
    providerCommitment = 'unknown';
    missingFacts.push('Scope justification and explicit owner price approval required.');
    summary = `Vendor mentioned an extra cost of INR ${price.amount}. Requires owner approval.`;
    uncertaintyReason =
      'Reported price delta is never auto-approved without owner sign-off.';
  } else if (hasDelayCue || delay.minutes !== null || hasEvasionCue) {
    eventKind = 'delay';
    providerCommitment =
      hasTentativeCue || asksConfirmation || hasEvasionCue || originalLanguage === 'Hinglish' || !explicitDatePresent
        ? 'tentative'
        : 'unknown';
    if (delay.minutes !== null && !timeMention && !explicitDatePresent) {
      missingFacts.push('Exact revised arrival date and time are not confirmed.');
    }
    summary =
      delay.minutes !== null
        ? `Offline rules detected a ${delay.minutes}-minute (${(delay.minutes / 60).toFixed(1).replace(/\.0$/, '')}h) delay (${providerCommitment}).`
        : hasEvasionCue
        ? 'Vendor gave verbal "on the way" / evasion cue without verified arrival — treated as tentative delay.'
        : 'Vendor indicated a delay without an explicit duration.';
    uncertaintyReason =
      missingFacts.length > 0
        ? missingFacts.join(' ')
        : 'Delay reported by vendor; dependent tasks need schedule review.';
  } else if (hasCompletionCue && !hasDelayCue && !hasCancelCue) {
    eventKind = 'completion_claim';
    providerCommitment = 'tentative';
    missingFacts.push('Physical inspection / evidence required before marking room ready.');
    summary =
      'Vendor claimed task completion. Treated as self-reported claim, not physical proof.';
    uncertaintyReason =
      'A vendor text claim alone never proves the physical room is ready.';
  } else {
    eventKind = 'unclear';
    providerCommitment = 'unknown';
    missingFacts.push('Intent, delay minutes, and confirmed date/time could not be extracted.');
    summary = 'Unclear vendor message — manual clarification required before updating tasks.';
    uncertaintyReason =
      'Offline rule baseline found no unambiguous delay, price, or cancellation structure.';
  }

  return {
    id,
    orgId,
    ownerUid,
    roomId,
    vendorUpdateId,
    source: 'offline_rules',
    engineLabel: 'Offline rules — NOT Gemini',
    eventKind,
    originalLanguage,
    summary,
    evidenceSpans: Array.from(new Set(evidenceSpans)).slice(0, 6),
    reportedDelayMinutes: delay.minutes,
    newDatetimeIso: null, // Offline rules never invent or silently infer ISO timestamps
    costDeltaInr: price.amount,
    providerCommitment,
    missingFacts,
    uncertaintyReason,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 3. Semantic Validation of Real Gemini Structured Output
// ---------------------------------------------------------------------------

const VALID_EVENT_KINDS = new Set([
  'delay',
  'cancellation',
  'price_change',
  'completion_claim',
  'unclear',
]);
const VALID_COMMITMENTS = new Set(['confirmed', 'tentative', 'unknown']);

export function validateGeminiExtraction(
  raw: unknown,
  originalText: string
): { valid: true; data: GeminiStructuredExtraction } | { valid: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'Gemini output is not a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.event_kind !== 'string' || !VALID_EVENT_KINDS.has(obj.event_kind)) {
    return { valid: false, reason: 'Invalid event_kind in Gemini output.' };
  }
  if (
    typeof obj.provider_commitment !== 'string' ||
    !VALID_COMMITMENTS.has(obj.provider_commitment)
  ) {
    return { valid: false, reason: 'Invalid provider_commitment in Gemini output.' };
  }
  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
    return { valid: false, reason: 'Missing summary in Gemini output.' };
  }

  let reportedDelayMinutes: number | null = null;
  if (obj.reported_delay_minutes !== null && obj.reported_delay_minutes !== undefined) {
    if (
      typeof obj.reported_delay_minutes !== 'number' ||
      !Number.isInteger(obj.reported_delay_minutes) ||
      obj.reported_delay_minutes < 0 ||
      obj.reported_delay_minutes > 43200
    ) {
      return {
        valid: false,
        reason: 'reported_delay_minutes must be null or a non-negative integer <= 43200.',
      };
    }
    reportedDelayMinutes = obj.reported_delay_minutes;
  }

  let costDeltaInr: number | null = null;
  if (obj.cost_delta_inr !== null && obj.cost_delta_inr !== undefined) {
    if (typeof obj.cost_delta_inr !== 'number' || !Number.isFinite(obj.cost_delta_inr)) {
      return { valid: false, reason: 'cost_delta_inr must be null or a finite number.' };
    }
    costDeltaInr = obj.cost_delta_inr;
  }

  const missingFacts = Array.isArray(obj.missing_facts)
    ? obj.missing_facts.filter((x): x is string => typeof x === 'string').slice(0, 8)
    : [];

  let newDatetimeIso: string | null = null;
  if (typeof obj.new_datetime_iso === 'string' && obj.new_datetime_iso.trim().length > 0) {
    const candidate = obj.new_datetime_iso.trim();
    const parsed = Date.parse(candidate);
    const explicitDate = hasExplicitCalendarDate(originalText);
    if (!explicitDate) {
      // Security invariant: never let LLM silently invent a calendar date from "11 AM" or "tomorrow"
      newDatetimeIso = null;
      missingFacts.push(
        'Model-suggested datetime was stripped because the original message lacked an explicit calendar date.'
      );
    } else if (Number.isNaN(parsed) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(candidate)) {
      newDatetimeIso = null;
      missingFacts.push('Invalid ISO datetime format returned by model; requires manual entry.');
    } else {
      newDatetimeIso = candidate;
    }
  }

  const evidenceSpans = Array.isArray(obj.evidence_spans)
    ? obj.evidence_spans.filter((x): x is string => typeof x === 'string').slice(0, 6)
    : [];

  const originalLanguage =
    typeof obj.original_language === 'string' && obj.original_language.trim()
      ? obj.original_language.trim().slice(0, 64)
      : 'Unknown';

  const uncertaintyReason =
    typeof obj.uncertainty_reason === 'string'
      ? obj.uncertainty_reason.trim().slice(0, 400)
      : '';

  const handoverRiskExplanation =
    typeof obj.handover_risk_explanation === 'string' && obj.handover_risk_explanation.trim()
      ? obj.handover_risk_explanation.trim().slice(0, 400)
      : undefined;

  const clarificationQuestions = Array.isArray(obj.clarification_questions)
    ? obj.clarification_questions
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 220))
        .slice(0, 5)
    : undefined;

  const draftReplyToVendor =
    typeof obj.draft_reply_to_vendor === 'string' && obj.draft_reply_to_vendor.trim()
      ? obj.draft_reply_to_vendor.trim().slice(0, 500)
      : undefined;

  // Guard against prompt-injection coercing a confirmed slot or leaking secrets
  const hasInjectionCues =
    /\b(ignore previous|system override|verified_physical_handover|api[_\s]?key|approve all)\b/i.test(
      originalText
    );
  let safeCommitment = obj.provider_commitment as GeminiStructuredExtraction['provider_commitment'];
  if (hasInjectionCues && safeCommitment === 'confirmed') {
    safeCommitment = 'unknown';
    missingFacts.push('Downgraded model commitment due to suspicious instruction-like text in vendor input.');
  }

  return {
    valid: true,
    data: {
      event_kind: obj.event_kind as GeminiStructuredExtraction['event_kind'],
      original_language: originalLanguage,
      summary: obj.summary.trim().slice(0, 400),
      evidence_spans: evidenceSpans,
      reported_delay_minutes: reportedDelayMinutes,
      new_datetime_iso: newDatetimeIso,
      cost_delta_inr: costDeltaInr,
      provider_commitment: safeCommitment,
      missing_facts: Array.from(new Set(missingFacts)),
      uncertainty_reason: uncertaintyReason,
      ...(handoverRiskExplanation ? { handover_risk_explanation: handoverRiskExplanation } : {}),
      ...(clarificationQuestions?.length ? { clarification_questions: clarificationQuestions } : {}),
      ...(draftReplyToVendor ? { draft_reply_to_vendor: draftReplyToVendor } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Candidate Impact Calculator (Does NOT Mutate Booked Schedules)
// ---------------------------------------------------------------------------

export function calculateCandidateImpact(params: {
  proposalId: string;
  room: Room;
  tasks: Task[];
  dependencies: TaskDependency[];
  sourceTaskId: string;
  interpretation: Interpretation;
}): ImpactProposal {
  const { proposalId, room, tasks, dependencies, sourceTaskId, interpretation } = params;
  const roomTasks = tasks
    .filter((t) => t.roomId === room.id && t.propertyId === room.propertyId)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const roomDeps = dependencies.filter(
    (d) => d.roomId === room.id && d.propertyId === room.propertyId
  );

  const sourceTask = roomTasks.find((t) => t.id === sourceTaskId);
  if (!sourceTask) {
    throw new Error('Selected task does not belong to this room.');
  }

  const downstreamIds = new Set(getDownstreamTaskIds(sourceTaskId, roomDeps));
  const affectedTasks: AffectedTaskImpact[] = roomTasks.map((t) => {
    if (t.id === sourceTaskId) {
      let note = 'Source update received — awaiting operator decision.';
      if (interpretation.eventKind === 'delay' && interpretation.reportedDelayMinutes !== null) {
        note = `Tentative +${interpretation.reportedDelayMinutes} min shift. Booked slot remains unchanged until confirmed.`;
      } else if (interpretation.eventKind === 'cancellation') {
        note = 'Vendor indicated cancellation — requires replacement or new slot.';
      } else if (interpretation.eventKind === 'price_change') {
        note = `Reported cost delta INR ${interpretation.costDeltaInr ?? 'unspecified'} — requires owner approval.`;
      } else if (interpretation.eventKind === 'completion_claim') {
        note = 'Completion claimed by vendor — requires physical verification.';
      }
      return {
        taskId: t.id,
        taskTitle: t.title,
        impactKind: 'source_task',
        candidateNote: note,
        requiresProviderConfirmation: interpretation.providerCommitment !== 'confirmed',
      };
    }

    if (downstreamIds.has(t.id)) {
      const candidateNote =
        interpretation.eventKind === 'completion_claim'
          ? 'Downstream prerequisite claimed complete; verify before starting.'
          : 'Flagged at risk due to upstream dependency; do not re-book until upstream and dependent vendors confirm.';
      return {
        taskId: t.id,
        taskTitle: t.title,
        impactKind: 'downstream_at_risk',
        candidateNote,
        requiresProviderConfirmation: true,
      };
    }

    return {
      taskId: t.id,
      taskTitle: t.title,
      impactKind: 'independent_unchanged',
      candidateNote: 'Independent branch — not affected by this dependency chain.',
      requiresProviderConfirmation: false,
    };
  });

  const downstreamCount = affectedTasks.filter(
    (a) => a.impactKind === 'downstream_at_risk'
  ).length;

  const targetHandoverAtRisk =
    interpretation.eventKind === 'delay' ||
    interpretation.eventKind === 'cancellation' ||
    interpretation.eventKind === 'unclear';

  const unresolvedAssumptions: string[] = [...interpretation.missingFacts];
  if (downstreamCount > 0 && interpretation.eventKind !== 'completion_claim') {
    unresolvedAssumptions.push(
      `${downstreamCount} downstream task(s) depend on "${sourceTask.title}" and have no confirmed replacement slot yet.`
    );
  }
  if (!interpretation.newDatetimeIso) {
    unresolvedAssumptions.push(
      'No verified calendar date + time (ISO timestamp) confirmed; existing scheduled times remain unaltered.'
    );
  }

  const deterministicQuestions: string[] = [];
  if (!interpretation.newDatetimeIso) {
    deterministicQuestions.push(
      `What exact calendar date and arrival time (IST) are you confirming for "${sourceTask.title}"?`
    );
  }
  if (interpretation.eventKind === 'price_change') {
    deterministicQuestions.push(
      'Please share itemised breakdown for the extra charge before we approve work.'
    );
  }
  if (interpretation.eventKind === 'cancellation') {
    deterministicQuestions.push(
      'Are you unavailable for the whole day or can a backup technician cover this slot?'
    );
  }
  if (downstreamCount > 0) {
    const downstreamNames = affectedTasks
      .filter((a) => a.impactKind === 'downstream_at_risk')
      .map((a) => a.taskTitle)
      .join(', ');
    deterministicQuestions.push(
      `Should we hold or shift downstream team(s) (${downstreamNames}) pending your confirmed ETA?`
    );
  }

  const clarificationQuestions = Array.from(
    new Set([...(interpretation.suggestedClarifications ?? []), ...deterministicQuestions])
  ).slice(0, 6);

  const vendorLabel =
    sourceTask.assignedVendor && sourceTask.assignmentState === 'assigned'
      ? sourceTask.assignedVendor
      : 'Vendor';
  const suggestedFollowUpDraft =
    interpretation.suggestedDraftReply ||
    `Hi ${vendorLabel}, regarding ${room.identifier} (${sourceTask.title}): we noted your update (${interpretation.summary}). ` +
      `Before we update our room handover schedule (target ${room.targetReadyIso}), please confirm exact date & arrival time in IST.`;

  const downstreamTitles = affectedTasks
    .filter((a) => a.impactKind === 'downstream_at_risk')
    .map((a) => a.taskTitle);
  const independentTitles = affectedTasks
    .filter((a) => a.impactKind === 'independent_unchanged')
    .map((a) => a.taskTitle);

  const deterministicRiskExplanation =
    downstreamTitles.length > 0
      ? `Because ${downstreamTitles.join(' and ')} depend on "${sourceTask.title}", an unconfirmed ${
          interpretation.eventKind.replace('_', ' ')
        } puts ${room.identifier}'s target handover (${room.targetReadyIso}) at risk.${
          independentTitles.length > 0
            ? ` Independent task(s) (${independentTitles.join(', ')}) do not wait on this step and stay unchanged.`
            : ''
        }`
      : `"${sourceTask.title}" has no downstream dependent tasks, but its own unconfirmed status prevents verified physical handover.`;

  const handoverRiskExplanation = interpretation.handoverRiskExplanation
    ? `${interpretation.handoverRiskExplanation} (${deterministicRiskExplanation})`
    : deterministicRiskExplanation;

  const now = new Date().toISOString();
  return {
    id: proposalId,
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    propertyId: room.propertyId,
    roomId: room.id,
    interpretationId: interpretation.id,
    sourceTaskId,
    affectedTaskCount: downstreamCount + 1,
    affectedTasks: affectedTasks.slice(0, 50),
    unresolvedAssumptions: Array.from(new Set(unresolvedAssumptions)).slice(0, 12),
    clarificationQuestions,
    suggestedFollowUpDraft: suggestedFollowUpDraft.slice(0, 995),
    targetHandoverAtRisk,
    status: 'pending_review',
    summary: `${sourceTask.title}: ${downstreamCount} downstream task(s) flagged at risk; independent tasks unchanged.`.slice(0, 495),
    handoverRiskExplanation: handoverRiskExplanation.slice(0, 595),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// 5. Explicit Human Approval & Idempotency Engine
// ---------------------------------------------------------------------------

export function applyOperatorDecision(params: {
  approvalId: string;
  idempotencyKey: string;
  existingApprovals: OwnerApproval[];
  proposal: ImpactProposal;
  interpretation: Interpretation;
  decision: ApprovalDecision;
  rationale: string;
  approvedByUid: string;
  room: Room;
  tasks: Task[];
}):
  | {
      ok: false;
      duplicate?: boolean;
      reason: string;
    }
  | {
      ok: true;
      approval: OwnerApproval;
      updatedProposal: ImpactProposal;
      updatedRoom: Room;
      updatedTasks: Task[];
    } {
  const {
    approvalId,
    idempotencyKey,
    existingApprovals,
    proposal,
    interpretation,
    decision,
    rationale,
    approvedByUid,
    room,
    tasks,
  } = params;

  if (!idempotencyKey || idempotencyKey.trim().length < 6) {
    return { ok: false, reason: 'Valid idempotency key is required.' };
  }

  if (existingApprovals.some((a) => a.idempotencyKey === idempotencyKey)) {
    return {
      ok: false,
      duplicate: true,
      reason: 'Duplicate approval submission blocked by idempotency check.',
    };
  }

  if (proposal.status !== 'pending_review') {
    return {
      ok: false,
      reason: `Proposal is already "${proposal.status}" and cannot be re-approved.`,
    };
  }

  if (proposal.roomId !== room.id || proposal.orgId !== room.orgId) {
    return { ok: false, reason: 'Cross-room or cross-organization approval rejected.' };
  }

  if (!rationale || rationale.trim().length < 2) {
    return { ok: false, reason: 'Please enter a short operator rationale.' };
  }

  // Invariant: cancellation or price change cannot become a confirmed schedule approval blindly
  if (
    decision === 'approve_risk_flag' &&
    (interpretation.eventKind === 'cancellation' || interpretation.eventKind === 'price_change')
  ) {
    // Allowed only as risk/clarification acknowledgment, never mutating booked slot
  }

  const now = new Date().toISOString();
  const prevRoomStage = room.readinessStage;
  const affectedIdSet = new Set(
    proposal.affectedTasks
      .filter((a) => a.impactKind === 'source_task' || a.impactKind === 'downstream_at_risk')
      .map((a) => a.taskId)
  );

  let nextRoomStage: Room['readinessStage'] = room.readinessStage;
  if (decision === 'approve_risk_flag' || decision === 'record_blocker') {
    nextRoomStage = room.readinessStage === 'verified_physical_handover' ? room.readinessStage : 'at_risk';
  }

  const updatedTasks = tasks.map((t) => {
    if (t.roomId !== room.id) return t;
    if (!affectedIdSet.has(t.id)) return t;
    if (decision === 'reject_proposal') return t;

    const impactEntry = proposal.affectedTasks.find((a) => a.taskId === t.id);
    if (decision === 'record_blocker' && t.id === proposal.sourceTaskId) {
      return {
        ...t,
        status: 'blocked' as const,
        proposedWindowNote: (impactEntry?.candidateNote ?? t.proposedWindowNote)?.slice(0, 275),
        updatedAt: now,
      };
    }

    if (decision === 'approve_risk_flag' || decision === 'request_clarification') {
      return {
        ...t,
        status: t.status === 'completed' ? ('completed' as const) : ('at_risk' as const),
        proposedWindowNote: (impactEntry?.candidateNote ?? t.proposedWindowNote)?.slice(0, 275),
        updatedAt: now,
      };
    }
    return t;
  });

  const nextProposalStatus: ImpactProposal['status'] =
    decision === 'reject_proposal' ? 'rejected' : 'approved';

  const approval: OwnerApproval = {
    id: approvalId,
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    proposalId: proposal.id,
    idempotencyKey,
    decision,
    rationale: rationale.trim().slice(0, 495),
    previousValues: {
      roomReadinessStage: prevRoomStage,
      proposalStatus: proposal.status,
    },
    newValues: {
      roomReadinessStage: nextRoomStage,
      proposalStatus: nextProposalStatus,
    },
    approvedByUid,
    createdAt: now,
  };

  return {
    ok: true,
    approval,
    updatedProposal: {
      ...proposal,
      status: nextProposalStatus,
      updatedAt: now,
    },
    updatedRoom: {
      ...room,
      readinessStage: nextRoomStage,
      updatedAt: now,
    },
    updatedTasks,
  };
}

// ---------------------------------------------------------------------------
// 6. Handover Readiness Gate (Owner Review vs Verified Physical Handover)
// ---------------------------------------------------------------------------

export function evaluateHandoverReadiness(params: {
  tasks: Task[];
  confirmations: ProviderConfirmation[];
  followUps: FollowUp[];
  evidence?: HandoverEvidence;
}): HandoverReadinessReport {
  const { tasks, confirmations, followUps, evidence } = params;

  const confirmedTaskIds = new Set(confirmations.map((c) => c.taskId));
  const allTasksHaveConfirmations =
    tasks.length > 0 && tasks.every((t) => t.providerConfirmed || confirmedTaskIds.has(t.id));

  const openBlockers = tasks.filter((t) => t.status === 'blocked');
  const openUnverifiedFollowUps = followUps.filter(
    (f) => f.status === 'open' && f.verificationState === 'unverified'
  );
  const noOutstandingBlockers = openBlockers.length === 0 && openUnverifiedFollowUps.length === 0;

  const allTasksCompleted = tasks.length > 0 && tasks.every((t) => t.status === 'completed');
  const safetyAck = Boolean(evidence?.safetyInspectionAck);
  const ownerAttestation = Boolean(evidence?.ownerAttestation);

  const checks = [
    {
      id: 'provider_confirmations',
      label: 'Independent job & provider confirmations',
      passed: allTasksHaveConfirmations,
      detail: allTasksHaveConfirmations
        ? 'All tasks have explicit provider slot confirmation.'
        : 'Missing provider slot confirmations on one or more tasks.',
    },
    {
      id: 'tasks_completed',
      label: 'Preparation work marked complete',
      passed: allTasksCompleted,
      detail: allTasksCompleted
        ? 'All preparation tasks are marked completed.'
        : 'One or more tasks are still pending, at risk, or blocked.',
    },
    {
      id: 'no_blockers',
      label: 'Zero open blockers or unverified follow-ups',
      passed: noOutstandingBlockers,
      detail: noOutstandingBlockers
        ? 'No open blockers or unverified follow-ups remain.'
        : `${openBlockers.length} blocked task(s), ${openUnverifiedFollowUps.length} unverified follow-up(s).`,
    },
    {
      id: 'safety_ack',
      label: 'Safety & electrical inspection acknowledgement',
      passed: safetyAck,
      detail: safetyAck
        ? 'Safety and electrical check acknowledged.'
        : 'Safety & inspection acknowledgement required.',
    },
    {
      id: 'owner_attestation',
      label: 'Owner physical handover attestation',
      passed: ownerAttestation,
      detail: ownerAttestation
        ? 'Owner signed handover attestation.'
        : 'Owner attestation not yet signed.',
    },
    {
      id: 'guest_ack',
      label: 'Guest / incoming resident acknowledgement (optional, never assumed)',
      passed: evidence?.guestAckState === 'acknowledged',
      detail:
        evidence?.guestAckState === 'acknowledged'
          ? 'Incoming guest acknowledged room condition.'
          : `Current state: ${evidence?.guestAckState ?? 'not_requested'} (not assumed).`,
    },
  ];

  const blockingReasons = checks
    .filter((c) => c.id !== 'guest_ack' && !c.passed)
    .map((c) => c.detail);

  const canMarkVerifiedHandover = blockingReasons.length === 0;

  let stage: HandoverReadinessReport['stage'] = 'not_ready';
  if (canMarkVerifiedHandover) {
    stage = 'verified_physical_handover';
  } else if (allTasksCompleted && noOutstandingBlockers) {
    stage = 'ready_for_owner_review';
  }

  return {
    stage,
    canMarkVerifiedHandover,
    checks,
    blockingReasons,
  };
}

// ---------------------------------------------------------------------------
// 7. Seven-Stage Progress Trail
// ---------------------------------------------------------------------------

export function computeSevenStageProgress(params: {
  latestUpdate?: VendorUpdate;
  latestInterpretation?: Interpretation;
  latestProposal?: ImpactProposal;
  latestApproval?: OwnerApproval;
  followUps: FollowUp[];
  handoverReport: HandoverReadinessReport;
  aiFailedDiagnostic?: string | null;
}): SevenStageStep[] {
  const {
    latestUpdate,
    latestInterpretation,
    latestProposal,
    latestApproval,
    followUps,
    handoverReport,
    aiFailedDiagnostic,
  } = params;

  const hasUpdate = Boolean(latestUpdate);
  const hasInterp = Boolean(latestInterpretation);
  const hasProposal = Boolean(latestProposal);
  const hasClarificationOrFollowUp =
    Boolean(latestProposal && latestProposal.clarificationQuestions.length > 0) ||
    followUps.length > 0;
  const hasApproval = Boolean(latestApproval);
  const outcomeRecorded =
    handoverReport.stage === 'verified_physical_handover' || Boolean(latestApproval);

  return [
    {
      key: 'received',
      label: '1. Received',
      state: hasUpdate ? 'completed' : 'current',
      detail: hasUpdate ? 'Vendor message captured.' : 'Paste message or voice transcript.',
    },
    {
      key: 'interpreted',
      label: '2. Interpreted',
      state: aiFailedDiagnostic && !hasInterp
        ? 'failed'
        : hasInterp
        ? 'completed'
        : hasUpdate
        ? 'current'
        : 'pending',
      detail: aiFailedDiagnostic
        ? `Fallback active (${aiFailedDiagnostic})`
        : hasInterp
        ? `${latestInterpretation!.engineLabel}: ${latestInterpretation!.eventKind}`
        : 'Awaiting extraction',
    },
    {
      key: 'affected_tasks',
      label: '3. Affected tasks',
      state: hasProposal ? 'completed' : hasInterp ? 'current' : 'pending',
      detail: hasProposal
        ? `${latestProposal!.affectedTaskCount} task(s) evaluated`
        : 'DAG risk check',
    },
    {
      key: 'clarifications',
      label: '4. Clarifications',
      state:
        hasProposal && latestProposal!.clarificationQuestions.length > 0
          ? 'completed'
          : hasProposal
          ? 'current'
          : 'pending',
      detail: hasClarificationOrFollowUp
        ? `${latestProposal?.clarificationQuestions.length ?? 0} question(s), ${followUps.length} saved follow-up(s)`
        : 'Identify missing date/confirmations',
    },
    {
      key: 'proposed_plan',
      label: '5. Proposed plan',
      state: hasProposal ? 'completed' : 'pending',
      detail: hasProposal
        ? latestProposal!.status === 'pending_review'
          ? 'Pending human approval'
          : `Proposal ${latestProposal!.status}`
        : 'No active proposal',
    },
    {
      key: 'human_approvals',
      label: '6. Human approvals',
      state: hasApproval
        ? 'completed'
        : hasProposal
        ? 'current'
        : 'pending',
      detail: hasApproval
        ? `Decision: ${latestApproval!.decision}`
        : 'Explicit operator decision required',
    },
    {
      key: 'recorded_outcome',
      label: '7. Recorded outcome',
      state:
        handoverReport.stage === 'verified_physical_handover'
          ? 'completed'
          : outcomeRecorded
          ? 'current'
          : 'pending',
      detail:
        handoverReport.stage === 'verified_physical_handover'
          ? 'Verified physical handover recorded'
          : hasApproval
          ? 'Decision logged; handover checks tracked'
          : 'Awaiting sign-off',
    },
  ];
}

// ---------------------------------------------------------------------------
// 8. Operator Economics Hypothesis Calculator (No Fake Traction)
// ---------------------------------------------------------------------------

export function calculateOperatorEconomics(inputs: EconomicsInputs): EconomicsOutputs {
  const dailyRent = Math.max(0, inputs.monthlyRentInr) / 30;
  const potentialRentExposureInr = Math.round(
    dailyRent * Math.max(0, inputs.turnoverEventsPerMonth) * Math.max(0, inputs.unreadyDaysPerTurnover)
  );

  // If no baseline exists, verified admin time & deposit dispute savings MUST remain 0
  const adminTimeValueInr = inputs.hasMeasuredBaseline
    ? Math.round(
        Math.max(0, inputs.avoidableCoordinationHours) * Math.max(0, inputs.hourlyAdminValueInr)
      )
    : 0;

  const depositDisputeAvoidedInr = inputs.hasMeasuredBaseline
    ? Math.round(Math.max(0, inputs.monthlyDepositDisputeExposureInr ?? 0))
    : 0;

  const estimatedTotalValueInr =
    potentialRentExposureInr + adminTimeValueInr + depositDisputeAvoidedInr;
  const operatorNetHypothesisInr = Math.round(
    estimatedTotalValueInr - Math.max(0, inputs.proposedMonthlyFeeInr)
  );

  const supportCost =
    (Math.max(0, inputs.marginalSupportMinutes) / 60) * Math.max(0, inputs.supportHourlyCostInr);
  const variableVendorCostInr = Math.round(Math.max(0, inputs.marginalAiCloudCostInr) + supportCost);
  const vendorGrossMarginHypothesisInr = Math.round(
    Math.max(0, inputs.proposedMonthlyFeeInr) - variableVendorCostInr
  );

  return {
    potentialRentExposureInr,
    adminTimeValueInr,
    depositDisputeAvoidedInr,
    estimatedTotalValueInr,
    operatorNetHypothesisInr,
    variableVendorCostInr,
    vendorGrossMarginHypothesisInr,
  };
}

// ---------------------------------------------------------------------------
// 9. Multimodal Room Photo Proof Validation & WhatsApp Move-In Proof Card
// ---------------------------------------------------------------------------

const VALID_PHOTO_VERDICTS = new Set<PhotoInspectionVerdict>([
  'pass',
  'issues_found',
  'unclear',
]);

export function validateGeminiPhotoInspection(
  raw: unknown
): { valid: true; data: PhotoInspectionResult } | { valid: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'Photo inspection output is not a JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.verdict !== 'string' ||
    !VALID_PHOTO_VERDICTS.has(obj.verdict as PhotoInspectionVerdict)
  ) {
    return { valid: false, reason: 'Invalid photo inspection verdict returned by model.' };
  }
  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
    return { valid: false, reason: 'Missing summary in photo inspection output.' };
  }

  const sanitizeList = (val: unknown, maxItems: number): string[] =>
    Array.isArray(val)
      ? val
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim().slice(0, 160))
          .slice(0, maxItems)
      : [];

  return {
    valid: true,
    data: {
      verdict: obj.verdict as PhotoInspectionVerdict,
      summary: obj.summary.trim().slice(0, 240),
      detectedIssues: sanitizeList(obj.detected_issues ?? obj.detectedIssues, 8),
      observedReadyItems: sanitizeList(obj.observed_ready_items ?? obj.observedReadyItems, 8),
      safetyFlags: sanitizeList(obj.safety_flags ?? obj.safetyFlags, 6),
    },
  };
}

export function buildMoveInProofCardText(params: {
  propertyName?: string;
  propertyLocality?: string;
  room: Room;
  tasks: Task[];
  handoverReport: HandoverReadinessReport;
  evidence?: HandoverEvidence;
  photoInspection?: PhotoInspectionResult | null;
}): string {
  const {
    propertyName,
    propertyLocality,
    room,
    tasks,
    handoverReport,
    evidence,
    photoInspection,
  } = params;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const statusLabel =
    handoverReport.stage === 'verified_physical_handover'
      ? 'VERIFIED READY FOR MOVE-IN'
      : handoverReport.stage === 'ready_for_owner_review'
      ? 'PENDING FINAL OWNER SIGN-OFF'
      : 'PREPARATION IN PROGRESS (NOT YET VERIFIED)';

  const locationPart = propertyName
    ? propertyLocality
      ? `${propertyName} (${propertyLocality})`
      : propertyName
    : 'PG Property';

  const stageHeading =
    evidence?.conditionStage === 'move_out'
      ? `*Sahvera Move-Out Condition & Deposit Audit — ${room.identifier}*`
      : `*Sahvera Move-In Proof Card — ${room.identifier}*`;

  const lines = [
    stageHeading,
    `Property: ${locationPart} | Type: ${room.roomType}`,
    `Condition Stage: ${
      evidence?.conditionStage === 'move_out'
        ? 'Move-Out Inspection (Deposit Dispute Baseline Comparison)'
        : 'Move-In Baseline (Pre-Arrival Condition Proof)'
    }`,
    `Status: ${statusLabel}`,
    `Checklist: ${completedCount}/${tasks.length} prep task(s) completed`,
    `Safety & electrical check: ${evidence?.safetyInspectionAck ? 'Acknowledged' : 'Pending'}`,
    `Owner physical attestation: ${evidence?.ownerAttestation ? 'Signed' : 'Pending'}`,
  ];

  const photoVerdict = photoInspection?.verdict ?? evidence?.photoInspectionVerdict;
  const photoSummary = photoInspection?.summary ?? evidence?.photoInspectionSummary;
  const photoCount = evidence?.photoCount ?? (photoInspection ? 1 : 0);

  if (photoVerdict || photoCount > 0) {
    const verdictLabel =
      photoVerdict === 'pass'
        ? 'AI Photo Check: Pass'
        : photoVerdict === 'issues_found'
        ? 'AI Photo Check: Issues Flagged'
        : photoVerdict === 'unclear'
        ? 'AI Photo Check: Unclear Photo'
        : 'Room Photos Attached';
    lines.push(
      `Visual Proof (${Math.max(1, photoCount)} photo): ${verdictLabel}${
        photoSummary ? ` — ${photoSummary}` : ''
      }`
    );
  }

  if (evidence?.baselineComparisonNote?.trim()) {
    lines.push(`Move-In vs Move-Out Audit: ${evidence.baselineComparisonNote.trim()}`);
  }

  if (evidence?.evidenceNote?.trim()) {
    lines.push(`Warden Note: ${evidence.evidenceNote.trim()}`);
  }

  lines.push(`Guest Condition Ack: ${evidence?.guestAckState ?? 'not_requested'}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 10. WhatsApp Share Helpers, PWA Share Target Intake & Role Guardrails
// ---------------------------------------------------------------------------

export function buildWhatsAppMessageUrl(message: string, phoneDigits?: string): string {
  const cleanMsg = message.trim().slice(0, 1500);
  const digits = (phoneDigits ?? '').replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(cleanMsg);
  return digits.length >= 10
    ? `https://wa.me/${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function extractShareTargetText(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const parts = [
    params.get('share_text'),
    params.get('text'),
    params.get('share_title'),
    params.get('title'),
    params.get('share_url'),
  ]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(' — ').slice(0, 1990);
}

export type OperationalAction =
  | 'intake_update'
  | 'update_task_status'
  | 'attach_photo_proof'
  | 'save_followup'
  | 'record_owner_approval'
  | 'sign_verified_handover'
  | 'manage_property_or_purge';

export function canRolePerformAction(
  role: OperatorRole,
  action: OperationalAction
): { allowed: boolean; reason?: string } {
  if (role === 'owner') {
    return { allowed: true };
  }
  if (role === 'viewer') {
    return {
      allowed: false,
      reason: 'Viewer role is read-only. Ask the Property Owner or Warden to log updates.',
    };
  }
  // role === 'manager' (Warden / Caretaker)
  if (
    action === 'record_owner_approval' ||
    action === 'sign_verified_handover' ||
    action === 'manage_property_or_purge'
  ) {
    return {
      allowed: false,
      reason:
        'Owner (Maalik) authority required for financial/schedule sign-off, verified handover attestation, or property deletion.',
    };
  }
  return { allowed: true };
}

