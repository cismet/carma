import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { createInitialShadowSimulationState } from "@carma-mapping/shadow-simulation/core";

import { ShadowTextureRuntime } from "./ShadowTextureRuntime";

const mocks = vi.hoisted(() => ({ load: vi.fn(), capture: vi.fn() }));

vi.mock("../ModelCollection/dzb-prm-collection", () => ({
  loadDzbPrmCollection: mocks.load,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => [],
  subscribeSharedThreeSceneContent: () => () => undefined,
}));
vi.mock("./shadow-texture-capture", () => ({
  DZB_SHADOW_SUN_DISC_SAMPLES: 64,
  createDzbPrmShadowCapture: () => ({
    render: mocks.capture,
    dispose: vi.fn(),
  }),
  createDzbPrmShadowFrameCache: () => ({
    get: async () => null,
    put: vi.fn(),
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
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(props.map.addSource).toHaveBeenCalledTimes(1);
  });
});
