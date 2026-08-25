// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared-three-scene-registry", () => ({
  getSharedThreeSceneStatus: vi.fn(),
  subscribeSharedThreeSceneStatus: vi.fn(() => vi.fn()),
}));

vi.mock("./generic-three-layer-registry", () => ({
  genericThreeLayerHasShadeableContent: vi.fn(),
  getGenericThreeLayers: vi.fn(() => []),
  subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
}));

import {
  getSharedThreeSceneStatus,
  subscribeSharedThreeSceneStatus,
} from "./shared-three-scene-registry";
import {
  genericThreeLayerHasShadeableContent,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
} from "./generic-three-layer-registry";
import {
  getShadowSimulationContentStatus,
  subscribeShadowSimulationContentStatus,
} from "./shadow-simulation-content-status";

describe("shadow simulation content status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSharedThreeSceneStatus).mockReturnValue({
      layerVisible: false,
      hasShadeableContent: false,
    });
    vi.mocked(getGenericThreeLayers).mockReturnValue([]);
    vi.mocked(genericThreeLayerHasShadeableContent).mockReturnValue(false);
  });

  it("accepts a visible native fill extrusion without a Three.js runtime", () => {
    const map = {
      getStyle: vi.fn(() => ({
        layers: [{ id: "alkis-buildings", type: "fill-extrusion" }],
      })),
      getLayoutProperty: vi.fn(() => "visible"),
      getPaintProperty: vi.fn(() => 0.8),
    };

    expect(getShadowSimulationContentStatus(map as never)).toEqual({
      hasThreeShadowContent: false,
      hasMapLibreLitExtrusions: true,
      available: true,
    });
  });

  it("ignores hidden or transparent fill extrusions", () => {
    const map = {
      getStyle: vi.fn(() => ({
        layers: [{ id: "alkis-buildings", type: "fill-extrusion" }],
      })),
      getLayoutProperty: vi.fn(() => "none"),
      getPaintProperty: vi.fn(() => 0.8),
    };

    expect(
      getShadowSimulationContentStatus(map as never).hasMapLibreLitExtrusions
    ).toBe(false);

    map.getLayoutProperty.mockReturnValue("visible");
    map.getPaintProperty.mockReturnValue(0);
    expect(getShadowSimulationContentStatus(map as never).available).toBe(
      false
    );
  });

  it("accepts visible ALKIS geometry from the generic Three.js manager", () => {
    vi.mocked(getGenericThreeLayers).mockReturnValue([
      { id: "3d-extrusion-alkis" } as never,
    ]);
    vi.mocked(genericThreeLayerHasShadeableContent).mockReturnValue(true);
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => ({ id: "3d-extrusion-alkis" })),
      getLayoutProperty: vi.fn(() => "visible"),
    };

    expect(getShadowSimulationContentStatus(map as never)).toEqual({
      hasThreeShadowContent: true,
      hasMapLibreLitExtrusions: false,
      available: true,
    });
  });

  it("subscribes to native style and shared Three.js changes", () => {
    const unsubscribeThree = vi.fn();
    const unsubscribeGenericThree = vi.fn();
    vi.mocked(subscribeSharedThreeSceneStatus).mockReturnValue(
      unsubscribeThree
    );
    vi.mocked(subscribeGenericThreeLayers).mockReturnValue(
      unsubscribeGenericThree
    );
    const map = { on: vi.fn(), off: vi.fn() };
    const listener = vi.fn();

    const unsubscribe = subscribeShadowSimulationContentStatus(
      map as never,
      listener
    );

    expect(map.on).toHaveBeenCalledWith("styledata", listener);
    expect(subscribeSharedThreeSceneStatus).toHaveBeenCalledWith(map, listener);
    expect(subscribeGenericThreeLayers).toHaveBeenCalledWith(map, listener);

    unsubscribe();
    expect(map.off).toHaveBeenCalledWith("styledata", listener);
    expect(unsubscribeGenericThree).toHaveBeenCalledOnce();
    expect(unsubscribeThree).toHaveBeenCalledOnce();
  });
});
