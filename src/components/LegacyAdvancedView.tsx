import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, RotateCcw, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { canRolePerformAction } from '../core/engine';
import type { Membership, OperatorRole, Property, WorkspaceDataset } from '../core/types';

interface LegacyAdvancedViewProps {
  dataset: WorkspaceDataset;
  selectedProperty?: Property;
  isDemoMode: boolean;
  activeRole?: OperatorRole;
  currentUserUid?: string;
  members?: Membership[];
  onResetDemo: () => void;
  onPurgeRealData: () => Promise<void>;
  onSaveProperty?: (
    propertyId: string | null,
    input: { name: string; city: string; locality: string; bedCapacity: number }
  ) => Promise<void>;
  onUpsertMember?: (input: {
    userId: string;
    role: 'manager' | 'viewer';
    displayName: string;
  }) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
}

const MIGRATION_ROWS = [
  {
    pythonModule: 'FastAPI local owner accounts & SQLite',
    tsModule: 'Firebase Auth + Cloud Firestore (/orgs/{orgId}/...)',
    status: 'Fresh TS/Firestore implementation (does not auto-migrate SQLite)',
  },
  {
    pythonModule: 'Daily work board & room checklists',
    tsModule: 'TodayView + RoomsListView + RoomDetailView',
    status: 'Implemented with tenant-isolated persistence',
  },
  {
    pythonModule: 'Manual intake & Hindi/Hinglish/Marathi offline rules',
    tsModule: 'src/core/engine.ts (interpretVendorMessageOffline)',
    status: 'Implemented & unit-tested via node:test',
  },
  {
    pythonModule: 'Optional Gemini structured interpretation',
    tsModule: 'src/server/geminiAdapter.ts (server-side @google/genai)',
    status: 'Server-side with explicit opt-in & semantic validator',
  },
  {
    pythonModule: 'Local backup/restore scripts',
    tsModule: 'Safe JSON export below (no automatic private record access)',
    status: 'Read-only JSON export implemented; restore requires manual review',
  },
];

