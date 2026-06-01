import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_STORE_ID, isSupabaseConfigured, supabase } from "./supabaseClient.js";

const SYNC_DEBOUNCE_MS = 750;

function serialize(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
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
    setStatus((current) => ({
      ...current,
      mode: "connecting",
      connected: false,
      label: "กำลังเชื่อมต่อ",
      lastError: "",
    }));

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
          setStatus((current) => ({
            ...current,
            mode: "supabase",
            connected: true,
            label: "เชื่อมต่อแล้ว",
            lastError: "",
            syncedAt: new Date().toISOString(),
          }));
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
        label: "ซิงค์แล้ว",
        lastError: "",
        syncedAt: new Date().toISOString(),
      });
    }, SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [hydrationTick, keySignature, keys, payloadSignature, stateSources, storeId]);

  return status;
}
