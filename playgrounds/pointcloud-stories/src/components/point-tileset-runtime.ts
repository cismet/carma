import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UnloadTilesPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Renders a 3D Tiles 1.1 point tileset (glTF POINTS content) into a scene that
 * is already anchored on a local ENU frame — the point-cloud counterpart to
 * createMesh2024TilesRuntime, and placed the same way so both line up.
 */
export type PointTilesetRuntimeOptions = {
  scene: THREE.Scene;
  /** Only the canvas is needed, so WebGL and WebGPU renderers both fit. */
  renderer: { readonly domElement: HTMLCanvasElement };
  camera: THREE.PerspectiveCamera;
  /** Scene origin as WGS84 [lng, lat]. */
  originLngLat: readonly [number, number];
  /** Ellipsoidal height of the scene origin. */
  anchorHeightEllipsoidal: number;
  url: string;
  enabled?: boolean;
  /**
   * Returns true while another tileset should own the request budget. The
   * point tileset then skips traversal, so the mesh keeps priority.
   */
  isDeferred?: () => boolean;
  pointSize?: number;
  errorTarget?: number;
  requestRender?: () => void;
};

export const POINT_TILESET_DEFAULT_POINT_SIZE = 2;
export const POINT_TILESET_DEFAULT_ERROR_TARGET = 8;
/** Upper bound on yielding to the mesh, so points always make progress. */
const MAXIMUM_DEFER_MILLISECONDS = 3_000;

export const createPointTilesetRuntime = ({
  scene,
  renderer,
  camera,
  originLngLat,
  anchorHeightEllipsoidal,
  url,
  enabled: initialEnabled = true,
  pointSize: initialPointSize = POINT_TILESET_DEFAULT_POINT_SIZE,
  errorTarget: initialErrorTarget = POINT_TILESET_DEFAULT_ERROR_TARGET,
  isDeferred = () => false,
  requestRender = () => undefined,
}: PointTilesetRuntimeOptions) => {
  let pointSize = initialPointSize;
  let disposed = false;
  /** When the current deferral to the mesh started; 0 when not deferring. */
  let deferringSince = 0;

  const tiles = new TilesRenderer(url);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
  // Give the budget to what is on screen: tiles that leave the view free
  // their GPU data almost immediately.
  tiles.registerPlugin(new UnloadTilesPlugin({ delay: 200 }));
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: THREE.MathUtils.degToRad(originLngLat[1]),
      lon: THREE.MathUtils.degToRad(originLngLat[0]),
      height: anchorHeightEllipsoidal,
    })
  );
  tiles.errorTarget = initialErrorTarget;
  tiles.downloadQueue.maxJobs = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.lruCache.minSize = 128;
  tiles.lruCache.maxSize = 4_096;
  tiles.lruCache.unloadPercent = 0.4;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer as never);

  // ReorientationPlugin yields X west / Z north; this scene uses X east and
  // Z south, matching how the mesh runtime is anchored.
  const group = new THREE.Group();
  group.rotation.y = Math.PI;
  group.visible = initialEnabled;
  group.add(tiles.group);
  scene.add(group);

  const applyPointSize = (object: THREE.Object3D) => {
    object.traverse((child) => {
      const points = child as THREE.Points;
      if (!(points instanceof THREE.Points)) return;
      const material = points.material as THREE.PointsMaterial;
      material.size = pointSize;
      material.sizeAttenuation = false;
      material.vertexColors = Boolean(points.geometry.getAttribute("color"));
      material.needsUpdate = true;
    });
  };
  const onLoadModel = (event: { scene?: THREE.Object3D }) => {
    if (!event.scene) return;
    applyPointSize(event.scene);
    requestRender();
  };
  tiles.addEventListener("load-model", onLoadModel);
  // UpdateOnChangePlugin only re-traverses on detected change; a periodic kick
  // keeps a slow tileset from settling in a half-loaded state.
  const watchdogTimer = window.setInterval(() => {
    if (!disposed && group.visible) {
      tiles.dispatchEvent({ type: "needs-update" });
    }
  }, 2_000);

  return {
    group,
    tiles,
    update: () => {
      if (disposed || !group.visible) return;
      // Mesh 2024 has priority: while it is fetching, the point tileset stays
      // idle rather than competing for the same connections. Two exceptions
      // keep the deferral from becoming a deadlock: the root tileset must be
      // allowed to load at all (nothing can be scheduled before it), and a
      // long stretch of mesh traffic must not starve the points forever.
      const now = performance.now();
      if (tiles.root && isDeferred()) {
        if (deferringSince === 0) deferringSince = now;
        if (now - deferringSince < MAXIMUM_DEFER_MILLISECONDS) return;
      } else {
        deferringSince = 0;
      }
      tiles.update();
    },
    setEnabled: (enabled: boolean) => {
      if (group.visible === enabled) return;
      group.visible = enabled;
      if (enabled) tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
    },
    setPointSize: (size: number) => {
      if (size === pointSize) return;
      pointSize = size;
      applyPointSize(tiles.group);
      requestRender();
    },
    setErrorTarget: (errorTarget: number) => {
      if (tiles.errorTarget === errorTarget) return;
      tiles.errorTarget = errorTarget;
      tiles.dispatchEvent({ type: "needs-update" });
    },
    notifyViewChanged: () => {
      if (!disposed && group.visible) {
        tiles.dispatchEvent({ type: "needs-update" });
      }
    },
    setResolutionFromRenderer: () =>
      tiles.setResolutionFromRenderer(camera, renderer as never),
    dispose: () => {
      disposed = true;
      window.clearInterval(watchdogTimer);
      tiles.removeEventListener("load-model", onLoadModel);
      scene.remove(group);
      tiles.dispose();
      dracoLoader.dispose();
    },
  };
};
