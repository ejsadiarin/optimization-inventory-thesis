const STORAGE_PREFIX = 'formwork-cutting-optimizer:unlocked:';

function isStorageAvailable(): boolean {
  return typeof sessionStorage !== 'undefined';
}

export function isProjectUnlocked(projectId: string): boolean {
  if (!isStorageAvailable()) return false;
  return sessionStorage.getItem(STORAGE_PREFIX + projectId) === 'true';
}

export function unlockProject(projectId: string): void {
  if (!isStorageAvailable()) return;
  sessionStorage.setItem(STORAGE_PREFIX + projectId, 'true');
}

export function lockProject(projectId: string): void {
  if (!isStorageAvailable()) return;
  sessionStorage.removeItem(STORAGE_PREFIX + projectId);
}
