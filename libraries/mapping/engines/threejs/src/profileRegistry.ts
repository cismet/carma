import type { ProfileFn } from "./types";

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
