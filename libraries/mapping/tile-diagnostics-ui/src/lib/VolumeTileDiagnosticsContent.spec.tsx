// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  TileDiagnostics,
} from "@carma-mapping/engines/maplibre";
import { createVolumeTileDiagnostics } from "./VolumeTileDiagnosticsContent";

const shared = vi.hoisted(() => ({
  runtime: null as unknown,
  volumes: [{ id: "first", minimum: [0, 0, 0], maximum: [1, 1, 1] }],
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  TILE_CAMERA_ROLE: { RECEIVER: "receiver" },
  TILE_DIAGNOSTIC_CAMERA_FOCUS: { LIVE: "live", ALL: "all" },
  TILE_DIAGNOSTIC_LABEL_MODE: { NONE: "none", ID: "id" },
  TILE_DIAGNOSTIC_OVERVIEW_UP: { TILESET: "tileset" },
  TILE_DIAGNOSTIC_PROJECTION: { CAMERA: "camera", PLAN: "plan" },
  TILE_VOLUME_STATE: { LOADING: "loading" },
  acquireSharedThreeScene: () => ({
    layer: {
      addRuntime: (runtime: unknown) => {
        shared.runtime = runtime;
      },
      removeRuntime: () => {},
      getRuntimes: () => [{ getActiveTileVolumes: () => shared.volumes }],
    },
    release: () => {},
  }),
  registerSharedThreeSceneRuntime: () => () => {},
}));
vi.mock("./TileDiagnosticOverlay", () => ({
  createTileDiagnosticOverlayComponent: () => () => null,
}));
vi.mock("antd", () => ({ Button: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("volume diagnostic trailing capture", () => {
  it("captures the latest throttled tile once after rendering stops and cancels on close", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    const capture = vi.fn(
      (_input: { volumes: readonly { id: string }[] }) => null
    );
    const diagnostics = {
      buildVolumeOverlayModel: capture,
      scheduleTileDiagnosticTask: (callback: () => void) => {
        const timer = window.setTimeout(callback, 0);
        return () => window.clearTimeout(timer);
      },
    } as unknown as TileDiagnostics;
    const map = {
      getCenter: () => ({ lat: 51, lng: 7 }),
      triggerRepaint: () => {},
    } as unknown as MapLibreMap;
    const Component = createVolumeTileDiagnostics(diagnostics);
    const view = render(<Component map={map} />);
    const runtime = shared.runtime as SharedThreeSceneRuntime;
    const frame = {
      renderCamera: new PerspectiveCamera(),
    } as SharedThreeSceneFrame;
    act(() => {
      runtime.update!(frame);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(capture).toHaveBeenCalledTimes(1);

    shared.volumes = [
      ...shared.volumes,
      { id: "last", minimum: [2, 0, 0], maximum: [3, 1, 1] },
    ];
    act(() => {
      runtime.update!(frame);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });
    act(() => {
      runtime.update!(frame);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    // No additional scene frame: the pending final state still reaches capture.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(capture).toHaveBeenCalledTimes(2);
    expect(
      capture.mock.lastCall![0].volumes.map(({ id }: { id: string }) => id)
    ).toEqual(["first", "last"]);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(capture).toHaveBeenCalledTimes(2);

    act(() => {
      runtime.update!(frame);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    act(() => {
      runtime.update!(frame);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(capture).toHaveBeenCalledTimes(3);
  });
});
