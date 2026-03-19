import { sandboxedEvalExternal } from "@carma-commons/sandbox-eval";
import type { Carma3dConfig, ProfileFn } from "./types";

// ─────────────────────────────────────────────────────────────
//  Profile registry: named curve functions for lathe/loft shapes
// ─────────────────────────────────────────────────────────────

const registry = new Map<string, ProfileFn>();

export function registerProfile(name: string, fn: ProfileFn): void {
  registry.set(name, fn);
}

export function getProfile(name: string): ProfileFn {
  const fn = registry.get(name);
  if (!fn) throw new Error(`Unknown profile: "${name}"`);
  return fn;
}

export function hasProfile(name: string): boolean {
  return registry.has(name);
}

// Built-in profiles (matching the original tree crown shapes)
registerProfile("conical", (t) => 1 - t);
registerProfile("parabolic", (t) => Math.sqrt(Math.max(0, 1 - t)));
registerProfile("spherical", (t) => {
  const u = 2 * t - 1;
  return Math.sqrt(Math.max(0, 1 - u * u));
});
registerProfile("gaussian", (t) => Math.exp(-5.0 * (t - 0.35) * (t - 0.35)));
// Hyperbolic currently uses the parabolic profile (visually indistinguishable)
registerProfile("hyperbolic", (t) => Math.sqrt(Math.max(0, 1 - t)));

// ─────────────────────────────────────────────────────────────
//  Inline JS profile compilation via sandboxed eval
// ─────────────────────────────────────────────────────────────

const LUT_PREFIX = "_lut:";
const LUT_SIZE = 101; // samples at t = 0.00 … 1.00

/**
 * Scans a Carma3dConfig's typeMap for profile names that aren't registered.
 * Treats unregistered names as inline JS code, compiles a LUT in the sandbox,
 * and registers a fast interpolating function under a cache key.
 * Must be called (and awaited) before the first synchronous rebuild().
 */
export async function ensureProfiles(config: Carma3dConfig): Promise<void> {
  for (const entry of Object.values(config.typeMap)) {
    if (hasProfile(entry.profileName)) continue;

    const code = entry.profileName;
    const cacheKey = `${LUT_PREFIX}${code}`;

    if (hasProfile(cacheKey)) {
      entry.profileName = cacheKey;
      continue;
    }

    const evalCode = `const fn = ${code}; Array.from({length:${LUT_SIZE}}, (_,i) => fn(i/${
      LUT_SIZE - 1
    }))`;
    const samples = (await sandboxedEvalExternal(evalCode)) as number[];

    const lut = new Float32Array(samples);
    registerProfile(cacheKey, (t: number) => {
      const idx = Math.min(t, 1) * (LUT_SIZE - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, LUT_SIZE - 1);
      return lut[lo] + (lut[hi] - lut[lo]) * (idx - lo);
    });

    entry.profileName = cacheKey;
  }
}
