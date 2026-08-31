// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { resolveTiles3dErrorTarget } from "./Tiles3dLayerManager";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("resolveTiles3dErrorTarget", () => {
  it("uses a high-quality target for a terrain mesh", () => {
    expect(resolveTiles3dErrorTarget({ providesTerrain: true })).toBe(1);
  });

  it("keeps an explicit style target", () => {
    expect(
      resolveTiles3dErrorTarget({ providesTerrain: true, errorTarget: 1.25 })
    ).toBe(1.25);
  });
});
