import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_STORE_ID, isSupabaseConfigured, supabase } from "./supabaseClient.js";

const SUPABASE_SYNC_DEBOUNCE_MS = 750;
const SHEET_SYNC_DEBOUNCE_MS = 1500;
const REMOTE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const REMOTE_REFRESH_MIN_GAP_MS = 5 * 60 * 1000;

function serialize(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

const PRODUCT_LOCAL_IMAGE_FIELDS = ["imageDataUrl", "imageName", "imageSize"];

function sanitizeRemoteStateValue(key, value) {
  if (key !== "products" || !Array.isArray(value)) return value;
  return value.map((product) => {
    if (!product || typeof product !== "object") return product;
    const cleaned = { ...product };
    PRODUCT_LOCAL_IMAGE_FIELDS.forEach((field) => delete cleaned[field]);
    return cleaned;
  });
}

function serializeRemoteStateValue(key, value) {
  return serialize(sanitizeRemoteStateValue(key, value));
}

function mergeStateValue(key, incoming, current) {
  if (!Array.isArray(incoming) || !Array.isArray(current)) {
    return incoming;
  }
  if (key === "purchaseUnits") return mergeRecordsById(current, incoming);
  if (key === "products") return mergeProductsWithLocalImages(incoming, current);
  if (key === "orders") {
    return mergeRecordsById(current, incoming)
      .sort((left, right) => getUpdatedAtTime(right) - getUpdatedAtTime(left));
  }
  return incoming;
}

function mergeProductsWithLocalImages(incoming, current) {
  const localById = new Map((current || []).filter((item) => item?.id).map((item) => [item.id, item]));
  return (incoming || []).map((remoteProduct) => {
    const localProduct = localById.get(remoteProduct?.id);
    if (!localProduct) return remoteProduct;
    const localImage = {};
    PRODUCT_LOCAL_IMAGE_FIELDS.forEach((field) => {
      if (localProduct[field] !== undefined) localImage[field] = localProduct[field];
    });
    return { ...remoteProduct, ...localImage };
  });
}

function mergeRecordsById(localItems, remoteItems) {
  const merged = new Map();
  for (const item of remoteItems) {
    if (item?.id) merged.set(item.id, item);
  }
  for (const item of localItems) {
    if (!item?.id) continue;
    const existing = merged.get(item.id);
    if (!existing || getUpdatedAtTime(item) >= getUpdatedAtTime(existing)) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values());
}

function getUpdatedAtTime(item) {
  const value = Date.parse(
    item?.updatedAt
    || item?.voidedAt
    || item?.closedAt
    || item?.createdAt
    || item?.openedAt
    || "",
  );
  return Number.isFinite(value) ? value : 0;
}

function rememberRemoteValue(lastSerializedRef, key, remoteValue, nextValue) {
  const remoteSerialized = serialize(remoteValue);
  const nextSerialized = serialize(nextValue);
  lastSerializedRef.current[key] = nextSerialized === remoteSerialized
    ? nextSerialized
    : remoteSerialized;
}

function hasLocalStateValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== null && value !== undefined && value !== "";
}

function getCompletenessScore(value) {
  if (!Array.isArray(value)) return hasLocalStateValue(value) ? 1 : 0;
  const ids = value
    .map((item) => {
      if (item && typeof item === "object") return item.id || item.key || item.name || item.label;
      return String(item ?? "");
    })
    .filter(Boolean);
  return ids.length ? new Set(ids).size : value.length;
}

function shouldKeepLocalValue(localValue, remoteValue) {
  if (!hasLocalStateValue(localValue)) return false;
  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return getCompletenessScore(localValue) > getCompletenessScore(remoteValue);
  }
  return true;
}

