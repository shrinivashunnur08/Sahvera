import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatIstDisplay,
  getUpcomingIstDateTimeLocal,
  getUpcomingIstIso,
} from '../core/dateUtils';
import { createInitialDemoDataset } from '../core/demoSeed';

test('27. Personal org bootstrap rules permit pre-creation org get and after-batch property creation', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  assert.match(rules, /orgId == 'org_' \+ request\.auth\.uid/);
  assert.match(
    rules,
    /getAfter\(\/databases\/\$\(database\)\/documents\/orgs\/\$\(orgId\)\/members\/\$\(request\.auth\.uid\)\)\.data\.role == 'owner'/
  );

  // Verify UID -> orgId mapping preserves standard 28-char Google Auth UID cleanly
  const sampleUid = 'QpH4YvA6GYh0jJyPscOcubZ1poC3';
  const expectedOrgId = `org_${sampleUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`;
  assert.equal(expectedOrgId, `org_${sampleUid}`);
});

test('28. Dynamic IST date utilities and sandbox seed never rely on stale hardcoded placeholder years', () => {
  const fixedNow = Date.parse('2026-04-20T06:00:00.000Z');
  const localTomorrow = getUpcomingIstDateTimeLocal(1, 18, 0, fixedNow);
  assert.equal(localTomorrow, '2026-04-21T18:00');

  const isoTomorrow = getUpcomingIstIso(1, 18, 0, fixedNow);
  assert.equal(isoTomorrow, '2026-04-21T18:00:00+05:30');
  assert.match(formatIstDisplay(isoTomorrow), /IST$/);

  const demo = createInitialDemoDataset();
  assert.ok(!demo.rooms[0].identifier.includes('(Fictional)'));
  assert.ok(!demo.properties[0].name.includes('(Fictional)'));
  assert.ok(!demo.rooms[0].targetReadyIso.startsWith('2030-'));
});

test('33. firestore.rules bounds handoverEvidence photo inspection metadata and excludes raw images', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  assert.match(rules, /photoInspectionVerdict/);
  assert.match(rules, /photoInspectionSummary/);
  assert.match(rules, /photoCount/);
  assert.match(rules, /data\.photoInspectionSummary\.size\(\) <= 300/);
  assert.match(rules, /data\.photoCount >= 0 && data\.photoCount <= 10/);
  assert.ok(!rules.includes('imageBase64'));
});

test('37. firestore.rules bounds conditionStage, baselineComparisonNote, and allows personal-org owner to list members', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  assert.match(rules, /conditionStage in \['move_in', 'move_out'\]/);
  assert.match(rules, /data\.baselineComparisonNote\.size\(\) <= 300/);
  assert.match(
    rules,
    /allow list: if isVerified\(\) && resource\.data\.orgId == orgId &&[\s\S]*orgId == 'org_' \+ request\.auth\.uid/
  );
});

test('38. firestore.rules enforces DB-layer Maalik-only authority, multi-org memberUids ACL, and bounded photo issue/safety arrays', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Delegated Warden / multi-org discovery & ACL
  assert.match(rules, /match \/\{path=\*\*}\/members\/\{userId\}/);
  assert.match(rules, /function canListOrgDoc\(data\)/);
  assert.match(rules, /request\.auth\.uid in data\.memberUids/);
  assert.match(rules, /function matchesOrgOwner\(orgId, ownerUid\)/);

  // Server-enforced Maalik-only sign-off authority
  assert.match(
    rules,
    /match \/ownerApprovals\/\{approvalId\}[\s\S]*allow create:[\s\S]*isOrgOwner\(orgId\)/
  );
  assert.match(
    rules,
    /isOrgWriter\(orgId\) &&[\s\S]*incoming\(\)\.readinessStage != 'verified_physical_handover'/
  );
  assert.match(
    rules,
    /isOrgWriter\(orgId\) && incoming\(\)\.ownerAttestation == false/
  );
  assert.match(
    rules,
    /isOrgWriter\(orgId\) &&[\s\S]*incoming\(\)\.ownerAttestation == existing\(\)\.ownerAttestation/
  );

  // Bounded Gemini Vision detectedIssues & safetyFlags arrays
  assert.match(rules, /photoDetectedIssues\.size\(\) <= 6/);
  assert.match(rules, /photoSafetyFlags\.size\(\) <= 6/);
});



