import { createInitialDemoDataset } from '../core/demoSeed';
import type { WorkspaceDataset } from '../core/types';

const SYNTHETIC_STORAGE_KEY = 'sahvera_synthetic_demo_v1';

export function loadSyntheticDemoState(): WorkspaceDataset {
  try {
    const raw = window.localStorage.getItem(SYNTHETIC_STORAGE_KEY);
    if (!raw) return createInitialDemoDataset();
    const parsed = JSON.parse(raw) as WorkspaceDataset;
    if (!parsed?.org?.id || !parsed.org.id.startsWith('demo-')) {
      return createInitialDemoDataset();
    }
    return parsed;
  } catch {
    return createInitialDemoDataset();
  }
}

export function saveSyntheticDemoState(dataset: WorkspaceDataset): void {
  if (!dataset.org.id.startsWith('demo-')) {
    throw new Error('Safety guard: demo store cannot persist non-synthetic organization data.');
  }
  try {
    window.localStorage.setItem(SYNTHETIC_STORAGE_KEY, JSON.stringify(dataset));
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

export function resetSyntheticDemoState(): WorkspaceDataset {
  const fresh = createInitialDemoDataset();
  try {
    window.localStorage.setItem(SYNTHETIC_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Ignore storage quota errors
  }
  return fresh;
}
