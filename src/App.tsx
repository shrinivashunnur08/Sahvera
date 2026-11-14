import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Building2, Languages, Pencil, Plus, RotateCcw, Shield } from 'lucide-react';
import {
  auth,
  signInWithGoogle,
  signOutUser,
} from './lib/firebase';
import {
  createFirestoreDoc,
  ensureUserWorkspace,
  listAccessibleOrgs,
  listOrgMembers,
  loadRealWorkspace,
  purgeRealOrgRecords,
  removeOrgMember,
  updateFirestoreDoc,
  upsertOrgMember,
  type AccessibleOrgSummary,
} from './lib/firestoreStore';
import {
  loadSyntheticDemoState,
  resetSyntheticDemoState,
  saveSyntheticDemoState,
} from './lib/demoStore';
import {
  applyOperatorDecision,
  calculateCandidateImpact,
  canRolePerformAction,
  extractShareTargetText,
  interpretVendorMessageOffline,
  validateDependencyAdd,
} from './core/engine';
import type {
  ApprovalDecision,
  AuditEvent,
  FollowUp,
  HandoverEvidence,
  ImpactProposal,
  Interpretation,
  Membership,
  OperatorRole,
  PhotoInspectionResult,
  PilotFeedback,
  Property,
  ProviderConfirmation,
  Room,
  RoomType,
  Task,
  TaskDependency,
  VendorUpdate,
  WorkspaceDataset,
} from './core/types';
import { TopNav, type WorkspaceTab } from './components/TopNav';
import { ProductIntro } from './components/ProductIntro';
import { TodayView } from './components/TodayView';
import { RoomsListView } from './components/RoomsListView';
import { RoomDetailView } from './components/RoomDetailView';
import { EconomicsPilotView } from './components/EconomicsPilotView';
import { EvaluatorsView } from './components/EvaluatorsView';
import { LegacyAdvancedView } from './components/LegacyAdvancedView';
import { OfflineIndicator } from './components/OfflineIndicator';

type RouteView = 'intro' | 'workspace';

