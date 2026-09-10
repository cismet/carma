import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { ShadowDepthPageCache, shadowDepthPageBytes } from "./shadow-depth-page-cache";

describe("shadow page speculative admission", () => {
  it("reports spare bytes and checks residency without mutating hit counters", () => {
    const cache = new ShadowDepthPageCache();
    const bytes = shadowDepthPageBytes(64, 64);
    cache.setBudget(bytes * 3, bytes);
    const target = new THREE.WebGLRenderTarget(64, 64);
    expect(cache.availableBytes).toBe(bytes * 2);
    expect(cache.admit("sample", "visible", target)).toBe(true);
    expect(cache.availableBytes).toBe(bytes);
    expect(cache.has("sample")).toBe(true);
    expect(cache.has("missing")).toBe(false);
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
    cache.clear();
  });

  it("forbids speculative eviction even if the supplied variant is currently active", () => {
    const cache = new ShadowDepthPageCache();
    const bytes = shadowDepthPageBytes(64, 64);
    cache.setBudget(bytes, 0);
    const old = new THREE.WebGLRenderTarget(64, 64);
    const candidate = new THREE.WebGLRenderTarget(64, 64);
    const disposed = vi.spyOn(old, "dispose");
    expect(cache.admit("old", "old-page", old)).toBe(true);
    cache.setActiveVariants(new Set(["current"]));
    expect(cache.admit("new", "new-page", candidate, "current", { evictInactive: false })).toBe(false);
    expect(cache.has("old")).toBe(true);
    expect(disposed).not.toHaveBeenCalled();
    expect(cache.admit("new", "new-page", candidate, "current")).toBe(true);
    expect(disposed).toHaveBeenCalledOnce();
    cache.clear();
  });
});
