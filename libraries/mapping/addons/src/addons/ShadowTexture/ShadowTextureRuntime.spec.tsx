import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  createInitialShadowSimulationState,
  getSolarPosition,
} from "@carma-mapping/shadow-simulation/core";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";

import { ShadowTextureRuntime } from "./ShadowTextureRuntime";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  capture: vi.fn(),
  cacheGet: vi.fn(async () => null),
  cachePut: vi.fn(),
}));

vi.mock("../ModelCollection/dzb-prm-collection", () => ({
  loadDzbPrmCollection: mocks.load,
}));
vi.mock("./shadow-texture-capture", () => ({
  DZB_SHADOW_SUN_DISC_SAMPLES: 64,
  createDzbPrmShadowCapture: () => ({
    render: mocks.capture,
    dispose: vi.fn(),
  }),
  createDzbPrmShadowFrameCache: () => ({
    get: mocks.cacheGet,
    put: mocks.cachePut,
    clear: vi.fn(),
  }),
}));

const makeProps = (): ComponentProps<typeof ShadowTextureRuntime> => {
  let source: unknown;
  let layer: unknown;
  const listeners = new Map<string, () => void>();
  const map = {
    isStyleLoaded: () => true,
    getZoom: () => 15,
    getBounds: () => ({
      getWest: () => 7.1,
      getEast: () => 7.14,
      getNorth: () => 51.26,
      getSouth: () => 51.23,
    }),
    on: vi.fn((event, listener) => {
      listeners.set(event, listener);
    }),
    off: vi.fn((event) => {
      listeners.delete(event);
    }),
    fire: vi.fn((event) => {
      listeners.get(event)?.();
    }),
    triggerRepaint: vi.fn(),
    setPaintProperty: vi.fn(),
    getSource: () => source,
    getLayer: () => layer,
    addSource: vi.fn((_id, spec) => {
      source = {
        getCanvas: () => spec.canvas,
        coordinates: spec.coordinates,
        setCoordinates: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
      };
    }),
    addLayer: vi.fn((spec) => {
      layer = spec;
    }),
    removeSource: () => {
      source = undefined;
    },
    removeLayer: () => {
      layer = undefined;
    },
  };
  return {
    map: map as unknown as MaplibreMap,
    assetBaseUrl: "https://assets.example/derived",
    manifestUrl: "/geoportal/assets/dz-b-prm/collection.json",
    shadowState: {
      ...createInitialShadowSimulationState(undefined),
      enabled: true,
    },
    dateState: {
      year: 2026,
      dayOfYear: 267,
      minutes: 794,
      timeZone: "Europe/Berlin",
    },
    textureState: {
      quality: "4k",
      mode: "hard",
      captureProjection: "perspective",
      cameraHeightMeters: 2.3,
      cameraHeightAdjusting: false,
      shadowOnly: true,
      status: "idle",
    },
    modelState: {
      visible: false,
      opacity: 1,
      quality: "5m",
      bridge: "existing",
    },
    setTextureState: vi.fn(),
    setDateState: vi.fn(),
  };
};

const installFrameClock = () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => callbacks.delete(key));
  return async (timestamp: number) => {
    now = timestamp;
    await act(async () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(timestamp));
    });
  };
};

