import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileAudio,
  GitBranch,
  Lock,
  Mic,
  PhoneOff,
  Share2,
  ShieldAlert,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  buildMoveInProofCardText,
  buildWhatsAppMessageUrl,
  canRolePerformAction,
  computeSevenStageProgress,
  evaluateHandoverReadiness,
} from '../core/engine';
import {
  formatIstDisplay,
  getUpcomingIstDateTimeLocal,
  toDateTimeLocalValue,
} from '../core/dateUtils';
import { SAMPLE_VENDOR_MESSAGES } from '../core/demoSeed';
import {
  compressImageFileToDataUrl,
  loadPersistedRoomPhotos,
  savePersistedRoomPhotos,
  type StoredRoomPhoto,
} from '../lib/photoProofStore';
import type {
  ApprovalDecision,
  ConditionStage,
  HandoverEvidence,
  Interpretation,
  OperatorRole,
  PhotoInspectionResult,
  ProviderConfirmation,
  Room,
  Task,
  WorkspaceDataset,
} from '../core/types';

interface RoomDetailViewProps {
  dataset: WorkspaceDataset;
  room: Room;
  propertyName?: string;
  propertyLocality?: string;
  hinglishMode?: boolean;
  isDemoMode: boolean;
  geminiConfigured: boolean;
  activeRole?: OperatorRole;
  sharedIntakeText?: string | null;
  onDismissSharedIntake?: () => void;
  onBack: () => void;
  onAddTask: (roomId: string, title: string, category: Task['category'], assignedVendor: string) => Promise<void>;
  onUpdateTaskStatus: (task: Task, status: Task['status']) => Promise<void>;
  onAddDependency: (roomId: string, fromTaskId: string, toTaskId: string) => Promise<{ ok: boolean; reason?: string }>;
  onAssessImpact: (params: {
    room: Room;
    taskId: string;
    rawText: string;
    inputMode: 'text_paste' | 'voice_transcript';
    useGemini: boolean;
    consentGranted: boolean;
  }) => Promise<{
    offlineInterpretation: Interpretation;
    activeInterpretation: Interpretation;
    aiError?: string | null;
    aiStatus?: 'ai_unavailable' | null;
  }>;
  onSaveManualInterpretation: (params: {
    room: Room;
    taskId: string;
    vendorUpdateId: string;
    eventKind: Interpretation['eventKind'];
    reportedDelayMinutes: number | null;
    providerCommitment: Interpretation['providerCommitment'];
    newDatetimeIso: string | null;
    summary: string;
  }) => Promise<Interpretation>;
  onTranscribeVoice: (params: {
    file: File;
    taskTitle: string;
    propertyId: string;
    consentGranted: boolean;
  }) => Promise<{ ok: true; transcript: string } | { ok: false; error: string }>;
  onInspectRoomPhoto: (params: {
    file: File;
    room: Room;
    taskTitles: string[];
    consentGranted: boolean;
  }) => Promise<{ ok: true; result: PhotoInspectionResult } | { ok: false; error: string }>;
  onApplyApproval: (params: {
    room: Room;
    proposalId: string;
    decision: ApprovalDecision;
    rationale: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; duplicate?: boolean; reason?: string }>;
  onSaveFollowUp: (params: {
    room: Room;
    taskId: string;
    messageDraft: string;
    dueIso: string;
  }) => Promise<void>;
  onRecordProviderConfirmation: (params: {
    room: Room;
    taskId: string;
    vendorName: string;
    confirmedSlotIso: string;
    evidenceChannel: ProviderConfirmation['evidenceChannel'];
  }) => Promise<void>;
  onUpdateHandoverEvidence: (
    room: Room,
    patch: Pick<
      HandoverEvidence,
      'safetyInspectionAck' | 'ownerAttestation' | 'guestAckState' | 'evidenceNote'
    > &
      Partial<
        Pick<
          HandoverEvidence,
          | 'photoInspectionVerdict'
          | 'photoInspectionSummary'
          | 'photoDetectedIssues'
          | 'photoSafetyFlags'
          | 'photoCount'
          | 'conditionStage'
          | 'baselineComparisonNote'
        >
      >,
    markVerifiedHandover: boolean
  ) => Promise<void>;
}

export const RoomDetailView: React.FC<RoomDetailViewProps> = ({
  dataset,
  room,
  propertyName,
  propertyLocality,
  hinglishMode = false,
  isDemoMode,
  geminiConfigured,
  activeRole = 'owner',
  sharedIntakeText,
  onDismissSharedIntake,
  onBack,
  onAddTask,
  onUpdateTaskStatus,
  onAddDependency,
  onAssessImpact,
  onSaveManualInterpretation,
  onTranscribeVoice,
  onInspectRoomPhoto,
  onApplyApproval,
  onSaveFollowUp,
  onRecordProviderConfirmation,
  onUpdateHandoverEvidence,
}) => {
  const roomTasks = dataset.tasks
    .filter((t) => t.roomId === room.id)
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const roomDeps = dataset.dependencies.filter((d) => d.roomId === room.id);
  const roomUpdates = dataset.vendorUpdates.filter((u) => u.roomId === room.id);
  const roomInterps = dataset.interpretations.filter((i) => i.roomId === room.id);
  const roomProposals = dataset.impactProposals.filter((p) => p.roomId === room.id);
  const roomConfs = dataset.providerConfirmations.filter((c) => c.roomId === room.id);
  const roomApprovals = dataset.ownerApprovals.filter((a) => a.roomId === room.id);
  const roomFollowUps = dataset.followUps.filter((f) => f.roomId === room.id);
  const roomEvidence = dataset.handoverEvidence.find((e) => e.roomId === room.id);
  const roomAudit = dataset.auditEvents
    .filter((a) => a.roomId === room.id)
    .slice()
    .reverse();

  const latestUpdate = roomUpdates[roomUpdates.length - 1];
  const latestInterp = roomInterps[roomInterps.length - 1];
  const latestProposal = roomProposals[roomProposals.length - 1];
  const latestApproval = roomApprovals[roomApprovals.length - 1];

  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    roomTasks.find((t) => t.category === 'electrical')?.id ?? roomTasks[0]?.id ?? ''
  );
  const [rawMessage, setRawMessage] = useState('');
  const [inputMode, setInputMode] = useState<'text_paste' | 'voice_transcript'>('text_paste');
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [useGemini, setUseGemini] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [aiDiagMessage, setAiDiagMessage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'ai_unavailable' | null>(null);
  const [sideBySideOffline, setSideBySideOffline] = useState<Interpretation | null>(null);
  const [sideBySideActive, setSideBySideActive] = useState<Interpretation | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualEventKind, setManualEventKind] = useState<Interpretation['eventKind']>('delay');
  const [manualDelayMins, setManualDelayMins] = useState<string>('120');
  const [manualCommitment, setManualCommitment] =
    useState<Interpretation['providerCommitment']>('tentative');
  const [manualDatetimeIso, setManualDatetimeIso] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const [voiceBusy, setVoiceBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpDueIso, setFollowUpDueIso] = useState(() =>
    getUpcomingIstDateTimeLocal(1, 10, 0)
  );
  const [followUpSavedMsg, setFollowUpSavedMsg] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision>('approve_risk_flag');
  const [approvalRationale, setApprovalRationale] = useState(
    'Flagged downstream risk; keeping booked slot unchanged until vendor confirms full date and time.'
  );
  const [approvalKey, setApprovalKey] = useState<string>('');
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null);

  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCat, setNewTaskCat] = useState<Task['category']>('plumbing');
  const [newTaskVendor, setNewTaskVendor] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [depFromId, setDepFromId] = useState('');
  const [depToId, setDepToId] = useState('');
  const [depError, setDepError] = useState<string | null>(null);

  const [confTaskId, setConfTaskId] = useState('');
  const [confVendorName, setConfVendorName] = useState('');
  const [confSlotIso, setConfSlotIso] = useState(() => getUpcomingIstDateTimeLocal(0, 15, 0));
  const [confChannel, setConfChannel] =
    useState<ProviderConfirmation['evidenceChannel']>('call_verified');
  const [confMsg, setConfMsg] = useState<string | null>(null);

  const [evSafety, setEvSafety] = useState(Boolean(roomEvidence?.safetyInspectionAck));
  const [evOwner, setEvOwner] = useState(Boolean(roomEvidence?.ownerAttestation));
  const [evGuest, setEvGuest] = useState<HandoverEvidence['guestAckState']>(
    roomEvidence?.guestAckState ?? 'not_requested'
  );
  const [evNote, setEvNote] = useState(roomEvidence?.evidenceNote ?? '');
  const [conditionStage, setConditionStage] = useState<ConditionStage>(
    roomEvidence?.conditionStage ?? 'move_in'
  );
  const [baselineNote, setBaselineNote] = useState(roomEvidence?.baselineComparisonNote ?? '');
  const [evMsg, setEvMsg] = useState<string | null>(null);

  const [sectionFocus, setSectionFocus] = useState<'all' | 'intake' | 'tasks' | 'proof' | 'audit'>('all');
  const [persistedPhotos, setPersistedPhotos] = useState<StoredRoomPhoto[]>(() =>
    loadPersistedRoomPhotos(room.orgId, room.id)
  );
  const [attachedPhotoFiles, setAttachedPhotoFiles] = useState<Record<string, File>>({});
  const [photoInspecting, setPhotoInspecting] = useState(false);
  const [photoInspectError, setPhotoInspectError] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoInspectionResult | null>(() =>
    roomEvidence?.photoInspectionVerdict && roomEvidence?.photoInspectionSummary
      ? {
          verdict: roomEvidence.photoInspectionVerdict,
          summary: roomEvidence.photoInspectionSummary,
          detectedIssues: roomEvidence.photoDetectedIssues ?? [],
          observedReadyItems: [],
          safetyFlags: roomEvidence.photoSafetyFlags ?? [],
        }
      : null
  );
  const [copiedProofCard, setCopiedProofCard] = useState(false);

  const taskWriteAuth = canRolePerformAction(activeRole, 'update_task_status');
  const ownerApprovalAuth = canRolePerformAction(activeRole, 'record_owner_approval');
  const handoverSignAuth = canRolePerformAction(activeRole, 'sign_verified_handover');

  useEffect(() => {
    if (sharedIntakeText && sharedIntakeText.trim().length > 0) {
      setRawMessage(sharedIntakeText.trim());
      setInputMode('text_paste');
    }
  }, [sharedIntakeText]);

  useEffect(() => {
    setPersistedPhotos(loadPersistedRoomPhotos(room.orgId, room.id));
  }, [room.orgId, room.id]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!roomTasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(
        roomTasks.find((t) => t.category === 'electrical')?.id ?? roomTasks[0]?.id ?? ''
      );
    }
  }, [room.id, roomTasks.length]);

  useEffect(() => {
    if (latestProposal) {
      setFollowUpDraft(latestProposal.suggestedFollowUpDraft);
      setApprovalKey(`apv_${latestProposal.id.replace(/[^a-zA-Z0-9_-]/g, '')}`);
      setApprovalMsg(null);
    }
  }, [latestProposal?.id]);

  useEffect(() => {
    setSectionFocus('all');
  }, [room.id]);

  useEffect(() => {
    setEvSafety(Boolean(roomEvidence?.safetyInspectionAck));
    setEvOwner(Boolean(roomEvidence?.ownerAttestation));
    setEvGuest(roomEvidence?.guestAckState ?? 'not_requested');
    setEvNote(roomEvidence?.evidenceNote ?? '');
    setConditionStage(roomEvidence?.conditionStage ?? 'move_in');
    setBaselineNote(roomEvidence?.baselineComparisonNote ?? '');
    if (roomEvidence?.photoInspectionVerdict && roomEvidence?.photoInspectionSummary) {
      setPhotoResult((prev) =>
        prev ?? {
          verdict: roomEvidence.photoInspectionVerdict!,
          summary: roomEvidence.photoInspectionSummary!,
          detectedIssues: roomEvidence.photoDetectedIssues ?? [],
          observedReadyItems: [],
          safetyFlags: roomEvidence.photoSafetyFlags ?? [],
        }
      );
    } else {
      setPhotoResult(null);
    }
  }, [
    room.id,
    roomEvidence?.id,
    roomEvidence?.safetyInspectionAck,
    roomEvidence?.ownerAttestation,
    roomEvidence?.conditionStage,
    roomEvidence?.baselineComparisonNote,
    roomEvidence?.photoInspectionVerdict,
    roomEvidence?.photoInspectionSummary,
  ]);

  const handoverReport = evaluateHandoverReadiness({
    tasks: roomTasks,
    confirmations: roomConfs,
    followUps: roomFollowUps,
    evidence: roomEvidence,
  });

  const sevenStages = computeSevenStageProgress({
    latestUpdate,
    latestInterpretation: latestInterp,
    latestProposal,
    latestApproval,
    followUps: roomFollowUps,
    handoverReport,
    aiFailedDiagnostic: aiDiagMessage,
  });

  const vacantDays = (() => {
    const start = Date.parse(room.vacantSinceIso);
    if (Number.isNaN(start)) return 1;
    return Math.max(1, Math.round((Date.now() - start) / (1000 * 60 * 60 * 24)));
  })();

  const handleAssessImpact = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssessError(null);
    setAiDiagMessage(null);
    setAiStatus(null);
    setFollowUpSavedMsg(null);

    if (!selectedTaskId) {
      setAssessError('Choose the affected preparation task first.');
      return;
    }
    if (!rawMessage.trim()) {
      setAssessError('Paste a vendor message or transcribe a voice note first.');
      return;
    }
    if (useGemini && !aiConsentGranted) {
      setAssessError(
        'Please check explicit AI consent before sending vendor messages to Gemini, or turn off Gemini to run Offline rules.'
      );
      return;
    }

    setAssessing(true);
    try {
      const res = await onAssessImpact({
        room,
        taskId: selectedTaskId,
        rawText: rawMessage.trim(),
        inputMode,
        useGemini,
        consentGranted: aiConsentGranted,
      });
      setSideBySideOffline(res.offlineInterpretation);
      setSideBySideActive(res.activeInterpretation);
      setManualEventKind(res.activeInterpretation.eventKind);
      setManualDelayMins(
        res.activeInterpretation.reportedDelayMinutes !== null
          ? String(res.activeInterpretation.reportedDelayMinutes)
          : ''
      );
      setManualCommitment(res.activeInterpretation.providerCommitment);
      setManualDatetimeIso(res.activeInterpretation.newDatetimeIso ?? '');
      setManualSummary(res.activeInterpretation.summary);
      if (res.aiError) {
        setAiDiagMessage(res.aiError);
      }
      if (res.aiStatus) {
        setAiStatus(res.aiStatus);
      }
    } catch (err) {
      setAssessError(err instanceof Error ? err.message : 'Unable to assess impact.');
    } finally {
      setAssessing(false);
    }
  };

  const handleSaveManualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!latestUpdate && !selectedTaskId) return;
    setManualBusy(true);
    try {
      const parsedDelay =
        manualDelayMins.trim() === '' ? null : Math.max(0, Math.round(Number(manualDelayMins) || 0));
      const saved = await onSaveManualInterpretation({
        room,
        taskId: selectedTaskId || latestProposal?.sourceTaskId || roomTasks[0]?.id || '',
        vendorUpdateId: latestUpdate?.id ?? 'manual_intake',
        eventKind: manualEventKind,
        reportedDelayMinutes: parsedDelay,
        providerCommitment: manualCommitment,
        newDatetimeIso: manualDatetimeIso.trim() || null,
        summary: manualSummary,
      });
      setSideBySideActive(saved);
      setManualOpen(false);
    } finally {
      setManualBusy(false);
    }
  };

  const handleVoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setVoiceFeedback(null);
    if (!file) return;

    if (!aiConsentGranted) {
      setVoiceFeedback(
        'Voice note blocked: please enable explicit AI consent above before uploading audio to Gemini.'
      );
      return;
    }
    const targetTask = roomTasks.find((t) => t.id === selectedTaskId);
    setVoiceBusy(true);
    const res = await onTranscribeVoice({
      file,
      taskTitle: targetTask?.title ?? 'Room task',
      propertyId: room.propertyId,
      consentGranted: aiConsentGranted,
    });
    setVoiceBusy(false);

    if (!res.ok) {
      setVoiceFeedback(res.error);
      return;
    }
    setRawMessage(res.transcript);
    setInputMode('voice_transcript');
    setVoiceFeedback(
      'Transcript ready below — please inspect and edit any misheard words before clicking Assess impact. Raw audio was not stored.'
    );
  };

  const handleMicToggle = async () => {
    setVoiceFeedback(null);
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    if (!aiConsentGranted) {
      setVoiceFeedback(
        'Enable explicit AI consent above before recording a live voice note for Gemini transcription.'
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setVoiceFeedback(
        'Live microphone recording is unavailable in this browser. Upload an audio note or type/paste the update.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size === 0) {
          setVoiceFeedback('No audio captured. Please speak closer to the mic or type the update.');
          return;
        }
        const file = new File([blob], 'caretaker-voice-note.webm', { type: mime });
        const targetTask = roomTasks.find((t) => t.id === selectedTaskId);
        setVoiceBusy(true);
        const res = await onTranscribeVoice({
          file,
          taskTitle: targetTask?.title ?? 'Room task',
          propertyId: room.propertyId,
          consentGranted: true,
        });
        setVoiceBusy(false);

        if (!res.ok) {
          setVoiceFeedback(res.error);
          return;
        }
        setRawMessage(res.transcript);
        setInputMode('voice_transcript');
        setVoiceFeedback(
          'Live voice note transcribed — review the text below and click Assess impact.'
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setVoiceFeedback('Recording voice note… speak in Hindi, Hinglish, Marathi, or English and click Stop.');
    } catch {
      setVoiceFeedback(
        'Microphone permission denied or unavailable. Use Upload voice note or paste the vendor update.'
      );
    }
  };

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setPhotoInspectError(null);
    if (!files.length) return;

    const validFiles = files
      .filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 4 * 1024 * 1024)
      .slice(0, Math.max(0, 4 - persistedPhotos.length));

    if (validFiles.length === 0) {
      setPhotoInspectError('Attach JPG, PNG, or WebP photos under 4 MB each (up to 4 photos).');
      return;
    }

    const newlyStored: StoredRoomPhoto[] = [];
    const fileMapUpdates: Record<string, File> = {};
    for (const file of validFiles) {
      const id = `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const dataUrl = await compressImageFileToDataUrl(file);
      newlyStored.push({
        id,
        name: file.name,
        stage: conditionStage,
        dataUrl,
        capturedAtIso: new Date().toISOString(),
      });
      fileMapUpdates[id] = file;
    }

    setAttachedPhotoFiles((prev) => ({ ...prev, ...fileMapUpdates }));
    setPersistedPhotos((prev) => {
      const next = [...prev, ...newlyStored].slice(0, 4);
      savePersistedRoomPhotos(room.orgId, room.id, next);
      return next;
    });
  };

  const handleRemovePhoto = (index: number) => {
    setPersistedPhotos((prev) => {
      const target = prev[index];
      const next = prev.filter((_, idx) => idx !== index);
      savePersistedRoomPhotos(room.orgId, room.id, next);
      if (target) {
        setAttachedPhotoFiles((fm) => {
          const copy = { ...fm };
          delete copy[target.id];
          return copy;
        });
      }
      return next;
    });
  };

  const handleInspectPhotoClick = async () => {
    setPhotoInspectError(null);
    const primary = persistedPhotos.find((p) => p.stage === conditionStage) ?? persistedPhotos[0];
    if (!primary) {
      setPhotoInspectError('Attach at least one room photo before running Gemini Vision inspection.');
      return;
    }
    if (!aiConsentGranted) {
      setPhotoInspectError(
        'Enable explicit AI consent (in Vendor Update Intake or below) before sending room photos to Gemini Vision.'
      );
      return;
    }

    let fileToInspect = attachedPhotoFiles[primary.id];
    if (!fileToInspect) {
      const resp = await fetch(primary.dataUrl);
      const blob = await resp.blob();
      fileToInspect = new File([blob], primary.name || 'room-proof.jpg', {
        type: blob.type || 'image/jpeg',
      });
    }

    setPhotoInspecting(true);
    const res = await onInspectRoomPhoto({
      file: fileToInspect,
      room,
      taskTitles: roomTasks.map((t) => t.title),
      consentGranted: true,
    });
    setPhotoInspecting(false);

    if (!res.ok) {
      setPhotoInspectError(res.error);
      return;
    }
    setPhotoResult(res.result);
  };

  const handleApplyDecision = async () => {
    if (!latestProposal) return;
    setApprovalMsg(null);
    const cleanKey = (approvalKey || `apv_${latestProposal.id}`)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120);
    if (cleanKey.length < 6) {
      setApprovalMsg('Internal audit reference invalid — please refresh.');
      return;
    }
    if (approvalRationale.trim().length < 2) {
      setApprovalMsg('Please enter an operator rationale (at least 2 characters).');
      return;
    }
    const res = await onApplyApproval({
      room,
      proposalId: latestProposal.id,
      decision: approvalDecision,
      rationale: approvalRationale.trim(),
      idempotencyKey: cleanKey,
    });
    if (!res.ok) {
      setApprovalMsg(res.reason ?? 'Approval blocked.');
    } else {
      setApprovalMsg('Human decision recorded with audit trail.');
    }
  };

  const handleSaveFollowUpClick = async () => {
    if (followUpDraft.trim().length < 2) return;
    const dueNormalized =
      followUpDueIso.trim().length === 16
        ? `${followUpDueIso.trim()}:00+05:30`
        : followUpDueIso.trim();
    await onSaveFollowUp({
      room,
      taskId: selectedTaskId,
      messageDraft: followUpDraft.trim(),
      dueIso: dueNormalized,
    });
    setFollowUpSavedMsg('Follow-up saved to Today queue.');
  };

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(followUpDraft);
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 1800);
    } catch {
      setCopiedDraft(false);
    }
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaskError(null);
    if (newTaskTitle.trim().length < 2) {
      setTaskError('Task title must be at least 2 characters.');
      return;
    }
    await onAddTask(room.id, newTaskTitle.trim(), newTaskCat, newTaskVendor.trim());
    setNewTaskTitle('');
    setNewTaskVendor('');
  };

  const handleAddDependencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepError(null);
    if (!depFromId || !depToId) {
      setDepError('Select both a prerequisite task and a dependent task.');
      return;
    }
    const res = await onAddDependency(room.id, depFromId, depToId);
    if (!res.ok) {
      setDepError(res.reason ?? 'Dependency rejected.');
    } else {
      setDepFromId('');
      setDepToId('');
    }
  };

  const handleRecordConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfMsg(null);
    if (!confTaskId || !confVendorName.trim() || confSlotIso.trim().length < 4) {
      setConfMsg('Select a task, enter vendor name, and choose a confirmed date/time.');
      return;
    }
    const slotNormalized =
      confSlotIso.trim().length === 16 ? `${confSlotIso.trim()}:00+05:30` : confSlotIso.trim();
    await onRecordProviderConfirmation({
      room,
      taskId: confTaskId,
      vendorName: confVendorName.trim(),
      confirmedSlotIso: slotNormalized,
      evidenceChannel: confChannel,
    });
    setConfTaskId('');
    setConfVendorName('');
    setConfMsg('Provider slot confirmation recorded.');
  };

  const handleSaveHandover = async (markVerified: boolean) => {
    setEvMsg(null);
    if (markVerified && !handoverSignAuth.allowed) {
      setEvMsg(handoverSignAuth.reason ?? 'Owner sign-off required.');
      return;
    }
    const totalPhotoCount = Math.max(persistedPhotos.length, roomEvidence?.photoCount ?? 0);
    await onUpdateHandoverEvidence(
      room,
      {
        safetyInspectionAck: evSafety,
        ownerAttestation: evOwner,
        guestAckState: evGuest,
        evidenceNote: evNote,
        conditionStage,
        ...(baselineNote.trim() ? { baselineComparisonNote: baselineNote.trim().slice(0, 295) } : {}),
        ...(photoResult
          ? {
              photoInspectionVerdict: photoResult.verdict,
              photoInspectionSummary: photoResult.summary,
              photoDetectedIssues: photoResult.detectedIssues.slice(0, 6),
              photoSafetyFlags: photoResult.safetyFlags.slice(0, 6),
            }
          : {}),
        ...(totalPhotoCount > 0 ? { photoCount: totalPhotoCount } : {}),
      },
      markVerified
    );
    setEvMsg(
      markVerified
        ? 'Verified physical handover recorded.'
        : 'Handover readiness checklist saved.'
    );
  };

  const proofCardText = buildMoveInProofCardText({
    propertyName,
    propertyLocality,
    room,
    tasks: roomTasks,
    handoverReport,
    evidence: {
      ...(roomEvidence ?? {
        id: 'draft',
        orgId: room.orgId,
        ownerUid: room.ownerUid,
        roomId: room.id,
        createdAt: '',
        updatedAt: '',
      }),
      safetyInspectionAck: evSafety,
      ownerAttestation: evOwner,
      guestAckState: evGuest,
      evidenceNote: evNote,
      conditionStage,
      baselineComparisonNote: baselineNote,
      photoCount: Math.max(persistedPhotos.length, roomEvidence?.photoCount ?? 0),
    },
    photoInspection: photoResult,
  });

  const handleCopyProofCard = async () => {
    try {
      await navigator.clipboard.writeText(proofCardText);
      setCopiedProofCard(true);
      setTimeout(() => setCopiedProofCard(false), 1800);
    } catch {
      setCopiedProofCard(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Room header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#DEDBD2] pb-5">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F4C4C] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to rooms</span>
          </button>
          <h1 className="font-display text-2xl font-bold text-[#111C1B]">
            {room.identifier}
          </h1>
          <p className="text-xs text-[#4A5957]">
            {room.roomType} · Target ready{' '}
            <span className="font-mono-num text-[#111C1B]">
              {formatIstDisplay(room.targetReadyIso)}
            </span>{' '}
            · Warden: {room.ownerName} · Stage:{' '}
            <strong className="text-[#111C1B]">{room.readinessStage.replace(/_/g, ' ')}</strong>
          </p>
        </div>

        {/* Turnover Snapshot */}
        <aside className="rounded-lg border border-[#DEDBD2] bg-white px-4 py-3 text-xs space-y-1 sm:max-w-xs">
          <div className="font-semibold text-[#111C1B]">Turnover snapshot</div>
          <div className="text-[#4A5957]">
            Vacant span: <span className="font-mono-num text-[#111C1B]">{vacantDays} day(s)</span> · Open follow-ups:{' '}
            <span className="font-mono-num text-[#111C1B]">
              {roomFollowUps.filter((f) => f.status === 'open').length}
            </span>
          </div>
          <div className="text-[11px] text-[#4A5957]">
            Tracks vendor confirmations and blockers before guest arrival.
          </div>
        </aside>
      </div>

      {/* Plain-English Next Action Card */}
      {(() => {
        const openFollowUpCount = roomFollowUps.filter((f) => f.status === 'open').length;
        let actionTitle = 'Step 1: Assess incoming vendor update';
        let actionDetail = isDemoMode
          ? 'Pick a sample vendor message below (or paste your own) and click Assess impact to check downstream handover risk.'
          : 'Paste a vendor WhatsApp/SMS update (or upload a voice note) below and click Assess impact to check downstream handover risk.';
        if (latestProposal && latestProposal.status === 'pending_review') {
          actionTitle = 'Next action: Review & decide proposed handover impact';
          actionDetail =
            'Check the affected tasks and clarification questions below, save a follow-up reminder if needed, and record your decision.';
        } else if (openFollowUpCount > 0) {
          actionTitle = `Next action: Resolve ${openFollowUpCount} open vendor follow-up(s)`;
          actionDetail =
            'Confirm exact arrival date & time (IST) with the vendor, log Provider Confirmation on the right, and resolve the open follow-up.';
        } else if (!handoverReport.canMarkVerifiedHandover) {
          actionTitle = 'Next action: Complete remaining handover proof checks';
          actionDetail =
            handoverReport.blockingReasons[0] ??
            'All preparation tasks, provider confirmations, and safety acknowledgements must pass before physical handover.';
        } else if (room.readinessStage !== 'verified_physical_handover') {
          actionTitle = 'Ready: Sign Verified Physical Handover';
          actionDetail =
            'All prerequisite tasks, confirmations, and safety checks have passed. Sign the physical handover attestation on the right.';
        } else {
          actionTitle = 'Handover verified with proof';
          actionDetail = 'Room physical handover has been signed and logged in the audit trail.';
        }

        const activeSourceBadge =
          aiStatus === 'ai_unavailable'
            ? { label: 'AI unavailable', cls: 'border-[#B91C1C]/40 bg-red-50 text-[#991B1B]' }
            : latestInterp?.source === 'real_gemini'
            ? { label: 'Gemini AI', cls: 'border-[#0F4C4C]/40 bg-[#F0F5F4] text-[#0F4C4C]' }
            : latestInterp?.source === 'manual_interpretation'
            ? { label: 'Operator edit', cls: 'border-[#1D4ED8]/40 bg-blue-50 text-[#1E40AF]' }
            : latestInterp?.source === 'offline_rules'
            ? { label: 'Local parser', cls: 'border-[#B45309]/40 bg-amber-50 text-[#92400E]' }
            : null;

        return (
          <section
            aria-label="Recommended next action"
            className="rounded-lg border border-[#0F4C4C]/30 bg-white px-4 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-0.5">
              <div className="font-display text-sm font-semibold text-[#111C1B]">
                {actionTitle}
              </div>
              <p className="text-xs text-[#4A5957]">{actionDetail}</p>
            </div>
            {activeSourceBadge && (
              <div className="shrink-0 flex items-center gap-2 text-xs">
                <span className="text-[#4A5957]">Latest parser:</span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono-num text-[11px] font-semibold ${activeSourceBadge.cls}`}
                >
                  {activeSourceBadge.label}
                </span>
              </div>
            )}
          </section>
        );
      })()}

      {/* Seven-state progress trail */}
      <section aria-label="Workflow progress trail" className="rounded-lg border border-[#DEDBD2] bg-white p-4">
        <h2 className="font-display text-xs font-semibold text-[#4A5957] mb-3">
          Handover exception workflow
        </h2>
        <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          {sevenStages.map((step) => (
            <li
              key={step.key}
              className={`rounded-md border p-2.5 text-xs ${
                step.state === 'failed'
                  ? 'border-[#B91C1C]/50 bg-red-50/70'
                  : step.state === 'completed'
                  ? 'border-[#15803D]/40 bg-emerald-50/50'
                  : step.state === 'current'
                  ? 'border-[#0F4C4C] bg-[#F0F5F4]'
                  : 'border-[#DEDBD2] bg-[#F7F6F2]/50'
              }`}
            >
              <div className="font-semibold text-[#111C1B]">{step.label}</div>
              <div className="mt-1 text-[11px] leading-snug text-[#4A5957]">{step.detail}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Quick Section Filter Bar (mobile-first jump without losing full 2-column desktop view) */}
      <div
        role="tablist"
        aria-label="Room sections"
        className="flex flex-wrap items-center gap-1.5 border-b border-[#DEDBD2] pb-3"
      >
        {(
          [
            { id: 'all', label: 'All steps' },
            { id: 'intake', label: 'Intake & Risk' },
            { id: 'tasks', label: `Tasks & DAG (${roomTasks.length})` },
            { id: 'proof', label: 'Proof & Handover' },
            { id: 'audit', label: `Audit (${roomAudit.length})` },
          ] as const
        ).map((tab) => {
          const active = sectionFocus === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSectionFocus(tab.id)}
              className={`min-h-[34px] rounded-md border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#0F4C4C] bg-[#0F4C4C] text-white'
                  : 'border-[#DEDBD2] bg-white text-[#4A5957] hover:bg-[#F7F6F2] hover:text-[#111C1B]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main 2-column operational layout */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left column: Vendor Update Intake + Extraction + Impact Proposal + Approvals */}
        {(sectionFocus === 'all' || sectionFocus === 'intake') && (
        <div className={`${sectionFocus === 'all' ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6`}>
          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            {sharedIntakeText && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#0F4C4C]/40 bg-[#F0F5F4] px-3 py-2 text-xs text-[#0F4C4C]"
              >
                <span>
                  <strong>WhatsApp Share imported:</strong> Review the message below, pick the
                  affected task, and click <em>Assess impact</em>.
                </span>
                {onDismissSharedIntake && (
                  <button
                    type="button"
                    onClick={onDismissSharedIntake}
                    className="font-semibold underline hover:text-[#0A3838]"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[#111C1B]">
                  Vendor update intake
                </h2>
                {hinglishMode && (
                  <p className="text-[11px] text-[#0F4C4C]">
                    Mistri ka update paste karein, silent log karein, ya mic se voice note record karein
                  </p>
                )}
              </div>
              <span className="text-xs text-[#4A5957]">
                Draft-safe · booked slots never auto-change
              </span>
            </div>

            {/* Quick sample buttons shown only inside Interactive Sandbox */}
            {isDemoMode && (
              <div className="flex flex-wrap gap-2">
                {SAMPLE_VENDOR_MESSAGES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      setRawMessage(sample.text);
                      setInputMode('text_paste');
                      const hintTask = roomTasks.find(
                        (t) => t.id === sample.taskIdHint || t.category === 'electrical'
                      );
                      if (hintTask) setSelectedTaskId(hintTask.id);
                    }}
                    className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] px-2.5 py-1.5 text-xs font-medium text-[#111C1B] hover:bg-[#EFEDE6]"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleAssessImpact} className="space-y-4">
              <div>
                <label htmlFor="affected-task-select" className="block text-xs font-medium text-[#111C1B] mb-1">
                  Affected preparation task
                </label>
                <select
                  id="affected-task-select"
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] bg-white px-3 py-2 text-sm text-[#111C1B]"
                >
                  {roomTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.sequenceOrder}. {t.title} ({t.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="vendor-message-input" className="block text-xs font-medium text-[#111C1B]">
                    Paste vendor WhatsApp/SMS update (English, Hinglish, Hindi, or Marathi)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRawMessage('Vendor not picking up call / no reply yet — need alternate check or backup contact.');
                      setInputMode('text_paste');
                    }}
                    className="inline-flex min-h-[28px] items-center gap-1 rounded border border-[#B45309]/40 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-[#92400E] hover:bg-amber-100"
                  >
                    <PhoneOff className="h-3 w-3" aria-hidden="true" />
                    <span>Vendor not picking up</span>
                  </button>
                </div>
                <textarea
                  id="vendor-message-input"
                  rows={3}
                  maxLength={2000}
                  value={rawMessage}
                  onChange={(e) => {
                    setRawMessage(e.target.value);
                    setInputMode('text_paste');
                  }}
                  placeholder="e.g. Bhai aaj 2 ghante late ho gaya, kal 11 baje koshish karunga..."
                  className="w-full rounded-md border border-[#DEDBD2] bg-white p-3 text-sm text-[#111C1B] placeholder:text-[#4A5957]/60"
                />
              </div>

              {/* Explicit AI Consent + Optional Gemini / Live Mic / Voice upload path */}
              <div className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 text-xs text-[#111C1B]">
                  <input
                    type="checkbox"
                    checked={aiConsentGranted}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAiConsentGranted(next);
                      if (!next) setUseGemini(false);
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#0F4C4C]"
                  />
                  <span>
                    <strong>AI processing consent:</strong> Send this vendor text, voice note, or room photo to
                    Gemini AI for structured inspection (leave unchecked to run locally with zero
                    external AI calls).
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#111C1B]">
                    <input
                      type="checkbox"
                      checked={useGemini}
                      disabled={!aiConsentGranted}
                      onChange={(e) => setUseGemini(e.target.checked)}
                      className="h-4 w-4 accent-[#0F4C4C] disabled:opacity-50"
                    />
                    <Sparkles className="h-3.5 w-3.5 text-[#0F4C4C]" aria-hidden="true" />
                    <span>
                      Use Gemini AI ({geminiConfigured ? 'Ready' : 'Server key unconfigured — safe fallback'})
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      disabled={voiceBusy}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        recording
                          ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                          : 'border-[#0F4C4C]/40 bg-white text-[#0F4C4C] hover:bg-[#F0F5F4]'
                      }`}
                    >
                      {recording ? (
                        <>
                          <Square className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Stop recording</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{voiceBusy ? 'Transcribing…' : 'Record voice note'}</span>
                        </>
                      )}
                    </button>

                    <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border border-[#DEDBD2] bg-white px-3 py-1.5 text-xs font-medium text-[#111C1B] hover:bg-[#EFEDE6]">
                      <FileAudio className="h-3.5 w-3.5 text-[#0F4C4C]" aria-hidden="true" />
                      <span>Upload audio (≤2MB)</span>
                      <input
                        type="file"
                        accept="audio/webm,audio/wav,audio/mp3,audio/mpeg,audio/ogg,audio/mp4,audio/x-m4a"
                        onChange={handleVoiceFile}
                        className="sr-only"
                        disabled={voiceBusy || recording}
                      />
                    </label>
                  </div>
                </div>

                {voiceFeedback && (
                  <p className="text-xs text-[#0F4C4C]" role="status">
                    {voiceFeedback}
                  </p>
                )}
              </div>

              {assessError && (
                <div
                  role="alert"
                  className="rounded-md border border-[#B91C1C]/30 bg-red-50 px-3 py-2 text-sm text-[#991B1B]"
                >
                  {assessError}
                </div>
              )}

              {aiDiagMessage && (
                <div
                  role="status"
                  className="rounded-md border border-[#B45309]/40 bg-amber-50 px-3 py-2 text-xs text-[#92400E]"
                >
                  <strong>Gemini unavailable — safe fallback used:</strong> {aiDiagMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={assessing}
                  className="min-h-[44px] rounded-md bg-[#0F4C4C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60"
                >
                  {assessing ? 'Assessing impact…' : 'Assess impact'}
                </button>
              </div>
            </form>
          </section>

          {/* Side-by-side Offline Rules vs Real Gemini / Manual Interpretation */}
          {(sideBySideOffline || latestInterp) && (
            <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-[#111C1B]">
                  Interpretation comparison
                </h2>
                <button
                  type="button"
                  onClick={() => setManualOpen((v) => !v)}
                  className="rounded border border-[#DEDBD2] px-2.5 py-1 text-xs font-medium text-[#0F4C4C] hover:bg-[#F7F6F2]"
                >
                  {manualOpen ? 'Close manual editor' : 'Edit / record Manual interpretation'}
                </button>
              </div>

              {manualOpen && (
                <form
                  onSubmit={handleSaveManualOverride}
                  className="rounded-md border border-[#1D4ED8]/30 bg-blue-50/40 p-3.5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E40AF]">
                      Manual interpretation override (attributed to Operator, never Gemini)
                    </span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-4">
                    <div>
                      <label htmlFor="manual-event-kind" className="block text-[#4A5957] mb-1">
                        Event kind
                      </label>
                      <select
                        id="manual-event-kind"
                        value={manualEventKind}
                        onChange={(e) =>
                          setManualEventKind(e.target.value as Interpretation['eventKind'])
                        }
                        className="min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2 py-1"
                      >
                        <option value="delay">delay</option>
                        <option value="cancellation">cancellation</option>
                        <option value="price_change">price_change</option>
                        <option value="completion_claim">completion_claim</option>
                        <option value="unclear">unclear</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="manual-delay-mins" className="block text-[#4A5957] mb-1">
                        Delay (minutes)
                      </label>
                      <input
                        id="manual-delay-mins"
                        type="number"
                        min={0}
                        value={manualDelayMins}
                        onChange={(e) => setManualDelayMins(e.target.value)}
                        placeholder="e.g. 120"
                        className="font-mono-num min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2 py-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-commitment" className="block text-[#4A5957] mb-1">
                        Commitment
                      </label>
                      <select
                        id="manual-commitment"
                        value={manualCommitment}
                        onChange={(e) =>
                          setManualCommitment(
                            e.target.value as Interpretation['providerCommitment']
                          )
                        }
                        className="min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2 py-1"
                      >
                        <option value="tentative">tentative</option>
                        <option value="unknown">unknown</option>
                        <option value="confirmed">confirmed</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="manual-iso" className="block text-[#4A5957] mb-1">
                        Confirmed slot (optional)
                      </label>
                      <input
                        id="manual-iso"
                        type="datetime-local"
                        value={toDateTimeLocalValue(manualDatetimeIso) || manualDatetimeIso}
                        onChange={(e) => setManualDatetimeIso(e.target.value)}
                        className="font-mono-num min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2 py-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="manual-summary" className="block text-[#4A5957] mb-1">
                      Operator summary
                    </label>
                    <input
                      id="manual-summary"
                      type="text"
                      value={manualSummary}
                      onChange={(e) => setManualSummary(e.target.value)}
                      placeholder="Summarize what the vendor confirmed or left unconfirmed"
                      className="min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2.5 py-1"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={manualBusy}
                      className="min-h-[34px] rounded bg-[#1E40AF] px-3 py-1 font-semibold text-white hover:bg-[#1E3A8A]"
                    >
                      {manualBusy ? 'Saving…' : 'Save operator summary & recalculate'}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid gap-4 md:grid-cols-2 md:divide-x md:divide-[#DEDBD2]">
                {(() => {
                  const offline =
                    sideBySideOffline ??
                    (latestInterp?.source === 'offline_rules' ? latestInterp : null);
                  const gemini =
                    sideBySideActive?.source === 'real_gemini'
                      ? sideBySideActive
                      : latestInterp?.source === 'real_gemini'
                      ? latestInterp
                      : null;
                  const manual =
                    sideBySideActive?.source === 'manual_interpretation'
                      ? sideBySideActive
                      : latestInterp?.source === 'manual_interpretation'
                      ? latestInterp
                      : null;

                  return (
                    <>
                      <div className="bg-[#F7F6F2]/70 p-3.5 rounded-md space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#111C1B]">
                            Local Rule Parser (Offline)
                          </span>
                          <span className="rounded border border-[#B45309]/40 bg-amber-50 px-1.5 py-0.5 font-mono-num text-[10px] font-semibold text-[#92400E]">
                            Offline rules
                          </span>
                        </div>
                        {offline ? (
                          <>
                            <div className="text-[#4A5957]">
                              Event: <strong className="text-[#111C1B]">{offline.eventKind}</strong> ·
                              Delay:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {offline.reportedDelayMinutes !== null
                                  ? `${offline.reportedDelayMinutes} min`
                                  : 'Not specified'}
                              </span>{' '}
                              · Commitment: <strong>{offline.providerCommitment}</strong>
                            </div>
                            <p className="text-[#111C1B]">{offline.summary}</p>
                            <div className="text-[#4A5957]">
                              Confirmed slot:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {offline.newDatetimeIso
                                  ? formatIstDisplay(offline.newDatetimeIso)
                                  : 'Not confirmed (no explicit date)'}
                              </span>
                            </div>
                            {offline.missingFacts.length > 0 && (
                              <ul className="list-disc pl-4 text-[#B45309] space-y-0.5">
                                {offline.missingFacts.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            )}
                          </>
                        ) : (
                          <p className="text-[#4A5957]">Click Assess impact to view local parser analysis.</p>
                        )}
                      </div>

                      <div className="p-3.5 md:pl-5 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0F4C4C]">
                            {manual
                              ? 'Operator Override'
                              : gemini
                              ? `Gemini AI (${gemini.modelId ?? 'Flash'})`
                              : aiStatus === 'ai_unavailable'
                              ? 'Gemini AI attempt'
                              : 'Gemini AI (opt-in)'}
                          </span>
                          {manual ? (
                            <span className="rounded border border-[#1D4ED8]/40 bg-blue-50 px-1.5 py-0.5 font-mono-num text-[10px] font-semibold text-[#1E40AF]">
                              Operator edit
                            </span>
                          ) : gemini ? (
                            <span className="rounded border border-[#0F4C4C]/40 bg-[#F0F5F4] px-1.5 py-0.5 font-mono-num text-[10px] font-semibold text-[#0F4C4C]">
                              Gemini AI
                            </span>
                          ) : aiStatus === 'ai_unavailable' ? (
                            <span className="rounded border border-[#B91C1C]/40 bg-red-50 px-1.5 py-0.5 font-mono-num text-[10px] font-semibold text-[#991B1B]">
                              AI unavailable
                            </span>
                          ) : null}
                        </div>
                        {manual ? (
                          <>
                            <div className="text-[#4A5957]">
                              Event: <strong className="text-[#111C1B]">{manual.eventKind}</strong> ·
                              Delay:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {manual.reportedDelayMinutes !== null
                                  ? `${manual.reportedDelayMinutes} min`
                                  : 'Not specified'}
                              </span>{' '}
                              · Commitment: <strong>{manual.providerCommitment}</strong>
                            </div>
                            <p className="text-[#111C1B]">{manual.summary}</p>
                            <div className="text-[#4A5957]">
                              Confirmed slot:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {manual.newDatetimeIso
                                  ? formatIstDisplay(manual.newDatetimeIso)
                                  : 'Unconfirmed'}
                              </span>
                            </div>
                          </>
                        ) : gemini ? (
                          <>
                            <div className="text-[#4A5957]">
                              Event: <strong className="text-[#111C1B]">{gemini.eventKind}</strong> ·
                              Delay:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {gemini.reportedDelayMinutes !== null
                                  ? `${gemini.reportedDelayMinutes} min`
                                  : 'Not specified'}
                              </span>{' '}
                              · Commitment: <strong>{gemini.providerCommitment}</strong>
                            </div>
                            <p className="text-[#111C1B]">{gemini.summary}</p>
                            <div className="text-[#4A5957]">
                              Confirmed slot:{' '}
                              <span className="font-mono-num text-[#111C1B]">
                                {gemini.newDatetimeIso
                                  ? formatIstDisplay(gemini.newDatetimeIso)
                                  : 'Not confirmed (requires exact date)'}
                              </span>
                            </div>
                            {gemini.missingFacts.length > 0 && (
                              <ul className="list-disc pl-4 text-[#B45309] space-y-0.5">
                                {gemini.missingFacts.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            )}
                          </>
                        ) : aiStatus === 'ai_unavailable' ? (
                          <p className="text-[#991B1B]">
                            Gemini AI was unavailable ({aiDiagMessage}). Local rules remained active so your workflow was not blocked.
                          </p>
                        ) : (
                          <p className="text-[#4A5957]">
                            Enable AI consent &amp; Use Gemini AI above to run structured extraction, or record an operator summary manually.
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </section>
          )}

          {/* Proposed Impact + Clarification + Editable Follow-up Draft + Explicit Human Approval */}
          {latestProposal && (
            <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#111C1B]">
                    Proposed impact &amp; human approval gate
                  </h2>
                  {hinglishMode && (
                    <p className="text-[11px] text-[#0F4C4C]">
                      Safai aur check-in par asar dekhein — aapke approval ke bina schedule nahi badlega
                    </p>
                  )}
                </div>
                <span className="font-mono-num text-xs font-medium text-[#0F4C4C]">
                  Status: {latestProposal.status.replace(/_/g, ' ')}
                </span>
              </div>

              {latestProposal.handoverRiskExplanation && (
                <div className="rounded-md border border-[#B45309]/35 bg-amber-50/60 p-3 text-xs text-[#111C1B] space-y-1">
                  <div className="font-semibold text-[#92400E]">Handover risk in plain language</div>
                  <p className="leading-relaxed text-[#4A5957]">
                    {latestProposal.handoverRiskExplanation}
                  </p>
                </div>
              )}

              <p className="text-xs text-[#4A5957]">
                Booked task times and room readiness remain unaltered until you explicitly record a decision below.
              </p>

              {/* Affected vs Independent tasks */}
              <ul className="divide-y divide-[#DEDBD2] border-y border-[#DEDBD2]">
                {latestProposal.affectedTasks.map((item) => (
                  <li key={item.taskId} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-[#111C1B]">{item.taskTitle}</div>
                      <div className="text-[#4A5957] mt-0.5">{item.candidateNote}</div>
                    </div>
                    <span
                      className={`shrink-0 font-medium ${
                        item.impactKind === 'downstream_at_risk'
                          ? 'text-[#B91C1C]'
                          : item.impactKind === 'source_task'
                          ? 'text-[#B45309]'
                          : 'text-[#15803D]'
                      }`}
                    >
                      {item.impactKind === 'downstream_at_risk'
                        ? 'At risk'
                        : item.impactKind === 'source_task'
                        ? 'Source'
                        : 'Unchanged'}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Clarification questions */}
              {latestProposal.clarificationQuestions.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-[#111C1B]">
                    Clarifications required before re-booking
                  </h3>
                  <ul className="list-disc pl-4 text-xs text-[#4A5957] space-y-1">
                    {latestProposal.clarificationQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Editable & Copyable Follow-up Draft + 1-Tap Send on WhatsApp */}
              <div className="space-y-2 border-t border-[#DEDBD2] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="followup-draft-input" className="text-xs font-semibold text-[#111C1B]">
                    Editable follow-up draft (stays draft until sent/saved; no silent auto-send)
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={buildWhatsAppMessageUrl(followUpDraft)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] hover:underline"
                    >
                      <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Send on WhatsApp</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyDraft}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0F4C4C] hover:underline"
                    >
                      {copiedDraft ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy draft
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  id="followup-draft-input"
                  rows={3}
                  value={followUpDraft}
                  onChange={(e) => setFollowUpDraft(e.target.value)}
                  className="w-full rounded-md border border-[#DEDBD2] p-2.5 text-xs text-[#111C1B]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="followup-due" className="text-xs text-[#4A5957]">
                    Follow-up due:
                  </label>
                  <input
                    id="followup-due"
                    type="datetime-local"
                    value={toDateTimeLocalValue(followUpDueIso) || followUpDueIso}
                    onChange={(e) => setFollowUpDueIso(e.target.value)}
                    className="font-mono-num min-h-[36px] rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs text-[#111C1B]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveFollowUpClick}
                    className="min-h-[36px] rounded-md border border-[#0F4C4C] px-3 py-1.5 text-xs font-semibold text-[#0F4C4C] hover:bg-[#F0F5F4]"
                  >
                    Save follow-up reminder
                  </button>
                </div>
                {followUpSavedMsg && (
                  <p className="text-xs font-medium text-[#15803D]" role="status">
                    {followUpSavedMsg}
                  </p>
                )}
              </div>

              {/* Human Approval Gate */}
              <div className="border-t border-[#DEDBD2] pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[#111C1B]">
                    Operator decision (Maalik / Warden sign-off)
                  </h3>
                  <span className="text-[11px] text-[#4A5957]">
                    Duplicate clicks automatically protected
                  </span>
                </div>
                <div>
                  <label htmlFor="approval-decision" className="block text-xs text-[#4A5957] mb-1">
                    Decision
                  </label>
                  <select
                    id="approval-decision"
                    value={approvalDecision}
                    onChange={(e) => setApprovalDecision(e.target.value as ApprovalDecision)}
                    className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] bg-white px-2.5 py-1.5 text-xs text-[#111C1B]"
                  >
                    <option value="approve_risk_flag">Accept risk flag (keep slots unconfirmed)</option>
                    <option value="request_clarification">Hold &amp; request vendor clarification</option>
                    <option value="record_blocker">Record source task as blocked</option>
                    <option value="reject_proposal">Reject proposal</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="approval-rationale" className="block text-xs text-[#4A5957]">
                      Operator rationale (tap a quick reason or edit)
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Vendor delayed; holding cleaning until IST arrival confirmed',
                      'Waiting for vendor material / switchboard rate approval',
                      'Confirmed on phone call; monitoring next step',
                      'Vendor unreachable — escalating backup technician',
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setApprovalRationale(chip)}
                        className="rounded border border-[#DEDBD2] bg-[#F7F6F2] px-2 py-1 text-[11px] font-medium text-[#111C1B] hover:bg-[#EFEDE6]"
                      >
                        {chip.split(';')[0]}
                      </button>
                    ))}
                  </div>
                  <input
                    id="approval-rationale"
                    type="text"
                    value={approvalRationale}
                    onChange={(e) => setApprovalRationale(e.target.value)}
                    className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-xs text-[#111C1B]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={!ownerApprovalAuth.allowed}
                    onClick={handleApplyDecision}
                    className="min-h-[40px] rounded-md bg-[#0F4C4C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A3838] disabled:opacity-45"
                  >
                    Record human decision
                  </button>
                  {!ownerApprovalAuth.allowed ? (
                    <span className="text-xs font-medium text-[#B45309]" role="status">
                      {ownerApprovalAuth.reason}
                    </span>
                  ) : approvalMsg ? (
                    <span className="text-xs font-medium text-[#0F4C4C]" role="status">
                      {approvalMsg}
                    </span>
                  ) : null}
                </div>
                <details className="text-[11px] text-[#4A5957]">
                  <summary className="cursor-pointer hover:text-[#111C1B]">
                    Technical audit reference (duplicate submission guard)
                  </summary>
                  <div className="mt-1.5 flex items-center gap-2">
                    <label htmlFor="approval-key" className="shrink-0">
                      Audit ref:
                    </label>
                    <input
                      id="approval-key"
                      type="text"
                      value={approvalKey}
                      onChange={(e) => setApprovalKey(e.target.value)}
                      className="font-mono-num min-h-[30px] flex-1 rounded border border-[#DEDBD2] px-2 py-0.5 text-[11px] text-[#111C1B]"
                    />
                  </div>
                </details>
              </div>
            </section>
          )}
        </div>
        )}

        {/* Right column: Ordered Tasks & Dependency DAG + Provider Confirmation + Handover Gate + Audit Trail */}
        {(sectionFocus === 'all' || sectionFocus === 'tasks' || sectionFocus === 'proof' || sectionFocus === 'audit') && (
        <div className={`${sectionFocus === 'all' ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-6`}>
          {(sectionFocus === 'all' || sectionFocus === 'tasks') && (
          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Preparation tasks &amp; dependency graph
              </h2>
              <span className="font-mono-num text-xs text-[#4A5957]">
                {roomTasks.length} tasks · {roomDeps.length} links
              </span>
            </div>

            <ul className="divide-y divide-[#DEDBD2]">
              {roomTasks.map((task) => {
                const prereqs = roomDeps
                  .filter((d) => d.toTaskId === task.id)
                  .map((d) => roomTasks.find((t) => t.id === d.fromTaskId)?.title)
                  .filter(Boolean);
                return (
                  <li key={task.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[#111C1B]">
                          {task.sequenceOrder}. {task.title}
                        </div>
                        <div className="text-xs text-[#4A5957]">
                          {task.assignmentState === 'assigned'
                            ? task.assignedVendor
                            : 'Unassigned'}{' '}
                          ·{' '}
                          {task.providerConfirmed
                            ? 'Provider confirmed'
                            : 'Provider unconfirmed'}
                        </div>
                      </div>
                      <select
                        aria-label={`Status for ${task.title}`}
                        value={task.status}
                        disabled={!taskWriteAuth.allowed}
                        onChange={(e) =>
                          onUpdateTaskStatus(task, e.target.value as Task['status'])
                        }
                        className="min-h-[32px] rounded border border-[#DEDBD2] bg-white px-2 py-1 text-xs text-[#111C1B] disabled:opacity-60"
                      >
                        <option value="pending">pending</option>
                        <option value="scheduled">scheduled</option>
                        <option value="at_risk">at_risk</option>
                        <option value="blocked">blocked</option>
                        <option value="completed">completed</option>
                      </select>
                    </div>
                    {prereqs.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#4A5957]">
                        <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>Depends on: {prereqs.join(', ')}</span>
                      </div>
                    )}
                    {task.proposedWindowNote && (
                      <div className="text-[11px] text-[#B45309]">{task.proposedWindowNote}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Collapsible task & dependency editor to keep 2-minute Hero flow clean */}
            <div className="border-t border-[#DEDBD2] pt-3 space-y-3">
              <button
                type="button"
                aria-expanded={taskEditorOpen}
                onClick={() => setTaskEditorOpen((prev) => !prev)}
                className="text-xs font-semibold text-[#0F4C4C] hover:underline"
              >
                {taskEditorOpen
                  ? 'Hide task & dependency editor'
                  : '+ Add preparation task or dependency link (DAG)'}
              </button>

              {taskEditorOpen && (
                <div className="space-y-4 pt-1">
                  <form onSubmit={handleAddTaskSubmit} className="space-y-2">
                    <div className="text-xs font-semibold text-[#111C1B]">Add preparation task</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="New task title"
                        placeholder="Task title"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="col-span-2 min-h-[36px] rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs"
                      />
                      <select
                        aria-label="New task category"
                        value={newTaskCat}
                        onChange={(e) => setNewTaskCat(e.target.value as Task['category'])}
                        className="min-h-[36px] rounded-md border border-[#DEDBD2] bg-white px-2 py-1 text-xs"
                      >
                        <option value="painting">painting</option>
                        <option value="electrical">electrical</option>
                        <option value="plumbing">plumbing</option>
                        <option value="cleaning">cleaning</option>
                        <option value="inspection">inspection</option>
                        <option value="wifi">wifi</option>
                        <option value="other">other</option>
                      </select>
                      <input
                        type="text"
                        aria-label="Assigned vendor"
                        placeholder="Vendor (optional)"
                        value={newTaskVendor}
                        onChange={(e) => setNewTaskVendor(e.target.value)}
                        className="min-h-[36px] rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs"
                      />
                    </div>
                    {taskError && (
                      <div role="alert" className="text-xs text-[#B91C1C]">
                        {taskError}
                      </div>
                    )}
                    <button
                      type="submit"
                      className="min-h-[36px] rounded-md border border-[#DEDBD2] px-3 py-1 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
                    >
                      Add task
                    </button>
                  </form>

                  <form
                    onSubmit={handleAddDependencySubmit}
                    className="border-t border-[#DEDBD2] pt-3 space-y-2"
                  >
                    <div className="text-xs font-semibold text-[#111C1B]">
                      Add dependency link (DAG cycle-checked)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Prerequisite task"
                        value={depFromId}
                        onChange={(e) => setDepFromId(e.target.value)}
                        className="min-h-[36px] rounded-md border border-[#DEDBD2] bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Prerequisite…</option>
                        {roomTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Dependent task"
                        value={depToId}
                        onChange={(e) => setDepToId(e.target.value)}
                        className="min-h-[36px] rounded-md border border-[#DEDBD2] bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Blocked task…</option>
                        {roomTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    {depError && (
                      <div role="alert" className="text-xs text-[#B91C1C]">
                        {depError}
                      </div>
                    )}
                    <button
                      type="submit"
                      className="min-h-[36px] rounded-md border border-[#DEDBD2] px-3 py-1 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
                    >
                      Link dependency
                    </button>
                  </form>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Distinct Provider Confirmation vs Handover Readiness & Proof Gate */}
          {(sectionFocus === 'all' || sectionFocus === 'proof') && (
          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Handover readiness &amp; proof gate
              </h2>
              {hinglishMode && (
                <p className="text-[11px] text-[#0F4C4C]">
                  Room handover se pehle vendor confirmation, photo check aur maalik sign-off zaroori hai
                </p>
              )}
            </div>

            <div className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-[#111C1B]">
                {handoverReport.canMarkVerifiedHandover ? (
                  <CheckCircle2 className="h-4 w-4 text-[#15803D]" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4 text-[#B45309]" aria-hidden="true" />
                )}
                <span>
                  {handoverReport.stage === 'verified_physical_handover'
                    ? 'Verified physical handover'
                    : handoverReport.stage === 'ready_for_owner_review'
                    ? 'Ready for owner review (not yet verified handover)'
                    : 'Physical handover blocked'}
                </span>
              </div>
              {!handoverReport.canMarkVerifiedHandover && (
                <p className="text-[#4A5957]">
                  A checked box or saved note never proves physical readiness. All required checks
                  must pass first.
                </p>
              )}
            </div>

            <ul className="space-y-2 text-xs">
              {handoverReport.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  {c.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                  )}
                  <div>
                    <div className="font-medium text-[#111C1B]">{c.label}</div>
                    <div className="text-[#4A5957]">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Room Photo Proof + Move-In vs Move-Out Deposit Baseline + Gemini Vision Check */}
            <div className="border-t border-[#DEDBD2] pt-3 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[#111C1B]">
                  Move-In / Move-Out photo proof (Deposit dispute protection)
                </div>
                <label className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded border border-[#DEDBD2] bg-white px-2.5 py-1 font-medium text-[#0F4C4C] hover:bg-[#F7F6F2]">
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Attach room photo(s)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePhotoFiles}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="condition-stage-select" className="block text-[11px] text-[#4A5957] mb-1">
                    Condition proof stage
                  </label>
                  <select
                    id="condition-stage-select"
                    value={conditionStage}
                    onChange={(e) => setConditionStage(e.target.value as ConditionStage)}
                    className="min-h-[34px] w-full rounded border border-[#DEDBD2] bg-white px-2 py-1 text-xs text-[#111C1B]"
                  >
                    <option value="move_in">Move-In Baseline (Arrival proof)</option>
                    <option value="move_out">Move-Out Audit (Deposit check)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="baseline-comparison-note" className="block text-[11px] text-[#4A5957] mb-1">
                    Baseline / deposit comparison note
                  </label>
                  <input
                    id="baseline-comparison-note"
                    type="text"
                    maxLength={295}
                    value={baselineNote}
                    onChange={(e) => setBaselineNote(e.target.value)}
                    placeholder="e.g. Walls fresh, desk & 6A socket intact at arrival"
                    className="min-h-[34px] w-full rounded border border-[#DEDBD2] px-2.5 py-1 text-xs text-[#111C1B]"
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#4A5957]">
                Compressed room photos persist locally per room &amp; stage across reloads (≤4 photos).
                Only structured verdicts and comparison notes sync to Firestore.
              </p>

              {persistedPhotos.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {persistedPhotos.map((p, idx) => (
                      <div key={p.id} className="relative rounded border border-[#DEDBD2] overflow-hidden bg-[#F7F6F2]">
                        <img
                          src={p.dataUrl}
                          alt={`Room photo ${idx + 1} (${p.stage}): ${p.name}`}
                          className="h-20 w-full object-cover"
                        />
                        <span className="absolute left-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                          {p.stage === 'move_out' ? 'Move-Out' : 'Move-In'}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute right-1 top-1 rounded bg-black/65 p-0.5 text-white hover:bg-black"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-[#4A5957]">
                      <input
                        type="checkbox"
                        checked={aiConsentGranted}
                        onChange={(e) => setAiConsentGranted(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#0F4C4C]"
                      />
                      <span>Allow Gemini Vision inspection</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleInspectPhotoClick}
                      disabled={photoInspecting}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md bg-[#0F4C4C] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{photoInspecting ? 'Inspecting photo…' : 'Inspect photo with Gemini AI'}</span>
                    </button>
                  </div>
                </div>
              )}

              {photoInspectError && (
                <p role="alert" className="rounded border border-[#B45309]/40 bg-amber-50 px-2.5 py-1.5 text-[11px] text-[#92400E]">
                  {photoInspectError}
                </p>
              )}

              {photoResult && (
                <div
                  className={`rounded-md border p-3 space-y-1.5 ${
                    photoResult.verdict === 'pass'
                      ? 'border-[#15803D]/40 bg-emerald-50/50'
                      : photoResult.verdict === 'issues_found'
                      ? 'border-[#B91C1C]/40 bg-red-50/50'
                      : 'border-[#B45309]/40 bg-amber-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span className="text-[#111C1B]">
                      AI Photo Inspection:{' '}
                      {photoResult.verdict === 'pass'
                        ? 'Pass'
                        : photoResult.verdict === 'issues_found'
                        ? 'Issues found'
                        : 'Unclear photo'}
                    </span>
                    {photoResult.modelId && (
                      <span className="font-mono-num text-[10px] text-[#4A5957]">{photoResult.modelId}</span>
                    )}
                  </div>
                  <p className="text-[#111C1B]">{photoResult.summary}</p>
                  {photoResult.safetyFlags.length > 0 && (
                    <div className="text-[#B91C1C]">
                      <strong>Safety flags:</strong> {photoResult.safetyFlags.join('; ')}
                    </div>
                  )}
                  {photoResult.detectedIssues.length > 0 && (
                    <div className="text-[#92400E]">
                      <strong>Issues:</strong> {photoResult.detectedIssues.join('; ')}
                    </div>
                  )}
                  {photoResult.observedReadyItems.length > 0 && (
                    <div className="text-[#15803D]">
                      <strong>Ready items:</strong> {photoResult.observedReadyItems.join('; ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Record explicit Provider Confirmation */}
            <form
              onSubmit={handleRecordConfirmation}
              className="border-t border-[#DEDBD2] pt-3 space-y-2"
            >
              <div className="text-xs font-semibold text-[#111C1B]">
                Record explicit provider slot confirmation
              </div>
              <select
                aria-label="Task for provider confirmation"
                value={confTaskId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setConfTaskId(nextId);
                  const chosen = roomTasks.find((t) => t.id === nextId);
                  if (chosen && chosen.assignedVendor) {
                    setConfVendorName(chosen.assignedVendor);
                  }
                }}
                className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] bg-white px-2.5 py-1 text-xs"
              >
                <option value="">Select task…</option>
                {roomTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label="Provider name"
                  placeholder="Vendor name"
                  value={confVendorName}
                  onChange={(e) => setConfVendorName(e.target.value)}
                  className="min-h-[36px] rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs"
                />
                <input
                  type="datetime-local"
                  aria-label="Confirmed arrival date and time (IST)"
                  value={toDateTimeLocalValue(confSlotIso) || confSlotIso}
                  onChange={(e) => setConfSlotIso(e.target.value)}
                  className="font-mono-num min-h-[36px] rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Confirmation channel"
                  value={confChannel}
                  onChange={(e) =>
                    setConfChannel(e.target.value as ProviderConfirmation['evidenceChannel'])
                  }
                  className="min-h-[36px] flex-1 rounded-md border border-[#DEDBD2] bg-white px-2.5 py-1 text-xs"
                >
                  <option value="call_verified">Call verified</option>
                  <option value="manual_whatsapp_copy">Manual WhatsApp copy</option>
                  <option value="on_site">On-site check</option>
                </select>
                <button
                  type="submit"
                  className="min-h-[36px] rounded-md border border-[#DEDBD2] px-3 py-1 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
                >
                  Save confirmation
                </button>
              </div>
              {confMsg && (
                <p className="text-xs font-medium text-[#0F4C4C]" role="status">
                  {confMsg}
                </p>
              )}
            </form>

            {/* Owner Attestation & Handover Evidence */}
            <div className="border-t border-[#DEDBD2] pt-3 space-y-2.5 text-xs">
              <div className="font-semibold text-[#111C1B]">
                Owner attestation &amp; guest acknowledgement
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={evSafety}
                  onChange={(e) => setEvSafety(e.target.checked)}
                  className="h-4 w-4 accent-[#0F4C4C]"
                />
                <span>Safety &amp; electrical inspection acknowledged</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={evOwner}
                  onChange={(e) => setEvOwner(e.target.checked)}
                  className="h-4 w-4 accent-[#0F4C4C]"
                />
                <span>Owner physical handover attestation signed</span>
              </label>
              <div className="flex items-center gap-2">
                <label htmlFor="guest-ack-select" className="text-[#4A5957]">
                  Guest ack (optional):
                </label>
                <select
                  id="guest-ack-select"
                  value={evGuest}
                  onChange={(e) =>
                    setEvGuest(e.target.value as HandoverEvidence['guestAckState'])
                  }
                  className="min-h-[34px] rounded border border-[#DEDBD2] bg-white px-2 py-1 text-xs"
                >
                  <option value="not_requested">Not requested</option>
                  <option value="pending">Pending</option>
                  <option value="acknowledged">Acknowledged</option>
                </select>
              </div>
              <input
                type="text"
                aria-label="Handover evidence note"
                placeholder="Evidence note (e.g. switchboard tested, keys tagged)"
                value={evNote}
                onChange={(e) => setEvNote(e.target.value)}
                className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveHandover(false)}
                  className="min-h-[36px] rounded-md border border-[#DEDBD2] px-3 py-1.5 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
                >
                  Save checklist
                </button>
                <button
                  type="button"
                  disabled={
                    !handoverSignAuth.allowed ||
                    !evSafety ||
                    !evOwner ||
                    !handoverReport.checks.slice(0, 3).every((c) => c.passed)
                  }
                  onClick={() => handleSaveHandover(true)}
                  className="min-h-[36px] rounded-md bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-40"
                >
                  Sign verified physical handover
                </button>
              </div>
              {!handoverSignAuth.allowed && (
                <p className="text-xs font-medium text-[#B45309]" role="status">
                  {handoverSignAuth.reason}
                </p>
              )}
              {evMsg && (
                <p className="text-xs font-medium text-[#15803D]" role="status">
                  {evMsg}
                </p>
              )}

              {/* 1-Tap WhatsApp Move-In Proof Card */}
              <div className="mt-3 rounded-md border border-[#0F4C4C]/30 bg-[#F0F5F4]/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#0F4C4C]">
                    Shareable Move-In Proof Card (Resident / Parent)
                  </span>
                </div>
                <p className="text-[11px] text-[#4A5957]">
                  Gives incoming students/parents transparent check-in status and move-in condition proof.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(proofCardText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md bg-[#0F4C4C] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0A3838]"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Share Move-In Proof (WhatsApp)</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyProofCard}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#DEDBD2] bg-white px-3 py-1 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
                  >
                    {copiedProofCard ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                        <span>Copied proof card</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy proof card</span>
                      </>
                    )}
                  </button>
                </div>
                <details className="text-[11px] text-[#4A5957]">
                  <summary className="cursor-pointer hover:text-[#111C1B]">Preview WhatsApp card text</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap rounded border border-[#DEDBD2] bg-white p-2 font-sans text-[11px] text-[#111C1B]">
                    {proofCardText}
                  </pre>
                </details>
              </div>
            </div>
          </section>
          )}

          {/* Provenance Audit Trail */}
          {(sectionFocus === 'all' || sectionFocus === 'audit') && (
          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Audit trail (with provenance)
              </h2>
              <ShieldAlert className="h-4 w-4 text-[#4A5957]" aria-hidden="true" />
            </div>
            {roomAudit.length === 0 ? (
              <p className="text-xs text-[#4A5957]">No audit events recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[#DEDBD2] text-xs max-h-80 overflow-y-auto">
                {roomAudit.map((evt) => (
                  <li key={evt.id} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-[#4A5957]">
                      <span>
                        <strong className="text-[#111C1B]">{evt.actorLabel}</strong> ·{' '}
                        {evt.provenance.replace(/_/g, ' ')} ·{' '}
                        {evt.hasSupportingEvidence ? 'with evidence' : 'no external proof'}
                      </span>
                      <span className="font-mono-num text-[11px] shrink-0">
                        {formatIstDisplay(evt.createdAt)}
                      </span>
                    </div>
                    <p className="text-[#111C1B]">{evt.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
