import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ObliqueCommand,
  ObliqueViewerState,
} from "@carma-mapping/oblique-viewer";

const channel = vi.hoisted(() => ({
  addons: [{ kind: "obliqueViewer", config: { storageKey: "route-a" } }],
  session: undefined as ObliqueViewerState | undefined,
  load: vi.fn(),
  save: vi.fn(),
  defaults: {
    enabledSeriesIds: null,
    series: [],
    selectionStrategy: "nearest-axis",
    rotationSurface: "mesh",
    previewBasemapLabels: false,
    previewRotationDrape: false,
    viewMode: "oblique",
    selectedSeriesId: null,
    selectedSourceImageId: null,
    isOn: false,
    title: "Schrägluftbilder",
    panelOpen: false,
    isLoading: false,
    isAllDataReady: false,
    error: null,
    selectedImageId: null,
    missingPreviewImageId: null,
    selectedCameraId: null,
    selectedCameraView: null,
    selectedImageBearingDeg: null,
    activeDirection: null,
    bearingDeg: null,
    pitchDeg: null,
    canPan: false,
    hoverAvailable: false,
    previewVisible: false,
    isBusy: false,
    downloadUrl: null,
    downloadOptions: null,
    request: null,
    requestSequence: 0,
  } as ObliqueViewerState,
}));
vi.mock("@carma-mapping/oblique-viewer", () => ({
  OBLIQUE_STATE_DEFAULT: channel.defaults,
  formatImageLabel: (_direction: unknown, imageId: string | null) =>
    imageId ?? "…",
  requestObliqueCommand: (
    state: ObliqueViewerState,
    command: ObliqueCommand
  ) => ({
    ...state,
    requestSequence: state.requestSequence + 1,
    request: { ...command, seq: state.requestSequence + 1 },
  }),
  acknowledgeObliqueRequest: (state: ObliqueViewerState, seq: number) =>
    state.request?.seq === seq ? { ...state, request: null } : state,
}));
vi.mock("../../lib/AddonStateContext", async () => {
  const { useState } = await import("react");
  return {
    useRouteAddons: () => channel.addons,
    useAddonState: () => useState(channel.session),
  };
});
vi.mock("./oblique-storage", () => ({
  loadObliqueState: channel.load,
  saveObliqueState: channel.save,
  obliqueStateStorageKey: (addons: typeof channel.addons) =>
    addons[0]?.config.storageKey ?? "default",
}));

import { useObliqueViewerActions } from "./oblique-actions";

const storedState = (): ObliqueViewerState => ({
  ...channel.defaults,
  isOn: true,
  title: "Stored imagery",
  enabledSeriesIds: ["2024"],
});
beforeEach(() => {
  vi.clearAllMocks();
  channel.addons = [
    { kind: "obliqueViewer", config: { storageKey: "route-a" } },
  ];
  channel.session = undefined;
  channel.load.mockReset().mockReturnValue(storedState());
});
afterEach(() => cleanup());

describe("oblique options storage", () => {
  it("restores the stored selection policy and persists only actual strategy changes", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      selectionStrategy: "best-resolution",
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.selectionStrategy).toBe("best-resolution");
    act(() =>
      view.result.current.publish({ selectionStrategy: "best-resolution" })
    );
    expect(channel.save).not.toHaveBeenCalled();
    act(() =>
      view.result.current.publish({ selectionStrategy: "nearest-axis" })
    );
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({
        selectionStrategy: "nearest-axis",
        enabledSeriesIds: ["2024"],
      })
    );
    act(() => {
      view.result.current.publish({ hoverAvailable: true });
      view.result.current.publish({
        selectionStrategy: "nearest-axis",
        isBusy: true,
      });
    });
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.load).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("persists a changed NG rotation surface without saving other runtime state", () => {
    const view = renderHook(useObliqueViewerActions);
    act(() => view.result.current.publish({ rotationSurface: "terrain" }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ rotationSurface: "terrain" })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it("restores and persists only actual changes to the NG photo projection option", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewRotationDrape: true,
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewRotationDrape).toBe(true);
    act(() => view.result.current.publish({ previewRotationDrape: true }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewRotationDrape: false }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewRotationDrape: false })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it("loads a route once and keeps camera, busy, preview and download updates out of persistence", () => {
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.enabledSeriesIds).toEqual(["2024"]);
    expect(channel.load).toHaveBeenCalledWith("route-a");
    act(() => {
      view.result.current.publish({
        bearingDeg: 90 as ObliqueViewerState["bearingDeg"],
        pitchDeg: 45 as ObliqueViewerState["pitchDeg"],
        selectedImageId: "2024:photo",
        enabledSeriesIds: ["2024"],
      });
      view.result.current.publish({ isBusy: true });
      view.result.current.publish({ previewVisible: true });
      view.result.current.publish({ missingPreviewImageId: "2024:photo" });
      view.result.current.publish({
        downloadUrl: "https://imagery.test/photo.tif",
        downloadOptions: null,
      });
    });
    channel.addons = [...channel.addons];
    view.rerender();
    expect(view.result.current.previewVisible).toBe(true);
    expect(view.result.current.selectedImageId).toBe("2024:photo");
    expect(channel.load).toHaveBeenCalledOnce();
    expect(channel.save).not.toHaveBeenCalled();
    view.unmount();
  });

  it("persists only changed on/off, title and enabled-series options", () => {
    const view = renderHook(useObliqueViewerActions);
    act(() => view.result.current.setOn(false));
    expect(channel.save).toHaveBeenCalledTimes(1);
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ isOn: false })
    );
    act(() => view.result.current.publish({ title: "New imagery" }));
    expect(channel.save).toHaveBeenCalledTimes(2);
    act(() =>
      view.result.current.setEnabledSeriesIds(["2026", "2026", "2024"])
    );
    expect(channel.save).toHaveBeenCalledTimes(3);
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({
        title: "New imagery",
        enabledSeriesIds: ["2026", "2024"],
      })
    );
    act(() => {
      view.result.current.setOn(false);
      view.result.current.publish({ title: "New imagery" });
      view.result.current.setEnabledSeriesIds(["2026", "2024"]);
    });
    expect(channel.save).toHaveBeenCalledTimes(3);
    expect(channel.load).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("does not persist commands, acknowledgements, panel state or identical runtime patches", () => {
    const view = renderHook(useObliqueViewerActions);
    act(() => view.result.current.sendRequest({ type: "flyToImage" }));
    const seq = view.result.current.request!.seq;
    act(() => {
      view.result.current.clearRequest(seq);
      view.result.current.clearRequest(seq);
      view.result.current.setPanelOpen(true);
      view.result.current.publish({
        isBusy: false,
        previewVisible: false,
        downloadUrl: null,
      });
    });
    expect(view.result.current.request).toBeNull();
    expect(view.result.current.panelOpen).toBe(true);
    expect(channel.save).not.toHaveBeenCalled();
    expect(channel.load).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("reads a fresh stored state only when the route storage key changes", () => {
    channel.load.mockImplementation((key: string) => ({
      ...storedState(),
      title: key,
    }));
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.title).toBe("route-a");
    channel.addons = [
      { kind: "obliqueViewer", config: { storageKey: "route-b" } },
    ];
    view.rerender();
    expect(view.result.current.title).toBe("route-b");
    expect(channel.load.mock.calls).toEqual([["route-a"], ["route-b"]]);
    view.rerender();
    expect(channel.load).toHaveBeenCalledTimes(2);
    expect(channel.save).not.toHaveBeenCalled();
    view.unmount();
  });
});
