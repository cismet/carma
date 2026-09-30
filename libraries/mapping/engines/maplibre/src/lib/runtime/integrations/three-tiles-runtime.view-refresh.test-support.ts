import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { vi } from "vitest";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

import type {
  RuntimeTile,
  RuntimeTilesRenderer,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

type TestRenderer = RuntimeTilesRenderer & {
  frameCount: number;
  loadingTiles: Set<Tile>;
  queuedTiles: Tile[];
};

export const buildMap = () => {
  const handlers = new Map<string, () => void>();
  let moving = false;
  const map = {
    on: vi.fn((event: string, handler: () => void) =>
      handlers.set(event, handler)
    ),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 7.2, lat: 51.2 })),
    isMoving: () => moving,
    isZooming: () => moving,
  } as unknown as MaplibreMap;
  return {
    map,
    handlers,
    setMoving: (value: boolean) => {
      moving = value;
    },
  };
};

export const buildTile = (error = 40) =>
  ({
    parent: null,
    children: [],
    refine: "REPLACE",
    geometricError: error,
    internal: {
      loadingState: 0,
      depth: 1,
      hasContent: true,
      hasRenderableContent: true,
      hasUnrenderableContent: false,
    },
    traversal: {
      inFrustum: true,
      error,
      distanceFromCamera: 1,
      visible: false,
      active: false,
    },
    engineData: {
      boundingVolume: {
        distanceToPoint: () => 1,
        intersectsFrustum: () => false,
        getAABB: (box: THREE.Box3) =>
          box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
        getSphere: (sphere: THREE.Sphere) => sphere.set(new THREE.Vector3(), 1),
      },
    },
  } as unknown as RuntimeTile);

export let runtimeIndex = 0;

export const mount = (
  update: (renderer: TestRenderer) => void = () => undefined,
  shouldTraverse: () => boolean = () => true,
  providesTerrain = true,
  options: Partial<ThreeTilesRuntimeOptions> = {}
) => {
  let renderer!: TestRenderer;
  vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function (
    this: TilesRenderer
  ) {
    renderer = this as TestRenderer;
    if (shouldTraverse()) renderer.frameCount += 1;
    update(renderer);
  });
  const host = buildMap();
  const layerId = `refresh-${runtimeIndex++}`;
  const runtime = buildThreeTilesRuntime(layerId, "mesh.json", [7.2, 51.2], {
    providesTerrain,
    baseErrorTargetPixels: 16,
    diagnostics: true,
    entry: {
      levels: [{ level: 0, geometricError: 40, bytes: 1 }],
    },
    ...options,
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.updateMatrixWorld(true);
  const frame = {
    map: host.map,
    renderCamera: camera,
    lodCamera: camera,
    lookTarget: new THREE.Vector3(),
    viewport: new THREE.Vector2(800, 600),
    localFrame: {
      lngLat: [7.2, 51.2] as const,
      revision: 1,
      sceneFromLocal: new THREE.Matrix4(),
      sceneFromLocalRotation: new THREE.Matrix4(),
      referenceLngLat: [7.2, 51.2] as const,
      sceneFromLocalReference: new THREE.Matrix4(),
      referenceToCurrent: new THREE.Matrix4(),
      currentToReference: new THREE.Matrix4(),
    },
  };
  runtime.scene.onAdd?.(host.map);
  runtime.scene.update(frame);
  const state = runtime.debug.readState() as ThreeTilesRuntimeState;
  return { ...host, runtime, renderer, camera, frame, layerId, state };
};

export const mockTileViews = (
  renderer: TestRenderer,
  tiles: readonly RuntimeTile[],
  inView: (tile: RuntimeTile) => boolean = () => true
) => {
  for (const tile of tiles) {
    delete (tile.engineData!.boundingVolume as { getAABB?: unknown }).getAABB;
    tile.engineData!.boundingVolume!.intersectsFrustum = () => inView(tile);
  }
  vi.spyOn(renderer, "calculateTileViewError").mockImplementation(
    (tile, target) =>
      Object.assign(target, {
        inView: inView(tile as RuntimeTile),
        error: tile.geometricError,
        distanceFromCamera: 1,
      })
  );
};

export const finishMove = (mounted: ReturnType<typeof mount>) => {
  mounted.setMoving(false);
  mounted.handlers.get(MAPLIBRE_EVENT.MOVE_END)?.();
  for (let frame = 0; frame < 3; frame++)
    mounted.runtime.scene.update(mounted.frame);
};
