import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_STORE_ID, isSupabaseConfigured, supabase } from "./supabaseClient.js";

const SUPABASE_SYNC_DEBOUNCE_MS = 750;
const SHEET_SYNC_DEBOUNCE_MS = 1500;

function serialize(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

function buildKeyContext(stateSources) {
  const keySignature = Object.keys(stateSources).sort().join("|");
  const keys = keySignature.split("|").filter(Boolean);
  const payloadSignature = keys.map((key) => `${key}:${serialize(stateSources[key]?.[0])}`).join("\n");
  return { keySignature, keys, payloadSignature };
}

export function useSupabaseAppState(stateSources, { storeId = SUPABASE_STORE_ID } = {}) {
  const sourceRef = useRef(stateSources);
  const lastSerializedRef = useRef({});
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
    () => keys.map((key) => `${key}:${serialize(stateSources[key]?.[0])}`).join("\n"),
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
        entry[1](row.payload);
      }
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });

      hydratedRef.current = true;
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
          const nextSerialized = serialize(row.payload);
          if (lastSerializedRef.current[row.key] === nextSerialized) return;
          applyingRemoteRef.current = true;
          lastSerializedRef.current[row.key] = nextSerialized;
          sourceRef.current[row.key][1](row.payload);
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
  }, [keySignature, keys, storeId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !hydratedRef.current || applyingRemoteRef.current) return undefined;

    const changedRows = keys.flatMap((key) => {
      const value = stateSources[key]?.[0];
      const serialized = serialize(value);
      if (lastSerializedRef.current[key] === serialized) return [];
      return [{
        store_id: storeId,
        key,
        payload: value,
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

  const { keySignature, keys, payloadSignature } = useMemo(
    () => buildKeyContext(stateSources),
    [stateSources],
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
          lastSerializedRef.current[key] = serialize(rows[key]);
          entry[1](rows[key]);
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
