// Device storage for user data (localStorage). The stored object carries schemaVersion.
import { emptyData, exportData, importData } from './logic.js';

const KEY = 'gym-tracker-data';

export function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyData();
  }
  if (!raw) return emptyData();
  try {
    return importData(raw);
  } catch (err) {
    // Keep the unreadable copy so nothing is silently lost.
    try { localStorage.setItem(`${KEY}-corrupt-${Date.now()}`, raw); } catch { /* storage full */ }
    alert(`Saved data could not be read and was set aside: ${err.message}`);
    return emptyData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, exportData(data));
    return true;
  } catch {
    return false;
  }
}

// Ask the browser not to evict our data. Helps on Chromium/Firefox.
// On iOS Safari it does not override WebKit's 7-day storage cap; installing to the Home Screen does.
export function requestPersistence() {
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
