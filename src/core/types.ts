export type AppMode = 'demo' | 'real';

export type RoomType = 'Single' | 'Double' | 'Triple' | 'Studio';

export type ReadinessStage =
  | 'in_progress'
  | 'at_risk'
  | 'ready_for_owner_review'
  | 'verified_physical_handover';

export type TaskCategory =
  | 'painting'
  | 'electrical'
  | 'plumbing'
  | 'cleaning'
  | 'inspection'
  | 'wifi'
  | 'other';

export type TaskStatus = 'pending' | 'scheduled' | 'at_risk' | 'blocked' | 'completed';

export type EventKind =
  | 'delay'
  | 'cancellation'
  | 'price_change'
  | 'completion_claim'
  | 'unclear';

export type ProviderCommitment = 'confirmed' | 'tentative' | 'unknown';

export type InterpretationSource = 'offline_rules' | 'real_gemini' | 'manual_interpretation';

export type ProvenanceType =
  | 'synthetic'
  | 'manually_copied'
  | 'self_reported'
  | 'ai_interpreted'
  | 'operator_verified';

export type DiagnosticCategory =
  | 'none'
  | 'invalid_request'
  | 'missing_or_invalid_key'
  | 'model_access'
  | 'quota_exceeded'
  | 'network_or_timeout'
  | 'invalid_structured_output';

export interface Organization {
  id: string;
  name: string;
  ownerUid: string;
  timezone: string;
  aiConsentEnabled: boolean;
  memberUids?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: 'owner' | 'manager' | 'viewer';
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  orgId: string;
  ownerUid: string;
  name: string;
  city: string;
  locality: string;
  bedCapacity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  identifier: string;
  roomType: RoomType;
  targetReadyIso: string;
  ownerName: string;
  readinessStage: ReadinessStage;
  vacantSinceIso: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  roomId: string;
  title: string;
  category: TaskCategory;
  sequenceOrder: number;
  assignedVendor: string;
  assignmentState: 'assigned' | 'unassigned';
  status: TaskStatus;
  scheduledStartIso?: string;
  scheduledEndIso?: string;
  proposedWindowNote?: string;
  providerConfirmed: boolean;
  ownerVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  roomId: string;
  fromTaskId: string;
  toTaskId: string;
  createdAt: string;
}

export interface VendorUpdate {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  roomId: string;
  taskId: string;
  inputMode: 'text_paste' | 'voice_transcript';
  rawText: string;
  aiConsentGranted: boolean;
  createdAt: string;
}

export interface GeminiStructuredExtraction {
  event_kind: EventKind;
  original_language: string;
  summary: string;
  evidence_spans: string[];
  reported_delay_minutes: number | null;
  new_datetime_iso: string | null;
  cost_delta_inr: number | null;
  provider_commitment: ProviderCommitment;
  missing_facts: string[];
  uncertainty_reason: string;
  handover_risk_explanation?: string;
  clarification_questions?: string[];
  draft_reply_to_vendor?: string;
}

export interface Interpretation {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  vendorUpdateId: string;
  source: InterpretationSource;
  engineLabel: 'Offline rules — NOT Gemini' | 'Real Gemini' | 'Manual interpretation';
  modelId?: string;
  eventKind: EventKind;
  originalLanguage: string;
  summary: string;
  evidenceSpans: string[];
  reportedDelayMinutes: number | null;
  newDatetimeIso: string | null;
  costDeltaInr: number | null;
  providerCommitment: ProviderCommitment;
  missingFacts: string[];
  uncertaintyReason: string;
  handoverRiskExplanation?: string;
  suggestedClarifications?: string[];
  suggestedDraftReply?: string;
  diagnosticCategory?: DiagnosticCategory;
  createdAt: string;
}

export interface AffectedTaskImpact {
  taskId: string;
  taskTitle: string;
  impactKind: 'source_task' | 'downstream_at_risk' | 'independent_unchanged';
  candidateNote: string;
  requiresProviderConfirmation: boolean;
}

