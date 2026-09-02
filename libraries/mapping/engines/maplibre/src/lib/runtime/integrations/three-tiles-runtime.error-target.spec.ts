// @vitest-environment jsdom

/**
 * D5 wiring of the effective error target in the runtime: a full, idle and
 * unconverged view relaxes the target once after the hold time, a pan keeps
 * the relaxed target, the failure memory blocks a re-tighten in the same view
 * class until the view zooms in, and a placeholder parent whose children can
 * never load counts as converged so the shadow camera can join.
 */

import { TilesRenderer } from "3d-tiles-renderer";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_TARGET_POLICY } from "./three-tiles-load-policy";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

type StubRenderer = TilesRenderer & {
  usedSet: Set<unknown>;
  stats: { failed: number };
};

describe("three tiles runtime effective error target", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setup = () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let renderer: StubRenderer | undefined;
    vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function (
      this: TilesRenderer
    ) {
      renderer = this as StubRenderer;
    });
    const handlers = new Map<string, () => void>();
    const view = { zoom: 17, pitch: 45 };
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getZoom: () => view.zoom,
      getPitch: () => view.pitch,
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const viewCamera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    layer.setErrorTarget(0.25);
    layer.onAdd?.(map);
    layer.setShadowView({
      camera: new THREE.OrthographicCamera(),
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.update(frame);
    // A displayed placeholder above the target whose child still has to load,
    // and one used tile that fills the whole ceiling: full, idle, unconverged.
    const child = {
      content: { uri: "child.b3dm" },
      internal: {
        basePath: "https://example.test/tiles",
        hasContent: true,
        loadingState: 0,
      },
      children: [],
    };
    const visibleTile = {
      traversal: { error: 1, inFrustum: true },
      children: [child],
    };
    const requiredTile = {} as never;
    const disposeRequiredTile = vi.fn();
    renderer!.visibleTiles.add(visibleTile as never);
    renderer!.usedSet.add(requiredTile);
    renderer!.lruCache.add(requiredTile, disposeRequiredTile);
    renderer!.lruCache.setMemoryUsage(requiredTile, 2 * GIB);
    const tick = () => layer.update(frame);
    const stall = (ms: number) => {
      tick();
      vi.advanceTimersByTime(ms);
      tick();
    };
    return {
      layer,
      renderer: renderer!,
      map,
      handlers,
      view,
      tick,
      stall,
      child,
      visibleTile,
      requiredTile,
      disposeRequiredTile,
    };
  };

  it("relaxes once after the hold time and keeps the target across pans", () => {
    const { layer, renderer, handlers, stall, tick, disposeRequiredTile } =
      setup();

    stall(ERROR_TARGET_POLICY.relaxHoldMs - 1);
    expect(renderer.errorTarget).toBe(0.25);
    vi.advanceTimersByTime(1);
    tick();
    expect(renderer.errorTarget).toBe(0.5);
    expect(disposeRequiredTile).not.toHaveBeenCalled();

    // The pan does not reset the effective target ...
    handlers.get("movestart")?.();
    expect(renderer.errorTarget).toBe(0.5);
    handlers.get("moveend")?.();
    expect(renderer.errorTarget).toBe(0.5);
    // ... and the next stall relaxes after the same hold, not a longer one.
    stall(ERROR_TARGET_POLICY.relaxHoldMs);
    expect(renderer.errorTarget).toBe(1);
    // Four times the requested target is the cap.
    stall(ERROR_TARGET_POLICY.relaxHoldMs);
    expect(renderer.errorTarget).toBe(1);
    layer.dispose();
  });

  it("does not tighten below the target that failed in this view until the view zooms in", () => {
    const { layer, renderer, view, stall, tick, visibleTile, requiredTile } =
      setup();
    stall(ERROR_TARGET_POLICY.relaxHoldMs);
    expect(renderer.errorTarget).toBe(0.5);

    // Eviction frees memory and the placeholder meets the relaxed target.
    renderer.lruCache.setMemoryUsage(requiredTile, 100 * MIB);
    visibleTile.traversal.error = 0.4;
    stall(ERROR_TARGET_POLICY.tightenCooldownMs);
    expect(renderer.errorTarget).toBe(0.5);
    stall(ERROR_TARGET_POLICY.tightenCooldownMs);
    expect(renderer.errorTarget).toBe(0.5);

    // A zoom-in clears the failure memory and tightens again.
    view.zoom = 17.5;
    tick();
    expect(renderer.errorTarget).toBe(0.25);
    layer.dispose();
  });

  it("does not retraverse when the same requested target is re-applied", () => {
    const { layer, renderer, stall } = setup();
    stall(ERROR_TARGET_POLICY.relaxHoldMs);
    expect(renderer.errorTarget).toBe(0.5);
    const dispatchSpy = vi.spyOn(renderer, "dispatchEvent");

    // shadow-scene.ts re-applies the same requested target on every content
    // change; that must not restart the relaxation cycle.
    layer.setErrorTarget(0.25);
    expect(renderer.errorTarget).toBe(0.5);
    expect(dispatchSpy).not.toHaveBeenCalled();

    layer.setErrorTarget(1);
    expect(renderer.errorTarget).toBe(1);
    expect(
      dispatchSpy.mock.calls.map(([event]) => (event as { type: string }).type)
    ).toContain("needs-update");
    layer.dispose();
  });

  it("treats a placeholder whose child can never load as converged and joins the shadow camera", () => {
    const { layer, renderer, tick, child, requiredTile } = setup();
    renderer.lruCache.setMemoryUsage(requiredTile, 16 * MIB);
    const setCameraSpy = vi.spyOn(TilesRenderer.prototype, "setCamera");

    // The child is missing on the server: exhausted at once, never requested.
    child.internal.loadingState = -1;
    renderer.stats.failed = 1;
    renderer.dispatchEvent({
      type: "load-error",
      tile: child as never,
      error: new Error("status 404"),
      url: "https://example.test/tiles/child.b3dm",
    });
    expect(child.internal.loadingState).toBe(0);

    for (let frame = 0; frame < 3; frame += 1) {
      tick();
      vi.advanceTimersByTime(ERROR_TARGET_POLICY.relaxHoldMs);
    }
    expect(renderer.errorTarget).toBe(0.25);
    expect(
      setCameraSpy.mock.calls.some(
        ([camera]) => camera instanceof THREE.OrthographicCamera
      )
    ).toBe(true);
    expect(layer.getRequestDemand()).toBe(0);
    layer.dispose();
  });
});
