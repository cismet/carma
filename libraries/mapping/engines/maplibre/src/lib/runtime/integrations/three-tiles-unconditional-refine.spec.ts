// @vitest-environment jsdom
// D7: under loadAncestors, upstream toggleTiles queues the content of a
// REPLACE tile whose geometricError is >= its parent's (unconditionallyRefine)
// although such a tile can never become active or visible. The runtime never
// downloads that content, and the parent's readiness is unaffected.

import { TilesRenderer } from "3d-tiles-renderer";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

const LOADED = 4;
const TILESET_URL = "https://example.test/tileset.json";
const box = { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };

type TileJson = {
  geometricError: number;
  refine: "REPLACE";
  boundingVolume: typeof box;
  content: { uri: string };
  children: TileJson[];
};
type TraversedTile = TileJson & {
  traversal: {
    unconditionallyRefine: boolean;
    active: boolean;
    visible: boolean;
    used: boolean;
    isLeaf: boolean;
    allChildrenLoaded: boolean;
  };
  internal: { loadingState: number };
  engineData: { scene: THREE.Object3D | null };
};
type RuntimeInternals = {
  rootLoadingState: number;
  calculateTileViewError: (
    tile: { geometricError: number },
    target: { inView: boolean; error: number; distanceFromCamera: number }
  ) => void;
  requestTileContents: (tile: TileJson) => void;
  preprocessTileset: (json: unknown, url: string) => void;
};

const node = (
  geometricError: number,
  uri: string,
  children: TileJson[] = []
): TileJson => ({
  geometricError,
  refine: "REPLACE",
  boundingVolume: box,
  content: { uri },
  children,
});

const traversalOf = (tile: TileJson) => tile as unknown as TraversedTile;

describe("three tiles unconditional refine (D7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never requests out-of-order content while the leaf still becomes visible", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let tiles: (TilesRenderer & RuntimeInternals) | undefined;
    const registerPlugin = TilesRenderer.prototype.registerPlugin;
    vi.spyOn(TilesRenderer.prototype, "registerPlugin").mockImplementation(
      function (this: TilesRenderer, plugin: object) {
        tiles = this as TilesRenderer & RuntimeInternals;
        return registerPlugin.call(this, plugin);
      }
    );
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getZoom: () => 17,
      getPitch: () => 45,
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", TILESET_URL, [7.15, 51.25]);
    layer.onAdd?.(map);
    expect(tiles).toBeDefined();
    const renderer = tiles!;

    const leaf = node(0.45, "leaf.b3dm");
    const outOfOrder = node(11.9, "out-of-order.b3dm", [leaf]);
    const parent = node(1.4, "parent.b3dm", [outOfOrder]);
    const tileset = {
      asset: { version: "1.0" },
      geometricError: 100,
      root: node(10, "root.b3dm", [parent]),
    };
    // 5 px per metre of geometric error: 0.45 -> 2.25 px (stop), 1.4 -> 7 px
    renderer.calculateTileViewError = (tile, target) => {
      target.inView = true;
      target.error = tile.geometricError * 5;
      target.distanceFromCamera = 100;
    };
    const requested: string[] = [];
    renderer.requestTileContents = (tile) => {
      requested.push(tile.content.uri);
    };
    renderer.preprocessTileset(tileset, TILESET_URL);
    (renderer as unknown as { rootTileset: unknown }).rootTileset = tileset;
    renderer.rootLoadingState = LOADED;

    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 1_000);
    camera.position.set(0, 0, 50);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const frame = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    const update = () => {
      renderer.dispatchEvent({ type: "needs-update" });
      layer.update(frame);
    };

    update();

    expect(traversalOf(outOfOrder).traversal.unconditionallyRefine).toBe(true);
    expect(traversalOf(outOfOrder).traversal.used).toBe(true);
    expect(requested).toEqual(
      expect.arrayContaining(["root.b3dm", "parent.b3dm", "leaf.b3dm"])
    );
    expect(requested).not.toContain("out-of-order.b3dm");

    for (const tile of [tileset.root, parent, leaf]) {
      traversalOf(tile).internal.loadingState = LOADED;
      traversalOf(tile).engineData.scene = new THREE.Group();
    }
    update();
    update();

    expect(requested).not.toContain("out-of-order.b3dm");
    expect(traversalOf(parent).traversal.allChildrenLoaded).toBe(true);
    expect(traversalOf(parent).traversal.isLeaf).toBe(false);
    expect(traversalOf(parent).traversal.active).toBe(false);
    expect(traversalOf(outOfOrder).traversal.active).toBe(false);
    expect(traversalOf(outOfOrder).traversal.visible).toBe(false);
    expect(traversalOf(leaf).traversal.active).toBe(true);
    expect(traversalOf(leaf).traversal.visible).toBe(true);

    layer.dispose();
  });
});
