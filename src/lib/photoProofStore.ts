import type { ConditionStage } from '../core/types';

export interface StoredRoomPhoto {
  id: string;
  name: string;
  stage: ConditionStage;
  dataUrl: string;
  capturedAtIso: string;
}

const PHOTO_STORAGE_PREFIX = 'sahvera_room_photos_v1:';
const MAX_STORED_PHOTOS_PER_ROOM = 4;

function getStorageKey(orgId: string, roomId: string): string {
  return `${PHOTO_STORAGE_PREFIX}${orgId}:${roomId}`;
}

export function loadPersistedRoomPhotos(orgId: string, roomId: string): StoredRoomPhoto[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(orgId, roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is StoredRoomPhoto =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.dataUrl === 'string' &&
          (item.stage === 'move_in' || item.stage === 'move_out')
      )
      .slice(0, MAX_STORED_PHOTOS_PER_ROOM);
  } catch {
    return [];
  }
}

export function savePersistedRoomPhotos(
  orgId: string,
  roomId: string,
  photos: StoredRoomPhoto[]
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const bounded = photos.slice(0, MAX_STORED_PHOTOS_PER_ROOM);
    if (bounded.length === 0) {
      window.localStorage.removeItem(getStorageKey(orgId, roomId));
      return;
    }
    window.localStorage.setItem(getStorageKey(orgId, roomId), JSON.stringify(bounded));
  } catch {
    // Ignore localStorage quota exceeded cleanly without crashing intake
  }
}

export async function compressImageFileToDataUrl(file: File, maxDimension = 760): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const originalDataUrl = String(reader.result || '');
      if (typeof document === 'undefined') {
        resolve(originalDataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(originalDataUrl);
      img.onload = () => {
        try {
          const ratio = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(originalDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.72);
          resolve(compressed || originalDataUrl);
        } catch {
          resolve(originalDataUrl);
        }
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