export function useSupabaseAppState(stateSources, { storeId = SUPABASE_STORE_ID, preferLocalOnHydrate = false } = {}) {
  const sourceRef = useRef(stateSources);
  const lastSerializedRef = useRef({});
  const lastRemoteRefreshRef = useRef(0);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const [hydrationTick, setHydrationTick] = useState(0);
  const [status, setStatus] = useState({
    mode: isSupabaseConfigured ? "connecting" : "local",
    connected: false,
    label: isSupabaseConfigured ? "กำลังเชื่อมต่อ" : "ยังไม่ได้ตั้งค่า",
    lastError: "",
    syncedAt: "",
  });

  sourceRef.current = stateSources;

  const keySignature = Object.keys(stateSources).sort().join("|");
  const keys = useMemo(() => keySignature.split("|").filter(Boolean), [keySignature]);
  const payloadSignature = useMemo(
    () => keys.map((key) => `${key}:${serializeRemoteStateValue(key, stateSources[key]?.[0])}`).join("\n"),
    [keySignature, keys, stateSources],
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let cancelled = false;
    hydratedRef.current = false;
    setStatus({
      mode: "connecting",
      connected: false,
      label: "กำลังเชื่อมต่อ",
      lastError: "",
      syncedAt: "",
    });

    async function hydrate() {
      const { data, error } = await supabase
        .from("pos_app_state")
        .select("key,payload,updated_at")
        .eq("store_id", storeId)
        .in("key", keys);

      if (cancelled) return;

      if (error) {
        setStatus({
          mode: "error",
          connected: false,
          label: "เชื่อมต่อไม่ได้",
          lastError: error.message,
          syncedAt: "",
        });
        hydratedRef.current = true;
        setHydrationTick((tick) => tick + 1);
        return;
      }

      applyingRemoteRef.current = true;
      for (const row of data || []) {
        const entry = sourceRef.current[row.key];
        if (!entry) continue;
        lastSerializedRef.current[row.key] = serialize(row.payload);
        if (preferLocalOnHydrate && shouldKeepLocalValue(entry[0], row.payload)) {
          continue;
        }
        const nextValue = mergeStateValue(row.key, row.payload, entry[0]);
        rememberRemoteValue(lastSerializedRef, row.key, row.payload, nextValue);
        entry[1](nextValue);
      }
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });

      hydratedRef.current = true;
      lastRemoteRefreshRef.current = Date.now();
      setStatus({
        mode: "supabase",
        connected: true,
        label: "เชื่อมต่อแล้ว",
        lastError: "",
        syncedAt: new Date().toISOString(),
      });
      setHydrationTick((tick) => tick + 1);
    }

    void hydrate();

    const channel = supabase
      .channel(`pos-app-state:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_app_state",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row?.key || !sourceRef.current[row.key]) return;
          lastRemoteRefreshRef.current = Date.now();
          const nextSerialized = serialize(row.payload);
          if (lastSerializedRef.current[row.key] === nextSerialized) return;
          const entry = sourceRef.current[row.key];
          if (preferLocalOnHydrate && shouldKeepLocalValue(entry[0], row.payload)) {
            lastSerializedRef.current[row.key] = nextSerialized;
            setHydrationTick((tick) => tick + 1);
            return;
          }
          applyingRemoteRef.current = true;
          const nextValue = mergeStateValue(row.key, row.payload, entry[0]);
          rememberRemoteValue(lastSerializedRef, row.key, row.payload, nextValue);
          entry[1](nextValue);
          queueMicrotask(() => {
            applyingRemoteRef.current = false;
          });
          setStatus({
            mode: "supabase",
            connected: true,
            label: "เชื่อมต่อแล้ว",
            lastError: "",
            syncedAt: new Date().toISOString(),
          });
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus((current) => ({
            ...current,
            mode: "supabase",
            connected: true,
            label: "Realtime พร้อม",
            lastError: "",
          }));
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [keySignature, keys, preferLocalOnHydrate, storeId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let cancelled = false;

    async function refreshRemoteState({ force = false } = {}) {
      if (document.visibilityState === "hidden" || navigator.onLine === false) return;
      const now = Date.now();
      if (!force && now - lastRemoteRefreshRef.current < REMOTE_REFRESH_MIN_GAP_MS) return;
      const { data, error } = await supabase
        .from("pos_app_state")
        .select("key,payload,updated_at")
        .eq("store_id", storeId)
        .in("key", keys);

      if (cancelled || error) return;
      lastRemoteRefreshRef.current = Date.now();
      applyingRemoteRef.current = true;
      for (const row of data || []) {
        const entry = sourceRef.current[row.key];
        if (!entry) continue;
        const nextValue = mergeStateValue(row.key, row.payload, entry[0]);
        if (serialize(entry[0]) === serialize(nextValue)) {
          rememberRemoteValue(lastSerializedRef, row.key, row.payload, nextValue);
          continue;
        }
        rememberRemoteValue(lastSerializedRef, row.key, row.payload, nextValue);
        entry[1](nextValue);
      }
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
      setHydrationTick((tick) => tick + 1);
      setStatus({
        mode: "supabase",
        connected: true,
        label: "ข้อมูลกลางเป็นปัจจุบัน",
        lastError: "",
        syncedAt: new Date().toISOString(),
      });
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshRemoteState();
    };
    const refreshWhenOnline = () => void refreshRemoteState({ force: true });
    const timer = window.setInterval(() => void refreshRemoteState(), REMOTE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenOnline);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenOnline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [keySignature, keys, storeId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !hydratedRef.current || applyingRemoteRef.current) return undefined;

    const changedRows = keys.flatMap((key) => {
      const value = stateSources[key]?.[0];
      const remoteValue = sanitizeRemoteStateValue(key, value);
      const serialized = serialize(remoteValue);
      if (lastSerializedRef.current[key] === serialized) return [];
      return [{
        store_id: storeId,
        key,
        payload: remoteValue,
        updated_at: new Date().toISOString(),
      }];
    });

    if (!changedRows.length) return undefined;

    const timer = window.setTimeout(async () => {
      const { error } = await supabase
        .from("pos_app_state")
        .upsert(changedRows, { onConflict: "store_id,key" });

      if (error) {
        setStatus({
          mode: "error",
          connected: false,
          label: "บันทึก Supabase ไม่สำเร็จ",
          lastError: error.message,
          syncedAt: "",
        });
        return;
      }

      for (const row of changedRows) {
        lastSerializedRef.current[row.key] = serialize(row.payload);
      }
      setStatus({
        mode: "supabase",
        connected: true,
        label: "ซิงก์แล้ว",
        lastError: "",
        syncedAt: new Date().toISOString(),
      });
    }, SUPABASE_SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [hydrationTick, keySignature, keys, payloadSignature, stateSources, storeId]);

  return status;
}

export function useSheetBackedAppState(stateSources, {
  enabled = false,
  sheetId = "",
  webAppUrl = "",
  storeId = SUPABASE_STORE_ID,
} = {}) {
  const sourceRef = useRef(stateSources);
  const lastSerializedRef = useRef({});
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(false);
  const [hydrationTick, setHydrationTick] = useState(0);
  const [status, setStatus] = useState({
    mode: enabled ? "connecting" : "disabled",
    connected: false,
    label: enabled ? "กำลังเชื่อมต่อ Google Sheet" : "ปิดการซิงก์สำรอง",
    lastError: "",
    syncedAt: "",
  });

  sourceRef.current = stateSources;

  const keySignature = useMemo(
    () => Object.keys(stateSources).sort().join("|"),
    [stateSources],
  );
  const keys = useMemo(
    () => keySignature.split("|").filter(Boolean),
    [keySignature],
  );
  const payloadSignature = useMemo(
    () => keys.map((key) => `${key}:${serialize(stateSources[key]?.[0])}`).join("\n"),
    [keySignature, keys, stateSources],
  );

  useEffect(() => {
    if (!enabled || !sheetId || !webAppUrl) {
      hydratedRef.current = false;
      setStatus({
        mode: enabled ? "error" : "disabled",
        connected: false,
        label: enabled ? "ยังไม่ได้ตั้งค่า Google Sheet sync" : "ปิดการซิงก์สำรอง",
        lastError: enabled ? "Missing Google Apps Script Web App URL or Sheet ID" : "",
        syncedAt: "",
      });
      return undefined;
    }

    let cancelled = false;
    hydratedRef.current = false;
    setStatus({
      mode: "connecting",
      connected: false,
      label: "กำลังเชื่อมต่อ Google Sheet",
      lastError: "",
      syncedAt: "",
    });

    async function hydrate() {
      try {
        const result = await postAppState(webAppUrl, {
          action: "getAppState",
          sheetId,
          storeId,
          keys,
        });
        if (cancelled) return;

        const rows = result?.state || {};
        applyingRemoteRef.current = true;
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(rows, key)) continue;
          const entry = sourceRef.current[key];
          if (!entry) continue;
          const nextValue = mergeStateValue(key, rows[key], entry[0]);
          rememberRemoteValue(lastSerializedRef, key, rows[key], nextValue);
          entry[1](nextValue);
        }
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });

        hydratedRef.current = true;
        setStatus({
          mode: "sheet",
          connected: true,
          label: "Google Sheet พร้อมใช้",
          lastError: "",
          syncedAt: new Date().toISOString(),
        });
        setHydrationTick((tick) => tick + 1);
      } catch (error) {
        if (cancelled) return;
        hydratedRef.current = true;
        setStatus({
          mode: "error",
          connected: false,
          label: "Google Sheet ไม่สำเร็จ",
          lastError: error instanceof Error ? error.message : String(error),
          syncedAt: "",
        });
        setHydrationTick((tick) => tick + 1);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [enabled, keySignature, keys, sheetId, storeId, webAppUrl]);

  useEffect(() => {
    if (!enabled || !sheetId || !webAppUrl) return undefined;

    let cancelled = false;

    async function refreshRemoteState() {
      if (document.visibilityState === "hidden") return;
      try {
        const result = await postAppState(webAppUrl, {
          action: "getAppState",
          sheetId,
          storeId,
          keys,
        });
        if (cancelled) return;

        const rows = result?.state || {};
        applyingRemoteRef.current = true;
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(rows, key)) continue;
          const entry = sourceRef.current[key];
          if (!entry) continue;
          const nextValue = mergeStateValue(key, rows[key], entry[0]);
          if (serialize(entry[0]) === serialize(nextValue)) {
            rememberRemoteValue(lastSerializedRef, key, rows[key], nextValue);
            continue;
          }
          rememberRemoteValue(lastSerializedRef, key, rows[key], nextValue);
          entry[1](nextValue);
        }
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
        setHydrationTick((tick) => tick + 1);
        setStatus({
          mode: "sheet",
          connected: true,
          label: "Google Sheet เป็นปัจจุบัน",
          lastError: "",
          syncedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (cancelled) return;
        setStatus({
          mode: "error",
          connected: false,
          label: "Google Sheet ไม่สำเร็จ",
          lastError: error instanceof Error ? error.message : String(error),
          syncedAt: "",
        });
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshRemoteState();
    };
    const timer = window.setInterval(() => void refreshRemoteState(), REMOTE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, keySignature, keys, sheetId, storeId, webAppUrl]);

  useEffect(() => {
    if (!enabled || !sheetId || !webAppUrl || !hydratedRef.current || applyingRemoteRef.current) return undefined;

    const changedRows = keys.flatMap((key) => {
      const value = stateSources[key]?.[0];
      const serialized = serialize(value);
      if (lastSerializedRef.current[key] === serialized) return [];
      return [{ key, payload: value, updatedAt: new Date().toISOString() }];
    });

    if (!changedRows.length) return undefined;

    const timer = window.setTimeout(async () => {
      try {
        await postAppState(webAppUrl, {
          action: "upsertAppState",
          sheetId,
          storeId,
          rows: changedRows,
        });
        for (const row of changedRows) {
          lastSerializedRef.current[row.key] = serialize(row.payload);
        }
        setStatus({
          mode: "sheet",
          connected: true,
          label: "Google Sheet ซิงก์แล้ว",
          lastError: "",
          syncedAt: new Date().toISOString(),
        });
      } catch (error) {
        setStatus({
          mode: "error",
          connected: false,
          label: "Google Sheet ไม่สำเร็จ",
          lastError: error instanceof Error ? error.message : String(error),
          syncedAt: "",
        });
      }
    }, SHEET_SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, hydrationTick, keySignature, keys, payloadSignature, sheetId, stateSources, storeId, webAppUrl]);

  return status;
}

async function postAppState(webAppUrl, payload) {
  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = { ok: response.ok, message: text };
  }
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || result?.message || `App state sync failed (${response.status})`);
  }
  return result || { ok: true };
}
