import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  AuditEvent,
  FollowUp,
  HandoverEvidence,
  ImpactProposal,
  Interpretation,
  Membership,
  OperatorRole,
  Organization,
  OwnerApproval,
  PilotFeedback,
  Property,
  ProviderConfirmation,
  Room,
  Task,
  TaskDependency,
  VendorUpdate,
  WorkspaceDataset,
} from '../core/types';

export interface AccessibleOrgSummary {
  orgId: string;
  orgName: string;
  ownerUid: string;
  role: OperatorRole;
  displayName: string;
}

const MUTABLE_SUBCOLLECTIONS = [
  'properties',
  'rooms',
  'tasks',
  'impactProposals',
  'followUps',
  'handoverEvidence',
] as const;

const MEMBER_ONLY_SUBCOLLECTIONS = [
  'dependencies',
  'vendorUpdates',
  'interpretations',
  'providerConfirmations',
  'ownerApprovals',
  'auditEvents',
  'pilotFeedback',
] as const;

function toIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function cleanRecord<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function getOrgIdForUser(uid: string): string {
  return `org_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}`;
}

async function queryOrgSubcollection<T>(
  orgId: string,
  orgOwnerUid: string,
  currentUid: string,
  subcollection: string
): Promise<T[]> {
  const path = `orgs/${orgId}/${subcollection}`;
  try {
    const q =
      orgOwnerUid === currentUid
        ? query(collection(db, path), where('ownerUid', '==', currentUid))
        : query(collection(db, path), where('memberUids', 'array-contains', currentUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        ...data,
        id: d.id,
        createdAt: toIso(data.createdAt),
        updatedAt: data.updatedAt ? toIso(data.updatedAt) : undefined,
      } as T;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function listAccessibleOrgs(user: User): Promise<AccessibleOrgSummary[]> {
  const personalOrgId = getOrgIdForUser(user.uid);
  const byOrgId = new Map<string, { name: string; ownerUid: string }>();

  try {
    const [ownedSnap, sharedSnap] = await Promise.all([
      getDocs(query(collection(db, 'orgs'), where('ownerUid', '==', user.uid))),
      getDocs(query(collection(db, 'orgs'), where('memberUids', 'array-contains', user.uid))),
    ]);

    for (const d of [...ownedSnap.docs, ...sharedSnap.docs]) {
      const data = d.data() as Record<string, unknown>;
      byOrgId.set(d.id, {
        name: String(data.name ?? 'PG Workspace'),
        ownerUid: String(data.ownerUid ?? user.uid),
      });
    }
  } catch {
    // Fallback to personal org lookup if org listing fails transiently
  }

  if (!byOrgId.has(personalOrgId)) {
    try {
      const personalSnap = await getDoc(doc(db, `orgs/${personalOrgId}`));
      if (personalSnap.exists()) {
        const data = personalSnap.data() as Record<string, unknown>;
        byOrgId.set(personalOrgId, {
          name: String(data.name ?? 'My PG Workspace'),
          ownerUid: String(data.ownerUid ?? user.uid),
        });
      }
    } catch {
      // Ignore if personal org has not been created yet
    }
  }

  const summaries: AccessibleOrgSummary[] = [];
  for (const [orgId, meta] of byOrgId.entries()) {
    let role: OperatorRole = meta.ownerUid === user.uid ? 'owner' : 'viewer';
    let displayName = user.displayName || user.email || 'Operator';
    try {
      const memSnap = await getDoc(doc(db, `orgs/${orgId}/members/${user.uid}`));
      if (memSnap.exists()) {
        const mem = memSnap.data() as Record<string, unknown>;
        const rawRole = String(mem.role ?? role);
        if (rawRole === 'owner' || rawRole === 'manager' || rawRole === 'viewer') {
          role = rawRole;
        }
        displayName = String(mem.displayName ?? displayName);
      } else if (meta.ownerUid !== user.uid) {
        continue;
      }
    } catch {
      if (meta.ownerUid !== user.uid) continue;
    }

    summaries.push({
      orgId,
      orgName: meta.name,
      ownerUid: meta.ownerUid,
      role,
      displayName,
    });
  }

  summaries.sort((a, b) => {
    if (a.orgId === personalOrgId) return -1;
    if (b.orgId === personalOrgId) return 1;
    return a.orgName.localeCompare(b.orgName);
  });

  return summaries;
}

const inFlightBootstrap = new Map<string, Promise<WorkspaceDataset>>();

export async function ensureUserWorkspace(params: {
  user: User;
  targetOrgId?: string;
  propertyName?: string;
  city?: string;
  locality?: string;
  bedCapacity?: number;
}): Promise<WorkspaceDataset> {
  const cacheKey = `${params.user.uid}:${params.targetOrgId ?? 'personal'}`;
  const existingPromise = inFlightBootstrap.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const run = (async () => {
    const {
      user,
      targetOrgId,
      propertyName = 'My PG Property',
      city = 'City',
      locality = 'Main Locality',
      bedCapacity = 24,
    } = params;
    const personalOrgId = getOrgIdForUser(user.uid);
    const orgPath = `orgs/${personalOrgId}`;
    const memberPath = `orgs/${personalOrgId}/members/${user.uid}`;

    try {
      const [orgSnap, memberSnap] = await Promise.all([
        getDoc(doc(db, orgPath)),
        getDoc(doc(db, memberPath)),
      ]);

      if (!orgSnap.exists() || !memberSnap.exists()) {
        const batch = writeBatch(db);
        if (!orgSnap.exists()) {
          batch.set(doc(db, orgPath), {
            id: personalOrgId,
            name: `${(user.displayName || user.email?.split('@')[0] || 'Operator').slice(0, 80)} Workspace`,
            ownerUid: user.uid,
            timezone: 'Asia/Kolkata',
            aiConsentEnabled: false,
            memberUids: [user.uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (!memberSnap.exists()) {
          batch.set(doc(db, memberPath), {
            orgId: personalOrgId,
            userId: user.uid,
            role: 'owner',
            displayName: (user.displayName || user.email || 'Owner').slice(0, 120),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } else {
        const rawOrg = orgSnap.data() as Record<string, unknown>;
        if (!Array.isArray(rawOrg.memberUids) || !rawOrg.memberUids.includes(user.uid)) {
          const existingList = Array.isArray(rawOrg.memberUids)
            ? rawOrg.memberUids.map(String)
            : [];
          const nextList = Array.from(new Set([user.uid, ...existingList])).slice(0, 20);
          await updateDoc(doc(db, orgPath), {
            memberUids: nextList,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, orgPath);
    }

    const personalLoaded = await loadRealWorkspace(user.uid, personalOrgId);
    if (personalLoaded.properties.length === 0) {
      const propId = `prop_${personalOrgId.slice(4, 16)}_1`;
      await createFirestoreDoc(personalOrgId, 'properties', propId, {
        id: propId,
        orgId: personalOrgId,
        ownerUid: user.uid,
        memberUids: personalLoaded.org.memberUids ?? [user.uid],
        name: propertyName,
        city,
        locality,
        bedCapacity,
      });
    }

    if (targetOrgId && targetOrgId !== personalOrgId) {
      try {
        return await loadRealWorkspace(user.uid, targetOrgId);
      } catch {
        return loadRealWorkspace(user.uid, personalOrgId);
      }
    }

    return loadRealWorkspace(user.uid, personalOrgId);
  })();

  inFlightBootstrap.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inFlightBootstrap.delete(cacheKey);
  }
}

export async function loadRealWorkspace(
  currentUid: string,
  targetOrgId?: string
): Promise<WorkspaceDataset> {
  const orgId = targetOrgId || getOrgIdForUser(currentUid);
  const orgPath = `orgs/${orgId}`;

  let orgData: Organization;
  try {
    const orgSnap = await getDoc(doc(db, orgPath));
    if (!orgSnap.exists()) {
      throw new Error('Organization not found for signed-in user.');
    }
    const raw = orgSnap.data() as Record<string, unknown>;
    const ownerUid = String(raw.ownerUid ?? currentUid);
    const memberUids = Array.isArray(raw.memberUids)
      ? Array.from(new Set([ownerUid, ...raw.memberUids.map(String)])).slice(0, 20)
      : [ownerUid];
    orgData = {
      id: orgId,
      name: String(raw.name ?? 'My PG Workspace'),
      ownerUid,
      timezone: String(raw.timezone ?? 'Asia/Kolkata'),
      aiConsentEnabled: Boolean(raw.aiConsentEnabled),
      memberUids,
      createdAt: toIso(raw.createdAt),
      updatedAt: toIso(raw.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, orgPath);
  }

  const orgOwnerUid = orgData.ownerUid;

  const [
    properties,
    rooms,
    tasks,
    dependencies,
    vendorUpdates,
    interpretations,
    impactProposals,
    providerConfirmations,
    ownerApprovals,
    followUps,
    handoverEvidence,
    auditEvents,
    pilotFeedback,
  ] = await Promise.all([
    queryOrgSubcollection<Property>(orgId, orgOwnerUid, currentUid, 'properties'),
    queryOrgSubcollection<Room>(orgId, orgOwnerUid, currentUid, 'rooms'),
    queryOrgSubcollection<Task>(orgId, orgOwnerUid, currentUid, 'tasks'),
    queryOrgSubcollection<TaskDependency>(orgId, orgOwnerUid, currentUid, 'dependencies'),
    queryOrgSubcollection<VendorUpdate>(orgId, orgOwnerUid, currentUid, 'vendorUpdates'),
    queryOrgSubcollection<Interpretation>(orgId, orgOwnerUid, currentUid, 'interpretations'),
    queryOrgSubcollection<ImpactProposal>(orgId, orgOwnerUid, currentUid, 'impactProposals'),
    queryOrgSubcollection<ProviderConfirmation>(
      orgId,
      orgOwnerUid,
      currentUid,
      'providerConfirmations'
    ),
    queryOrgSubcollection<OwnerApproval>(orgId, orgOwnerUid, currentUid, 'ownerApprovals'),
    queryOrgSubcollection<FollowUp>(orgId, orgOwnerUid, currentUid, 'followUps'),
    queryOrgSubcollection<HandoverEvidence>(orgId, orgOwnerUid, currentUid, 'handoverEvidence'),
    queryOrgSubcollection<AuditEvent>(orgId, orgOwnerUid, currentUid, 'auditEvents'),
    queryOrgSubcollection<PilotFeedback>(orgId, orgOwnerUid, currentUid, 'pilotFeedback'),
  ]);

  return {
    org: orgData,
    properties,
    rooms,
    tasks,
    dependencies,
    vendorUpdates,
    interpretations,
    impactProposals,
    providerConfirmations,
    ownerApprovals,
    followUps,
    handoverEvidence,
    auditEvents,
    pilotFeedback,
  };
}

export async function createFirestoreDoc(
  orgId: string,
  subcollection: string,
  docId: string,
  payload: Record<string, unknown>,
  withUpdatedAt = true
): Promise<void> {
  const path = `orgs/${orgId}/${subcollection}/${docId}`;
  try {
    const cleaned = cleanRecord(payload);
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    await setDoc(doc(db, path), {
      ...cleaned,
      createdAt: serverTimestamp(),
      ...(withUpdatedAt ? { updatedAt: serverTimestamp() } : {}),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreDoc(
  orgId: string,
  subcollection: string,
  docId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const path = `orgs/${orgId}/${subcollection}/${docId}`;
  try {
    const cleaned = cleanRecord(patch);
    delete cleaned.updatedAt;
    await updateDoc(doc(db, path), {
      ...cleaned,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateOrganizationAiConsent(
  orgId: string,
  aiConsentEnabled: boolean
): Promise<void> {
  const path = `orgs/${orgId}`;
  try {
    await updateDoc(doc(db, path), {
      aiConsentEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreDoc(
  orgId: string,
  subcollection: string,
  docId: string
): Promise<void> {
  const path = `orgs/${orgId}/${subcollection}/${docId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function listOrgMembers(
  orgId: string,
  currentUid?: string
): Promise<Membership[]> {
  const path = `orgs/${orgId}/members`;
  if (currentUid && orgId !== getOrgIdForUser(currentUid)) {
    try {
      const singleSnap = await getDoc(doc(db, `${path}/${currentUid}`));
      if (!singleSnap.exists()) return [];
      const data = singleSnap.data() as Record<string, unknown>;
      return [
        {
          orgId: String(data.orgId ?? orgId),
          userId: String(data.userId ?? singleSnap.id),
          role: (data.role as Membership['role']) ?? 'viewer',
          displayName: String(data.displayName ?? 'Team Member'),
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        },
      ];
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${path}/${currentUid}`);
    }
  }

  try {
    const q = query(collection(db, path), where('orgId', '==', orgId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        orgId: String(data.orgId ?? orgId),
        userId: String(data.userId ?? d.id),
        role: (data.role as Membership['role']) ?? 'viewer',
        displayName: String(data.displayName ?? 'Team Member'),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function syncOrgMemberUids(
  orgId: string,
  ownerUid: string
): Promise<string[]> {
  const members = await listOrgMembers(orgId, ownerUid);
  const nextMemberUids = Array.from(
    new Set([ownerUid, ...members.map((m) => m.userId)])
  ).slice(0, 20);

  await updateDoc(doc(db, `orgs/${orgId}`), {
    memberUids: nextMemberUids,
    updatedAt: serverTimestamp(),
  });

  const updates: Array<{
    sub: string;
    id: string;
    withUpdatedAt: boolean;
  }> = [];

  for (const sub of MUTABLE_SUBCOLLECTIONS) {
    const snap = await getDocs(
      query(collection(db, `orgs/${orgId}/${sub}`), where('ownerUid', '==', ownerUid))
    );
    for (const d of snap.docs) {
      updates.push({ sub, id: d.id, withUpdatedAt: true });
    }
  }

  for (const sub of MEMBER_ONLY_SUBCOLLECTIONS) {
    const snap = await getDocs(
      query(collection(db, `orgs/${orgId}/${sub}`), where('ownerUid', '==', ownerUid))
    );
    for (const d of snap.docs) {
      updates.push({ sub, id: d.id, withUpdatedAt: false });
    }
  }

  for (let i = 0; i < updates.length; i += 350) {
    const batch = writeBatch(db);
    for (const item of updates.slice(i, i + 350)) {
      batch.update(doc(db, `orgs/${orgId}/${item.sub}/${item.id}`), {
        memberUids: nextMemberUids,
        ...(item.withUpdatedAt ? { updatedAt: serverTimestamp() } : {}),
      });
    }
    await batch.commit();
  }

  return nextMemberUids;
}

export async function upsertOrgMember(params: {
  orgId: string;
  ownerUid: string;
  userId: string;
  role: 'manager' | 'viewer';
  displayName: string;
}): Promise<string[]> {
  const path = `orgs/${params.orgId}/members/${params.userId}`;
  try {
    const existing = await getDoc(doc(db, path));
    if (existing.exists()) {
      await updateDoc(doc(db, path), {
        role: params.role,
        displayName: params.displayName.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, path), {
        orgId: params.orgId,
        userId: params.userId,
        role: params.role,
        displayName: params.displayName.slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return await syncOrgMemberUids(params.orgId, params.ownerUid);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeOrgMember(
  orgId: string,
  ownerUid: string,
  userId: string
): Promise<string[]> {
  await deleteFirestoreDoc(orgId, 'members', userId);
  return syncOrgMemberUids(orgId, ownerUid);
}

export async function purgeRealOrgRecords(orgId: string, uid: string): Promise<void> {
  const subcollections = [
    'pilotFeedback',
    'handoverEvidence',
    'followUps',
    'ownerApprovals',
    'providerConfirmations',
    'impactProposals',
    'interpretations',
    'vendorUpdates',
    'dependencies',
    'tasks',
    'rooms',
  ];
  for (const sub of subcollections) {
    const docs = await queryOrgSubcollection<{ id: string }>(orgId, uid, uid, sub);
    for (const item of docs) {
      await deleteFirestoreDoc(orgId, sub, item.id);
    }
  }
}
