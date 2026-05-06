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
  /** Notified with the new feature count on every transition (baseline,
   * md5 change, missing → 0, reappear). */
  onCountChange?: (count: number) => void;
}

const LOG_PREFIX = "[BRAND-NEW-SYNC]";

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const useBrandnewFcSync = ({
  map,
  enabled,
  source,
  dataUrl,
  intervalMs,
  onCountChange,
}: UseBrandnewFcSyncOptions): void => {
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  useEffect(() => {
    if (!map || !enabled) return;

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
    };

    const tick = async () => {
      if (stopped) return;
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
          console.warn(
            LOG_PREFIX,
            "source not yet registered on map; will retry:",
            source
          );
          return;
        }
        const wasBaseline = lastMd5 === null && !fcMissing;
        const wasMissing = fcMissing;
        src.setData(fc);
        lastMd5 = md5;
        fcMissing = false;
        if (wasBaseline) {
          console.log(LOG_PREFIX, "baseline md5", { md5, count });
        } else if (wasMissing) {
          console.log(LOG_PREFIX, "md5 reappeared, loaded FC", { md5, count });
        } else {
          console.log(LOG_PREFIX, "md5 changed, loaded FC", { md5, count });
        }
        reportCount(count);
      } catch (err) {
        // Network error (offline, DNS, etc.) — keep current data; only an
        // explicit non-ok response clears the layer.
        console.warn(LOG_PREFIX, "tick failed:", (err as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [map, enabled, source, dataUrl, intervalMs]);
};
