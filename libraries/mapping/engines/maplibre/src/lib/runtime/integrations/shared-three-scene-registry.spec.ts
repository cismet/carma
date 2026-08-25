// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneStatus,
  subscribeSharedThreeSceneStatus,
} from "./shared-three-scene-registry";

describe("shared Three.js scene registry", () => {
  const dispose = vi.fn();
  const sharedLayer = {
    id: "carma-shared-three-scene",
    dispose,
    hasShadeableContent: vi.fn(() => true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildSharedThreeSceneLayer).mockReturnValue(sharedLayer as never);
  });

  it("shares one layer and disposes it after the final lease", () => {
    const listeners = new Map<string, () => void>();
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    const getLayoutProperty = vi.fn(() => "visible");
    let attached = false;
    addLayer.mockImplementation(() => {
      attached = true;
    });
    removeLayer.mockImplementation(() => {
      attached = false;
    });
    const map = {
      isStyleLoaded: vi.fn(() => true),
      getStyle: vi.fn(() => ({ layers: [{ id: "labels", type: "symbol" }] })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      getLayoutProperty,
      addLayer,
      removeLayer,
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };

    const first = acquireSharedThreeScene(map as never);
    const second = acquireSharedThreeScene(map as never);

    expect(first.layer).toBe(second.layer);
    expect(buildSharedThreeSceneLayer).toHaveBeenCalledOnce();
    expect(addLayer).toHaveBeenCalledWith(sharedLayer, "labels");
    expect(getSharedThreeSceneStatus(map as never)).toEqual({
      layerVisible: true,
      hasShadeableContent: true,
    });
    getLayoutProperty.mockReturnValue("none");
    expect(getSharedThreeSceneStatus(map as never).layerVisible).toBe(false);
    getLayoutProperty.mockReturnValue("visible");

    const statusListener = vi.fn();
    const unsubscribe = subscribeSharedThreeSceneStatus(
      map as never,
      statusListener
    );
    const onContentChange = vi.mocked(buildSharedThreeSceneLayer).mock
      .calls[0]?.[1]?.onContentChange;
    onContentChange?.();
    expect(statusListener).toHaveBeenCalledOnce();
    unsubscribe();

    first.release();
    expect(dispose).not.toHaveBeenCalled();

    second.release();
    expect(removeLayer).toHaveBeenCalledWith(sharedLayer.id);
    expect(dispose).toHaveBeenCalledOnce();
    expect(listeners.has("styledata")).toBe(false);
  });
});
