// @vitest-environment jsdom

/**
 * D1 traversal behaviour of the 3D Tiles runtime (`loadAncestors=true`,
 * `loadSiblings=false`, `displayActiveTiles=true`) against the real
 * 3d-tiles-renderer 0.5.2 traversal: displayable REPLACE siblings outside the
 * view and its prefetch margin are deferred instead of blocking the parent
 * gate, external-tileset stubs still load, margin siblings load at low
 * priority, and deferred siblings are released once they enter the view.
 *
 * The runtime is driven through `buildThreeTilesRuntime` with an in-memory
 * REPLACE tileset served by a stubbed `fetch`; frame scheduling is stubbed so
 * the pipeline drains deterministically.
 */

import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
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

const ORIGIN: [number, number] = [7.15, 51.25];
const BASE_URL = "https://tiles.test/traversal";
const TILESET_URL = `${BASE_URL}/tileset.json`;
const FAILED = -1;
const LOADED = 4;

type TilesetJson = {
  asset: { version: string };
  geometricError: number;
  root: TileJson;
};
type TileJson = {
  boundingVolume: { box: number[] };
  geometricError: number;
  refine: "REPLACE";
  content?: { uri: string };
  children?: TileJson[];
  transform?: number[];
};
type HarnessTile = Tile & {
  priority?: number;
  traversal: Tile["traversal"] & {
    active: boolean;
    allChildrenLoaded: boolean;
    unconditionallyRefine: boolean;
  };
  engineData: {
    scene: THREE.Object3D | null;
    geometry: THREE.BufferGeometry[] | null;
    materials: THREE.Material[] | null;
    textures: THREE.Texture[] | null;
  };
};
type HarnessRenderer = TilesRenderer & {
  root: HarnessTile | null;
  stats: {
    failed: number;
    queued: number;
    downloading: number;
    parsing: number;
  };
  ellipsoid: {
    getObjectFrame: (
      lat: number,
      lon: number,
      height: number,
      az: number,
      el: number,
      roll: number,
      target: THREE.Matrix4
    ) => THREE.Matrix4;
  };
};

/**
 * Boxes are given in scene coordinates (x east, y up, z south). The runtime
 * re-orients the tileset from the ECEF object frame at the layer origin, in
 * which the local axes point x west / z north, so mirror x and z.
 */
const sceneBox = (
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number
) => ({ box: [-cx, cy, -cz, hx, 0, 0, 0, hy, 0, 0, 0, hz] });

