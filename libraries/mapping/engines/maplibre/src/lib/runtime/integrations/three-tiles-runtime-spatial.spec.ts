// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesSpatial } from "./three-tiles-runtime-spatial";
import type { RuntimeTile } from "./three-tiles-runtime-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-spatial-worker",
  });
});

const tile = (error: number, children: RuntimeTile[] = []): RuntimeTile =>
  ({
    children,
    traversal: { error, inFrustum: true },
    internal: { hasContent: true, hasRenderableContent: true, loadingState: 4 },
  } as RuntimeTile);

describe("mesh viewport convergence", () => {
  const fixture = () => {
    const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
      providesTerrain: true,
    });
    const receiver = tile(1, [tile(0.5)]);
    const caster = tile(64, [tile(32)]);
    state.tiles = {
      visibleTiles: new Set([receiver, caster]),
    } as typeof state.tiles;
    state.requestedErrorTarget = 1;
    state.effectiveErrorTarget = 16;
    state.displayedMeshFrontier.add(receiver);
    const spatial = createThreeTilesSpatial(state, {
      getStableTileId: vi.fn(),
      getTileLoadReason: vi.fn(),
    });
    return { state, spatial, receiver };
  };

  it("does not let retained caster parents block receiver refinement", () => {
    const { spatial } = fixture();
    expect(spatial.mainViewConverged()).toBe(true);
    expect(spatial.isMainViewReady()).toBe(true);
  });

  it("still requires the actual receiver error target, not an idle queue", () => {
    const { spatial, receiver } = fixture();
    receiver.traversal.error = 4;
    expect(spatial.mainViewConverged()).toBe(true);
    expect(spatial.isMainViewReady()).toBe(false);
    receiver.traversal.error = 32;
    expect(spatial.mainViewConverged()).toBe(false);
  });

  it("does not declare a caster-only scene to be a filled viewport", () => {
    const { spatial, state } = fixture();
    state.displayedMeshFrontier.clear();
    expect(spatial.mainViewConverged()).toBe(false);
    expect(spatial.isMainViewReady()).toBe(false);
  });
});
