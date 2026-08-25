// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  getGenericThreeLayers,
  notifyGenericThreeLayerContentChanged,
  registerGenericThreeLayer,
  subscribeGenericThreeLayers,
  unregisterGenericThreeLayer,
} from "./generic-three-layer-registry";

describe("generic Three.js layer registry", () => {
  it("publishes layer lifecycle and content changes", () => {
    const map = {} as never;
    const layer = {} as never;
    const listener = vi.fn();
    const unsubscribe = subscribeGenericThreeLayers(map, listener);

    registerGenericThreeLayer(map, layer);
    notifyGenericThreeLayerContentChanged(map);
    expect(getGenericThreeLayers(map)).toEqual([layer]);
    expect(listener).toHaveBeenCalledTimes(2);

    unregisterGenericThreeLayer(map, layer);
    expect(getGenericThreeLayers(map)).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});