const tileName = (tile: Tile): string =>
  (tile.content?.uri ?? "").replace(/^.*\//, "").replace(/\.b3dm$/, "");

const names = (set: Iterable<Tile>) => [...set].map(tileName).sort();

/**
 * root box 400 x 100 x 400 centred on the origin (ge 100)
 * children: 2x2 grid of 200 x 100 x 200 boxes (ge 10), "near" = +z, "far" = -z
 * grandchildren: 2x2 grid of 100 x 100 x 100 boxes per child (ge 1)
 */
const NEAR = ["near-west", "near-east"];
const FAR = ["far-west", "far-east"];
const buildQuadTileset = (): TilesetJson => {
  const childLayout: Array<[string, number, number]> = [
    ["near-west", -100, 100],
    ["near-east", 100, 100],
    ["far-west", -100, -100],
    ["far-east", 100, -100],
  ];
  const children = childLayout.map(([name, cx, cz]) => ({
    boundingVolume: sceneBox(cx, 0, cz, 100, 50, 100),
    geometricError: 10,
    refine: "REPLACE" as const,
    content: { uri: `${name}.b3dm` },
    children: [
      [-50, -50],
      [50, -50],
      [-50, 50],
      [50, 50],
    ].map(([gx, gz], index) => ({
      boundingVolume: sceneBox(cx + gx, 0, cz + gz, 50, 50, 50),
      geometricError: 1,
      refine: "REPLACE" as const,
      content: { uri: `${name}_${index}.b3dm` },
    })),
  }));
  return {
    asset: { version: "1.0" },
    geometricError: 100,
    root: {
      boundingVolume: sceneBox(0, 0, 0, 200, 50, 200),
      geometricError: 100,
      refine: "REPLACE",
      content: { uri: "root.b3dm" },
      children,
    },
  };
};

/** Camera at z=+500 looking along -z; `far` bounds the visible depth. */
const createViewCamera = (far: number) => {
  const camera = new THREE.PerspectiveCamera(40, 800 / 600, 1, far);
  camera.position.set(0, 30, 500);
  camera.lookAt(0, 30, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

type Harness = {
  tiles: HarnessRenderer;
  layer: ReturnType<typeof buildThreeTilesRuntime>;
  downloads: string[];
  frame: (
    camera: THREE.PerspectiveCamera,
    flushSteps?: number
  ) => Promise<void>;
  runUntilSettled: (
    camera: THREE.PerspectiveCamera,
    options?: { flushSteps?: number; onFrame?: () => void }
  ) => Promise<void>;
  dispose: () => void;
};

const createHarness = (
  buildTilesets: (
    tiles: HarnessRenderer
  ) => Record<string, TilesetJson | (() => TilesetJson)>
): Harness => {
  const frameCallbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    frameCallbacks.set(handle, cb);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frameCallbacks.delete(handle);
  });

  let captured: HarnessRenderer | undefined;
  const registerPlugin = TilesRenderer.prototype.registerPlugin;
  vi.spyOn(TilesRenderer.prototype, "registerPlugin").mockImplementation(
    function (this: TilesRenderer, plugin: object) {
      captured = this as HarnessRenderer;
      return registerPlugin.call(this, plugin);
    }
  );
  const downloads: string[] = [];
  let tilesets: Record<string, TilesetJson | (() => TilesetJson)> = {};
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = String(input);
    const tileset = tilesets[url];
    if (tileset) {
      downloads.push(url.replace(`${BASE_URL}/`, ""));
      const json = typeof tileset === "function" ? tileset() : tileset;
      return Promise.resolve(
        new Response(JSON.stringify(json), {
          headers: { "content-type": "application/json" },
        })
      );
    }
    downloads.push(url.replace(`${BASE_URL}/`, ""));
    return Promise.resolve(new Response(new ArrayBuffer(16)));
  });

  const map = {
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getZoom: () => 17,
    getPitch: () => 45,
  } as unknown as MaplibreMap;
  const layer = buildThreeTilesRuntime("mesh", TILESET_URL, ORIGIN);
  layer.onAdd?.(map);
  expect(captured).toBeDefined();
  const tiles = captured!;
  tilesets = buildTilesets(tiles);
  tiles.registerPlugin({
    name: "TEST_PARSE_PLUGIN",
    parseTile: (
      _buffer: ArrayBuffer,
      tile: Tile,
      _extension: string,
      _url: string,
      signal: AbortSignal
    ) => {
      if (signal.aborted) return Promise.resolve();
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial();
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(geometry, material));
      const engineData = (tile as HarnessTile).engineData;
      engineData.scene = scene;
      engineData.geometry = [geometry];
      engineData.materials = [material];
      engineData.textures = [];
      return Promise.resolve();
    },
  });

  const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const flush = async (steps: number) => {
    for (let index = 0; index < steps; index += 1) {
      const callbacks = [...frameCallbacks.values()];
      frameCallbacks.clear();
      for (const callback of callbacks) callback(index);
      await nextTick();
    }
  };
  const frame = async (camera: THREE.PerspectiveCamera, flushSteps = 8) => {
    tiles.dispatchEvent({ type: "needs-update" });
    layer.root.updateMatrixWorld(true);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    await flush(flushSteps);
  };
  const runUntilSettled: Harness["runUntilSettled"] = async (
    camera,
    options = {}
  ) => {
    let stableFrames = 0;
    let lastCount = -1;
    for (let index = 0; index < 80 && stableFrames < 4; index += 1) {
      await frame(camera, options.flushSteps);
      options.onFrame?.();
      if (downloads.length === lastCount) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        lastCount = downloads.length;
      }
    }
  };

  return {
    tiles,
    layer,
    downloads,
    frame,
    runUntilSettled,
    dispose: () => {
      layer.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
  };
};

/** Root transform = object frame at the layer origin, so local == scene frame. */
const withOriginTransform = (
  tiles: HarnessRenderer,
  tileset: TilesetJson
): TilesetJson => {
  const frame = tiles.ellipsoid.getObjectFrame(
    THREE.MathUtils.degToRad(ORIGIN[1]),
    THREE.MathUtils.degToRad(ORIGIN[0]),
    0,
    0,
    0,
    0,
    new THREE.Matrix4()
  );
  return { ...tileset, root: { ...tileset.root, transform: frame.toArray() } };
};

const childByName = (tiles: HarnessRenderer, name: string) =>
  tiles.root!.children!.find(
    (child) => tileName(child) === name
  ) as HarnessTile;

