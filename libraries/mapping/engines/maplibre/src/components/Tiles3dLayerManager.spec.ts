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
  it("uses a 4 px target for a regular 3D tiles mesh", () => {
    expect(resolveTiles3dErrorTarget({})).toBe(4);
  });

  it("keeps an explicit style target", () => {
    expect(resolveTiles3dErrorTarget({ errorTarget: 1.25 })).toBe(1.25);
  });
});
