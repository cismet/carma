// @vitest-environment jsdom
import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesShadows } from "./three-tiles-runtime-shadows";
import type {
  RuntimeLruCache,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import type { SharedThreeShadowRegionDiagnostics } from "../../core/shared-three-scene-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:runtime-publication-test",
  });
});

describe("mesh caster publication", () => {
  it("retries negative proofs on publication and retains unaffected corridor proofs", () => {
    const onContentChanged = vi.fn();
    const updateRootWorldBounds = vi.fn(() => false);
    const state = createThreeTilesRuntimeState(
      "mesh",
      "mesh.json",
      [7.2, 51.2],
      { providesTerrain: true, onContentChanged }
    );
    const main = new Set<Tile>();
    const makeTile = (
      name: string,
      x: number,
      error: number,
      inView: boolean,
      parent: Tile | null = null
    ) => {
      const bounds = new THREE.Box3(
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x + 1, 1, 1)
      );
      const tile = {
        content: { uri: name },
        parent,
        children: [],
        refine: "REPLACE",
        geometricError: error,
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { error },
        engineData: {
          boundingVolume: {
            getAABB: (target: THREE.Box3) => target.copy(bounds),
          },
        },
      } as unknown as Tile;
      parent?.children?.push(tile);
      if (inView) main.add(tile);
      return tile;
    };
    const parent = makeTile("parent", 0, 16, true);
    const receiver = makeTile("receiver", 0, 1, true, parent);
    const chimney = makeTile("chimney", 0, 1, false, parent);
    const otherParent = makeTile("other-parent", 10, 16, true);
    const otherChild = makeTile("other-child", 10, 1, true, otherParent);
    chimney.internal.loadingState = 2;
    state.requestedErrorTarget = 1;
    state.shadowView = {
      camera: new THREE.OrthographicCamera(),
      shadowMapSize: { width: 1024, height: 1024 },
    };
    state.shadowReceiverMask = {
      match: () => true,
    } as unknown as ShadowReceiverMask;
    state.tiles = {
      group: new THREE.Group(),
      markTileUsed: vi.fn(),
    } as unknown as RuntimeTilesRenderer;
    const api = createThreeTilesShadows(state, {
      isTileInMainView: (tile) => main.has(tile),
      isChildUnloadable: () => false,
      updateRootWorldBounds,
      getTileScreenError: (tile) => tile.traversal.error,
      getStableTileId: (tile) => tile.content!.uri!,
      getTileCenterness: () => 1,
      getTileDebugId: (tile) => tile.content!.uri!,
      requestRender: vi.fn(),
      isPipelineIdle: () => false,
      applyRequestConcurrency: vi.fn(),
      notifyRequestStateChange: vi.fn(),
    });
    api.advanceMeshShadowCorridors(
      new Set([parent, otherParent]),
      new Set([parent, otherParent])
    );

    state.effectiveErrorTarget = 1;
    // A coarse caster may meet its own SSE after camera/receiver changes.
    // Already displayed descendants still set its minimum geometric detail.
    parent.traversal.error = 0.5;
    api.advanceMeshShadowCorridors(
      new Set([receiver, otherChild]),
      new Set([receiver, otherChild])
    );
    expect(state.committedMeshReceiverFrontier).toEqual(
      new Set([receiver, otherChild])
    );
    expect(state.committedMeshCasterFrontier).toEqual(
      new Set([parent, otherChild])
    );
    // A pending/failed child and repeated traversal must neither replace the
    // parent in depth nor trigger another hard-shadow invalidation.
    onContentChanged.mockClear();
    for (const loadingState of [2, 3, -1]) {
      chimney.internal.loadingState = loadingState;
      api.advanceMeshShadowCorridors(
        new Set([receiver, otherChild]),
        new Set([receiver, otherChild])
      );
      expect(state.committedMeshCasterFrontier).toEqual(
        new Set([parent, otherChild])
      );
      expect(onContentChanged).not.toHaveBeenCalled();
    }

    // A cached negative proof from the decode/publication gap must be retried.
    const diagnostics: SharedThreeShadowRegionDiagnostics = {
      sourceId: "mesh.json",
      ready: false,
      errorPixels: 1,
      visitedNodes: 3,
      broadPhaseNodes: 3,
      rejectedPrismNodes: 0,
      receiverPrismTested: true,
      selectedTileIds: [],
    };
    const affected = {
      queryBounds: new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(2, 2, 2)
      ),
      revision: null,
      diagnostics,
    };
    const unrelated = {
      ...affected,
      queryBounds: affected.queryBounds
        .clone()
        .translate(new THREE.Vector3(100, 0, 0)),
    };
    state.shadowRegionRevisions.set("affected", affected);
    state.shadowRegionRevisions.set("unrelated", unrelated);
    onContentChanged.mockClear();
    chimney.internal.loadingState = 4;
    Object.assign(chimney, { shadowReceiverCurrent: true });
    // Decode completion is enough: upstream may still withhold this caster
    // from visibleTiles behind unrelated sibling payloads.
    state.tiles.lruCache = { itemList: [chimney] } as RuntimeLruCache;
    api.advanceMeshShadowCorridors(
      new Set([receiver, otherChild]),
      new Set([receiver, otherChild])
    );
    expect(state.committedMeshReceiverFrontier).toEqual(
      new Set([receiver, otherChild])
    );
    expect(state.committedMeshCasterFrontier).toEqual(
      new Set([receiver, chimney, otherChild])
    );
    expect(state.shadowRegionRevisions.has("affected")).toBe(false);
    expect(state.shadowRegionRevisions.has("unrelated")).toBe(true);
    expect(onContentChanged).toHaveBeenCalledOnce();
    expect(onContentChanged.mock.calls[0][0]).toEqual(
      expect.arrayContaining([expect.any(THREE.Box3)])
    );
    state.shadowRegionRevisions.set("affected", affected);
    api.advanceMeshShadowCorridors(
      new Set([receiver, otherChild]),
      new Set([receiver, chimney, otherChild])
    );
    expect(state.shadowRegionRevisions.has("affected")).toBe(true);
    expect(onContentChanged).toHaveBeenCalledOnce();

    // Sampling unchanged lighting must reuse the receiver spatial index;
    // changing observer pixel density or the requested SSE must not reuse it.
    updateRootWorldBounds.mockReturnValue(true);
    state.viewFrustumsReady = true;
    state.rootWorldBoundingBox.set(
      new THREE.Vector3(-100, -100, -100),
      new THREE.Vector3(100, 100, 100)
    );
    const frontier = new Set([receiver, otherChild]);
    const snapshot = api.createReceiverSnapshot(frontier)!;
    expect(snapshot).not.toBeNull();
    state.shadowReceiverSourceSignature = snapshot.signature;
    state.shadowReceiverMask = snapshot.mask;
    state.mainViewSourceTiles = snapshot.sourceTiles;
    expect(
      api.createReceiverSnapshot(new Set([otherChild, receiver]))?.mask
    ).toBe(snapshot.mask);
    receiver.traversal.error = 2;
    expect(api.createReceiverSnapshot(frontier)?.mask).not.toBe(snapshot.mask);
    receiver.traversal.error = 1;
    state.requestedErrorTarget = 0.25;
    expect(api.createReceiverSnapshot(frontier)?.mask).not.toBe(snapshot.mask);

    // Membership follows metadata intersection, not a previous traversal flag.
    const outside = makeTile("outside-corridor", 1000, 1, false);
    Object.assign(outside, { shadowReceiverCurrent: true });
    Object.assign(chimney, { shadowReceiverCurrent: false });
    api.advanceMeshShadowCorridors(
      frontier,
      new Set([receiver, otherChild, chimney, outside])
    );
    expect(state.committedMeshCasterFrontier.has(chimney)).toBe(true);
    expect(state.committedMeshCasterFrontier.has(outside)).toBe(false);
    // A still-needed loaded caster survives a transient omission from upstream.
    api.advanceMeshShadowCorridors(frontier, new Set([receiver, otherChild]));
    expect(state.committedMeshCasterFrontier.has(chimney)).toBe(true);
  });
});
