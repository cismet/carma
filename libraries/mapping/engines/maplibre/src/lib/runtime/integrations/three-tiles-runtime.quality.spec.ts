// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";

import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";

import { HIDDEN_TAB_WIPE_DELAY_MS } from "./three-tiles-runtime-config";
const MIB = 1024 ** 2;

type BytesRenderer = {
  calculateBytesUsed: (tile: unknown, scene: THREE.Object3D | null) => number;
};

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("quality runtime integration", () => {
  it("does not retraverse for an unchanged error target", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera();

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });
    const dispatchSpy = vi.spyOn(renderer!, "dispatchEvent");

    layer.loading.setErrorTarget(1);
    const callsAfterChange = dispatchSpy.mock.calls.length;
    layer.loading.setErrorTarget(1);

    expect(dispatchSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(callsAfterChange);

    layer.scene.dispose();
    updateSpy.mockRestore();
  });

  it("relaxes non-terrain layer precision under its own cache pressure", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const updateErrorTargets: number[] = [];
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
        updateErrorTargets.push(this.errorTarget);
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getZoom: () => 17,
      getPitch: () => 45,
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      // Pin the ceiling this test fills; the desktop default is 6 GiB.
      {
        providesTerrain: false,
        cacheBudgetBytes: 1024 ** 3,
        cacheOverflowBytes: 0,
      }
    );
    const viewCamera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    };

    layer.loading.setErrorTarget(0.25);
    layer.scene.onAdd?.(map);
    layer.scene.setShadowView({
      camera: new THREE.OrthographicCamera(),
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.scene.update(frame);

    // A displayed placeholder above the target whose child still has to load,
    // and one used tile that fills the whole ceiling: full, idle, unconverged.
    const visibleTile = {
      traversal: { error: 1, inFrustum: true },
      engineData: {},
      children: [{ internal: { hasContent: true, loadingState: 0 } }],
    } as never;
    const requiredTile = {} as never;
    const disposeRequiredTile = vi.fn();
    renderer!.visibleTiles.add(visibleTile);
    (renderer as TilesRenderer & { usedSet: Set<unknown> }).usedSet.add(
      requiredTile
    );
    renderer!.lruCache.add(requiredTile, disposeRequiredTile);
    renderer!.lruCache.setMemoryUsage(requiredTile, 2 * 1024 ** 3);

    layer.scene.update(frame);
    expect(disposeRequiredTile).not.toHaveBeenCalled();
    expect(renderer!.errorTarget).toBe(0.25);
    expect(layer.loading.getRequestDemand()).toBeGreaterThan(0);

    vi.advanceTimersByTime(999);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(0.25);

    vi.advanceTimersByTime(1);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(0.5);
    expect(layer.scene.isMainViewReady()).toBe(false);
    expect(updateErrorTargets).toEqual([0.25, 0.25, 0.25, 0.25]);

    // A pan keeps the effective target; the next stall relaxes further, up to
    // four times the requested target.
    handlers.get("movestart")?.();
    handlers.get("moveend")?.();
    expect(renderer!.errorTarget).toBe(0.5);
    layer.scene.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(1);
    layer.scene.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(1);

    // A hidden tab keeps the used tiles and the effective target for a
    // while; the debounced full wipe resets to the requested target.
    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(disposeRequiredTile).not.toHaveBeenCalled();
    expect(renderer!.errorTarget).toBe(1);
    vi.advanceTimersByTime(HIDDEN_TAB_WIPE_DELAY_MS);
    expect(disposeRequiredTile).toHaveBeenCalledOnce();
    expect(renderer!.errorTarget).toBe(0.25);

    visibilitySpy.mockRestore();
    layer.scene.dispose();
    updateSpy.mockRestore();
    vi.useRealTimers();
  });
});
