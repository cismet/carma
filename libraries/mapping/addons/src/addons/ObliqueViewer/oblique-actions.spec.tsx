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
    rotationSurface: "auto",
    mapStyle3dEnabled: false,
    previewBasemapLabels: false,
    previewRotationDrape: false,
    previewHoverDrape: false,
    previewCenterDebug: false,
    previewOpticalCenterDebug: true,
    previewScreenCenterDebug: true,
    previewPoolDebug: false,
    previewSeamless: false,
    previewSeamlessMode: "handover",
    previewUprightOnlyWhenCovered: false,
    previewSeamlessCenterY: 0.3,
    viewMode: "oblique",
    selectedSeriesId: null,
    lastActiveSeriesId: null,
    canOrbitCamera: false,
    selectedSourceImageId: null,
    isOn: false,
    title: "Schrägluftbilder",
    panelOpen: false,
    isLoading: false,
    isTargetImageLoading: false,
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
  OBLIQUE_ROTATION_SURFACES: { Surface: "auto", Terrain: "terrain" },
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
vi.mock("../../lib/registry", () => ({
  normalizeAddonEntries: (entries: unknown) => entries ?? [],
}));
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
  it("restores and saves the last active series only when changed, retaining it across on/off", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      lastActiveSeriesId: "2026",
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.lastActiveSeriesId).toBe("2026");
    act(() =>
      view.result.current.publish({
        lastActiveSeriesId: "2026",
        canOrbitCamera: true,
      })
    );
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ lastActiveSeriesId: "2024" }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ lastActiveSeriesId: "2024" })
    );
    act(() =>
      view.result.current.publish({
        lastActiveSeriesId: "2024",
        bearingDeg: 55,
        canOrbitCamera: false,
      })
    );
    expect(channel.save).toHaveBeenCalledOnce();
    act(() => view.result.current.setOn(false));
    expect(view.result.current.lastActiveSeriesId).toBe("2024");
    act(() => view.result.current.setOn(true));
    expect(view.result.current.lastActiveSeriesId).toBe("2024");
    expect(channel.save).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it("roundtrips only last active series through actual storage without restoring a live photo or camera capability", async () => {
    const storage = await vi.importActual<typeof import("./oblique-storage")>(
      "./oblique-storage"
    );
    const key = "last-series-storage-check";
    try {
      storage.saveObliqueState(key, {
        ...storedState(),
        lastActiveSeriesId: "2026",
        selectedImageId: "photo",
        selectedSeriesId: "2026",
        selectedSourceImageId: "source",
        previewVisible: true,
        canOrbitCamera: true,
      });
      expect(JSON.parse(localStorage.getItem(key)!).lastActiveSeriesId).toBe(
        "2026"
      );
      const restored = storage.loadObliqueState(key)!;
      expect(restored.lastActiveSeriesId).toBe("2026");
      expect(restored.selectedImageId).toBeNull();
      expect(restored.selectedSourceImageId).toBeNull();
      expect(restored.selectedSeriesId).toBeNull();
      expect(restored.previewVisible).toBe(false);
      expect(restored.canOrbitCamera).toBe(false);
    } finally {
      localStorage.removeItem(key);
    }
  });

  it.each([undefined, null, "", 2026, false, {}, []])(
    "normalizes malformed last-series value %j to null using actual storage",
    async (value) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "last-series-storage-check";
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            lastActiveSeriesId: value,
            selectedImageId: "untrusted-live-photo",
            canOrbitCamera: true,
          })
        );
        const restored = storage.loadObliqueState(key)!;
        expect(restored.lastActiveSeriesId).toBeNull();
        expect(restored.selectedImageId).toBeNull();
        expect(restored.canOrbitCamera).toBe(false);
      } finally {
        localStorage.removeItem(key);
      }
    }
  );

  it("restores mosaic and only persists an actual mode change", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewSeamlessMode: "mosaic",
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewSeamlessMode).toBe("mosaic");
    act(() => view.result.current.publish({ previewSeamlessMode: "mosaic" }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewSeamlessMode: "handover" }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewSeamlessMode: "handover" })
    );
    act(() =>
      view.result.current.publish({
        previewSeamlessMode: "handover",
        isBusy: true,
      })
    );
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, "handover"],
    ["invalid", "handover"],
    ["image", "handover"],
    ["handover", "handover"],
    ["mosaic", "mosaic"],
  ])(
    "normalizes persisted seamless mode %s to %s",
    async (stored, expected) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "seamless-mode-storage-check";
      localStorage.setItem(
        key,
        JSON.stringify({ previewSeamlessMode: stored })
      );
      try {
        expect(storage.loadObliqueState(key)?.previewSeamlessMode).toBe(
          expected
        );
      } finally {
        localStorage.removeItem(key);
      }
    }
  );

  it("writes the selected mosaic mode through actual storage", async () => {
    const storage = await vi.importActual<typeof import("./oblique-storage")>(
      "./oblique-storage"
    );
    const key = "seamless-mode-storage-check";
    try {
      storage.saveObliqueState(key, {
        ...storedState(),
        previewSeamlessMode: "mosaic",
      });
      expect(JSON.parse(localStorage.getItem(key)!).previewSeamlessMode).toBe(
        "mosaic"
      );
      expect(storage.loadObliqueState(key)?.previewSeamlessMode).toBe("mosaic");
    } finally {
      localStorage.removeItem(key);
    }
  });

  it.each(["best-resolution", "nearest-axis", "invalid", null])(
    "normalizes persisted selection policy %j to the sole nearest-axis path",
    async (selectionStrategy) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "obsolete-selection-policy-check";
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ selectionStrategy, enabledSeriesIds: ["2024"] })
        );
        const restored = storage.loadObliqueState(key)!;
        expect(restored.selectionStrategy).toBe("nearest-axis");
        channel.load.mockReturnValue(restored);
        const view = renderHook(useObliqueViewerActions);
        expect(view.result.current.selectionStrategy).toBe("nearest-axis");
        act(() =>
          view.result.current.publish({
            selectionStrategy: "nearest-axis",
            isBusy: true,
          })
        );
        expect(channel.save).not.toHaveBeenCalled();
        storage.saveObliqueState(key, restored);
        expect(JSON.parse(localStorage.getItem(key)!).selectionStrategy).toBe(
          "nearest-axis"
        );
        view.unmount();
      } finally {
        localStorage.removeItem(key);
      }
    }
  );

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

  it("restores and persists only actual changes to the NG hover photo projection option", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewHoverDrape: true,
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewHoverDrape).toBe(true);
    act(() => view.result.current.publish({ previewHoverDrape: true }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewHoverDrape: false }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewHoverDrape: false })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it.each(["previewOpticalCenterDebug", "previewScreenCenterDebug"] as const)(
    "persists independent %s changes without rewriting identical values",
    (field) => {
      channel.load.mockReturnValue({
        ...storedState(),
        previewCenterDebug: true,
      });
      const view = renderHook(useObliqueViewerActions);
      expect(view.result.current[field]).toBe(true);
      act(() => view.result.current.publish({ [field]: false }));
      expect(channel.save).toHaveBeenCalledOnce();
      expect(channel.save).toHaveBeenLastCalledWith(
        "route-a",
        expect.objectContaining({ [field]: false, previewCenterDebug: true })
      );
      act(() => view.result.current.publish({ [field]: false, isBusy: true }));
      expect(channel.save).toHaveBeenCalledOnce();
      const other =
        field === "previewOpticalCenterDebug"
          ? "previewScreenCenterDebug"
          : "previewOpticalCenterDebug";
      expect(view.result.current[other]).toBe(true);
      view.unmount();
    }
  );

  it.each([false, true])(
    "restores legacy master=%s with both marker subtypes enabled",
    async (previewCenterDebug) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "center-subtype-storage-check";
      try {
        localStorage.setItem(key, JSON.stringify({ previewCenterDebug }));
        expect(storage.loadObliqueState(key)).toMatchObject({
          previewCenterDebug,
          previewOpticalCenterDebug: true,
          previewScreenCenterDebug: true,
        });
      } finally {
        localStorage.removeItem(key);
      }
    }
  );

  it.each([
    [true, false],
    [false, true],
    [false, false],
    [true, true],
  ])(
    "roundtrips independent optical=%s and screen=%s through actual storage",
    async (optical, screen) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "center-subtype-storage-check";
      try {
        const markerState = {
          previewCenterDebug: optical || screen,
          previewOpticalCenterDebug: optical,
          previewScreenCenterDebug: screen,
        };
        storage.saveObliqueState(key, { ...storedState(), ...markerState });
        expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(
          markerState
        );
        expect(storage.loadObliqueState(key)).toMatchObject(markerState);
      } finally {
        localStorage.removeItem(key);
      }
    }
  );

  it("defaults malformed subtype values without activating the master", async () => {
    const storage = await vi.importActual<typeof import("./oblique-storage")>(
      "./oblique-storage"
    );
    const key = "center-subtype-storage-check";
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          previewOpticalCenterDebug: "false",
          previewScreenCenterDebug: null,
        })
      );
      expect(storage.loadObliqueState(key)).toMatchObject({
        previewCenterDebug: false,
        previewOpticalCenterDebug: true,
        previewScreenCenterDebug: true,
      });
    } finally {
      localStorage.removeItem(key);
    }
  });

  it("restores and persists only actual changes to the NG image center debugging option", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewCenterDebug: true,
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewCenterDebug).toBe(true);
    act(() => view.result.current.publish({ previewCenterDebug: true }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewCenterDebug: false }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewCenterDebug: false })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it("restores and persists only actual changes to the image pool debugging option", () => {
    channel.load.mockReturnValue({ ...storedState(), previewPoolDebug: true });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewPoolDebug).toBe(true);
    act(() => view.result.current.publish({ previewPoolDebug: true }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewPoolDebug: false }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewPoolDebug: false })
    );
    act(() => view.result.current.publish({ previewPoolDebug: true }));
    expect(channel.save).toHaveBeenCalledTimes(2);
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewPoolDebug: true })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledTimes(2);
  });

  it("restores seamless navigation and persists only changed opt-in values", () => {
    channel.load.mockReturnValue({ ...storedState(), previewSeamless: true });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewSeamless).toBe(true);
    act(() => view.result.current.publish({ previewSeamless: true }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewSeamless: false }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewSeamless: false })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledOnce();
  });

  it("restores the coverage-only upright option and persists only changed values", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewUprightOnlyWhenCovered: true,
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewUprightOnlyWhenCovered).toBe(true);
    act(() =>
      view.result.current.publish({ previewUprightOnlyWhenCovered: true })
    );
    expect(channel.save).not.toHaveBeenCalled();
    act(() =>
      view.result.current.publish({ previewUprightOnlyWhenCovered: false })
    );
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewUprightOnlyWhenCovered: false })
    );
    act(() =>
      view.result.current.publish({ previewUprightOnlyWhenCovered: true })
    );
    expect(channel.save).toHaveBeenCalledTimes(2);
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewUprightOnlyWhenCovered: true })
    );
    act(() => view.result.current.publish({ isBusy: true }));
    expect(channel.save).toHaveBeenCalledTimes(2);
  });

  it("restores the preferred image centre and persists only changed slider values", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewSeamlessCenterY: 0.4,
    });
    const view = renderHook(useObliqueViewerActions);
    expect(view.result.current.previewSeamlessCenterY).toBe(0.4);
    act(() => view.result.current.publish({ previewSeamlessCenterY: 0.4 }));
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.publish({ previewSeamlessCenterY: 0.25 }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({ previewSeamlessCenterY: 0.25 })
    );
    act(() =>
      view.result.current.publish({
        previewSeamlessCenterY: 0.25,
        isBusy: true,
      })
    );
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

  it("clears target-image loading on switch-off without persisting its runtime updates", () => {
    const view = renderHook(useObliqueViewerActions);
    act(() => view.result.current.setOn(true));
    channel.save.mockClear();
    act(() => view.result.current.publish({ isTargetImageLoading: true }));
    expect(view.result.current.isTargetImageLoading).toBe(true);
    expect(channel.save).not.toHaveBeenCalled();
    act(() => view.result.current.setOn(false));
    expect(view.result.current.isTargetImageLoading).toBe(false);
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

describe("optional 3D styling and mutually exclusive photo modes", () => {
  it("persists style changes once, retains label preference and ignores repeated equal patches", () => {
    channel.load.mockReturnValue({
      ...storedState(),
      previewBasemapLabels: true,
    });
    const hook = renderHook(useObliqueViewerActions);
    expect(hook.result.current.mapStyle3dEnabled).toBe(false);
    act(() => hook.result.current.publish({ mapStyle3dEnabled: true }));
    expect(channel.save).toHaveBeenCalledOnce();
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({
        mapStyle3dEnabled: true,
        previewBasemapLabels: true,
      })
    );
    act(() => hook.result.current.publish({ mapStyle3dEnabled: true }));
    expect(channel.save).toHaveBeenCalledOnce();
    act(() => hook.result.current.publish({ mapStyle3dEnabled: false }));
    expect(hook.result.current.previewBasemapLabels).toBe(true);
    expect(channel.save).toHaveBeenCalledTimes(2);
  });

  it("normalizes all channel writers before equality checks and persistence", () => {
    const hook = renderHook(useObliqueViewerActions);
    act(() =>
      hook.result.current.publish({
        previewHoverDrape: true,
        previewRotationDrape: true,
      })
    );
    act(() => hook.result.current.publish({ previewSeamless: true }));
    expect(hook.result.current).toMatchObject({
      previewSeamless: true,
      previewHoverDrape: false,
      previewRotationDrape: false,
    });
    const saves = channel.save.mock.calls.length;
    act(() =>
      hook.result.current.publish({
        previewSeamless: true,
        previewHoverDrape: true,
        previewRotationDrape: true,
      })
    );
    expect(channel.save).toHaveBeenCalledTimes(saves);
    act(() => hook.result.current.publish({ previewHoverDrape: true }));
    expect(hook.result.current).toMatchObject({
      previewSeamless: false,
      previewHoverDrape: true,
    });
    act(() => hook.result.current.publish({ previewSeamless: true }));
    act(() => hook.result.current.publish({ previewRotationDrape: true }));
    expect(hook.result.current).toMatchObject({
      previewSeamless: false,
      previewHoverDrape: false,
      previewRotationDrape: true,
    });
    expect(channel.save).toHaveBeenLastCalledWith(
      "route-a",
      expect.objectContaining({
        previewSeamless: false,
        previewRotationDrape: true,
      })
    );
  });

  it.each([undefined, false, true, "true", 1])(
    "restores map style opt-in strictly for %s and gives legacy seamless precedence",
    async (stored) => {
      const storage = await vi.importActual<typeof import("./oblique-storage")>(
        "./oblique-storage"
      );
      const key = "ng-style-and-modes";
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            mapStyle3dEnabled: stored,
            previewBasemapLabels: true,
            previewSeamless: true,
            previewHoverDrape: true,
            previewRotationDrape: true,
          })
        );
        const restored = storage.loadObliqueState(key)!;
        expect(restored).toMatchObject({
          mapStyle3dEnabled: stored === true,
          previewBasemapLabels: true,
          previewSeamless: true,
          previewHoverDrape: false,
          previewRotationDrape: false,
        });
        storage.saveObliqueState(key, restored);
        expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
          mapStyle3dEnabled: stored === true,
          previewSeamless: true,
          previewHoverDrape: false,
          previewRotationDrape: false,
        });
      } finally {
        localStorage.removeItem(key);
      }
    }
  );
});