function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export default function App() {
  const [sharedIntakeText, setSharedIntakeText] = useState<string | null>(() =>
    extractShareTargetText(window.location.search)
  );

  const [route, setRoute] = useState<RouteView>(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      window.location.pathname.startsWith('/workspace') ||
      params.get('autostart') === '1' ||
      Boolean(extractShareTargetText(window.location.search))
    ) {
      return 'workspace';
    }
    return 'intro';
  });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('demo') === '1' ||
      params.get('autostart') === '1' ||
      Boolean(extractShareTargetText(window.location.search))
    ) {
      return 'demo';
    }
    return 'today';
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [demoDataset, setDemoDataset] = useState<WorkspaceDataset>(() => loadSyntheticDemoState());
  const [realDataset, setRealDataset] = useState<WorkspaceDataset | null>(null);
  const [accessibleOrgs, setAccessibleOrgs] = useState<AccessibleOrgSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>('');
  const [orgMembers, setOrgMembers] = useState<Membership[]>([]);
  const [roleOverride, setRoleOverride] = useState<OperatorRole | null>(null);
  const [realLoading, setRealLoading] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('demo') === '1' ||
      params.get('autostart') === '1' ||
      Boolean(extractShareTargetText(window.location.search))
    ) {
      return loadSyntheticDemoState().rooms[0]?.id ?? null;
    }
    return null;
  });
  const [demoSubView, setDemoSubView] = useState<'room' | 'today'>('room');
  const [hinglishMode, setHinglishMode] = useState<boolean>(false);

  // Inline property create/edit modal state
  const [propEditorOpen, setPropEditorOpen] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propFormName, setPropFormName] = useState('');
  const [propFormCity, setPropFormCity] = useState('');
  const [propFormLocality, setPropFormLocality] = useState('');
  const [propFormBeds, setPropFormBeds] = useState('24');
  const [propFormError, setPropFormError] = useState<string | null>(null);
  const [propFormBusy, setPropFormBusy] = useState(false);

  const [health, setHealth] = useState({
    geminiConfigured: false,
    textModelId: 'gemini-4-hydrogen',
    audioModelId: 'gemini-3.5-transcribe',
    firebaseConfigured: true,
    cloudRunStatus: 'NOT DEPLOYED (local/preview)',
    quotaBackend: 'File-backed sliding window',
  });

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.status === 'ok') {
          setHealth({
            geminiConfigured: Boolean(d.geminiConfigured),
            textModelId: String(d.textModelId || 'gemini-4-hydrogen'),
            audioModelId: String(d.audioModelId || 'gemini-3.5-transcribe'),
            firebaseConfigured: Boolean(d.firebaseConfigured),
            cloudRunStatus: String(d.cloudRunStatus || 'NOT DEPLOYED'),
            quotaBackend: String(d.quotaBackend || 'File-backed sliding window'),
          });
        }
      })
      .catch(() => {
        // Keep safe defaults
      });
  }, []);

  const loadCloudWorkspaceForUser = async (nextUser: User, targetOrgId?: string) => {
    const ws = await ensureUserWorkspace({ user: nextUser, targetOrgId });
    setRealDataset(ws);
    setActiveOrgId(ws.org.id);
    setRoleOverride(null);
    setSelectedPropertyId((prev) =>
      ws.properties.some((p) => p.id === prev) ? prev : ws.properties[0]?.id ?? ''
    );

    const [orgs, members] = await Promise.all([
      listAccessibleOrgs(nextUser).catch(() => []),
      listOrgMembers(ws.org.id, nextUser.uid).catch(() => [
        {
          orgId: ws.org.id,
          userId: nextUser.uid,
          role: (ws.org.ownerUid === nextUser.uid ? 'owner' : 'viewer') as Membership['role'],
          displayName: nextUser.displayName || nextUser.email || 'Operator',
          createdAt: ws.org.createdAt,
          updatedAt: ws.org.updatedAt,
        },
      ]),
    ]);
    setAccessibleOrgs(orgs);
    setOrgMembers(members);
    return ws;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setRealLoading(true);
        setRealError(null);
        try {
          const savedOrg = window.localStorage.getItem(`sahvera_active_org_${nextUser.uid}`) || undefined;
          const ws = await loadCloudWorkspaceForUser(nextUser, savedOrg);
          const initialShared = extractShareTargetText(window.location.search);
          if (initialShared && ws.rooms.length > 0) {
            setActiveTab('rooms');
            setSelectedRoomId(ws.rooms[0].id);
          } else if (
            activeTab === 'demo' &&
            !new URLSearchParams(window.location.search).get('demo') &&
            !initialShared
          ) {
            setActiveTab('today');
          }
        } catch (err) {
          setRealError(
            err instanceof Error ? err.message : 'Unable to load Cloud Firestore workspace.'
          );
        } finally {
          setRealLoading(false);
        }
      } else {
        setRealDataset(null);
        setAccessibleOrgs([]);
        setActiveOrgId('');
        setOrgMembers([]);
      }
    });
    return () => unsub();
  }, []);

  const isDemoMode = activeTab === 'demo' || !user;
  const activeDataset = isDemoMode ? demoDataset : realDataset ?? demoDataset;
  const cloudMemberRole: OperatorRole =
    orgMembers.find((m) => m.userId === user?.uid)?.role ??
    (realDataset && user && realDataset.org.ownerUid !== user.uid ? 'viewer' : 'owner');
  const canSwitchPreviewRole = isDemoMode || cloudMemberRole === 'owner';
  const effectiveRole: OperatorRole = canSwitchPreviewRole
    ? roleOverride ?? 'owner'
    : cloudMemberRole;

  useEffect(() => {
    if (isDemoMode) {
      saveSyntheticDemoState(demoDataset);
    }
  }, [demoDataset, isDemoMode]);

  useEffect(() => {
    if (isDemoMode) {
      setSelectedPropertyId(demoDataset.properties[0]?.id ?? '');
    } else if (realDataset) {
      setSelectedPropertyId((prev) =>
        realDataset.properties.some((p) => p.id === prev)
          ? prev
          : realDataset.properties[0]?.id ?? ''
      );
    }
  }, [isDemoMode, demoDataset.properties, realDataset]);

  const navigateTo = (nextRoute: RouteView, nextTab?: WorkspaceTab) => {
    setRoute(nextRoute);
    if (nextTab) setActiveTab(nextTab);
    setSelectedRoomId(null);
    const targetUrl = nextRoute === 'intro' ? '/' : '/workspace';
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, '', targetUrl);
    }
  };

  const handleTryDemo = () => {
    setRoute('workspace');
    setActiveTab('demo');
    setDemoSubView('room');
    setSelectedRoomId(demoDataset.rooms[0]?.id ?? null);
    if (window.location.pathname !== '/workspace') {
      window.history.pushState({}, '', '/workspace?demo=1');
    }
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setRealError(null);
    try {
      const signedIn = await signInWithGoogle();
      setRealLoading(true);
      const savedOrg = window.localStorage.getItem(`sahvera_active_org_${signedIn.uid}`) || undefined;
      await loadCloudWorkspaceForUser(signedIn, savedOrg);
      setRoute('workspace');
      setActiveTab('today');
      setSelectedRoomId(null);
      if (window.location.pathname !== '/workspace') {
        window.history.pushState({}, '', '/workspace');
      }
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google sign-in was cancelled or blocked. You can still inspect the Interactive Sandbox.'
      );
    } finally {
      setAuthBusy(false);
      setRealLoading(false);
    }
  };

  const handleSwitchOrg = async (nextOrgId: string) => {
    if (!user || !nextOrgId || nextOrgId === activeOrgId) return;
    setRealLoading(true);
    setRealError(null);
    setSelectedRoomId(null);
    try {
      window.localStorage.setItem(`sahvera_active_org_${user.uid}`, nextOrgId);
      await loadCloudWorkspaceForUser(user, nextOrgId);
    } catch (err) {
      setRealError(err instanceof Error ? err.message : 'Unable to switch workspace.');
    } finally {
      setRealLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setRealDataset(null);
    setAccessibleOrgs([]);
    setActiveOrgId('');
    setSelectedRoomId(null);
    setActiveTab('today');
    navigateTo('intro');
  };

  const mutateDataset = (updater: (prev: WorkspaceDataset) => WorkspaceDataset) => {
    if (isDemoMode) {
      setDemoDataset((prev) => updater(prev));
    } else {
      setRealDataset((prev) => (prev ? updater(prev) : prev));
    }
  };

  const getMemberUids = (ds: WorkspaceDataset): string[] =>
    Array.from(new Set([ds.org.ownerUid, ...(ds.org.memberUids ?? [])])).slice(0, 20);

  const appendAudit = async (
    roomId: string,
    action: string,
    provenance: AuditEvent['provenance'],
    hasSupportingEvidence: boolean,
    summary: string
  ) => {
    const ds = activeDataset;
    const evt: AuditEvent = {
      id: uid('aud'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      roomId,
      actorUid: isDemoMode ? 'synthetic-demo-operator' : user?.uid ?? 'unknown',
      actorLabel: isDemoMode ? 'Sandbox Operator' : user?.displayName || user?.email || 'Owner',
      action,
      provenance: isDemoMode ? 'synthetic' : provenance,
      hasSupportingEvidence,
      summary: summary.slice(0, 495),
      createdAt: new Date().toISOString(),
    };
    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'auditEvents',
        evt.id,
        {
          ...(evt as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        false
      );
    }
    mutateDataset((prev) => ({
      ...prev,
      auditEvents: [...prev.auditEvents, evt],
    }));
  };

  const handleResetDemo = () => {
    const fresh = resetSyntheticDemoState();
    setDemoDataset(fresh);
    if (activeTab === 'demo') {
      setSelectedRoomId(fresh.rooms[0]?.id ?? null);
    }
  };

  const handleSaveProperty = async (
    propertyId: string | null,
    input: { name: string; city: string; locality: string; bedCapacity: number }
  ) => {
    const authz = canRolePerformAction(effectiveRole, 'manage_property_or_purge');
    if (!authz.allowed) {
      throw new Error(authz.reason || 'Owner authority required.');
    }
    const ds = activeDataset;
    const now = new Date().toISOString();
    if (propertyId) {
      if (!isDemoMode) {
        await updateFirestoreDoc(ds.org.id, 'properties', propertyId, input);
      }
      mutateDataset((prev) => ({
        ...prev,
        properties: prev.properties.map((p) =>
          p.id === propertyId ? { ...p, ...input, updatedAt: now } : p
        ),
      }));
      setSelectedPropertyId(propertyId);
    } else {
      const newPropId = uid('prop');
      const newProp: Property = {
        id: newPropId,
        orgId: ds.org.id,
        ownerUid: ds.org.ownerUid,
        name: input.name,
        city: input.city,
        locality: input.locality,
        bedCapacity: input.bedCapacity,
        createdAt: now,
        updatedAt: now,
      };
      if (!isDemoMode) {
        await createFirestoreDoc(
          ds.org.id,
          'properties',
          newPropId,
          {
            ...(newProp as unknown as Record<string, unknown>),
            memberUids: getMemberUids(ds),
          },
          true
        );
      }
      mutateDataset((prev) => ({
        ...prev,
        properties: [...prev.properties, newProp],
      }));
      setSelectedPropertyId(newPropId);
    }
  };

  const openPropertyModal = (prop: Property | null) => {
    setPropFormError(null);
    if (prop) {
      setEditingPropertyId(prop.id);
      setPropFormName(prop.name === 'My PG Property' ? '' : prop.name);
      setPropFormCity(prop.city === 'City' ? '' : prop.city);
      setPropFormLocality(prop.locality === 'Main Locality' ? '' : prop.locality);
      setPropFormBeds(String(prop.bedCapacity));
    } else {
      setEditingPropertyId(null);
      setPropFormName('');
      setPropFormCity('');
      setPropFormLocality('');
      setPropFormBeds('24');
    }
    setPropEditorOpen(true);
  };

  const handleSubmitPropertyModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setPropFormError(null);
    if (
      propFormName.trim().length < 2 ||
      propFormCity.trim().length < 2 ||
      propFormLocality.trim().length < 2
    ) {
      setPropFormError('Property name, city, and locality must each be at least 2 characters.');
      return;
    }
    const beds = Math.min(1000, Math.max(1, Math.round(Number(propFormBeds) || 24)));
    setPropFormBusy(true);
    try {
      await handleSaveProperty(editingPropertyId, {
        name: propFormName.trim(),
        city: propFormCity.trim(),
        locality: propFormLocality.trim(),
        bedCapacity: beds,
      });
      setPropEditorOpen(false);
    } catch (err) {
      setPropFormError(err instanceof Error ? err.message : 'Unable to save property.');
    } finally {
      setPropFormBusy(false);
    }
  };

  const handleCreateRoom = async (input: {
    propertyId: string;
    locality: string;
    identifier: string;
    roomType: RoomType;
    targetReadyIso: string;
    ownerName: string;
    includeDraftTasks: boolean;
  }) => {
    const ds = activeDataset;
    const now = new Date().toISOString();
    const propId = input.propertyId || ds.properties[0]?.id || uid('prop');
    const existingProp = ds.properties.find((p) => p.id === propId);

    if (
      existingProp &&
      input.locality.trim().length >= 2 &&
      existingProp.locality !== input.locality &&
      !isDemoMode &&
      canRolePerformAction(effectiveRole, 'manage_property_or_purge').allowed
    ) {
      await updateFirestoreDoc(ds.org.id, 'properties', existingProp.id, {
        locality: input.locality.trim(),
      });
    }

    const roomId = uid('room');
    const newRoom: Room = {
      id: roomId,
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      propertyId: propId,
      identifier: input.identifier,
      roomType: input.roomType,
      targetReadyIso: input.targetReadyIso,
      ownerName: input.ownerName,
      readinessStage: 'in_progress',
      vacantSinceIso: now,
      createdAt: now,
      updatedAt: now,
    };

    const newTasks: Task[] = [];
    const newDeps: TaskDependency[] = [];

    if (input.includeDraftTasks) {
      const paintId = uid('tsk');
      const plumbId = uid('tsk');
      const cleanId = uid('tsk');
      const inspId = uid('tsk');
      const wifiId = uid('tsk');

      newTasks.push(
        {
          id: paintId,
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          title: 'Wall Touch-up & Painting',
          category: 'painting',
          sequenceOrder: 1,
          assignedVendor: 'Painter',
          assignmentState: 'assigned',
          status: 'scheduled',
          providerConfirmed: false,
          ownerVerified: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: plumbId,
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          title: 'Plumbing & Electrical Check',
          category: 'electrical',
          sequenceOrder: 2,
          assignedVendor: 'Plumber / Electrician',
          assignmentState: 'assigned',
          status: 'scheduled',
          providerConfirmed: false,
          ownerVerified: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: cleanId,
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          title: 'Deep Cleaning',
          category: 'cleaning',
          sequenceOrder: 3,
          assignedVendor: 'Housekeeping Staff',
          assignmentState: 'assigned',
          status: 'pending',
          providerConfirmed: false,
          ownerVerified: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: inspId,
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          title: 'Safety & Final Inspection',
          category: 'inspection',
          sequenceOrder: 4,
          assignedVendor: input.ownerName,
          assignmentState: 'assigned',
          status: 'pending',
          providerConfirmed: false,
          ownerVerified: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: wifiId,
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          title: 'Independent Wi-Fi Setup',
          category: 'wifi',
          sequenceOrder: 5,
          assignedVendor: 'Broadband Technician',
          assignmentState: 'assigned',
          status: 'scheduled',
          providerConfirmed: false,
          ownerVerified: false,
          createdAt: now,
          updatedAt: now,
        }
      );

      newDeps.push(
        {
          id: uid('dep'),
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          fromTaskId: paintId,
          toTaskId: plumbId,
          createdAt: now,
        },
        {
          id: uid('dep'),
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          fromTaskId: plumbId,
          toTaskId: cleanId,
          createdAt: now,
        },
        {
          id: uid('dep'),
          orgId: ds.org.id,
          ownerUid: ds.org.ownerUid,
          propertyId: propId,
          roomId,
          fromTaskId: cleanId,
          toTaskId: inspId,
          createdAt: now,
        }
      );
    }

    if (!isDemoMode) {
      const memberUids = getMemberUids(ds);
      await createFirestoreDoc(ds.org.id, 'rooms', newRoom.id, {
        ...(newRoom as unknown as Record<string, unknown>),
        memberUids,
      });
      for (const t of newTasks) {
        await createFirestoreDoc(ds.org.id, 'tasks', t.id, {
          ...(t as unknown as Record<string, unknown>),
          memberUids,
        });
      }
      for (const d of newDeps) {
        await createFirestoreDoc(
          ds.org.id,
          'dependencies',
          d.id,
          {
            ...(d as unknown as Record<string, unknown>),
            memberUids,
          },
          false
        );
      }
    }

    mutateDataset((prev) => ({
      ...prev,
      properties: prev.properties.map((p) =>
        p.id === propId ? { ...p, locality: input.locality.trim() || p.locality } : p
      ),
      rooms: [...prev.rooms, newRoom],
      tasks: [...prev.tasks, ...newTasks],
      dependencies: [...prev.dependencies, ...newDeps],
    }));

    await appendAudit(
      roomId,
      'room_created',
      'self_reported',
      false,
      `Created ${input.identifier} (${input.locality}) with target ready ${input.targetReadyIso}.`
    );
    setSelectedRoomId(roomId);
  };

  const handleUpdateRoom = async (
    roomId: string,
    patch: { identifier: string; roomType: RoomType; targetReadyIso: string; ownerName: string }
  ) => {
    const ds = activeDataset;
    if (!isDemoMode) {
      await updateFirestoreDoc(ds.org.id, 'rooms', roomId, patch);
    }
    mutateDataset((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) =>
        r.id === roomId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
      ),
    }));
  };

  const handleAddTask = async (
    roomId: string,
    title: string,
    category: Task['category'],
    assignedVendor: string
  ) => {
    const ds = activeDataset;
    const room = ds.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const now = new Date().toISOString();
    const roomTaskCount = ds.tasks.filter((t) => t.roomId === roomId).length;
    const newTask: Task = {
      id: uid('tsk'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      propertyId: room.propertyId,
      roomId,
      title,
      category,
      sequenceOrder: roomTaskCount + 1,
      assignedVendor,
      assignmentState: assignedVendor ? 'assigned' : 'unassigned',
      status: 'pending',
      providerConfirmed: false,
      ownerVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    if (!isDemoMode) {
      await createFirestoreDoc(ds.org.id, 'tasks', newTask.id, {
        ...(newTask as unknown as Record<string, unknown>),
        memberUids: getMemberUids(ds),
      });
    }
    mutateDataset((prev) => ({ ...prev, tasks: [...prev.tasks, newTask] }));
  };

  const handleUpdateTaskStatus = async (task: Task, status: Task['status']) => {
    const authz = canRolePerformAction(effectiveRole, 'update_task_status');
    if (!authz.allowed) return;
    const ds = activeDataset;
    if (!isDemoMode) {
      await updateFirestoreDoc(ds.org.id, 'tasks', task.id, { status });
    }
    mutateDataset((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === task.id ? { ...t, status, updatedAt: new Date().toISOString() } : t
      ),
    }));
  };

  const handleAddDependency = async (
    roomId: string,
    fromTaskId: string,
    toTaskId: string
  ): Promise<{ ok: boolean; reason?: string }> => {
    const ds = activeDataset;
    const check = validateDependencyAdd({
      tasks: ds.tasks,
      dependencies: ds.dependencies,
      fromTaskId,
      toTaskId,
    });
    if (!check.ok) return check;

    const room = ds.rooms.find((r) => r.id === roomId);
    if (!room) return { ok: false, reason: 'Room not found.' };

    const dep: TaskDependency = {
      id: uid('dep'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      propertyId: room.propertyId,
      roomId,
      fromTaskId,
      toTaskId,
      createdAt: new Date().toISOString(),
    };
    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'dependencies',
        dep.id,
        {
          ...(dep as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        false
      );
    }
    mutateDataset((prev) => ({
      ...prev,
      dependencies: [...prev.dependencies, dep],
    }));
    return { ok: true };
  };

  const handleAssessImpact = async (params: {
    room: Room;
    taskId: string;
    rawText: string;
    inputMode: 'text_paste' | 'voice_transcript';
    useGemini: boolean;
    consentGranted: boolean;
  }) => {
    const ds = activeDataset;
    const now = new Date().toISOString();
    const updateId = uid('upd');
    const vendorUpdate: VendorUpdate = {
      id: updateId,
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      propertyId: params.room.propertyId,
      roomId: params.room.id,
      taskId: params.taskId,
      inputMode: params.inputMode,
      rawText: params.rawText.slice(0, 1990),
      aiConsentGranted: params.consentGranted,
      createdAt: now,
    };

    const offlineInterp = interpretVendorMessageOffline({
      id: uid('int_off'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      roomId: params.room.id,
      vendorUpdateId: updateId,
      rawText: params.rawText,
      timezone: ds.org.timezone,
    });

    let activeInterp: Interpretation = offlineInterp;
    let aiError: string | null = null;
    let aiStatus: 'ai_unavailable' | null = null;

    if (params.useGemini && params.consentGranted) {
      try {
        const targetTask = ds.tasks.find((t) => t.id === params.taskId);
        const token = !isDemoMode && user ? await user.getIdToken() : null;
        const resp = await fetch('/api/ai/interpret-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            rawText: params.rawText,
            taskTitle: targetTask?.title ?? 'Room task',
            timezone: ds.org.timezone,
            propertyId: params.room.propertyId,
            consentGranted: true,
            mode: isDemoMode ? 'demo' : 'real',
          }),
        });
        const json = await resp.json();
        if (resp.ok && json.ok && json.source === 'real_gemini') {
          activeInterp = {
            id: uid('int_gem'),
            orgId: ds.org.id,
            ownerUid: ds.org.ownerUid,
            roomId: params.room.id,
            vendorUpdateId: updateId,
            source: 'real_gemini',
            engineLabel: 'Real Gemini',
            modelId: String(json.modelId || health.textModelId).slice(0, 64),
            eventKind: json.data.event_kind,
            originalLanguage: String(json.data.original_language || 'Unknown').slice(0, 64),
            summary: String(json.data.summary || '').slice(0, 395),
            evidenceSpans: Array.isArray(json.data.evidence_spans)
              ? json.data.evidence_spans.map(String).slice(0, 6)
              : [],
            reportedDelayMinutes: json.data.reported_delay_minutes ?? null,
            newDatetimeIso: json.data.new_datetime_iso ?? null,
            costDeltaInr: json.data.cost_delta_inr ?? null,
            providerCommitment: json.data.provider_commitment,
            missingFacts: Array.isArray(json.data.missing_facts)
              ? json.data.missing_facts.map(String).slice(0, 8)
              : [],
            uncertaintyReason: String(json.data.uncertainty_reason || '').slice(0, 395),
            ...(json.data.handover_risk_explanation
              ? {
                  handoverRiskExplanation: String(json.data.handover_risk_explanation).slice(0, 395),
                }
              : {}),
            ...(Array.isArray(json.data.clarification_questions) &&
            json.data.clarification_questions.length > 0
              ? {
                  suggestedClarifications: json.data.clarification_questions
                    .map(String)
                    .slice(0, 6),
                }
              : {}),
            ...(json.data.draft_reply_to_vendor
              ? { suggestedDraftReply: String(json.data.draft_reply_to_vendor).slice(0, 495) }
              : {}),
            createdAt: now,
          };
        } else {
          aiStatus = 'ai_unavailable';
          aiError = `${json.category ?? 'error'}: ${json.safeMessage ?? 'Gemini call failed.'}`;
        }
      } catch (err) {
        aiStatus = 'ai_unavailable';
        aiError = err instanceof Error ? err.message : 'Network error reaching Gemini endpoint.';
      }
    }

    const proposal: ImpactProposal = calculateCandidateImpact({
      proposalId: uid('prop'),
      room: params.room,
      tasks: ds.tasks,
      dependencies: ds.dependencies,
      sourceTaskId: params.taskId,
      interpretation: activeInterp,
    });

    if (!isDemoMode) {
      const memberUids = getMemberUids(ds);
      await createFirestoreDoc(
        ds.org.id,
        'vendorUpdates',
        vendorUpdate.id,
        {
          ...(vendorUpdate as unknown as Record<string, unknown>),
          memberUids,
        },
        false
      );
      await createFirestoreDoc(
        ds.org.id,
        'interpretations',
        activeInterp.id,
        {
          ...(activeInterp as unknown as Record<string, unknown>),
          memberUids,
        },
        false
      );
      await createFirestoreDoc(
        ds.org.id,
        'impactProposals',
        proposal.id,
        {
          ...(proposal as unknown as Record<string, unknown>),
          memberUids,
        },
        true
      );
    }

    mutateDataset((prev) => ({
      ...prev,
      vendorUpdates: [...prev.vendorUpdates, vendorUpdate],
      interpretations: [...prev.interpretations, activeInterp],
      impactProposals: [...prev.impactProposals, proposal],
    }));

    await appendAudit(
      params.room.id,
      'impact_assessed',
      activeInterp.source === 'real_gemini' ? 'ai_interpreted' : 'manually_copied',
      false,
      `Assessed message via ${activeInterp.engineLabel}: ${proposal.summary}`
    );

    return {
      offlineInterpretation: offlineInterp,
      activeInterpretation: activeInterp,
      aiError,
      aiStatus,
    };
  };

  const handleSaveManualInterpretation = async (params: {
    room: Room;
    taskId: string;
    vendorUpdateId: string;
    eventKind: Interpretation['eventKind'];
    reportedDelayMinutes: number | null;
    providerCommitment: Interpretation['providerCommitment'];
    newDatetimeIso: string | null;
    summary: string;
  }) => {
    const ds = activeDataset;
    const now = new Date().toISOString();
    const rawSlot = params.newDatetimeIso?.trim();
    const formattedSlot = rawSlot
      ? rawSlot.length === 16
        ? `${rawSlot}:00+05:30`
        : rawSlot
      : null;

    const manualInterp: Interpretation = {
      id: uid('int_man'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      roomId: params.room.id,
      vendorUpdateId: params.vendorUpdateId,
      source: 'manual_interpretation',
      engineLabel: 'Manual interpretation',
      eventKind: params.eventKind,
      originalLanguage: 'Operator-verified',
      summary: (params.summary.trim() || 'Operator recorded vendor update facts.').slice(0, 395),
      evidenceSpans: ['manual_operator_edit'],
      reportedDelayMinutes: params.reportedDelayMinutes,
      newDatetimeIso: formattedSlot,
      costDeltaInr: null,
      providerCommitment: params.providerCommitment,
      missingFacts:
        params.providerCommitment === 'confirmed' && formattedSlot
          ? []
          : ['Awaiting verified provider confirmation and explicit slot if still unconfirmed.'],
      uncertaintyReason:
        params.providerCommitment === 'confirmed'
          ? 'Operator manually verified vendor facts.'
          : 'Operator manually recorded tentative/unconfirmed facts.',
      createdAt: now,
    };

    const proposal = calculateCandidateImpact({
      proposalId: uid('prop'),
      room: params.room,
      tasks: ds.tasks,
      dependencies: ds.dependencies,
      sourceTaskId: params.taskId,
      interpretation: manualInterp,
    });

    if (!isDemoMode) {
      const memberUids = getMemberUids(ds);
      await createFirestoreDoc(
        ds.org.id,
        'interpretations',
        manualInterp.id,
        {
          ...(manualInterp as unknown as Record<string, unknown>),
          memberUids,
        },
        false
      );
      await createFirestoreDoc(
        ds.org.id,
        'impactProposals',
        proposal.id,
        {
          ...(proposal as unknown as Record<string, unknown>),
          memberUids,
        },
        true
      );
    }

    mutateDataset((prev) => ({
      ...prev,
      interpretations: [...prev.interpretations, manualInterp],
      impactProposals: [...prev.impactProposals, proposal],
    }));

    await appendAudit(
      params.room.id,
      'manual_interpretation_saved',
      'operator_verified',
      true,
      `Operator recorded manual interpretation (${manualInterp.eventKind}, ${manualInterp.providerCommitment}): ${manualInterp.summary}`
    );

    return manualInterp;
  };

  const handleTranscribeVoice = async (params: {
    file: File;
    taskTitle: string;
    propertyId: string;
    consentGranted: boolean;
  }): Promise<{ ok: true; transcript: string } | { ok: false; error: string }> => {
    const allowedTypes = [
      'audio/webm',
      'audio/wav',
      'audio/x-wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (!allowedTypes.includes(params.file.type)) {
      return {
        ok: false,
        error: `Unsupported file type "${params.file.type || 'unknown'}". Allowed: webm, wav, mp3, ogg, m4a.`,
      };
    }
    if (params.file.size === 0 || params.file.size > 2 * 1024 * 1024) {
      return {
        ok: false,
        error: 'Audio file must be non-empty and <= 2 MB.',
      };
    }

    const buf = await params.file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const audioBase64 = btoa(binary);

    const token = !isDemoMode && user ? await user.getIdToken() : null;
    const resp = await fetch('/api/ai/interpret-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        audioBase64,
        mimeType: params.file.type,
        taskTitle: params.taskTitle,
        timezone: activeDataset.org.timezone,
        propertyId: params.propertyId,
        consentGranted: params.consentGranted,
        mode: isDemoMode ? 'demo' : 'real',
      }),
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      return {
        ok: false,
        error: json.safeMessage || 'Voice transcription failed; please paste text manually.',
      };
    }
    return { ok: true, transcript: json.transcript };
  };

  const handleInspectRoomPhoto = async (params: {
    file: File;
    room: Room;
    taskTitles: string[];
    consentGranted: boolean;
  }): Promise<{ ok: true; result: PhotoInspectionResult } | { ok: false; error: string }> => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedImageTypes.includes(params.file.type)) {
      return {
        ok: false,
        error: `Unsupported photo format "${params.file.type || 'unknown'}". Allowed: JPG, PNG, WebP.`,
      };
    }
    if (params.file.size === 0 || params.file.size > 4 * 1024 * 1024) {
      return {
        ok: false,
        error: 'Room photo must be non-empty and <= 4 MB.',
      };
    }

    const buf = await params.file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const imageBase64 = btoa(binary);

    const token = !isDemoMode && user ? await user.getIdToken() : null;
    const resp = await fetch('/api/ai/inspect-room-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        imageBase64,
        mimeType: params.file.type,
        roomIdentifier: params.room.identifier,
        taskTitles: params.taskTitles,
        propertyId: params.room.propertyId,
        consentGranted: params.consentGranted,
        mode: isDemoMode ? 'demo' : 'real',
      }),
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      return {
        ok: false,
        error: json.safeMessage || 'Gemini Vision inspection unavailable; please inspect physically.',
      };
    }
    return { ok: true, result: json.result as PhotoInspectionResult };
  };

  const handleApplyApproval = async (params: {
    room: Room;
    proposalId: string;
    decision: ApprovalDecision;
    rationale: string;
    idempotencyKey: string;
  }) => {
    const authz = canRolePerformAction(effectiveRole, 'record_owner_approval');
    if (!authz.allowed) {
      return { ok: false, reason: authz.reason || 'Owner authority required.' };
    }
    const ds = activeDataset;
    const proposal = ds.impactProposals.find((p) => p.id === params.proposalId);
    const interp = ds.interpretations.find((i) => i.id === proposal?.interpretationId);
    if (!proposal || !interp) {
      return { ok: false, reason: 'Proposal or interpretation record missing.' };
    }

    const res = applyOperatorDecision({
      approvalId: uid('apv'),
      idempotencyKey: params.idempotencyKey,
      existingApprovals: ds.ownerApprovals,
      proposal,
      interpretation: interp,
      decision: params.decision,
      rationale: params.rationale,
      approvedByUid: isDemoMode ? 'synthetic-demo-operator' : user?.uid ?? 'owner',
      room: params.room,
      tasks: ds.tasks,
    });

    if (!res.ok) return res;

    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'ownerApprovals',
        res.approval.id,
        {
          ...(res.approval as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        false
      );
      await updateFirestoreDoc(ds.org.id, 'impactProposals', res.updatedProposal.id, {
        status: res.updatedProposal.status,
      });
      if (params.room.readinessStage !== 'verified_physical_handover') {
        await updateFirestoreDoc(ds.org.id, 'rooms', res.updatedRoom.id, {
          readinessStage: res.updatedRoom.readinessStage,
        });
      }
      for (const t of res.updatedTasks) {
        if (t.roomId === params.room.id) {
          await updateFirestoreDoc(ds.org.id, 'tasks', t.id, {
            status: t.status,
            proposedWindowNote: t.proposedWindowNote ?? null,
          });
        }
      }
    }

    mutateDataset((prev) => ({
      ...prev,
      ownerApprovals: [...prev.ownerApprovals, res.approval],
      impactProposals: prev.impactProposals.map((p) =>
        p.id === res.updatedProposal.id ? res.updatedProposal : p
      ),
      rooms: prev.rooms.map((r) => (r.id === res.updatedRoom.id ? res.updatedRoom : r)),
      tasks: res.updatedTasks,
    }));

    await appendAudit(
      params.room.id,
      'owner_decision_recorded',
      'operator_verified',
      false,
      `Human approval decision "${params.decision}" recorded (${params.rationale}).`
    );

    return { ok: true };
  };

  const handleSaveFollowUp = async (params: {
    room: Room;
    taskId: string;
    messageDraft: string;
    dueIso: string;
  }) => {
    const ds = activeDataset;
    const now = new Date().toISOString();
    const followUp: FollowUp = {
      id: uid('fup'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      propertyId: params.room.propertyId,
      roomId: params.room.id,
      taskId: params.taskId || undefined,
      messageDraft: params.messageDraft.slice(0, 995),
      dueIso: params.dueIso,
      status: 'open',
      verificationState: 'unverified',
      createdAt: now,
      updatedAt: now,
    };
    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'followUps',
        followUp.id,
        {
          ...(followUp as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        true
      );
    }
    mutateDataset((prev) => ({
      ...prev,
      followUps: [...prev.followUps, followUp],
    }));
    await appendAudit(
      params.room.id,
      'followup_saved',
      'self_reported',
      false,
      `Saved vendor follow-up reminder due ${params.dueIso}.`
    );
  };

  const handleResolveFollowUp = async (followUp: FollowUp) => {
    const ds = activeDataset;
    if (!isDemoMode) {
      await updateFirestoreDoc(ds.org.id, 'followUps', followUp.id, {
        status: 'resolved',
        verificationState: 'verified',
      });
    }
    mutateDataset((prev) => ({
      ...prev,
      followUps: prev.followUps.map((f) =>
        f.id === followUp.id
          ? {
              ...f,
              status: 'resolved',
              verificationState: 'verified',
              updatedAt: new Date().toISOString(),
            }
          : f
      ),
    }));
  };

  const handleRecordProviderConfirmation = async (params: {
    room: Room;
    taskId: string;
    vendorName: string;
    confirmedSlotIso: string;
    evidenceChannel: ProviderConfirmation['evidenceChannel'];
  }) => {
    const ds = activeDataset;
    const now = new Date().toISOString();
    const conf: ProviderConfirmation = {
      id: uid('pconf'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      roomId: params.room.id,
      taskId: params.taskId,
      vendorName: params.vendorName.slice(0, 100),
      confirmedSlotIso: params.confirmedSlotIso.slice(0, 64),
      evidenceChannel: params.evidenceChannel,
      recordedByUid: isDemoMode ? 'synthetic-demo-operator' : user?.uid ?? 'owner',
      createdAt: now,
    };
    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'providerConfirmations',
        conf.id,
        {
          ...(conf as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        false
      );
      await updateFirestoreDoc(ds.org.id, 'tasks', params.taskId, {
        providerConfirmed: true,
      });
    }
    mutateDataset((prev) => ({
      ...prev,
      providerConfirmations: [...prev.providerConfirmations, conf],
      tasks: prev.tasks.map((t) =>
        t.id === params.taskId ? { ...t, providerConfirmed: true, updatedAt: now } : t
      ),
    }));
    await appendAudit(
      params.room.id,
      'provider_confirmation_recorded',
      'operator_verified',
      true,
      `Recorded ${params.evidenceChannel} confirmation from ${params.vendorName} for ${params.confirmedSlotIso}.`
    );
  };

  const handleUpdateHandoverEvidence = async (
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
  ) => {
    if (markVerifiedHandover) {
      const authz = canRolePerformAction(effectiveRole, 'sign_verified_handover');
      if (!authz.allowed) {
        throw new Error(authz.reason || 'Owner authority required to sign Verified Physical Handover.');
      }
    }
    const ds = activeDataset;
    const now = new Date().toISOString();
    const existing = ds.handoverEvidence.find((e) => e.roomId === room.id);
    const evId = existing?.id ?? uid('hev');

    const sanitizePhotoList = (arr?: string[]) =>
      Array.isArray(arr)
        ? arr
            .map((item) => String(item).trim().slice(0, 160))
            .filter(Boolean)
            .slice(0, 6)
        : undefined;

    const safeDetectedIssues =
      sanitizePhotoList(patch.photoDetectedIssues) ?? existing?.photoDetectedIssues;
    const safeSafetyFlags =
      sanitizePhotoList(patch.photoSafetyFlags) ?? existing?.photoSafetyFlags;

    const safePatch: Pick<
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
      > = {
      safetyInspectionAck: patch.safetyInspectionAck,
      ownerAttestation: patch.ownerAttestation,
      guestAckState: patch.guestAckState,
      evidenceNote: patch.evidenceNote.slice(0, 495),
      ...(patch.photoInspectionVerdict
        ? { photoInspectionVerdict: patch.photoInspectionVerdict }
        : existing?.photoInspectionVerdict
        ? { photoInspectionVerdict: existing.photoInspectionVerdict }
        : {}),
      ...(patch.photoInspectionSummary
        ? { photoInspectionSummary: patch.photoInspectionSummary.slice(0, 295) }
        : existing?.photoInspectionSummary
        ? { photoInspectionSummary: existing.photoInspectionSummary }
        : {}),
      ...(safeDetectedIssues ? { photoDetectedIssues: safeDetectedIssues } : {}),
      ...(safeSafetyFlags ? { photoSafetyFlags: safeSafetyFlags } : {}),
      ...(typeof patch.photoCount === 'number'
        ? { photoCount: Math.max(0, Math.min(10, Math.round(patch.photoCount))) }
        : typeof existing?.photoCount === 'number'
        ? { photoCount: existing.photoCount }
        : {}),
      ...(patch.conditionStage
        ? { conditionStage: patch.conditionStage }
        : existing?.conditionStage
        ? { conditionStage: existing.conditionStage }
        : {}),
      ...(typeof patch.baselineComparisonNote === 'string'
        ? { baselineComparisonNote: patch.baselineComparisonNote.slice(0, 295) }
        : typeof existing?.baselineComparisonNote === 'string'
        ? { baselineComparisonNote: existing.baselineComparisonNote }
        : {}),
    };

    const nextEv: HandoverEvidence = {
      id: evId,
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      roomId: room.id,
      ...safePatch,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const nextStage: Room['readinessStage'] = markVerifiedHandover
      ? 'verified_physical_handover'
      : room.readinessStage;

    if (!isDemoMode) {
      if (existing) {
        await updateFirestoreDoc(ds.org.id, 'handoverEvidence', evId, safePatch);
      } else {
        await createFirestoreDoc(
          ds.org.id,
          'handoverEvidence',
          evId,
          {
            ...(nextEv as unknown as Record<string, unknown>),
            memberUids: getMemberUids(ds),
          },
          true
        );
      }
      if (markVerifiedHandover && room.readinessStage !== 'verified_physical_handover') {
        await updateFirestoreDoc(ds.org.id, 'rooms', room.id, {
          readinessStage: 'verified_physical_handover',
        });
      }
    }

    mutateDataset((prev) => ({
      ...prev,
      handoverEvidence: existing
        ? prev.handoverEvidence.map((e) => (e.id === evId ? nextEv : e))
        : [...prev.handoverEvidence, nextEv],
      rooms: prev.rooms.map((r) =>
        r.id === room.id ? { ...r, readinessStage: nextStage, updatedAt: now } : r
      ),
    }));

    await appendAudit(
      room.id,
      markVerifiedHandover ? 'verified_physical_handover' : 'handover_checklist_saved',
      'operator_verified',
      Boolean(safePatch.evidenceNote) || Boolean(safePatch.photoCount),
      markVerifiedHandover
        ? `Signed Verified Physical Handover for ${room.identifier}.`
        : 'Updated handover readiness checklist.'
    );
  };

  const handleAddPilotFeedback = async (
    entry: Omit<PilotFeedback, 'id' | 'orgId' | 'ownerUid' | 'createdAt'>
  ) => {
    const ds = activeDataset;
    const item: PilotFeedback = {
      id: uid('pilot'),
      orgId: ds.org.id,
      ownerUid: ds.org.ownerUid,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    if (!isDemoMode) {
      await createFirestoreDoc(
        ds.org.id,
        'pilotFeedback',
        item.id,
        {
          ...(item as unknown as Record<string, unknown>),
          memberUids: getMemberUids(ds),
        },
        false
      );
    }
    mutateDataset((prev) => ({
      ...prev,
      pilotFeedback: [...prev.pilotFeedback, item],
    }));
  };

  const handlePurgeRealData = async () => {
    const authz = canRolePerformAction(effectiveRole, 'manage_property_or_purge');
    if (!authz.allowed) {
      throw new Error(authz.reason || 'Owner authority required.');
    }
    if (!user || !realDataset) return;
    await purgeRealOrgRecords(realDataset.org.id, user.uid);
    const refreshed = await loadRealWorkspace(user.uid, realDataset.org.id);
    setRealDataset(refreshed);
    setSelectedRoomId(null);
  };

  const handleUpsertMember = async (input: {
    userId: string;
    role: 'manager' | 'viewer';
    displayName: string;
  }) => {
    const authz = canRolePerformAction(effectiveRole, 'manage_property_or_purge');
    if (!authz.allowed || !realDataset || !user) {
      throw new Error(authz.reason || 'Owner authority required.');
    }
    const nextMemberUids = await upsertOrgMember({
      orgId: realDataset.org.id,
      ownerUid: realDataset.org.ownerUid,
      userId: input.userId,
      role: input.role,
      displayName: input.displayName,
    });
    const updated = await listOrgMembers(realDataset.org.id, user.uid);
    setOrgMembers(updated);
    setRealDataset((prev) =>
      prev ? { ...prev, org: { ...prev.org, memberUids: nextMemberUids } } : prev
    );
  };

  const handleRemoveMember = async (userId: string) => {
    const authz = canRolePerformAction(effectiveRole, 'manage_property_or_purge');
    if (!authz.allowed || !realDataset || !user) {
      throw new Error(authz.reason || 'Owner authority required.');
    }
    const nextMemberUids = await removeOrgMember(
      realDataset.org.id,
      realDataset.org.ownerUid,
      userId
    );
    const updated = await listOrgMembers(realDataset.org.id, user.uid);
    setOrgMembers(updated);
    setRealDataset((prev) =>
      prev ? { ...prev, org: { ...prev.org, memberUids: nextMemberUids } } : prev
    );
  };

  const selectedRoom = selectedRoomId
    ? activeDataset.rooms.find((r) => r.id === selectedRoomId) ?? null
    : null;

  const selectedProperty =
    activeDataset.properties.find((p) => p.id === selectedPropertyId) ??
    activeDataset.properties[0];

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#111C1B]">
      <TopNav
        currentRoute={route}
        activeWorkspaceTab={activeTab}
        isSignedIn={Boolean(user)}
        userEmail={user?.email}
        onNavigateIntro={() => navigateTo('intro')}
        onTryDemo={handleTryDemo}
        onOpenWorkspace={(tab) => navigateTo('workspace', tab ?? (user ? 'today' : 'rooms'))}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {route === 'intro' ? (
        <ProductIntro
          onTryDemo={handleTryDemo}
          onSignIn={handleSignIn}
          onOpenEvaluators={() => navigateTo('workspace', 'evaluators')}
          isSignedIn={Boolean(user)}
          onOpenRealWorkspace={() => navigateTo('workspace', 'today')}
          authBusy={authBusy}
          authError={authError}
        />
      ) : (
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 space-y-6">
          {/* Workspace Context Bar */}
          <section
            aria-label="Workspace context"
            className="rounded-lg border border-[#DEDBD2] bg-white px-4 py-3 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              {(activeTab === 'demo' || Boolean(user)) ? (
                <div className="flex min-w-0 max-w-full items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-[#0F4C4C]" aria-hidden="true" />
                  <label htmlFor="property-selector" className="shrink-0 font-medium text-[#4A5957]">
                    Property:
                  </label>
                  <select
                    id="property-selector"
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="min-h-[34px] min-w-0 max-w-full flex-1 truncate rounded border border-[#DEDBD2] bg-white px-2.5 py-1 text-xs font-medium text-[#111C1B] sm:flex-initial"
                  >
                    {activeDataset.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.locality}, {p.city})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-[#0F4C4C]" aria-hidden="true" />
                  <span className="font-medium text-[#111C1B]">Private Cloud Workspace</span>
                </div>
              )}

              {!isDemoMode && user && accessibleOrgs.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="org-selector" className="shrink-0 font-medium text-[#4A5957]">
                    Org:
                  </label>
                  <select
                    id="org-selector"
                    value={activeOrgId}
                    onChange={(e) => handleSwitchOrg(e.target.value)}
                    className="min-h-[34px] rounded border border-[#0F4C4C]/40 bg-[#F0F5F4] px-2 py-1 text-xs font-semibold text-[#0F4C4C]"
                  >
                    {accessibleOrgs.map((org) => (
                      <option key={org.orgId} value={org.orgId}>
                        {org.orgName} ({org.role === 'owner' ? 'Owner' : org.role === 'manager' ? 'Warden' : 'Viewer'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {user && !isDemoMode && canRolePerformAction(effectiveRole, 'manage_property_or_purge').allowed && (
                <div className="flex items-center gap-1.5">
                  {selectedProperty && (
                    <button
                      type="button"
                      onClick={() => openPropertyModal(selectedProperty)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#DEDBD2] px-2 py-1 text-xs font-medium text-[#4A5957] hover:text-[#111C1B]"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openPropertyModal(null)}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#DEDBD2] px-2 py-1 text-xs font-medium text-[#0F4C4C] hover:bg-[#F7F6F2]"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    <span>New property</span>
                  </button>
                </div>
              )}

              {activeTab === 'demo' ? (
                <span className="font-semibold text-[#B45309] whitespace-nowrap">
                  · Sandbox (Room 203, local only)
                </span>
              ) : user ? (
                <span className="font-semibold text-[#15803D] whitespace-nowrap">
                  · Live Cloud ({user.email})
                </span>
              ) : (
                <span className="font-medium text-[#4A5957] whitespace-nowrap">
                  · Sign in required for live rooms
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A5957]">
              <div className="inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#0F4C4C]" aria-hidden="true" />
                <label htmlFor="workspace-role-selector" className="text-[11px] font-medium text-[#4A5957]">
                  Role:
                </label>
                {canSwitchPreviewRole ? (
                  <select
                    id="workspace-role-selector"
                    value={effectiveRole}
                    onChange={(e) => setRoleOverride(e.target.value as OperatorRole)}
                    className="min-h-[32px] rounded border border-[#DEDBD2] bg-white px-2 py-1 text-xs font-medium text-[#111C1B]"
                  >
                    <option value="owner">Owner (Maalik)</option>
                    <option value="manager">Warden (manager)</option>
                    <option value="viewer">Viewer (read-only)</option>
                  </select>
                ) : (
                  <span className="font-semibold text-[#111C1B]">
                    {effectiveRole === 'manager' ? 'Warden (manager)' : 'Viewer'}
                  </span>
                )}
              </div>

              <button
                type="button"
                aria-pressed={hinglishMode}
                onClick={() => setHinglishMode((v) => !v)}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded border px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  hinglishMode
                    ? 'border-[#0F4C4C] bg-[#F0F5F4] text-[#0F4C4C]'
                    : 'border-[#DEDBD2] bg-white text-[#4A5957] hover:text-[#111C1B]'
                }`}
              >
                <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{hinglishMode ? 'English + Hinglish' : 'English'}</span>
              </button>
              {activeTab === 'demo' && (
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded border border-[#DEDBD2] px-2.5 py-1 font-medium text-[#0F4C4C] whitespace-nowrap hover:bg-[#F7F6F2]"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Reset sandbox</span>
                </button>
              )}
            </div>
          </section>

          {/* Inline Property Setup / Editor Panel */}
          {propEditorOpen && (
            <form
              onSubmit={handleSubmitPropertyModal}
              className="rounded-lg border border-[#0F4C4C]/40 bg-white p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[#111C1B]">
                  {editingPropertyId ? 'Update PG property details' : 'Add new PG property'}
                </h2>
                <button
                  type="button"
                  onClick={() => setPropEditorOpen(false)}
                  className="text-xs font-medium text-[#4A5957] hover:text-[#111C1B]"
                >
                  Cancel
                </button>
              </div>
              {propFormError && (
                <div role="alert" className="text-xs font-medium text-[#B91C1C]">
                  {propFormError}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div>
                  <label htmlFor="modal-prop-name" className="block font-medium text-[#111C1B] mb-1">
                    Property name
                  </label>
                  <input
                    id="modal-prop-name"
                    type="text"
                    value={propFormName}
                    onChange={(e) => setPropFormName(e.target.value)}
                    placeholder="e.g. Sri Sai Men's PG"
                    className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="modal-prop-city" className="block font-medium text-[#111C1B] mb-1">
                    City
                  </label>
                  <input
                    id="modal-prop-city"
                    type="text"
                    value={propFormCity}
                    onChange={(e) => setPropFormCity(e.target.value)}
                    placeholder="e.g. Bengaluru"
                    className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="modal-prop-locality" className="block font-medium text-[#111C1B] mb-1">
                    Locality
                  </label>
                  <input
                    id="modal-prop-locality"
                    type="text"
                    value={propFormLocality}
                    onChange={(e) => setPropFormLocality(e.target.value)}
                    placeholder="e.g. HSR Layout Sector 2"
                    className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="modal-prop-beds" className="block font-medium text-[#111C1B] mb-1">
                    Total beds
                  </label>
                  <input
                    id="modal-prop-beds"
                    type="number"
                    min={1}
                    max={1000}
                    value={propFormBeds}
                    onChange={(e) => setPropFormBeds(e.target.value)}
                    className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={propFormBusy}
                  className="min-h-[38px] rounded-md bg-[#0F4C4C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60"
                >
                  {propFormBusy ? 'Saving…' : 'Save property'}
                </button>
              </div>
            </form>
          )}

          {/* Workspace Navigation Tabs */}
          <nav
            aria-label="Workspace views"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DEDBD2] pb-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'rooms', label: 'Rooms' },
                  { id: 'settings', label: 'Settings & Export' },
                  { id: 'demo', label: 'Interactive Sandbox' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setDemoSubView('room');
                      setSelectedRoomId(
                        tab.id === 'demo' ? demoDataset.rooms[0]?.id ?? null : null
                      );
                    }}
                    className={`min-h-[38px] rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#0F4C4C] text-white'
                        : 'text-[#4A5957] hover:bg-[#EFEDE6] hover:text-[#111C1B]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'economics', label: 'ROI Calculator' },
                  { id: 'evaluators', label: 'AI Eval & Architecture' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSelectedRoomId(null);
                    }}
                    className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#EFEDE6] text-[#0F4C4C] font-semibold'
                        : 'text-[#4A5957] hover:bg-[#EFEDE6] hover:text-[#111C1B]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Private Sign-in Gate if user selects Today, Rooms, or Settings while signed out */}
          {!user && (activeTab === 'today' || activeTab === 'rooms' || activeTab === 'settings') ? (
            <section className="rounded-lg border border-[#DEDBD2] bg-white p-8 text-center space-y-4">
              <h1 className="font-display text-xl font-bold text-[#111C1B]">
                Sign in to manage your PG properties &amp; rooms
              </h1>
              <p className="mx-auto max-w-lg text-sm text-[#4A5957]">
                Your properties, rooms, vendor updates, and verified handover logs are isolated
                in your private Cloud Firestore workspace. Sign in with Google or try the Interactive
                Sandbox immediately without an account.
              </p>
              {authError && (
                <div role="alert" className="text-sm text-[#B91C1C]">
                  {authError}
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={!authReady || authBusy}
                  className="min-h-[44px] rounded-md bg-[#0F4C4C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A3838]"
                >
                  {authBusy ? 'Signing in…' : 'Sign in with Google'}
                </button>
                <button
                  type="button"
                  onClick={handleTryDemo}
                  className="min-h-[44px] rounded-md border border-[#DEDBD2] bg-white px-5 py-2 text-sm font-semibold text-[#111C1B] hover:bg-[#F7F6F2]"
                >
                  Open Interactive Sandbox
                </button>
              </div>
            </section>
          ) : realLoading && !isDemoMode ? (
            <div className="rounded-lg border border-[#DEDBD2] bg-white p-8 text-sm text-[#4A5957]">
              Loading your workspace from Cloud Firestore…
            </div>
          ) : realError && !isDemoMode ? (
            <div
              role="alert"
              className="rounded-lg border border-[#B91C1C]/40 bg-red-50 p-6 text-sm text-[#991B1B]"
            >
              {realError}
            </div>
          ) : activeTab === 'economics' ? (
            <EconomicsPilotView
              pilotFeedback={activeDataset.pilotFeedback}
              isDemoMode={isDemoMode}
              onAddPilotFeedback={handleAddPilotFeedback}
            />
          ) : activeTab === 'evaluators' ? (
            <EvaluatorsView health={health} />
          ) : activeTab === 'settings' ? (
            <LegacyAdvancedView
              dataset={activeDataset}
              selectedProperty={selectedProperty}
              isDemoMode={isDemoMode}
              activeRole={effectiveRole}
              currentUserUid={user?.uid}
              members={orgMembers}
              onResetDemo={handleResetDemo}
              onPurgeRealData={handlePurgeRealData}
              onSaveProperty={handleSaveProperty}
              onUpsertMember={handleUpsertMember}
              onRemoveMember={handleRemoveMember}
            />
          ) : activeTab === 'demo' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDemoSubView('room');
                    setSelectedRoomId(demoDataset.rooms[0]?.id ?? null);
                  }}
                  className={`min-h-[34px] rounded-md border px-3 py-1 text-xs font-medium ${
                    demoSubView === 'room'
                      ? 'border-[#0F4C4C] bg-[#F0F5F4] text-[#0F4C4C]'
                      : 'border-[#DEDBD2] bg-white text-[#4A5957]'
                  }`}
                >
                  Room 203 Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setDemoSubView('today')}
                  className={`min-h-[34px] rounded-md border px-3 py-1 text-xs font-medium ${
                    demoSubView === 'today'
                      ? 'border-[#0F4C4C] bg-[#F0F5F4] text-[#0F4C4C]'
                      : 'border-[#DEDBD2] bg-white text-[#4A5957]'
                  }`}
                >
                  Sandbox Today Queue ({demoDataset.followUps.filter((f) => f.status === 'open').length} open)
                </button>
              </div>
              {demoSubView === 'today' ? (
                <TodayView
                  dataset={demoDataset}
                  selectedPropertyId={selectedPropertyId}
                  hinglishMode={hinglishMode}
                  onOpenRoom={(roomId) => {
                    setDemoSubView('room');
                    setSelectedRoomId(roomId);
                  }}
                  onResolveFollowUp={handleResolveFollowUp}
                  onGoToRooms={() => setDemoSubView('room')}
                />
              ) : (selectedRoom ?? demoDataset.rooms[0]) ? (
                <RoomDetailView
                  dataset={activeDataset}
                  room={(selectedRoom ?? demoDataset.rooms[0])!}
                  propertyName={selectedProperty?.name}
                  propertyLocality={selectedProperty?.locality}
                  hinglishMode={hinglishMode}
                  isDemoMode={isDemoMode}
                  geminiConfigured={health.geminiConfigured}
                  activeRole={effectiveRole}
                  sharedIntakeText={sharedIntakeText}
                  onDismissSharedIntake={() => setSharedIntakeText(null)}
                  onBack={() => setDemoSubView('today')}
                  onAddTask={handleAddTask}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                  onAddDependency={handleAddDependency}
                  onAssessImpact={handleAssessImpact}
                  onSaveManualInterpretation={handleSaveManualInterpretation}
                  onTranscribeVoice={handleTranscribeVoice}
                  onInspectRoomPhoto={handleInspectRoomPhoto}
                  onApplyApproval={handleApplyApproval}
                  onSaveFollowUp={handleSaveFollowUp}
                  onRecordProviderConfirmation={handleRecordProviderConfirmation}
                  onUpdateHandoverEvidence={handleUpdateHandoverEvidence}
                />
              ) : null}
            </div>
          ) : selectedRoom ? (
            <RoomDetailView
              dataset={activeDataset}
              room={selectedRoom}
              propertyName={selectedProperty?.name}
              propertyLocality={selectedProperty?.locality}
              hinglishMode={hinglishMode}
              isDemoMode={isDemoMode}
              geminiConfigured={health.geminiConfigured}
              activeRole={effectiveRole}
              sharedIntakeText={sharedIntakeText}
              onDismissSharedIntake={() => setSharedIntakeText(null)}
              onBack={() => setSelectedRoomId(null)}
              onAddTask={handleAddTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onAddDependency={handleAddDependency}
              onAssessImpact={handleAssessImpact}
              onSaveManualInterpretation={handleSaveManualInterpretation}
              onTranscribeVoice={handleTranscribeVoice}
              onInspectRoomPhoto={handleInspectRoomPhoto}
              onApplyApproval={handleApplyApproval}
              onSaveFollowUp={handleSaveFollowUp}
              onRecordProviderConfirmation={handleRecordProviderConfirmation}
              onUpdateHandoverEvidence={handleUpdateHandoverEvidence}
            />
          ) : activeTab === 'today' ? (
            <TodayView
              dataset={activeDataset}
              selectedPropertyId={selectedPropertyId}
              hinglishMode={hinglishMode}
              onOpenRoom={(roomId) => setSelectedRoomId(roomId)}
              onResolveFollowUp={handleResolveFollowUp}
              onGoToRooms={() => setActiveTab('rooms')}
              onConfigureProperty={(prop) => openPropertyModal(prop)}
            />
          ) : (
            <RoomsListView
              dataset={activeDataset}
              selectedPropertyId={selectedPropertyId}
              isDemoMode={isDemoMode}
              defaultOwnerLabel={user?.displayName || user?.email?.split('@')[0] || 'Warden'}
              onOpenRoom={(roomId) => setSelectedRoomId(roomId)}
              onCreateRoom={handleCreateRoom}
              onUpdateRoom={handleUpdateRoom}
            />
          )}
        </main>
      )}
      <OfflineIndicator />
    </div>
  );
}
