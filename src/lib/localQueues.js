const DB_NAME = "burger-pos-local";
const DB_VERSION = 3;
const STORES = ["printJobs", "sheetSyncJobs", "lineNotifyJobs", "centralSyncJobs"];

export async function addLocalJob(storeName, job) {
  const db = await openDb();
  const record = {
    id: job.id || `${storeName}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: "PENDING",
    retryCount: 0,
    createdAt: new Date().toISOString(),
    ...job,
  };
  await txStore(db, storeName, "readwrite").add(record);
  return record;
}

export async function listLocalJobs(storeName) {
  const db = await openDb();
  return txStore(db, storeName, "readonly").getAll();
}

export async function updateLocalJob(storeName, job) {
  const db = await openDb();
  await txStore(db, storeName, "readwrite").put({ ...job, updatedAt: new Date().toISOString() });
}

export async function pruneCompletedLocalJobs(storeName, completedStatuses, { keep = 50 } = {}) {
  const db = await openDb();
  const statuses = new Set(completedStatuses || []);
  const jobs = await txStore(db, storeName, "readonly").getAll();
  const completed = jobs
    .filter((job) => statuses.has(job.status))
    .sort((left, right) => getJobTime(right) - getJobTime(left));
  const removable = completed.slice(Math.max(0, Number(keep) || 0));
  for (const job of removable) {
    await txStore(db, storeName, "readwrite").delete(job.id);
  }
  return removable.length;
}

export async function clearLocalJobs(storeName) {
  const db = await openDb();
  await txStore(db, storeName, "readwrite").clear();
}

export async function clearAllLocalJobs() {
  await Promise.all(STORES.map((storeName) => clearLocalJobs(storeName)));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      STORES.forEach((store) => {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "id" });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db, name, mode) {
  const tx = db.transaction(name, mode);
  const store = tx.objectStore(name);
  return {
    add: (value) => requestToPromise(store.add(value), tx),
    put: (value) => requestToPromise(store.put(value), tx),
    getAll: () => requestToPromise(store.getAll(), tx),
    clear: () => requestToPromise(store.clear(), tx),
    delete: (key) => requestToPromise(store.delete(key), tx),
  };
}

function getJobTime(job) {
  const parsed = Date.parse(job?.updatedAt || job?.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function requestToPromise(request, tx) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}
