// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { acquireSharedThreeScene } from "./shared-three-scene-registry";

describe("shared Three.js scene registry", () => {
  const dispose = vi.fn();
  const sharedLayer = {
    id: "carma-shared-three-scene",
    addRuntime: vi.fn(),
    removeRuntime: vi.fn(),
    getScene: vi.fn(),
    getRenderer: vi.fn(),
    dispose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildSharedThreeSceneLayer).mockReturnValue(sharedLayer as never);
  });

  it("shares one layer and disposes it after the final lease", () => {
    const listeners = new Map<string, () => void>();
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
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

    first.release();
    expect(dispose).not.toHaveBeenCalled();

    second.release();
    expect(removeLayer).toHaveBeenCalledWith(sharedLayer.id);
    expect(dispose).toHaveBeenCalledOnce();
    expect(listeners.has("styledata")).toBe(false);
    expect(listeners.has("style.load")).toBe(false);
    expect(listeners.has("idle")).toBe(false);
  });

  it("adds the layer while sources keep the style in a loading state", () => {
    const addLayer = vi.fn();
    let attached = false;
    addLayer.mockImplementation(() => {
      attached = true;
    });
    const map = {
      isStyleLoaded: vi.fn(() => false),
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(addLayer).toHaveBeenCalledWith(sharedLayer, undefined);
    lease.release();
  });

  it("retries after the host style becomes writable", () => {
    const listeners = new Map<string, () => void>();
    let attached = false;
    const addLayer = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Style is not done loading");
      })
      .mockImplementation(() => {
        attached = true;
      });
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    expect(attached).toBe(false);

    listeners.get("style.load")?.();

    expect(attached).toBe(true);
    expect(addLayer).toHaveBeenCalledTimes(2);
    lease.release();
  });

  it("reuses a mounted shared layer after the module registry was replaced", () => {
    const mountedLayer = {
      ...sharedLayer,
      addRuntime: vi.fn(),
      removeRuntime: vi.fn(),
      getScene: vi.fn(),
    };
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => ({ implementation: mountedLayer })),
      addLayer,
      removeLayer,
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(lease.layer).toBe(mountedLayer);
    expect(buildSharedThreeSceneLayer).not.toHaveBeenCalled();
    expect(addLayer).not.toHaveBeenCalled();

    lease.release();
    expect(removeLayer).toHaveBeenCalledWith(mountedLayer.id);
    expect(mountedLayer.dispose).toHaveBeenCalledOnce();
  });

  it("does not remove a newer shared layer when an old lease releases", () => {
    const replacementLayer = {
      ...sharedLayer,
      addRuntime: vi.fn(),
      removeRuntime: vi.fn(),
      getScene: vi.fn(),
    };
    const removeLayer = vi.fn();
    let mountedLayer: unknown = sharedLayer;
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayer: vi.fn(() => ({ implementation: mountedLayer })),
      addLayer: vi.fn(),
      removeLayer,
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);
    mountedLayer = replacementLayer;
    lease.release();

    expect(removeLayer).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
