import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateGeminiExtraction } from '../core/engine';
import { createInitialDemoDataset } from '../core/demoSeed';
import {
  classifyGeminiError,
  runGeminiAudioUnderstanding,
  runGeminiTextExtraction,
} from '../server/geminiAdapter';
import { assertTenantBoundary } from '../server/authGuard';

test('12. Gemini structured output is semantically validated and strips hallucinated dates', () => {
  const validPayload = {
    event_kind: 'delay',
    original_language: 'English',
    summary: 'Electrician delayed by 2 hours, proposed 11 AM without date.',
    evidence_spans: ['delayed by 2 hours', '11 AM'],
    reported_delay_minutes: 120,
    new_datetime_iso: '2026-11-15T11:00:00+05:30', // Model hallucinated date despite original message lacking calendar date!
    cost_delta_inr: null,
    provider_commitment: 'tentative',
    missing_facts: ['Calendar date missing'],
    uncertainty_reason: '11 AM lacks full date',
  };

  const checked = validateGeminiExtraction(
    validPayload,
    'Electrical inspection is delayed by 2 hours. I can arrive at 11 AM instead.'
  );
  assert.equal(checked.valid, true);
  if (checked.valid) {
    assert.equal(checked.data.new_datetime_iso, null);
    assert.ok(checked.data.missing_facts.some((f) => /stripped/i.test(f)));
  }

  // Malformed negative duration must be rejected
  const malformed = validateGeminiExtraction(
    {
      ...validPayload,
      reported_delay_minutes: -30,
    },
    'delayed'
  );
  assert.equal(malformed.valid, false);
});

test('13. Synthetic demo dataset isolation cannot touch real organization IDs', () => {
  const demo = createInitialDemoDataset();
  assert.ok(demo.org.id.startsWith('demo-'));
  assert.equal(demo.org.ownerUid, 'synthetic-demo-operator');

  const realOrgBoundary = assertTenantBoundary({
    authenticatedUid: 'real-user-uid-1',
    requestedOwnerUid: 'real-user-uid-1',
    requestedOrgId: demo.org.id,
    expectedOrgId: 'org_realuseruid1',
  });
  assert.equal(realOrgBoundary.ok, false);
});

test('14. Cross-tenant access attempts fail server-side tenant boundary checks', () => {
  const crossUser = assertTenantBoundary({
    authenticatedUid: 'attacker-uid-999',
    requestedOwnerUid: 'victim-uid-111',
    requestedOrgId: 'org_victim',
    expectedOrgId: 'org_victim',
  });
  assert.equal(crossUser.ok, false);
  if (!crossUser.ok) {
    assert.match(crossUser.reason, /Cross-tenant access denied/i);
  }
});

test('15. Gemini off / missing key / error falls back safely without claiming Real Gemini', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';

  const res = await runGeminiTextExtraction({
    rawText: 'Bhai 2 ghante late hoga',
    taskTitle: 'Electrical',
    timezone: 'Asia/Kolkata',
    propertyId: 'prop-test',
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.category, 'missing_or_invalid_key');
  }

  const quotaErr = classifyGeminiError(new Error('429 RESOURCE_EXHAUSTED quota exceeded'));
  assert.equal(quotaErr.category, 'quota_exceeded');
  assert.ok(!quotaErr.safeMessage.includes('AIza'));

  process.env.GEMINI_API_KEY = prevKey;
});

test('16. Voice/audio missing, unsupported, or oversized fails safely', async () => {
  const badMime = await runGeminiAudioUnderstanding({
    audioBase64: Buffer.from('fake-audio').toString('base64'),
    mimeType: 'application/pdf',
    taskTitle: 'Electrical',
    timezone: 'Asia/Kolkata',
    propertyId: 'prop-test',
  });
  assert.equal(badMime.ok, false);
  if (!badMime.ok) {
    assert.equal(badMime.category, 'invalid_request');
  }

  const oversized = await runGeminiAudioUnderstanding({
    audioBase64: Buffer.alloc(2 * 1024 * 1024 + 50).toString('base64'),
    mimeType: 'audio/mp3',
    taskTitle: 'Electrical',
    timezone: 'Asia/Kolkata',
    propertyId: 'prop-test',
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.category, 'invalid_request');
  }
});

test('17. Client source files never import @google/genai or access GEMINI_API_KEY', () => {
  const srcRoot = path.resolve(process.cwd(), 'src');
  const checkDirs = ['components', 'lib', 'core'];
  for (const dir of checkDirs) {
    const fullDir = path.join(srcRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of fs.readdirSync(fullDir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
      assert.ok(
        !/['"]@google\/genai['"]/.test(content),
        `${dir}/${file} must never import @google/genai on the client`
      );
      assert.ok(
        !content.includes('GEMINI_API_KEY'),
        `${dir}/${file} must never reference GEMINI_API_KEY on the client`
      );
    }
  }
});

test('18. Hardened firestore.rules contains global deny, verified email gate, and tenant checks', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.match(rules, /allow read, write: if false;/);
  assert.match(rules, /email_verified == true/);
  assert.match(rules, /isOrgMember\(orgId\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
});
