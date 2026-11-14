import React from 'react';
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Clock } from 'lucide-react';
import type { FollowUp, Property, Room, WorkspaceDataset } from '../core/types';
import { evaluateHandoverReadiness } from '../core/engine';
import { formatIstDisplay } from '../core/dateUtils';

interface TodayViewProps {
  dataset: WorkspaceDataset;
  selectedPropertyId: string;
  hinglishMode?: boolean;
  onOpenRoom: (roomId: string) => void;
  onResolveFollowUp: (followUp: FollowUp) => void;
  onGoToRooms: () => void;
  onConfigureProperty?: (property: Property) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  dataset,
  selectedPropertyId,
  hinglishMode = false,
  onOpenRoom,
  onResolveFollowUp,
  onGoToRooms,
  onConfigureProperty,
}) => {
  const activeProperty =
    dataset.properties.find((p) => p.id === selectedPropertyId) ?? dataset.properties[0];

  const scopedRooms = dataset.rooms.filter(
    (r) => !selectedPropertyId || r.propertyId === selectedPropertyId
  );
  const scopedRoomIds = new Set(scopedRooms.map((r) => r.id));

  const roomsNeedingAttention = scopedRooms.filter(
    (r) => r.readinessStage === 'at_risk' || r.readinessStage === 'in_progress'
  );

  const openFollowUps = dataset.followUps.filter(
    (f) => scopedRoomIds.has(f.roomId) && f.status === 'open'
  );

  const nowMs = Date.now();
  const overdueFollowUps = openFollowUps.filter((f) => {
    const dueMs = Date.parse(f.dueIso);
    return !Number.isNaN(dueMs) && dueMs < nowMs;
  });

  const handoversForReview = scopedRooms.filter((room) => {
    const rTasks = dataset.tasks.filter((t) => t.roomId === room.id);
    const rConfs = dataset.providerConfirmations.filter((c) => c.roomId === room.id);
    const rFollowUps = dataset.followUps.filter((f) => f.roomId === room.id);
    const rEv = dataset.handoverEvidence.find((e) => e.roomId === room.id);
    const report = evaluateHandoverReadiness({
      tasks: rTasks,
      confirmations: rConfs,
      followUps: rFollowUps,
      evidence: rEv,
    });
    return (
      room.readinessStage === 'ready_for_owner_review' ||
      report.stage === 'ready_for_owner_review' ||
      (room.readinessStage !== 'verified_physical_handover' && rTasks.length > 0)
    );
  });

  const roomName = (roomId: string): string =>
    dataset.rooms.find((r) => r.id === roomId)?.identifier ?? roomId;

  const isDefaultProperty =
    activeProperty &&
    (activeProperty.name === 'My PG Property' || activeProperty.city === 'City');

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-4">
          <div className="text-xs font-medium text-[#4A5957]">
            Rooms needing attention
            {hinglishMode && <span className="block text-[11px] text-[#0F4C4C]">Aaj ke zaroori rooms</span>}
          </div>
          <div className="font-mono-num mt-1 text-2xl font-bold text-[#111C1B]">
            {roomsNeedingAttention.length}
          </div>
        </div>
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-4">
          <div className="text-xs font-medium text-[#4A5957]">
            Open follow-ups
            {hinglishMode && <span className="block text-[11px] text-[#0F4C4C]">Baaki vendor calls</span>}
          </div>
          <div className="font-mono-num mt-1 text-2xl font-bold text-[#111C1B]">
            {openFollowUps.length}
          </div>
        </div>
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-4">
          <div className="text-xs font-medium text-[#4A5957]">
            Overdue follow-ups
            {hinglishMode && <span className="block text-[11px] text-[#B91C1C]">Late vendor updates</span>}
          </div>
          <div className="font-mono-num mt-1 text-2xl font-bold text-[#B91C1C]">
            {overdueFollowUps.length}
          </div>
        </div>
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-4">
          <div className="text-xs font-medium text-[#4A5957]">
            Handovers awaiting review
            {hinglishMode && <span className="block text-[11px] text-[#0F4C4C]">Maalik final check</span>}
          </div>
          <div className="font-mono-num mt-1 text-2xl font-bold text-[#0F4C4C]">
            {handoversForReview.length}
          </div>
        </div>
      </div>

      {isDefaultProperty && activeProperty && onConfigureProperty && (
        <section className="rounded-lg border border-[#0F4C4C]/30 bg-[#F0F5F4]/60 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 shrink-0 text-[#0F4C4C] mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <h2 className="font-display text-sm font-semibold text-[#111C1B]">
                Set up your PG property details
              </h2>
              <p className="text-xs text-[#4A5957]">
                Replace the placeholder property name and locality with your real hostel or PG address before adding rooms.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onConfigureProperty(activeProperty)}
            className="min-h-[38px] shrink-0 rounded-md border border-[#0F4C4C] bg-white px-4 py-1.5 text-xs font-semibold text-[#0F4C4C] hover:bg-[#F0F5F4]"
          >
            Configure property
          </button>
        </section>
      )}

      {scopedRooms.length === 0 ? (
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-8 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#111C1B]">
            No rooms tracked in {activeProperty?.name || 'this property'} yet
          </h2>
          <p className="mx-auto max-w-md text-sm text-[#4A5957]">
            Add a vacant or upcoming turnover room with its preparation checklist to track vendor
            updates, downstream delays, and verified handover evidence.
          </p>
          <button
            type="button"
            onClick={onGoToRooms}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838]"
          >
            Add your first room
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Rooms needing attention
              </h2>
              <span className="font-mono-num text-xs text-[#4A5957]">
                {roomsNeedingAttention.length} active
              </span>
            </div>

            {roomsNeedingAttention.length === 0 ? (
              <p className="text-sm text-[#4A5957]">
                All active rooms in this property are on schedule or verified.
              </p>
            ) : (
              <ul className="divide-y divide-[#DEDBD2]">
                {roomsNeedingAttention.map((room: Room) => (
                  <li key={room.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#111C1B] truncate">
                        {room.identifier}
                      </div>
                      <div className="mt-0.5 text-xs text-[#4A5957]">
                        {room.roomType} · Target{' '}
                        <span className="font-mono-num text-[#111C1B]">
                          {formatIstDisplay(room.targetReadyIso)}
                        </span>{' '}
                        ·{' '}
                        <span
                          className={
                            room.readinessStage === 'at_risk'
                              ? 'font-medium text-[#B91C1C]'
                              : 'text-[#0F4C4C]'
                          }
                        >
                          {room.readinessStage.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenRoom(room.id)}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-md border border-[#DEDBD2] px-3 py-1.5 text-xs font-medium text-[#0F4C4C] hover:bg-[#F7F6F2]"
                    >
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Open &amp; overdue follow-ups
              </h2>
              <span className="font-mono-num text-xs text-[#4A5957]">
                {openFollowUps.length} open
              </span>
            </div>

            {openFollowUps.length === 0 ? (
              <p className="text-sm text-[#4A5957]">
                No pending vendor follow-ups. Saved clarification reminders will appear here until marked resolved.
              </p>
            ) : (
              <ul className="divide-y divide-[#DEDBD2]">
                {openFollowUps.map((f) => {
                  const isOverdue = overdueFollowUps.some((o) => o.id === f.id);
                  return (
                    <li key={f.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-[#4A5957]">
                          <strong className="font-semibold text-[#111C1B]">
                            {roomName(f.roomId)}
                          </strong>{' '}
                          · Due <span className="font-mono-num text-[#111C1B]">{formatIstDisplay(f.dueIso)}</span> ·{' '}
                          <span>{f.verificationState}</span>
                          {isOverdue && (
                            <span className="ml-2 inline-flex items-center gap-1 font-medium text-[#B91C1C]">
                              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Overdue
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenRoom(f.roomId)}
                          className="text-xs font-medium text-[#0F4C4C] hover:underline shrink-0"
                        >
                          View room
                        </button>
                      </div>
                      <p className="text-sm text-[#111C1B]">{f.messageDraft}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onResolveFollowUp(f)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#DEDBD2] px-3 py-1 text-xs font-medium text-[#15803D] hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Mark resolved</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="lg:col-span-2 rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#111C1B]">
                Handovers requiring review
              </h2>
              <span className="font-mono-num text-xs text-[#4A5957]">
                {handoversForReview.length} room(s)
              </span>
            </div>
            {handoversForReview.length === 0 ? (
              <p className="text-sm text-[#4A5957]">
                No rooms currently awaiting handover sign-off.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {handoversForReview.map((room) => {
                  const rTasks = dataset.tasks.filter((t) => t.roomId === room.id);
                  const rConfs = dataset.providerConfirmations.filter((c) => c.roomId === room.id);
                  const rFollowUps = dataset.followUps.filter((f) => f.roomId === room.id);
                  const rEv = dataset.handoverEvidence.find((e) => e.roomId === room.id);
                  const report = evaluateHandoverReadiness({
                    tasks: rTasks,
                    confirmations: rConfs,
                    followUps: rFollowUps,
                    evidence: rEv,
                  });
                  return (
                    <div
                      key={room.id}
                      className="rounded-md border border-[#DEDBD2] p-4 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[#111C1B]">
                          {room.identifier}
                        </div>
                        <div className="text-xs text-[#4A5957] flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {report.canMarkVerifiedHandover
                              ? 'Ready for final verified handover sign-off'
                              : `Blocked: ${report.blockingReasons[0] ?? 'Checks incomplete'}`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenRoom(room.id)}
                        className="min-h-[36px] shrink-0 rounded-md bg-[#0F4C4C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0A3838]"
                      >
                        Review
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
