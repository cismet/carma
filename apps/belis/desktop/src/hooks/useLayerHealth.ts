import { useEffect, useState } from "react";

import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
} from "../config/mapLayerConfigs";
import {
  probeLayerEntryWithRetry,
  type LayerHealth,
} from "../helper/layerHealth";

export type LayerHealthMap = Record<string, LayerHealth>;

export interface UseLayerHealthResult {
  health: LayerHealthMap;
  /** Device reports no network at all — one note beats ten red rows. */
  offline: boolean;
}

/**
 * Checks every configured layer whenever the settings drawer opens.
 *
 * Re-runs on each opening rather than caching: the point of the check is to
 * tell you whether the layers work *right now* (VPN just dropped, service just
 * came back), and a cached verdict from ten minutes ago cannot do that.
 */
export const useLayerHealth = (open: boolean): UseLayerHealthResult => {
  const [health, setHealth] = useState<LayerHealthMap>({});
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOffline(true);
      setHealth({});
      return;
    }
    setOffline(false);

    const entries = [
      ...Object.entries(backgroundLayerConfigs),
      ...Object.entries(additionalLayerConfigs),
    ];

    // Blue while checking: a working layer must never flicker red on the way.
    setHealth(
      Object.fromEntries(
        entries.map(([key]) => [key, "checking" as LayerHealth])
      )
    );

    let cancelled = false;
    for (const [key, entry] of entries) {
      void probeLayerEntryWithRetry(entry).then((ok) => {
        if (cancelled) return;
        setHealth((prev) => ({ ...prev, [key]: ok ? "ok" : "broken" }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [open]);

  return { health, offline };
};

export default useLayerHealth;
