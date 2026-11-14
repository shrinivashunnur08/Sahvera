import React, { useState } from 'react';
import { Plus, Search, ArrowRight, Pencil } from 'lucide-react';
import type { Room, RoomType, WorkspaceDataset } from '../core/types';
import {
  formatIstDisplay,
  getUpcomingIstDateTimeLocal,
  toDateTimeLocalValue,
} from '../core/dateUtils';

interface RoomsListViewProps {
  dataset: WorkspaceDataset;
  selectedPropertyId: string;
  isDemoMode: boolean;
  defaultOwnerLabel?: string;
  onOpenRoom: (roomId: string) => void;
  onCreateRoom: (input: {
    propertyId: string;
    locality: string;
    identifier: string;
    roomType: RoomType;
    targetReadyIso: string;
    ownerName: string;
    includeDraftTasks: boolean;
  }) => Promise<void>;
  onUpdateRoom: (
    roomId: string,
    patch: { identifier: string; roomType: RoomType; targetReadyIso: string; ownerName: string }
  ) => Promise<void>;
}

export const RoomsListView: React.FC<RoomsListViewProps> = ({
  dataset,
  selectedPropertyId,
  defaultOwnerLabel,
  onOpenRoom,
  onCreateRoom,
  onUpdateRoom,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const defaultProp =
    dataset.properties.find((p) => p.id === selectedPropertyId) ?? dataset.properties[0];

  const [identifier, setIdentifier] = useState('');
  const [locality, setLocality] = useState(defaultProp?.locality ?? '');
  const [roomType, setRoomType] = useState<RoomType>('Single');
  const [targetReadyIso, setTargetReadyIso] = useState(() =>
    getUpcomingIstDateTimeLocal(1, 18, 0)
  );
  const [ownerName, setOwnerName] = useState(defaultOwnerLabel || 'Warden');
  const [includeDraftTasks, setIncludeDraftTasks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredRooms = dataset.rooms
    .filter((r) => !selectedPropertyId || r.propertyId === selectedPropertyId)
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.identifier.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q) ||
        r.roomType.toLowerCase().includes(q)
      );
    });

  const handleOpenCreate = () => {
    setEditingRoom(null);
    setIdentifier('');
    setLocality(defaultProp?.locality ?? '');
    setRoomType('Single');
    setTargetReadyIso(getUpcomingIstDateTimeLocal(1, 18, 0));
    setOwnerName(defaultOwnerLabel || 'Warden');
    setIncludeDraftTasks(true);
    setFormError(null);
    setShowForm(true);
  };

  const handleOpenEdit = (room: Room) => {
    setEditingRoom(room);
    setIdentifier(room.identifier);
    setRoomType(room.roomType);
    setTargetReadyIso(toDateTimeLocalValue(room.targetReadyIso) || room.targetReadyIso);
    setOwnerName(room.ownerName);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!identifier.trim()) {
      setFormError('Room number or name is required (e.g. Room 204).');
      return;
    }
    if (!targetReadyIso.trim() || targetReadyIso.trim().length < 10) {
      setFormError('Please select a target move-in date and time.');
      return;
    }
    if (!ownerName.trim()) {
      setFormError('Responsible operator or warden name is required.');
      return;
    }

    const normalizedIso =
      targetReadyIso.trim().length === 16 ? `${targetReadyIso.trim()}:00+05:30` : targetReadyIso.trim();

    setSubmitting(true);
    try {
      if (editingRoom) {
        await onUpdateRoom(editingRoom.id, {
          identifier: identifier.trim(),
          roomType,
          targetReadyIso: normalizedIso,
          ownerName: ownerName.trim(),
        });
      } else {
        await onCreateRoom({
          propertyId: defaultProp?.id ?? '',
          locality: locality.trim() || defaultProp?.locality || 'Main Locality',
          identifier: identifier.trim(),
          roomType,
          targetReadyIso: normalizedIso,
          ownerName: ownerName.trim(),
          includeDraftTasks,
        });
      }
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="room-search" className="sr-only">
            Search rooms
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A5957]"
            aria-hidden="true"
          />
          <input
            id="room-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by room number, type, or warden…"
            className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] bg-white pl-9 pr-3 py-2 text-sm text-[#111C1B] placeholder:text-[#4A5957]/70 focus-visible:outline-2 focus-visible:outline-[#0F4C4C]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add room</span>
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-[#DEDBD2] bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#111C1B]">
              {editingRoom ? `Edit ${editingRoom.identifier}` : 'Add turnover room'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs font-medium text-[#4A5957] hover:text-[#111C1B]"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-md border border-[#B91C1C]/30 bg-red-50 px-3 py-2 text-sm text-[#991B1B]"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="room-identifier" className="block text-xs font-medium text-[#111C1B] mb-1">
                Room number / label
              </label>
              <input
                id="room-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. Room 204"
                className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] px-3 py-2 text-sm text-[#111C1B]"
                required
              />
            </div>

            {!editingRoom && (
              <div>
                <label htmlFor="room-locality" className="block text-xs font-medium text-[#111C1B] mb-1">
                  Property locality
                </label>
                <input
                  id="room-locality"
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="e.g. Koramangala"
                  className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] px-3 py-2 text-sm text-[#111C1B]"
                />
              </div>
            )}

            <div>
              <label htmlFor="room-type" className="block text-xs font-medium text-[#111C1B] mb-1">
                Occupancy type
              </label>
              <select
                id="room-type"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType)}
                className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] bg-white px-3 py-2 text-sm text-[#111C1B]"
              >
                <option value="Single">Single</option>
                <option value="Double">Double</option>
                <option value="Triple">Triple</option>
                <option value="Studio">Studio</option>
              </select>
            </div>

            <div>
              <label htmlFor="room-target" className="block text-xs font-medium text-[#111C1B] mb-1">
                Target move-in ready time (IST)
              </label>
              <input
                id="room-target"
                type="datetime-local"
                value={toDateTimeLocalValue(targetReadyIso) || targetReadyIso}
                onChange={(e) => setTargetReadyIso(e.target.value)}
                className="font-mono-num min-h-[40px] w-full rounded-md border border-[#DEDBD2] px-3 py-2 text-sm text-[#111C1B]"
                required
              />
            </div>

            <div>
              <label htmlFor="room-owner" className="block text-xs font-medium text-[#111C1B] mb-1">
                Responsible owner / warden
              </label>
              <input
                id="room-owner"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Rajesh (Warden)"
                className="min-h-[40px] w-full rounded-md border border-[#DEDBD2] px-3 py-2 text-sm text-[#111C1B]"
                required
              />
            </div>
          </div>

          {!editingRoom && (
            <label className="inline-flex items-center gap-2 text-sm text-[#111C1B]">
              <input
                type="checkbox"
                checked={includeDraftTasks}
                onChange={(e) => setIncludeDraftTasks(e.target.checked)}
                className="h-4 w-4 accent-[#0F4C4C]"
              />
              <span>
                Add standard PG turnover checklist (Painting → Plumbing &amp; Electrical → Deep Cleaning → Safety Inspection + Independent Wi-Fi)
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838] disabled:opacity-60"
            >
              {submitting ? 'Saving…' : editingRoom ? 'Save room changes' : 'Create room'}
            </button>
          </div>
        </form>
      )}

      {filteredRooms.length === 0 ? (
        <div className="rounded-lg border border-[#DEDBD2] bg-white p-8 text-center space-y-3">
          <h3 className="font-display text-base font-semibold text-[#111C1B]">
            {dataset.rooms.length === 0 ? 'No rooms added yet' : 'No rooms match your search'}
          </h3>
          <p className="text-sm text-[#4A5957]">
            {dataset.rooms.length === 0
              ? 'Add a vacant or upcoming turnover room to start coordinating vendors and handover proof.'
              : 'Try a different room number, occupancy type, or warden name.'}
          </p>
          {dataset.rooms.length === 0 && !showForm && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add first room</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#DEDBD2] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#DEDBD2] bg-[#F7F6F2] text-xs font-semibold text-[#4A5957]">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Target ready</th>
                <th className="px-4 py-3">Tasks</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DEDBD2]">
              {filteredRooms.map((room) => {
                const roomTasks = dataset.tasks.filter((t) => t.roomId === room.id);
                const completedCount = roomTasks.filter((t) => t.status === 'completed').length;
                const prop = dataset.properties.find((p) => p.id === room.propertyId);
                return (
                  <tr key={room.id} className="hover:bg-[#F7F6F2]/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#111C1B]">{room.identifier}</div>
                      <div className="text-xs text-[#4A5957]">
                        {prop?.locality ?? prop?.city ?? 'Property'} · Warden: {room.ownerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#4A5957]">{room.roomType}</td>
                    <td className="px-4 py-3 font-mono-num text-xs text-[#111C1B]">
                      {formatIstDisplay(room.targetReadyIso)}
                    </td>
                    <td className="px-4 py-3 font-mono-num text-xs text-[#4A5957]">
                      {completedCount}/{roomTasks.length} complete
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <span
                        className={
                          room.readinessStage === 'verified_physical_handover'
                            ? 'text-[#15803D]'
                            : room.readinessStage === 'at_risk'
                            ? 'text-[#B91C1C]'
                            : 'text-[#0F4C4C]'
                        }
                      >
                        {room.readinessStage.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {room.readinessStage !== 'verified_physical_handover' && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(room)}
                            aria-label={`Edit ${room.identifier}`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-[#DEDBD2] px-2.5 py-1 text-xs font-medium text-[#4A5957] hover:text-[#111C1B]"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenRoom(room.id)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#0F4C4C] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0A3838]"
                        >
                          <span>Open</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
