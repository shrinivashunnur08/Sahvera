import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOperatorDecision,
  calculateCandidateImpact,
  calculateOperatorEconomics,
  detectCycle,
  evaluateHandoverReadiness,
  interpretVendorMessageOffline,
  validateDependencyAdd,
} from '../core/engine';
import { createInitialDemoDataset } from '../core/demoSeed';

test('1. Two-hour explicit English delay extracts 120 minutes offline and is never labeled Gemini', () => {
  const interp = interpretVendorMessageOffline({
    id: 'i1',
    orgId: 'demo-org',
    ownerUid: 'u1',
    roomId: 'demo-room',
    vendorUpdateId: 'v1',
    rawText: 'Electrical inspection is delayed by 2 hours. I can arrive at 11 AM instead. Please confirm.',
  });

  assert.equal(interp.source, 'offline_rules');
  assert.equal(interp.engineLabel, 'Offline rules — NOT Gemini');
  assert.equal(interp.eventKind, 'delay');
  assert.equal(interp.reportedDelayMinutes, 120);
  assert.equal(interp.providerCommitment, 'tentative');
});

test('2. Hinglish message "2 ghante late" is tentative delay and asks for date/time', () => {
  const interp = interpretVendorMessageOffline({
    id: 'i2',
    orgId: 'org-1',
    ownerUid: 'u1',
    roomId: 'r1',
    vendorUpdateId: 'v2',
    rawText: 'Bhai, plumber 2 ghante late hoga',
  });

  assert.equal(interp.source, 'offline_rules');
  assert.equal(interp.eventKind, 'delay');
  assert.equal(interp.reportedDelayMinutes, 120);
  assert.equal(interp.providerCommitment, 'tentative');
  assert.equal(interp.newDatetimeIso, null);
  assert.ok(interp.missingFacts.some((m) => /date|time/i.test(m)));
});

test('3. "11 AM" without a full calendar date is never silently converted to a timestamp', () => {
  const interp = interpretVendorMessageOffline({
    id: 'i3',
    orgId: 'demo-org',
    ownerUid: 'u1',
    roomId: 'demo-room',
    vendorUpdateId: 'v3',
    rawText: 'I can arrive at 11 AM instead.',
  });

  assert.equal(interp.newDatetimeIso, null);
  assert.ok(interp.missingFacts.some((m) => m.includes('11 AM') && /date/i.test(m)));
});

test('4. Cancellation and price change never become confirmed approvals automatically', () => {
  const demo = createInitialDemoDataset();
  const room = demo.rooms[0];

  const cancelInterp = interpretVendorMessageOffline({
    id: 'ic1',
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    vendorUpdateId: 'vc1',
    rawText: 'Sorry sir, today I cannot come, cancel my slot.',
  });
  assert.equal(cancelInterp.eventKind, 'cancellation');
  assert.notEqual(cancelInterp.providerCommitment, 'confirmed');

  const priceInterp = interpretVendorMessageOffline({
    id: 'ip1',
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    vendorUpdateId: 'vp1',
    rawText: 'Switchboard replacement needs extra Rs 650 charge.',
  });
  assert.equal(priceInterp.eventKind, 'price_change');
  assert.equal(priceInterp.costDeltaInr, 650);
  assert.notEqual(priceInterp.providerCommitment, 'confirmed');
});

test('5. Unclear and contradictory statements trigger manual clarification', () => {
  const interp = interpretVendorMessageOffline({
    id: 'iu1',
    orgId: 'demo-org',
    ownerUid: 'u1',
    roomId: 'demo-room',
    vendorUpdateId: 'vu1',
    rawText: 'Maybe tomorrow afternoon or cancel if rain continues, dekhte hain.',
  });

  assert.equal(interp.eventKind, 'unclear');
  assert.equal(interp.providerCommitment, 'unknown');
  assert.ok(interp.missingFacts.length > 0);
});

test('6. Downstream task is flagged at risk while independent Wi-Fi task remains unchanged', () => {
  const demo = createInitialDemoDataset();
  const room = demo.rooms[0];
  const interp = interpretVendorMessageOffline({
    id: 'id1',
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    vendorUpdateId: 'vd1',
    rawText: 'Electrical inspection is delayed by 2 hours. I can arrive at 11 AM instead. Please confirm.',
  });

  const proposal = calculateCandidateImpact({
    proposalId: 'prop1',
    room,
    tasks: demo.tasks,
    dependencies: demo.dependencies,
    sourceTaskId: 'demo-task-elec',
    interpretation: interp,
  });

  const cleanImpact = proposal.affectedTasks.find((a) => a.taskId === 'demo-task-clean');
  const inspectImpact = proposal.affectedTasks.find((a) => a.taskId === 'demo-task-inspect');
  const wifiImpact = proposal.affectedTasks.find((a) => a.taskId === 'demo-task-wifi');

  assert.equal(cleanImpact?.impactKind, 'downstream_at_risk');
  assert.equal(inspectImpact?.impactKind, 'downstream_at_risk');
  assert.equal(wifiImpact?.impactKind, 'independent_unchanged');
  assert.equal(proposal.status, 'pending_review');
});

