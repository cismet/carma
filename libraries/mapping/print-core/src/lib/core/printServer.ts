import type { PrintInputLayer } from "./types";

const REACHABILITY_TTL_MS = 60_000;
const reachabilityCache = new Map<string, { ok: boolean; at: number }>();

/**
 * Whether the browser can reach a MapFish server. `no-cors` resolves (opaque)
 * for any HTTP answer and only rejects on network failure, so this works
 * without CORS headers on the target.
 */
export const isPrintServerReachable = async (
  mapfishBase: string,
  timeoutMs = 3000
): Promise<boolean> => {
  const cached = reachabilityCache.get(mapfishBase);
  if (cached && Date.now() - cached.at < REACHABILITY_TTL_MS) {
    return cached.ok;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let ok = false;
  try {
    await fetch(`${mapfishBase}/apps.json`, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    ok = true;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  reachabilityCache.set(mapfishBase, { ok, at: Date.now() });
  return ok;
};

export interface PrintTarget {
  layers: PrintInputLayer[];
  /** undefined = default (public) MapFish server. */
  mapfishBase?: string;
  /** Number of internal layers dropped because no internal server was reachable. */
  skippedInternal: number;
}

/**
 * Internal layers can only be rendered by the internal print server. Use it
 * when reachable; otherwise print on the public server without them.
 */
export const resolvePrintTarget = async (
  layers: PrintInputLayer[],
  internalMapfishBase?: string
): Promise<PrintTarget> => {
  const publicLayers = layers.filter((l) => !l.internal);
  const skipped = layers.length - publicLayers.length;
  if (skipped === 0) return { layers, skippedInternal: 0 };
  if (
    internalMapfishBase &&
    (await isPrintServerReachable(internalMapfishBase))
  ) {
    return { layers, mapfishBase: internalMapfishBase, skippedInternal: 0 };
  }
  return { layers: publicLayers, skippedInternal: skipped };
};
