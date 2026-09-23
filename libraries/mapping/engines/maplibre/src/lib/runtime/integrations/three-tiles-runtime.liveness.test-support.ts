import { TilesRenderer } from "3d-tiles-renderer";

import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";

type LivenessRenderer = TilesRenderer & {
  requestTileContents: (tile: unknown) => unknown;
  queueTileForDownload: (tile: unknown) => void;
  queuedTiles: unknown[];
  loadingTiles: Set<unknown>;
  stats: {
    queued: number;
    downloading: number;
    parsing: number;
    failed: number;
  };
};

export const buildTile = (
  uri: string,
  scene: THREE.Object3D | null = null
) => ({
  content: { uri },
  geometricError: 1,
  internal: {
    basePath: "https://example.test/tiles",
    loadingState: 0,
    depth: 3,
    hasContent: true,
    hasRenderableContent: true,
  },
  traversal: { inFrustum: true, visible: false, active: false },
  engineData: { scene, geometry: [], materials: [], textures: [] },
  children: [],
});

export const buildMap = () =>
  ({
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
  } as unknown as MaplibreMap);

export const dispatchedTypes = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([event]) => (event as { type: string }).type);

export const mountRuntime = (
  providesTerrain = false,
  cameraLocalMount = false,
  diagnostics = false
) => {
  let renderer: LivenessRenderer | undefined;
  vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function (
    this: TilesRenderer
  ) {
    renderer = this as LivenessRenderer;
  });
  const map = buildMap();
  const repaint = map.triggerRepaint as unknown as ReturnType<typeof vi.fn>;
  const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25], {
    providesTerrain,
    cameraLocalMount,
    diagnostics,
  });
  if (providesTerrain) layer.loading.setErrorTarget(1);
  const camera = new THREE.PerspectiveCamera();
  const frame = {
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
  };
  layer.scene.onAdd?.(map);
  layer.scene.update(frame);
  return { layer, map, repaint, frame, renderer: renderer as LivenessRenderer };
};
