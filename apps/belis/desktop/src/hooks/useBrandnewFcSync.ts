import { useEffect } from "react";
import type { Map as MaplibreMap, GeoJSONSource } from "maplibre-gl";

interface UseBrandnewFcSyncOptions {
  map: MaplibreMap | null;
  enabled: boolean;
  /** Namespaced source id of the brandnew geojson source on the map. */
  source: string;
  /** Base data URL; the hook polls `${dataUrl}.md5` and reloads the FC when the digest changes. */
  dataUrl: string;
  intervalMs: number;
}

const LOG_PREFIX = "[BRAND-NEW-SYNC]";

export const useBrandnewFcSync = ({
  map,
  enabled,
  source,
  dataUrl,
  intervalMs,
}: UseBrandnewFcSyncOptions): void => {
  useEffect(() => {
    if (!map || !enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMd5: string | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`${dataUrl}.md5`, { cache: "no-store" });
        if (!res.ok) throw new Error(`md5 ${res.status}`);
        const md5 = (await res.text()).trim();
        if (lastMd5 === null) {
          // First tick after mount: MapLibre already loaded the FC when the
          // source was created, so just record the baseline without reloading.
          lastMd5 = md5;
          console.log(LOG_PREFIX, "baseline md5", md5);
        } else if (md5 !== lastMd5) {
          const src = map.getSource(source) as GeoJSONSource | undefined;
          if (src && typeof src.setData === "function") {
            console.log(LOG_PREFIX, "md5 changed, reloading FC", {
              from: lastMd5,
              to: md5,
            });
            // ?v=md5 keeps the URL stable for HTTP caches when nothing
            // changed, but forces a fresh fetch on every digest change.
            src.setData(`${dataUrl}?v=${md5}`);
            lastMd5 = md5;
          } else {
            console.warn(
              LOG_PREFIX,
              "source not yet registered on map; will retry:",
              source
            );
          }
        }
      } catch (err) {
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
