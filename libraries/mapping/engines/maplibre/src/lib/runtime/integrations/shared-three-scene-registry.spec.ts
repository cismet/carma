// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

vi.mock("./shared-three-scene-layer", () => ({
  buildSharedThreeSceneLayer: vi.fn(),
}));

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";
import { acquireSharedThreeScene } from "./shared-three-scene-registry";
import { installSharedThreeSceneRegistryFixture } from "./shared-three-scene-registry.fixture";

describe("shared Three.js scene registry", () => {
  const { dispose, sharedLayer } = installSharedThreeSceneRegistryFixture();

  it("enables presentation only while an explicit consumer holds it", () => {
    let attached = false;
    const map = {
      getStyle: () => ({ layers: [] }),
      getLayersOrder: () => [sharedLayer.id],
      getLayer: () => (attached ? sharedLayer : undefined),
      addLayer: () => {
        attached = true;
      },
      removeLayer: () => {
        attached = false;
      },
      on: vi.fn(),
      off: vi.fn(),
    };
    const mesh = acquireSharedThreeScene(map as never);
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenLastCalledWith(
      false
    );
    const style = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });
    const shadows = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenLastCalledWith(
      true
    );
    style.release();
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenLastCalledWith(
      true
    );
    shadows.release();
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenLastCalledWith(
      false
    );
    expect(dispose).not.toHaveBeenCalled();
    mesh.release();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps transient read-only leases out of label maintenance while managed releases still restore presentation", () => {
    let attached = false;
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      getLayersOrder: vi.fn(() => [sharedLayer.id]),
      getLayer: vi.fn(() => (attached ? sharedLayer : undefined)),
      addLayer: vi.fn(() => {
        attached = true;
      }),
      removeLayer: vi.fn(() => {
        attached = false;
      }),
      on: vi.fn(),
      off: vi.fn(),
    };
    const holder = acquireSharedThreeScene(map as never);
    const presentation = acquireSharedThreeScene(map as never, {
      mapStylePresentation: true,
    });
    sharedLayer.setMapStylePresentationEnabled.mockClear();
    map.getLayersOrder.mockClear();
    map.getStyle.mockClear();
    for (let index = 0; index < 32; index++) {
      const transient = acquireSharedThreeScene(map as never);
      expect(transient.layer).toBe(sharedLayer);
      transient.release();
      transient.release();
    }
    vi.advanceTimersByTime(1000);
    expect(map.getLayersOrder).not.toHaveBeenCalled();
    expect(map.getStyle).not.toHaveBeenCalled();
    expect(sharedLayer.setMapStylePresentationEnabled).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    presentation.release();
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenCalledOnce();
    expect(sharedLayer.setMapStylePresentationEnabled).toHaveBeenCalledWith(
      false
    );
    expect(map.getLayersOrder).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    holder.release();
    expect(dispose).toHaveBeenCalledOnce();
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
      getStyle: vi.fn(() => ({
        layers: [
          { id: "basemap", type: "raster" },
          { id: "roads", type: "line" },
          { id: "labels", type: "symbol" },
        ],
      })),
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
    expect(addLayer).toHaveBeenCalledWith(sharedLayer);

    first.release();
    expect(dispose).not.toHaveBeenCalled();

    second.release();
    expect(removeLayer).toHaveBeenCalledWith(sharedLayer.id);
    expect(dispose).toHaveBeenCalledOnce();
    expect(listeners.has("styledata")).toBe(false);
    expect(listeners.has(MAPLIBRE_EVENT.STYLE_LOAD)).toBe(false);
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

    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
    lease.release();
  });

  it("does not redraw raster label overlays above Three", () => {
    const addLayer = vi.fn();
    const map = {
      getStyle: vi.fn(() => ({
        layers: [
          { id: "basemap", type: "raster" },
          {
            id: "---raster-spw2-light-grundriss-0:first---",
            type: "background",
          },
          {
            id: "raster-spw2-light-grundriss-0-raster",
            type: "raster",
          },
          { id: "raster-dop-overlay-1-raster", type: "raster" },
        ],
      })),
      getLayer: vi.fn(() => undefined),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
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

    listeners.get(MAPLIBRE_EVENT.STYLE_LOAD)?.();

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

  it("tolerates MapLibre style teardown during HMR", () => {
    const addLayer = vi.fn(() => {
      throw new Error("style is gone");
    });
    const map = {
      getStyle: vi.fn(() => {
        throw new Error("style is gone");
      }),
      getLayer: vi.fn(() => {
        throw new Error("style is gone");
      }),
      addLayer,
      removeLayer: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const lease = acquireSharedThreeScene(map as never);

    expect(lease.layer).toBe(sharedLayer);
    expect(addLayer).toHaveBeenCalledWith(sharedLayer);
    expect(() => lease.release()).not.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
