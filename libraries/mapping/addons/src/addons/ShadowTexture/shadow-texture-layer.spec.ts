import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/registry", () => ({
  resolveAddonEntries: (entries?: unknown[]) =>
    entries?.map((value) => {
      const entry = value as { addon: string; config?: unknown };
      return { kind: entry.addon, config: entry.config };
    }) ?? [],
}));

vi.mock("../../lib/addon-overrides", () => ({
  applyAddonOverrides: (entries: unknown[]) => entries,
}));

import {
  createShadowTextureLayer,
  resolveShadowTextureAddon,
  SHADOW_TEXTURE_LAYER_ID,
} from "./shadow-texture-layer";

describe("shadow-texture layer", () => {
  it("resolves the route addon and builds its selectable layer entry", () => {
    const addon = resolveShadowTextureAddon(
      [{ addon: "shadowTexture", config: { assetBaseUrl: "/models" } }],
      undefined
    );

    expect(createShadowTextureLayer(addon, true)).toEqual(
      expect.objectContaining({
        id: SHADOW_TEXTURE_LAYER_ID,
        title: "Schatten-Textur",
        visible: true,
        tools: [addon],
      })
    );
  });

  it("does not create a row without the addon", () => {
    expect(resolveShadowTextureAddon(undefined, undefined)).toBeNull();
    expect(createShadowTextureLayer(null, false)).toBeNull();
  });
});