export interface ImpactProposal {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  roomId: string;
  interpretationId: string;
  sourceTaskId: string;
  affectedTaskCount: number;
  affectedTasks: AffectedTaskImpact[];
  unresolvedAssumptions: string[];
  clarificationQuestions: string[];
  suggestedFollowUpDraft: string;
  targetHandoverAtRisk: boolean;
  status: 'pending_review' | 'approved' | 'rejected';
  summary: string;
  handoverRiskExplanation: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfirmation {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  taskId: string;
  vendorName: string;
  confirmedSlotIso: string;
  evidenceChannel: 'call_verified' | 'manual_whatsapp_copy' | 'on_site';
  recordedByUid: string;
  createdAt: string;
}

export type ApprovalDecision =
  | 'approve_risk_flag'
  | 'request_clarification'
  | 'record_blocker'
  | 'reject_proposal';

export interface OwnerApproval {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  proposalId: string;
  idempotencyKey: string;
  decision: ApprovalDecision;
  rationale: string;
  previousValues: Record<string, string | boolean | null>;
  newValues: Record<string, string | boolean | null>;
  approvedByUid: string;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  orgId: string;
  ownerUid: string;
  propertyId: string;
  roomId: string;
  taskId?: string;
  messageDraft: string;
  dueIso: string;
  status: 'open' | 'resolved';
  verificationState: 'unverified' | 'verified';
  createdAt: string;
  updatedAt: string;
}

export type PhotoInspectionVerdict = 'pass' | 'issues_found' | 'unclear';

export type ConditionStage = 'move_in' | 'move_out';

export type OperatorRole = 'owner' | 'manager' | 'viewer';

export interface PhotoInspectionResult {
  verdict: PhotoInspectionVerdict;
  summary: string;
  detectedIssues: string[];
  observedReadyItems: string[];
  safetyFlags: string[];
  modelId?: string;
}

export interface HandoverEvidence {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  safetyInspectionAck: boolean;
  ownerAttestation: boolean;
  guestAckState: 'not_requested' | 'pending' | 'acknowledged';
  evidenceNote: string;
  photoInspectionVerdict?: PhotoInspectionVerdict;
  photoInspectionSummary?: string;
  photoDetectedIssues?: string[];
  photoSafetyFlags?: string[];
  photoCount?: number;
  conditionStage?: ConditionStage;
  baselineComparisonNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  ownerUid: string;
  roomId: string;
  actorUid: string;
  actorLabel: string;
  action: string;
  provenance: ProvenanceType;
  hasSupportingEvidence: boolean;
  summary: string;
  createdAt: string;
}

export interface PilotFeedback {
  id: string;
  orgId: string;
  ownerUid: string;
  partnerAlias: string;
  consentRecorded: boolean;
  dataClassification: 'anonymized_pilot_note' | 'synthetic_example';
  baselineCoordinationHours: number;
  firstSessionMinutes: number;
  majorBlocker: string;
  willingnessToPayInr: number;
  createdAt: string;
}

export interface SevenStageStep {
  key:
    | 'received'
    | 'interpreted'
    | 'affected_tasks'
    | 'clarifications'
    | 'proposed_plan'
    | 'human_approvals'
    | 'recorded_outcome';
  label: string;
  state: 'completed' | 'current' | 'pending' | 'failed';
  detail: string;
}

export interface HandoverReadinessReport {
  stage: 'not_ready' | 'ready_for_owner_review' | 'verified_physical_handover';
  canMarkVerifiedHandover: boolean;
  checks: {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
  }[];
  blockingReasons: string[];
}

export interface EconomicsInputs {
  monthlyRentInr: number;
  turnoverEventsPerMonth: number;
  unreadyDaysPerTurnover: number;
  avoidableCoordinationHours: number;
  hourlyAdminValueInr: number;
  hasMeasuredBaseline: boolean;
  proposedMonthlyFeeInr: number;
  marginalAiCloudCostInr: number;
  marginalSupportMinutes: number;
  supportHourlyCostInr: number;
  monthlyDepositDisputeExposureInr?: number;
}

export interface EconomicsOutputs {
  potentialRentExposureInr: number;
  adminTimeValueInr: number;
  depositDisputeAvoidedInr: number;
  estimatedTotalValueInr: number;
  operatorNetHypothesisInr: number;
  variableVendorCostInr: number;
  vendorGrossMarginHypothesisInr: number;
}

export interface WorkspaceDataset {
  org: Organization;
  properties: Property[];
  rooms: Room[];
  tasks: Task[];
  dependencies: TaskDependency[];
  vendorUpdates: VendorUpdate[];
  interpretations: Interpretation[];
  impactProposals: ImpactProposal[];
  providerConfirmations: ProviderConfirmation[];
  ownerApprovals: OwnerApproval[];
  followUps: FollowUp[];
  handoverEvidence: HandoverEvidence[];
  auditEvents: AuditEvent[];
  pilotFeedback: PilotFeedback[];
}
