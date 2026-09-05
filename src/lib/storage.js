import { useEffect, useState } from "react";

const STATE_DB_NAME = "burger-pos-state-v2";
const STATE_DB_VERSION = 1;
const STATE_STORE_NAME = "values";

export function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence is best-effort; the app should keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useIndexedDbPersistentState(key, fallback, { legacyLocalStorageKey = key } = {}) {
  const [value, setValue] = useState(() => {
    try {
      const raw = legacyLocalStorageKey ? localStorage.getItem(legacyLocalStorageKey) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    let cancelled = false;
    readIndexedDbValue(key)
      .then((stored) => {
        if (cancelled || stored === undefined) return;
        setValue((current) => mergePersistedRecords(current, stored));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    writeIndexedDbValue(key, value)
      .then(() => {
        if (legacyLocalStorageKey) localStorage.removeItem(legacyLocalStorageKey);
      })
      .catch(() => {});
  }, [key, legacyLocalStorageKey, value]);

  return [value, setValue];
}

function mergePersistedRecords(current, stored) {
  if (!Array.isArray(current) || !Array.isArray(stored)) return stored;
  const merged = new Map();
  for (const item of stored) {
    if (item?.id) merged.set(item.id, item);
  }
  for (const item of current) {
    if (!item?.id) continue;
    const existing = merged.get(item.id);
    const currentTime = getRecordTime(item);
    const existingTime = getRecordTime(existing);
    if (!existing || currentTime >= existingTime) merged.set(item.id, item);
  }
  return [...merged.values()].sort((left, right) => getRecordTime(right) - getRecordTime(left));
}

function getRecordTime(item) {
  const parsed = Date.parse(item?.updatedAt || item?.voidedAt || item?.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function openStateDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB_NAME, STATE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STATE_STORE_NAME)) {
        request.result.createObjectStore(STATE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedDbValue(key) {
  const db = await openStateDb();
  return requestToPromise(db.transaction(STATE_STORE_NAME, "readonly").objectStore(STATE_STORE_NAME).get(key));
}

async function writeIndexedDbValue(key, value) {
  const db = await openStateDb();
  return requestToPromise(db.transaction(STATE_STORE_NAME, "readwrite").objectStore(STATE_STORE_NAME).put(value, key));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
