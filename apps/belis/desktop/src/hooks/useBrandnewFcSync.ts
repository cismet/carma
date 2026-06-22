import { useEffect, useRef } from "react";
import type { Map as MaplibreMap, GeoJSONSource } from "maplibre-gl";

interface UseBrandnewFcSyncOptions {
  map: MaplibreMap | null;
  enabled: boolean;
  /** Namespaced source id of the brandnew geojson source on the map. */
  source: string;
  /** Base data URL; the hook polls `${dataUrl}.md5` and reloads the FC when the digest changes. */
  dataUrl: string;
  intervalMs: number;
  /** Monotonic counter bumped by the host on every successful save (the app's
   * `featureDataVersion`). Each change triggers an immediate poll plus a short
   * burst of fast (1s) polls, so the user's own freshly-saved brandnew feature
   * shows up quickly; afterwards the loop returns to the normal `intervalMs`. */
  syncVersion?: number;
  /** Notified with the new feature count on every transition (baseline,
   * md5 change, missing → 0, reappear). */
  onCountChange?: (count: number) => void;
  /** Notified with the FC the hook just pushed to the map. Lets sibling
   * surfaces (e.g. the mini-map) mirror the same data without polling again. */
  onDataChange?: (fc: GeoJSON.FeatureCollection) => void;
}

const LOG_PREFIX = "[BRAND-NEW-SYNC]";

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

// While a save-triggered burst is active the loop polls every second instead
// of `intervalMs` (capped at `intervalMs` so localhost's cadence is never
// slowed down).
const BURST_INTERVAL_MS = 1000;
// How long the fast burst lasts after a save before falling back to the
// normal cadence — long enough to outlast the server-side regeneration of
// brand.new.features.json.
const BURST_DURATION_MS = 15000;

export const useBrandnewFcSync = ({
  map,
  enabled,
  source,
  dataUrl,
  intervalMs,
  syncVersion,
  onCountChange,
  onDataChange,
}: UseBrandnewFcSyncOptions): void => {
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  // Tracks the syncVersion the running poll loop was started for, so the
  // effect can tell a save-triggered restart from an unrelated one.
  const prevSyncVersionRef = useRef(syncVersion);

  useEffect(() => {
    if (!map || !enabled) return;

    // A change in syncVersion (bumped by the host on every successful save)
    // means the user just saved something. Run a short burst of fast (1s)
    // polls so their own brandnew feature appears quickly; unrelated restarts
    // keep the normal interval.
    const isSaveTrigger = syncVersion !== prevSyncVersionRef.current;
    prevSyncVersionRef.current = syncVersion;
    const burstUntil = isSaveTrigger ? Date.now() + BURST_DURATION_MS : 0;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMd5: string | null = null;
    // True once the .md5 sidecar has returned a non-ok status — e.g. the
    // tiles.cismet.de/belis folder is regenerated every morning before the
    // brandnew job runs again, so both the FC and its sidecar are gone for
    // a while. In that window the layer should render nothing.
    let fcMissing = false;
    let lastReportedCount: number | null = null;

    const reportCount = (count: number) => {
      if (lastReportedCount === count) return;
      lastReportedCount = count;
      onCountChangeRef.current?.(count);
    };

    const getSource = () =>
      map.getSource(source) as GeoJSONSource | undefined;

    const clearToEmpty = () => {
      const src = getSource();
      if (src && typeof src.setData === "function") {
        src.setData(EMPTY_FC);
      }
      fcMissing = true;
      lastMd5 = null;
      reportCount(0);
      onDataChangeRef.current?.(EMPTY_FC);
    };

    const tick = async () => {
      if (stopped) return;
      let sourceNotReady = false;
      try {
        const md5Res = await fetch(`${dataUrl}.md5`, { cache: "no-store" });
        if (!md5Res.ok) {
          if (!fcMissing) {
            console.warn(
              LOG_PREFIX,
              `md5 ${md5Res.status} — clearing brandnew FC to []`
            );
            clearToEmpty();
          }
          return;
        }
        const md5 = (await md5Res.text()).trim();
        // Steady-state short-circuit: nothing changed and we already have
        // the right data on the map.
        if (!fcMissing && md5 === lastMd5) return;

        // Always fetch the FC ourselves and pass the parsed object —
        // setData(URL) does not reliably re-render after the source has
        // been set to inline EMPTY_FC (or after the initial style-driven
        // fetch 404'd). Fetching ourselves also lets us report the count.
        // ?v=md5 makes the URL stable so the browser HTTP cache reuses the
        // same response until the digest changes.
        const fcRes = await fetch(`${dataUrl}?v=${md5}`, { cache: "default" });
        if (!fcRes.ok) {
          if (!fcMissing) {
            console.warn(
              LOG_PREFIX,
              `FC ${fcRes.status} despite md5 present — clearing to []`
            );
            clearToEmpty();
          }
          return;
        }
        const fc = (await fcRes.json()) as GeoJSON.FeatureCollection;
        const count = fc.features?.length ?? 0;
        const src = getSource();
        if (!src || typeof src.setData !== "function") {
          sourceNotReady = true;
          console.warn(
            LOG_PREFIX,
            "source not yet registered on map; will retry:",
            source
          );
          return;
        }
        // The server's brandnew FC still ships soft-deleted rows flagged with
        // `is_deleted: true`. They must never be rendered: a deleted feature
        // drawn on top of (or next to) its live counterpart produces an
        // overlapping ghost that steals clicks and corrupts selection. Strip
        // them here so the map source only ever receives live features —
        // regardless of which writer (this hook, or the BelisMapWrapper
        // re-merge effect) last set the data. The full, unfiltered `fc` is
        // still passed to `onDataChange` below, so downstream consumers that
        // need to see deletions (stale-id pruning, counts) keep working.
        const visibleFc: GeoJSON.FeatureCollection = {
          ...fc,
          features: (fc.features ?? []).filter(
            (f) => f.properties?.is_deleted !== true
          ),
        };
        const wasBaseline = lastMd5 === null && !fcMissing;
        const wasMissing = fcMissing;
        src.setData(visibleFc);
        lastMd5 = md5;
        fcMissing = false;
        if (wasBaseline) {
        } else if (wasMissing) {
        } else {
        }
        reportCount(count);
        onDataChangeRef.current?.(fc);
      } catch (err) {
        // Network error (offline, DNS, etc.) — keep current data; only an
        // explicit non-ok response clears the layer.
        console.warn(LOG_PREFIX, "tick failed:", (err as Error).message);
      } finally {
        if (!stopped) {
          const nextDelay =
            sourceNotReady || Date.now() < burstUntil
              ? Math.min(BURST_INTERVAL_MS, intervalMs)
              : intervalMs;
          timer = setTimeout(tick, nextDelay);
        }
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [map, enabled, source, dataUrl, intervalMs, syncVersion]);
};