describe("three tiles traversal (D1 deferral)", () => {
  let harness: Harness | null = null;
  afterEach(() => {
    harness?.dispose();
    harness = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the parent first and refines the visible children although two off-frustum siblings never load", async () => {
    harness = createHarness((tiles) => ({
      [TILESET_URL]: withOriginTransform(tiles, buildQuadTileset()),
    }));
    const { tiles, layer, downloads } = harness;
    // Serialise the pipeline so the placeholder chain is observable.
    layer.setRequestConcurrency(1);
    tiles.parseQueue.maxJobs = 1;
    const camera = createViewCamera(450);
    const visibleTimeline: string[][] = [];
    const sampleVisible = () => {
      const current = names(tiles.visibleTiles);
      const last = visibleTimeline[visibleTimeline.length - 1];
      if (!last || last.join() !== current.join())
        visibleTimeline.push(current);
    };

    await harness.runUntilSettled(camera, {
      flushSteps: 2,
      onFrame: sampleVisible,
    });

    const near = NEAR.map((name) => childByName(tiles, name));
    const far = FAR.map((name) => childByName(tiles, name));
    expect(near.map((tile) => tile.traversal.inFrustum)).toEqual([true, true]);
    expect(far.map((tile) => tile.traversal.inFrustum)).toEqual([false, false]);

    // Everything the camera sees is loaded: root, 2 children, 8 grandchildren.
    const grandchildren = NEAR.flatMap((name) =>
      [0, 1, 2, 3].map((index) => `${name}_${index}`)
    );
    expect(downloads.filter((entry) => entry.endsWith(".b3dm")).sort()).toEqual(
      [
        "root.b3dm",
        ...NEAR.map((n) => `${n}.b3dm`),
        ...grandchildren.map((n) => `${n}.b3dm`),
      ].sort()
    );
    // The off-frustum siblings were marked used by the traversal, deferred
    // (parked as finished) and never requested; they are no failures.
    for (const tile of far) {
      expect(tile.traversal.used).toBe(true);
      expect(tile.internal.loadingState).toBe(FAILED);
      expect(tile.traversal.active).toBe(false);
      expect(tile.traversal.visible).toBe(false);
    }
    expect(tiles.stats.failed).toBe(0);

    // The parent gate opens: root and near children step aside.
    expect(tiles.root!.traversal.allChildrenLoaded).toBe(true);
    expect(tiles.root!.traversal.isLeaf).toBe(false);
    expect(names(tiles.visibleTiles)).toEqual([...grandchildren].sort());
    expect(names(tiles.activeTiles)).toEqual([...grandchildren].sort());

    // Progressive placeholder chain: nothing -> root -> near children -> ... ->
    // the 8 grandchildren; the deferred siblings never show up.
    expect(visibleTimeline[0]).toEqual([]);
    expect(visibleTimeline[1]).toEqual(["root"]);
    expect(visibleTimeline).toContainEqual([...NEAR].sort());
    expect(visibleTimeline[visibleTimeline.length - 1]).toEqual(
      [...grandchildren].sort()
    );
    for (const stage of visibleTimeline) {
      for (const name of FAR) expect(stage).not.toContain(name);
    }
  });

  it("releases, requests and displays a deferred sibling once it enters the frustum", async () => {
    harness = createHarness((tiles) => ({
      [TILESET_URL]: withOriginTransform(tiles, buildQuadTileset()),
    }));
    const { tiles, downloads } = harness;
    await harness.runUntilSettled(createViewCamera(450));
    for (const name of FAR) {
      expect(childByName(tiles, name).internal.loadingState).toBe(FAILED);
    }
    const downloadsBefore = downloads.length;

    // Extend the visible depth so the far children enter the frustum.
    await harness.runUntilSettled(createViewCamera(1_000));

    for (const name of FAR) {
      const tile = childByName(tiles, name);
      expect(tile.traversal.inFrustum).toBe(true);
      expect(tile.internal.loadingState).toBe(LOADED);
      expect(downloads).toContain(`${name}.b3dm`);
    }
    const allGrandchildren = [...NEAR, ...FAR].flatMap((name) =>
      [0, 1, 2, 3].map((index) => `${name}_${index}`)
    );
    expect(names(tiles.visibleTiles)).toEqual([...allGrandchildren].sort());
    // Only the far subtree was fetched: 2 children + 8 grandchildren.
    expect(downloads.length - downloadsBefore).toBe(10);
    expect(new Set(downloads).size).toBe(downloads.length);
  });

  it("requests an off-frustum external-tileset stub but defers its off-frustum root content", async () => {
    const stubUrl = `${BASE_URL}/far-east/tileset.json`;
    harness = createHarness((tiles) => ({
      [TILESET_URL]: withOriginTransform(tiles, {
        asset: { version: "1.0" },
        geometricError: 100,
        root: {
          boundingVolume: sceneBox(0, 0, 0, 200, 50, 200),
          geometricError: 100,
          refine: "REPLACE",
          content: { uri: "root.b3dm" },
          children: [
            {
              boundingVolume: sceneBox(-100, 0, 100, 100, 50, 100),
              geometricError: 10,
              refine: "REPLACE",
              content: { uri: "near-west.b3dm" },
            },
            {
              boundingVolume: sceneBox(100, 0, -100, 100, 50, 100),
              geometricError: 10,
              refine: "REPLACE",
              content: { uri: "far-east/tileset.json" },
            },
          ],
        },
      }),
      [stubUrl]: {
        asset: { version: "1.0" },
        geometricError: 10,
        root: {
          boundingVolume: sceneBox(100, 0, -100, 100, 50, 100),
          geometricError: 10,
          refine: "REPLACE",
          content: { uri: "far-east-root.b3dm" },
        },
      },
    }));
    const { tiles, downloads } = harness;
    await harness.runUntilSettled(createViewCamera(450));

    expect(downloads).toContain("far-east/tileset.json");
    expect(downloads).not.toContain("far-east/far-east-root.b3dm");
    const stub = tiles.root!.children!.find(
      (child) => child.content?.uri === "far-east/tileset.json"
    ) as HarnessTile;
    expect(stub.internal.loadingState).toBe(LOADED);
    expect(stub.traversal.unconditionallyRefine).toBe(true);
    const externalRoot = stub.children![0] as HarnessTile;
    expect(externalRoot.traversal.inFrustum).toBe(false);
    expect(externalRoot.internal.loadingState).toBe(FAILED);

    // The subtree structure satisfied the parent gate: the visible child shows.
    expect(tiles.root!.traversal.allChildrenLoaded).toBe(true);
    expect(names(tiles.visibleTiles)).toEqual(["near-west"]);
  });

  it("requests margin siblings at low priority without deferring them", async () => {
    harness = createHarness((tiles) => ({
      [TILESET_URL]: withOriginTransform(tiles, {
        asset: { version: "1.0" },
        geometricError: 100,
        root: {
          boundingVolume: sceneBox(300, 0, 100, 400, 50, 100),
          geometricError: 100,
          refine: "REPLACE",
          content: { uri: "root.b3dm" },
          children: [
            // inside the main frustum
            {
              boundingVolume: sceneBox(0, 0, 100, 100, 50, 100),
              geometricError: 10,
              refine: "REPLACE",
              content: { uri: "in.b3dm" },
            },
            // outside the main frustum, inside the 1.25x fov prefetch margin
            {
              boundingVolume: sceneBox(280, 0, 100, 20, 50, 100),
              geometricError: 10,
              refine: "REPLACE",
              content: { uri: "margin.b3dm" },
            },
            // outside the margin as well
            {
              boundingVolume: sceneBox(650, 0, 100, 50, 50, 100),
              geometricError: 10,
              refine: "REPLACE",
              content: { uri: "far.b3dm" },
            },
          ],
        },
      }),
    }));
    const { tiles, layer, downloads } = harness;
    layer.setRequestConcurrency(1);
    const camera = createViewCamera(1_000);
    const priorities = new Map<string, number>();
    await harness.runUntilSettled(camera, {
      onFrame: () => {
        const root = tiles.root;
        if (!root) return;
        for (const tile of [root, ...(root.children ?? [])]) {
          const priority = (tile as HarnessTile).priority;
          if (priority !== undefined && !priorities.has(tileName(tile))) {
            priorities.set(tileName(tile), priority);
          }
        }
      },
    });

    const inTile = childByName(tiles, "in");
    const marginTile = childByName(tiles, "margin");
    const farTile = childByName(tiles, "far");
    expect(inTile.traversal.inFrustum).toBe(true);
    expect(marginTile.traversal.inFrustum).toBe(false);
    expect(farTile.traversal.inFrustum).toBe(false);

    expect(downloads).toContain("in.b3dm");
    expect(downloads).toContain("margin.b3dm");
    expect(downloads).not.toContain("far.b3dm");
    expect(marginTile.internal.loadingState).toBe(LOADED);
    expect(farTile.internal.loadingState).toBe(FAILED);
    expect(priorities.get("margin")).toBeLessThan(priorities.get("in")!);
    expect(priorities.get("in")).toBeLessThan(priorities.get("root")!);

    expect(tiles.root!.traversal.allChildrenLoaded).toBe(true);
    expect(names(tiles.visibleTiles)).toContain("in");
    expect(names(tiles.visibleTiles)).not.toContain("far");
  });
});
