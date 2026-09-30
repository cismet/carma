// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Tile } from "3d-tiles-renderer/core";
import type {
  TileDiagnostics,
  TileDiagnosticModel,
  TilesRuntimeDebugState,
} from "@carma-mapping/engines/maplibre";
import { useTileLoadingDebugRuntime } from "./use-tile-loading-debug-runtime";

const shared = vi.hoisted(() => ({ lease: null as unknown }));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  MAPLIBRE_EVENT: {
    RENDER: "render",
    MOVE_START: "movestart",
    MOVE_END: "moveend",
  },
  acquireSharedThreeScene: () => shared.lease,
  registerSharedThreeSceneRuntime: () => () => {},
}));

const ref = <T>(current: T) => ({ current });
const noop = () => {};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("diagnostic publication invalidation", () => {
  it("refreshes published caster cuts without another download or scene revision", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", noop);
    const receiver = {
      content: { uri: "receiver.glb" },
      internal: { loadingState: 4 },
    } as unknown as Tile;
    const caster = {
      content: { uri: "caster.glb" },
      internal: { loadingState: 4 },
    } as unknown as Tile;
    const state = {
      tiles: {
        root: receiver,
        group: new THREE.Group(),
        lruCache: {
          itemSet: new Map([
            [receiver, true],
            [caster, true],
          ]),
        },
        loadingTiles: new Set(),
      },
      displayedMeshFrontier: new Set([receiver]),
      committedMeshCasterFrontier: new Set([receiver]),
      deferred: new Set(),
      meshContentRevision: 7,
      effectiveErrorTarget: 6,
      extentGeometricError: 100,
      extentFloorPending: 0,
      meshBaseCoverageReady: true,
    } as unknown as TilesRuntimeDebugState;
    const coverage = {
      known: 1,
      demanded: 1,
      resident: 1,
      renderable: 1,
      covered: 1,
      ratio: 1,
    };
    const runtime = {
      scene: { id: "mesh", originLngLat: [7, 51] },
      debug: { readState: () => state, setDiagnosticsEnabled: noop },
      loading: {
        getCoverageStatus: () => ({
          baseCoverage: coverage,
          closureCoverage: coverage,
          seamCoverage: coverage,
          waitingForBase: false,
        }),
      },
    };
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    shared.lease = {
      layer: {
        getScene: () => new THREE.Scene(),
        getRuntimes: () => [],
        addRuntime: noop,
        removeRuntime: noop,
      },
      release: noop,
    };
    const map = {
      getContainer: () => container,
      on: noop,
      off: noop,
      triggerRepaint: noop,
    };
    const capture = vi.fn(async (current: TilesRuntimeDebugState) => {
      // The engine owns geometry capture; this fixture isolates the hook's
      // decision to refresh when native published membership changes.
      const published = new Set([
        ...current.displayedMeshFrontier,
        ...current.committedMeshCasterFrontier!,
      ]);
      return {
        model: {
          width: 800,
          height: 600,
          target: 6,
          rects: [],
          extent: null,
          intersectionEdges: null,
          centerHit: null,
          footprintBounds: null,
          viewportBasis: {
            bounds: [0, 0, 0, 1, 1, 1],
            worldToOverview: new THREE.Matrix4().toArray(),
            screen: [1, 0, 0],
            width: 800,
            height: 600,
            tileBounds: [...published].flatMap(() => [0, 0, 0, 1, 1, 1]),
          },
        } as TileDiagnosticModel,
        labelled: [],
        displayed: current.displayedMeshFrontier.size,
      };
    });
    const diagnostics = {
      captureTileDiagnostics: capture,
      summarizeTileDiagnostics: () => null,
      loadingTilesOf: () => [],
      tileId: (tile: Tile) => tile.content?.uri ?? "",
      createTilePipelineTelemetry: () => ({
        sample: () => ({}),
        dispose: noop,
      }),
      createTileDiagnosticScene: () => ({
        syncLoadedGeometry: noop,
        syncSceneExtents: noop,
        syncDebugPlugin: noop,
        syncHoverHelpers: noop,
        dispose: noop,
      }),
      scheduleTileDiagnosticTask: (callback: () => void) => {
        const timer = window.setTimeout(callback, 0);
        return () => window.clearTimeout(timer);
      },
    } as unknown as TileDiagnostics;
    const options = { telemetryEnabled: true, showResident: false };
    const setModel = vi.fn();
    const bindings = {
      map,
      runtimeHandle: runtime,
      options,
      optionsRef: ref(options),
      recorder: { sample: noop, log: noop, elapsed: () => 0 },
      cameraIdsKey: ref(""),
      cameraListeners: ref(new Set()),
      liveCamera: ref(null),
      liveSecondaryCameras: ref([]),
      latest: ref({}),
      hoverRef: ref(null),
      queueHistory: ref(new Map()),
      chartRef: ref(null),
      statusRef: ref(null),
      setCameraIds: noop,
      setHover: noop,
      setModel,
      setQueue: noop,
      setRuntimeReady: noop,
      setSummary: noop,
    } as unknown as Parameters<typeof useTileLoadingDebugRuntime>[1];
    const hook = renderHook(() =>
      useTileLoadingDebugRuntime(diagnostics, bindings)
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(setModel.mock.lastCall![0].viewportBasis.tileBounds).toHaveLength(6);

    // A normal metric sample must keep the existing captured model.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(capture).toHaveBeenCalledTimes(1);
    const pool = (
      state.tiles!.lruCache as unknown as { itemSet: Map<Tile, unknown> }
    ).itemSet;
    (state.committedMeshCasterFrontier as Set<Tile>).add(caster);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(
      (state.tiles!.lruCache as unknown as { itemSet: Map<Tile, unknown> })
        .itemSet
    ).toBe(pool);
    expect(state.meshContentRevision).toBe(7);
    expect(caster.internal.loadingState).toBe(4);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(setModel.mock.lastCall![0].viewportBasis.tileBounds).toHaveLength(
      12
    );
    hook.unmount();
  });
});