describe("shadow capture updates", () => {
  beforeEach(() => {
    mocks.load.mockResolvedValue({
      boardBounds3857: [788836, 6663227, 794575, 6666423],
      anchor3857: [791706, 6664825],
      boardBottomHeightMeters: 124.35,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
      })) as unknown as HTMLCanvasElement["getContext"]
    );
    mocks.capture.mockImplementation(async () => ({
      canvas: document.createElement("canvas"),
      coordinates: [
        [7.1, 51.26],
        [7.14, 51.26],
        [7.14, 51.23],
        [7.1, 51.23],
      ],
    }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("swaps the printable proposal for Bestand plus the realistic bridge and recaptures", async () => {
    const props = makeProps();
    props.modelState = {
      ...props.modelState,
      bridge: "planning",
      visible: false,
    };
    props.textureState = {
      ...props.textureState,
      useCatalogBridgeCaster: true,
    };
    const view = render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(mocks.capture.mock.lastCall![0].visibility).toMatchObject({
      bridge: false,
      bridgeExisting: true,
      catalogBridge: true,
    });
    props.textureState = {
      ...props.textureState,
      useCatalogBridgeCaster: false,
    };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(mocks.capture.mock.lastCall![0].visibility).toMatchObject({
      bridge: true,
      bridgeExisting: false,
      catalogBridge: false,
    });
    props.textureState = {
      ...props.textureState,
      useCatalogBridgeCaster: true,
    };
    props.modelState = { ...props.modelState, bridge: "existing" };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(3));
    expect(mocks.capture.mock.lastCall![0].visibility).toMatchObject({
      bridge: false,
      bridgeExisting: true,
      catalogBridge: false,
    });
  });

  it("delivers every available refresh tick without a 250ms frame delay or WebP work", async () => {
    const tick = installFrameClock();
    const props = makeProps();
    props.shadowState = {
      ...props.shadowState,
      isAnimating: true,
      animationSpeed: 1,
    };
    props.textureState.mode = "sun-disc";
    render(<ShadowTextureRuntime {...props} />);
    await act(async () => {});
    const initialCaptures = mocks.capture.mock.calls.length;
    for (let frame = 1; frame <= 60; frame += 1)
      await tick((frame * 1000) / 60);
    expect(mocks.capture.mock.calls.length - initialCaptures).toBe(60);
    expect(
      mocks.capture.mock.calls.every(
        ([options]) => options.sunDiscSamples === 1
      )
    ).toBe(true);
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.cachePut).not.toHaveBeenCalled();
    const finalSun = getSolarPosition(
      { ...props.dateState, minutes: props.dateState.minutes + 60 },
      DZ_B_PRM_POSITION
    );
    expect(mocks.capture.mock.lastCall![0].sunAzimuthDegrees).toBeCloseTo(
      finalSun.azimuthDegrees,
      8
    );
    expect(
      vi.mocked(props.setDateState).mock.calls.length
    ).toBeGreaterThanOrEqual(3);
    expect(vi.mocked(props.setDateState).mock.calls.length).toBeLessThanOrEqual(
      4
    );
  });

  it("keeps one capture in flight and replaces waiting timestamps with the newest", async () => {
    const tick = installFrameClock();
    const props = makeProps();
    props.shadowState = {
      ...props.shadowState,
      isAnimating: true,
      animationSpeed: 1,
    };
    const image = {
      canvas: document.createElement("canvas"),
      coordinates: [
        [7.1, 51.26],
        [7.14, 51.26],
        [7.14, 51.23],
        [7.1, 51.23],
      ],
    };
    let complete!: (image: unknown) => void;
    mocks.capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    render(<ShadowTextureRuntime {...props} />);
    await act(async () => {});
    for (let frame = 1; frame <= 6; frame += 1) await tick((frame * 1000) / 60);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete(image);
    });
    expect(mocks.capture).toHaveBeenCalledTimes(2);
    const expected = getSolarPosition(
      { ...props.dateState, minutes: props.dateState.minutes + 6 },
      DZ_B_PRM_POSITION
    );
    expect(mocks.capture.mock.lastCall![0].sunAzimuthDegrees).toBeCloseTo(
      expected.azimuthDegrees,
      8
    );
  });

  it("uses the configured manifest when GLBs move to another host and redraws time and height changes", async () => {
    const props = makeProps();
    const view = render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(props.map.addSource).toHaveBeenCalledTimes(1));
    expect(mocks.load).toHaveBeenCalledWith(props.manifestUrl);
    const firstSun = mocks.capture.mock.calls[0][0].sunAzimuthDegrees;

    view.rerender(
      <ShadowTextureRuntime
        {...props}
        dateState={{ ...props.dateState, minutes: 600 }}
      />
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(mocks.capture.mock.lastCall![0].sunAzimuthDegrees).not.toBe(
      firstSun
    );

    view.rerender(
      <ShadowTextureRuntime
        {...props}
        textureState={{ ...props.textureState, cameraHeightMeters: 7.5 }}
      />
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(3));
    expect(mocks.capture.mock.lastCall![0].perspective.cameraHeightMeters).toBe(
      7.5
    );
    expect(props.map.addSource).toHaveBeenCalledTimes(1);

    view.rerender(
      <ShadowTextureRuntime
        {...props}
        textureState={{
          ...props.textureState,
          captureProjection: "orthographic",
        }}
      />
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(4));
    expect(mocks.capture.mock.lastCall![0].perspective).toBeUndefined();

    const softState = { ...props.textureState, mode: "sun-disc" as const };
    view.rerender(
      <ShadowTextureRuntime
        {...props}
        textureState={{ ...softState, cameraHeightAdjusting: true }}
      />
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(5));
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    view.rerender(<ShadowTextureRuntime {...props} textureState={softState} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(6));
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(64);
  });

  it("reports a missing capture manifest instead of silently retaining a stale frame", async () => {
    mocks.load.mockRejectedValue(new Error("Collection HTTP 404"));
    const props = makeProps();
    render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => {
      const update = vi.mocked(props.setTextureState).mock.lastCall?.[0];
      expect(
        typeof update === "function" && update(props.textureState).status
      ).toBe("Aufnahmefehler: Collection HTTP 404");
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("says the model is out of view when the capture comes back empty instead of leaving a progress status", async () => {
    mocks.capture.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ state: "ready", loaded: 1, total: 1, cached: 0 });
      return null;
    });
    const props = makeProps();
    render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => {
      const update = vi.mocked(props.setTextureState).mock.lastCall?.[0];
      expect(
        typeof update === "function" && update(props.textureState).status
      ).toBe("Kein Modell im Bild");
    });
    expect(props.map.addSource).not.toHaveBeenCalled();
  });

  it("keeps the current canvas intact when a style reload restores the same image", async () => {
    const props = makeProps();
    render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(props.map.addSource).toHaveBeenCalledTimes(1));
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockClear();
    act(() => {
      props.map.fire("style.load");
    });
    act(() => {
      props.map.fire("idle");
    });
    const source = props.map.getSource(
      "__shadow_texture_canvas__"
    ) as unknown as { getCanvas: () => HTMLCanvasElement };
    expect(source.getCanvas()).not.toBe(
      (await mocks.capture.mock.results[0].value).canvas
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(props.map.addSource).toHaveBeenCalledTimes(1);
  });

  it("keeps hard shadows while the slider is held and debounces soft refinement after release or animation stop", async () => {
    vi.useFakeTimers();
    const props = makeProps();
    props.textureState.mode = "sun-disc";
    const view = render(<ShadowTextureRuntime {...props} />);
    const flush = (ms = 0) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    await flush();
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(64);

    props.textureState = { ...props.textureState, timeAdjusting: true };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await flush(5000);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    const heldCount = mocks.capture.mock.calls.length;
    props.dateState = { ...props.dateState, minutes: 700 };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await flush(5000);
    expect(
      mocks.capture.mock.calls
        .slice(heldCount)
        .every(([options]) => options.sunDiscSamples === 1)
    ).toBe(true);

    props.textureState = { ...props.textureState, timeAdjusting: false };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await flush(1499);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    await flush(1);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(64);

    props.shadowState = { ...props.shadowState, isAnimating: true };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await flush(5000);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    props.shadowState = { ...props.shadowState, isAnimating: false };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await flush(1499);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    await flush(1);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(64);
  });

  it("updates overlay color and intensity without recapturing and keeps the same appearance at night", async () => {
    const props = makeProps();
    const view = render(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    props.textureState = {
      ...props.textureState,
      color: "#123456",
      intensity: 0.45,
    };
    view.rerender(<ShadowTextureRuntime {...props} />);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(props.map.setPaintProperty).toHaveBeenLastCalledWith(
      "__shadow_texture_raster__",
      "raster-opacity",
      0.45
    );
    const contexts = vi.mocked(HTMLCanvasElement.prototype.getContext).mock
      .results;
    expect(contexts.at(-1)!.value.fillStyle).toBe("#123456");

    props.dateState = { ...props.dateState, minutes: 0 };
    view.rerender(<ShadowTextureRuntime {...props} />);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(mocks.capture.mock.lastCall![0].sunElevationDegrees).toBeLessThan(0);
    expect(mocks.capture.mock.lastCall![0].sunDiscSamples).toBe(1);
    expect(props.map.addSource).toHaveBeenCalledTimes(1);
    expect(props.map.setPaintProperty).toHaveBeenLastCalledWith(
      "__shadow_texture_raster__",
      "raster-opacity",
      0.45
    );
    expect(contexts.at(-1)!.value.fillStyle).toBe("#123456");
  });
});