export const LegacyAdvancedView: React.FC<LegacyAdvancedViewProps> = ({
  dataset,
  selectedProperty,
  isDemoMode,
  activeRole = 'owner',
  currentUserUid,
  members = [],
  onResetDemo,
  onPurgeRealData,
  onSaveProperty,
  onUpsertMember,
  onRemoveMember,
}) => {
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [archOpen, setArchOpen] = useState(false);

  const [propName, setPropName] = useState(selectedProperty?.name ?? '');
  const [propCity, setPropCity] = useState(selectedProperty?.city ?? '');
  const [propLocality, setPropLocality] = useState(selectedProperty?.locality ?? '');
  const [propBeds, setPropBeds] = useState(String(selectedProperty?.bedCapacity ?? 24));
  const [propSaving, setPropSaving] = useState(false);
  const [propMsg, setPropMsg] = useState<string | null>(null);

  const [memberUidInput, setMemberUidInput] = useState('');
  const [memberNameInput, setMemberNameInput] = useState('');
  const [memberRoleInput, setMemberRoleInput] = useState<'manager' | 'viewer'>('manager');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);

  const ownerCheck = canRolePerformAction(activeRole, 'manage_property_or_purge');

  useEffect(() => {
    setPropName(selectedProperty?.name ?? '');
    setPropCity(selectedProperty?.city ?? '');
    setPropLocality(selectedProperty?.locality ?? '');
    setPropBeds(String(selectedProperty?.bedCapacity ?? 24));
    setPropMsg(null);
  }, [selectedProperty?.id]);

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: isDemoMode ? 'interactive_sandbox' : 'real_organization',
      schemaVersion: 'sahvera-ts-v1',
      dataset,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sahvera-${isDemoMode ? 'sandbox' : 'workspace'}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePurge = async () => {
    if (!ownerCheck.allowed) {
      setPurgeMsg(ownerCheck.reason ?? 'Owner authority required.');
      return;
    }
    await onPurgeRealData();
    setConfirmPurge(false);
    setPurgeMsg('Organization operational records deleted from Cloud Firestore.');
  };

  const handleSavePropSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveProperty || !selectedProperty) return;
    if (!ownerCheck.allowed) {
      setPropMsg(ownerCheck.reason ?? 'Owner authority required.');
      return;
    }
    setPropMsg(null);
    if (propName.trim().length < 2 || propCity.trim().length < 2 || propLocality.trim().length < 2) {
      setPropMsg('Property name, city, and locality must each be at least 2 characters.');
      return;
    }
    const beds = Math.min(1000, Math.max(1, Math.round(Number(propBeds) || 24)));
    setPropSaving(true);
    try {
      await onSaveProperty(selectedProperty.id, {
        name: propName.trim(),
        city: propCity.trim(),
        locality: propLocality.trim(),
        bedCapacity: beds,
      });
      setPropMsg('Property profile saved.');
    } catch (err) {
      setPropMsg(err instanceof Error ? err.message : 'Unable to save property.');
    } finally {
      setPropSaving(false);
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpsertMember) return;
    setMemberMsg(null);
    if (!ownerCheck.allowed) {
      setMemberMsg(ownerCheck.reason ?? 'Only Owner (Maalik) can manage team delegation.');
      return;
    }
    const cleanUid = memberUidInput.trim();
    const cleanName = memberNameInput.trim();
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(cleanUid)) {
      setMemberMsg('Enter a valid Firebase User UID (6–128 alphanumeric/hyphen/underscore chars).');
      return;
    }
    if (cleanName.length < 2) {
      setMemberMsg('Enter a display name for the Warden or Viewer.');
      return;
    }
    setMemberBusy(true);
    try {
      await onUpsertMember({
        userId: cleanUid,
        role: memberRoleInput,
        displayName: cleanName,
      });
      setMemberUidInput('');
      setMemberNameInput('');
      setMemberMsg(`Saved ${cleanName} as ${memberRoleInput === 'manager' ? 'Warden (manager)' : 'Viewer'}.`);
    } catch (err) {
      setMemberMsg(err instanceof Error ? err.message : 'Unable to update team member.');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleRemoveMemberClick = async (uid: string) => {
    if (!onRemoveMember || !ownerCheck.allowed) return;
    setMemberBusy(true);
    setMemberMsg(null);
    try {
      await onRemoveMember(uid);
      setMemberMsg('Team member access removed.');
    } catch (err) {
      setMemberMsg(err instanceof Error ? err.message : 'Unable to remove team member.');
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isDemoMode && selectedProperty && onSaveProperty && (
        <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              Property profile
            </h2>
            <p className="text-xs text-[#4A5957]">
              Update the selected PG or hostel name, city, locality, and bed capacity.
            </p>
          </div>
          <form onSubmit={handleSavePropSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <label htmlFor="settings-prop-name" className="block text-[#4A5957] mb-1">
                Property name
              </label>
              <input
                id="settings-prop-name"
                type="text"
                value={propName}
                onChange={(e) => setPropName(e.target.value)}
                placeholder="e.g. Sai Krupa Residency PG"
                className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm text-[#111C1B]"
                required
              />
            </div>
            <div>
              <label htmlFor="settings-prop-city" className="block text-[#4A5957] mb-1">
                City
              </label>
              <input
                id="settings-prop-city"
                type="text"
                value={propCity}
                onChange={(e) => setPropCity(e.target.value)}
                placeholder="e.g. Bengaluru"
                className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm text-[#111C1B]"
                required
              />
            </div>
            <div>
              <label htmlFor="settings-prop-locality" className="block text-[#4A5957] mb-1">
                Locality / neighborhood
              </label>
              <input
                id="settings-prop-locality"
                type="text"
                value={propLocality}
                onChange={(e) => setPropLocality(e.target.value)}
                placeholder="e.g. Koramangala 4th Block"
                className="min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm text-[#111C1B]"
                required
              />
            </div>
            <div>
              <label htmlFor="settings-prop-beds" className="block text-[#4A5957] mb-1">
                Bed capacity
              </label>
              <input
                id="settings-prop-beds"
                type="number"
                min={1}
                max={1000}
                value={propBeds}
                onChange={(e) => setPropBeds(e.target.value)}
                className="font-mono-num min-h-[38px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1.5 text-sm text-[#111C1B]"
                required
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={propSaving || !ownerCheck.allowed}
                className="min-h-[38px] rounded-md bg-[#0F4C4C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60"
              >
                {propSaving ? 'Saving…' : 'Save property profile'}
              </button>
              {propMsg && (
                <span className="text-xs font-medium text-[#0F4C4C]" role="status">
                  {propMsg}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Team Roles & Warden Delegation */}
      <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#111C1B] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0F4C4C]" aria-hidden="true" />
              <span>Team roles &amp; Warden (caretaker) delegation</span>
            </h2>
            <p className="text-xs text-[#4A5957]">
              Wardens (<code>manager</code>) log vendor updates, attach room photos, and mark prep
              tasks done. Only the Property Owner (<code>owner</code> / Maalik) can approve schedule/cost
              impacts, sign Verified Physical Handover, or purge org data.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded border border-[#DEDBD2] bg-[#F7F6F2] px-2.5 py-1 text-xs font-medium text-[#111C1B]">
            <Shield className="h-3.5 w-3.5 text-[#0F4C4C]" aria-hidden="true" />
            <span>
              Active role:{' '}
              <strong>
                {activeRole === 'owner'
                  ? 'Owner (Maalik)'
                  : activeRole === 'manager'
                  ? 'Warden (manager)'
                  : 'Viewer (read-only)'}
              </strong>
            </span>
          </div>
        </div>

        {isDemoMode ? (
          <div className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] p-3 text-xs text-[#4A5957]">
            Use the <strong>Role</strong> selector in the Workspace Context Bar above to switch
            between <strong>Owner (Maalik)</strong> and <strong>Warden (manager)</strong> and verify
            authority guardrails live in Room 203. Sign in with Google to delegate real Firebase UIDs
            on your Cloud organization.
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {currentUserUid && (
              <div className="rounded-md border border-[#DEDBD2] bg-[#F7F6F2] px-3 py-2 text-[#4A5957]">
                Your Firebase UID:{' '}
                <code className="font-mono-num text-[#111C1B] select-all">{currentUserUid}</code>
              </div>
            )}

            {members.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-[#DEDBD2]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#DEDBD2] bg-[#F7F6F2] text-[#4A5957]">
                    <tr>
                      <th className="px-3 py-2">Member</th>
                      <th className="px-3 py-2">UID</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DEDBD2]">
                    {members.map((m) => (
                      <tr key={m.userId}>
                        <td className="px-3 py-2 font-medium text-[#111C1B]">{m.displayName}</td>
                        <td className="px-3 py-2 font-mono-num text-[11px] text-[#4A5957]">
                          {m.userId}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-[#0F4C4C]">
                            {m.role === 'owner'
                              ? 'Owner (Maalik)'
                              : m.role === 'manager'
                              ? 'Warden (manager)'
                              : 'Viewer'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {m.role !== 'owner' && ownerCheck.allowed && onRemoveMember ? (
                            <button
                              type="button"
                              disabled={memberBusy}
                              onClick={() => handleRemoveMemberClick(m.userId)}
                              className="text-xs font-medium text-[#B91C1C] hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#4A5957]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {onUpsertMember && (
              <form
                onSubmit={handleAddMemberSubmit}
                className="grid gap-3 sm:grid-cols-4 items-end border-t border-[#DEDBD2] pt-3"
              >
                <div>
                  <label htmlFor="member-uid" className="block text-[#4A5957] mb-1">
                    Warden / Member Firebase UID
                  </label>
                  <input
                    id="member-uid"
                    type="text"
                    value={memberUidInput}
                    onChange={(e) => setMemberUidInput(e.target.value)}
                    placeholder="Paste member UID"
                    disabled={!ownerCheck.allowed}
                    className="font-mono-num min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1 disabled:bg-[#F7F6F2]"
                  />
                </div>
                <div>
                  <label htmlFor="member-name" className="block text-[#4A5957] mb-1">
                    Display name
                  </label>
                  <input
                    id="member-name"
                    type="text"
                    value={memberNameInput}
                    onChange={(e) => setMemberNameInput(e.target.value)}
                    placeholder="e.g. Suresh (Night Warden)"
                    disabled={!ownerCheck.allowed}
                    className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] px-2.5 py-1 disabled:bg-[#F7F6F2]"
                  />
                </div>
                <div>
                  <label htmlFor="member-role" className="block text-[#4A5957] mb-1">
                    Assigned role
                  </label>
                  <select
                    id="member-role"
                    value={memberRoleInput}
                    onChange={(e) => setMemberRoleInput(e.target.value as 'manager' | 'viewer')}
                    disabled={!ownerCheck.allowed}
                    className="min-h-[36px] w-full rounded-md border border-[#DEDBD2] bg-white px-2.5 py-1 disabled:bg-[#F7F6F2]"
                  >
                    <option value="manager">Warden (manager)</option>
                    <option value="viewer">Auditor / Viewer (read-only)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={memberBusy || !ownerCheck.allowed}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md bg-[#0F4C4C] px-3 py-1.5 font-semibold text-white hover:bg-[#0A3838] disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{memberBusy ? 'Saving…' : 'Save member role'}</span>
                </button>
              </form>
            )}

            {memberMsg && (
              <p className="text-xs font-medium text-[#0F4C4C]" role="status">
                {memberMsg}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-[#111C1B]">
          Backup, data export &amp; workspace controls
        </h2>
        <p className="text-xs text-[#4A5957]">
          Export your workspace records as JSON at any time. Sandbox resets only affect local
          browser state and never modify your Cloud Firestore records.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#DEDBD2] px-3.5 py-1.5 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export JSON backup</span>
          </button>

          {isDemoMode && (
            <button
              type="button"
              onClick={onResetDemo}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#DEDBD2] px-3.5 py-1.5 text-xs font-medium text-[#0F4C4C] hover:bg-[#F0F5F4]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset sandbox</span>
            </button>
          )}

          {!isDemoMode && !confirmPurge && (
            <button
              type="button"
              disabled={!ownerCheck.allowed}
              onClick={() => setConfirmPurge(true)}
              title={!ownerCheck.allowed ? ownerCheck.reason : undefined}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#B91C1C]/40 px-3.5 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {ownerCheck.allowed ? 'Delete my org rooms & logs' : 'Owner required to delete org'}
              </span>
            </button>
          )}
        </div>

        {confirmPurge && (
          <div className="rounded-md border border-[#B91C1C]/40 bg-red-50 p-3 text-xs space-y-2">
            <div className="font-semibold text-[#991B1B]">
              Confirm permanent deletion of all rooms, tasks, follow-ups, and logs in this organization?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePurge}
                className="min-h-[34px] rounded bg-[#B91C1C] px-3 py-1 font-semibold text-white"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmPurge(false)}
                className="min-h-[34px] rounded border border-[#DEDBD2] bg-white px-3 py-1 text-[#111C1B]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {purgeMsg && (
          <p className="text-xs font-medium text-[#15803D]" role="status">
            {purgeMsg}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-3">
        <button
          type="button"
          aria-expanded={archOpen}
          onClick={() => setArchOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#4A5957] hover:text-[#111C1B]"
        >
          {archOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          <span>Technical Architecture, Legacy Migration Notes &amp; Security Posture</span>
        </button>

        {archOpen && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <p className="text-xs text-[#4A5957]">
                This cloud release is a fresh TypeScript + React + Cloud Firestore implementation; it
                does not automatically access or migrate local SQLite files.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#DEDBD2] bg-[#F7F6F2] text-[#4A5957]">
                    <tr>
                      <th className="px-3 py-2">Prior Python/SQLite capability</th>
                      <th className="px-3 py-2">New TypeScript/Node equivalent</th>
                      <th className="px-3 py-2">Status &amp; boundary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DEDBD2]">
                    {MIGRATION_ROWS.map((row) => (
                      <tr key={row.pythonModule}>
                        <td className="px-3 py-2.5 font-medium text-[#111C1B]">{row.pythonModule}</td>
                        <td className="px-3 py-2.5 text-[#4A5957]">{row.tsModule}</td>
                        <td className="px-3 py-2.5 text-[#4A5957]">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-[#DEDBD2] pt-3 space-y-2 text-xs text-[#4A5957]">
              <div className="font-semibold text-[#111C1B]">Security &amp; operational boundaries</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Least-privilege Firestore rules:</strong> Every read/write is gated on verified Firebase Auth identity and tenant ownership.
                </li>
                <li>
                  <strong>In-memory rate limiter scope:</strong> Per-property AI quota resets on instance recycle unless backed by Redis/Firestore counters.
                </li>
                <li>
                  <strong>Manual WhatsApp copy only:</strong> Operators review and copy messages manually; no unattended automated WhatsApp sending occurs.
                </li>
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