test('7. Dependency cycles and cross-property task links are rejected', () => {
  const demo = createInitialDemoDataset();
  const cycleRes = validateDependencyAdd({
    tasks: demo.tasks,
    dependencies: demo.dependencies,
    fromTaskId: 'demo-task-inspect',
    toTaskId: 'demo-task-paint',
  });
  assert.equal(cycleRes.ok, false);
  assert.ok(cycleRes.reason && /cycle/i.test(cycleRes.reason));

  const otherPropertyTask = {
    ...demo.tasks[0],
    id: 'other-prop-task',
    propertyId: 'other-prop-999',
  };
  const crossPropRes = validateDependencyAdd({
    tasks: [...demo.tasks, otherPropertyTask],
    dependencies: demo.dependencies,
    fromTaskId: 'demo-task-paint',
    toTaskId: 'other-prop-task',
  });
  assert.equal(crossPropRes.ok, false);
  assert.ok(crossPropRes.reason && /cross-property/i.test(crossPropRes.reason));
  assert.equal(detectCycle(demo.tasks, demo.dependencies), false);
});

test('8. Plain vendor message does not mutate booked/approved task times', () => {
  const demo = createInitialDemoDataset();
  const room = demo.rooms[0];
  const beforeElecStart = demo.tasks.find((t) => t.id === 'demo-task-elec')?.scheduledStartIso;

  const interp = interpretVendorMessageOffline({
    id: 'im1',
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    vendorUpdateId: 'vm1',
    rawText: 'Electrical inspection is delayed by 2 hours. I can arrive at 11 AM instead.',
  });
  calculateCandidateImpact({
    proposalId: 'prop-immutable',
    room,
    tasks: demo.tasks,
    dependencies: demo.dependencies,
    sourceTaskId: 'demo-task-elec',
    interpretation: interp,
  });

  const afterElecStart = demo.tasks.find((t) => t.id === 'demo-task-elec')?.scheduledStartIso;
  assert.equal(beforeElecStart, afterElecStart);
});

test('9. Duplicate approval submissions are blocked by idempotency key', () => {
  const demo = createInitialDemoDataset();
  const room = demo.rooms[0];
  const interp = interpretVendorMessageOffline({
    id: 'i-idem',
    orgId: room.orgId,
    ownerUid: room.ownerUid,
    roomId: room.id,
    vendorUpdateId: 'v-idem',
    rawText: 'Delayed by 2 hours',
  });
  const proposal = calculateCandidateImpact({
    proposalId: 'prop-idem',
    room,
    tasks: demo.tasks,
    dependencies: demo.dependencies,
    sourceTaskId: 'demo-task-elec',
    interpretation: interp,
  });

  const first = applyOperatorDecision({
    approvalId: 'apv-1',
    idempotencyKey: 'key_unique_12345',
    existingApprovals: [],
    proposal,
    interpretation: interp,
    decision: 'approve_risk_flag',
    rationale: 'Flagging downstream tasks while awaiting confirmation.',
    approvedByUid: 'owner-1',
    room,
    tasks: demo.tasks,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const duplicate = applyOperatorDecision({
    approvalId: 'apv-2',
    idempotencyKey: 'key_unique_12345',
    existingApprovals: [first.approval],
    proposal: first.updatedProposal,
    interpretation: interp,
    decision: 'approve_risk_flag',
    rationale: 'Duplicate click',
    approvedByUid: 'owner-1',
    room: first.updatedRoom,
    tasks: first.updatedTasks,
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.duplicate, true);
  }
});

test('10. Provider confirmation, owner approval, and physical handover evidence remain distinct', () => {
  const demo = createInitialDemoDataset();
  const blockedReport = evaluateHandoverReadiness({
    tasks: demo.tasks,
    confirmations: demo.providerConfirmations,
    followUps: [],
    evidence: demo.handoverEvidence[0],
  });
  assert.equal(blockedReport.canMarkVerifiedHandover, false);
  assert.notEqual(blockedReport.stage, 'verified_physical_handover');

  // Even if tasks are marked completed, without provider confirmations and safety/owner attestation handover stays blocked
  const completedTasks = demo.tasks.map((t) => ({ ...t, status: 'completed' as const }));
  const reviewOnly = evaluateHandoverReadiness({
    tasks: completedTasks,
    confirmations: demo.providerConfirmations,
    followUps: [],
    evidence: demo.handoverEvidence[0],
  });
  assert.equal(reviewOnly.stage, 'ready_for_owner_review');
  assert.equal(reviewOnly.canMarkVerifiedHandover, false);
});

test('11. Operator economics leaves admin time value at 0 when no measured baseline exists', () => {
  const out = calculateOperatorEconomics({
    monthlyRentInr: 12000,
    turnoverEventsPerMonth: 2,
    unreadyDaysPerTurnover: 1.5,
    avoidableCoordinationHours: 10,
    hourlyAdminValueInr: 300,
    hasMeasuredBaseline: false,
    proposedMonthlyFeeInr: 999,
    marginalAiCloudCostInr: 80,
    marginalSupportMinutes: 20,
    supportHourlyCostInr: 300,
  });

  assert.equal(out.potentialRentExposureInr, 1200);
  assert.equal(out.adminTimeValueInr, 0);
  assert.equal(out.operatorNetHypothesisInr, 201);
});
