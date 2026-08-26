import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import { getSharedThreeTerrainElevation } from "./shared-three-terrain-registry";

export interface SharedThreeSceneFrame {
  map: MaplibreMap;
  renderCamera: THREE.Camera;
  lodCamera: THREE.PerspectiveCamera;
  lookTarget: THREE.Vector3;
  viewport: THREE.Vector2;
}

export interface SharedThreeSceneRuntime {
  id: string;
  originLngLat: [number, number];
  root: THREE.Object3D;
  onAdd?: (map: MaplibreMap) => void;
  update: (frame: SharedThreeSceneFrame) => void;
  dispose: () => void;
}

export interface SharedThreeSceneLayer extends CustomLayerInterface {
  addRuntime: (runtime: SharedThreeSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  getScene: () => THREE.Scene;
  projectLngLatToScene: (
    lngLat: [number, number],
    altitudeMeters?: number,
    target?: THREE.Vector3
  ) => THREE.Vector3 | null;
  /** Detach the custom layer without destroying runtimes preserved across HMR. */
  detach: () => void;
  dispose: () => void;
}

export interface SharedThreeSceneLayerOptions {
  ambientLightIntensity?: number;
}

type DepthRange = readonly [near: number, far: number];

type RenderTargetDepthRangeBridge = {
  render: (depthRange: DepthRange, callback: () => void) => void;
  dispose: () => void;
};

type SharedCanvasViewportRenderer = Pick<THREE.WebGLRenderer, "setViewport">;

/**
 * Keep Three's main-framebuffer viewport in sync with the canvas MapLibre owns.
 *
 * WebGLRenderer snapshots the canvas dimensions when it is constructed. A
 * later MapLibre resize changes the shared canvas drawing buffer without
 * updating Three's private main viewport. After rendering a shadow map, Three
 * would therefore restore that stale viewport and stretch or clip the scene.
 * Updating only the viewport avoids calling `setSize`, which would write back
 * to a canvas whose size lifecycle belongs to MapLibre.
 */
export const syncSharedCanvasViewport = (
  renderer: SharedCanvasViewportRenderer,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  viewport: THREE.Vector2
): void => {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  if (viewport.x === width && viewport.y === height) return;
  viewport.set(width, height);
  renderer.setViewport(0, 0, width, height);
};

/**
 * Three.js does not track `gl.depthRange`. MapLibre intentionally compresses
 * the main 3D depth range to leave room for later style layers, but that range
 * must not leak into Three's offscreen shadow maps: their lookup coordinates
 * are always normalized to [0, 1]. Route offscreen targets to the canonical
 * range while preserving MapLibre's range for the shared main framebuffer.
 */
export const installRenderTargetDepthRangeBridge = (
  renderer: Pick<THREE.WebGLRenderer, "setRenderTarget">,
  gl: Pick<WebGLRenderingContext, "depthRange">
): RenderTargetDepthRangeBridge => {
  const originalSetRenderTarget = renderer.setRenderTarget;
  let activeDepthRange: DepthRange | null = null;

  renderer.setRenderTarget = function (...args) {
    originalSetRenderTarget.apply(renderer, args);
    if (!activeDepthRange) return;
    if (args[0] === null) {
      gl.depthRange(activeDepthRange[0], activeDepthRange[1]);
    } else {
      gl.depthRange(0, 1);
    }
  };

  return {
    render(depthRange, callback) {
      activeDepthRange = depthRange;
      try {
        callback();
      } finally {
        activeDepthRange = null;
        gl.depthRange(depthRange[0], depthRange[1]);
      }
    },
    dispose() {
      activeDepthRange = null;
      renderer.setRenderTarget = originalSetRenderTarget;
    },
  };
};

const rotationX = new THREE.Matrix4().makeRotationAxis(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);

/**
 * One MapLibre custom layer and one Three.js scene for all streamed point and
 * mesh content. Opaque meshes and transparent splats therefore share Three's
 * render ordering and MapLibre's existing depth buffer in a single draw.
 */
export const buildSharedThreeSceneLayer = (
  layerId: string,
  options: SharedThreeSceneLayerOptions = {}
): SharedThreeSceneLayer => {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.AmbientLight(0xffffff, options.ambientLightIntensity ?? 2.4)
  );
  const renderCamera = new THREE.Camera();
  const lodCamera = new THREE.PerspectiveCamera();
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();
  const runtimes = new Map<string, SharedThreeSceneRuntime>();
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let depthRangeBridge: RenderTargetDepthRangeBridge | null = null;
  let originMerc: MercatorCoordinate | null = null;
  let meterScale = 0;
  let disposed = false;

  const placeRuntime = (runtime: SharedThreeSceneRuntime) => {
    if (!originMerc || meterScale <= 0) return;
    const runtimeOrigin = MercatorCoordinate.fromLngLat(
      runtime.originLngLat,
      0
    );
    const runtimeScale = runtimeOrigin.meterInMercatorCoordinateUnits();
    runtime.root.position.set(
      (runtimeOrigin.x - originMerc.x) / meterScale,
      (runtimeOrigin.z - originMerc.z) / meterScale,
      (runtimeOrigin.y - originMerc.y) / meterScale
    );
    runtime.root.scale.setScalar(runtimeScale / meterScale);
    runtime.root.updateMatrixWorld(true);
  };

  const layer: SharedThreeSceneLayer = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    addRuntime(runtime) {
      if (disposed) return;
      const existing = runtimes.get(runtime.id);
      if (existing === runtime) return;
      if (existing) layer.removeRuntime(existing.id);
      runtimes.set(runtime.id, runtime);
      scene.add(runtime.root);
      placeRuntime(runtime);
      if (map) runtime.onAdd?.(map);
      map?.triggerRepaint();
    },

    removeRuntime(runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (!runtime) return;
      runtimes.delete(runtimeId);
      scene.remove(runtime.root);
      runtime.dispose();
      map?.triggerRepaint();
    },

    hasRuntime(runtimeId) {
      return runtimes.has(runtimeId);
    },

    getScene() {
      return scene;
    },

    projectLngLatToScene(
      lngLat,
      altitudeMeters = 0,
      target = new THREE.Vector3()
    ) {
      if (!originMerc || meterScale <= 0) return null;
      const coordinate = MercatorCoordinate.fromLngLat(lngLat, altitudeMeters);
      return target.set(
        (coordinate.x - originMerc.x) / meterScale,
        (coordinate.z - originMerc.z) / meterScale,
        (coordinate.y - originMerc.y) / meterScale
      );
    },

    detach() {
      for (const runtime of runtimes.values()) scene.remove(runtime.root);
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
      originMerc = null;
      meterScale = 0;
    },

    onAdd(mapInstance, gl) {
      map = mapInstance;
      const center = mapInstance.getCenter();
      originMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
      meterScale = originMerc.meterInMercatorCoordinateUnits();
      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
      });
      depthRangeBridge = installRenderTargetDepthRangeBridge(renderer, gl);
      renderer.autoClear = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      for (const runtime of runtimes.values()) {
        if (runtime.root.parent !== scene) scene.add(runtime.root);
        placeRuntime(runtime);
        runtime.onAdd?.(mapInstance);
      }
    },

    render(gl, options: CustomRenderMethodInput) {
      if (!map || !renderer || !originMerc || meterScale <= 0) return;

      const mainMatrix = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const localFromScene = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      renderCamera.projectionMatrix = mainMatrix.multiply(localFromScene);
      renderCamera.projectionMatrixInverse
        .copy(renderCamera.projectionMatrix)
        .invert();

      syncSharedCanvasViewport(renderer, map.getCanvas(), viewport);
      // Same pose the MapLibre 3D Tiles layer works out for itself, so it
      // lives in the engine rather than here, see synthesizeLodCamera.
      const centerLngLat = map.getCenter();
      if (
        !synthesizeLodCamera(
          lodCamera,
          map,
          {
            originMerc,
            meterScale,
            viewport,
            centerElevationMeters:
              map.queryTerrainElevation(centerLngLat) ??
              getSharedThreeTerrainElevation(
                map,
                centerLngLat.lng,
                centerLngLat.lat
              ) ??
              0,
          },
          lookTarget
        )
      ) {
        return;
      }

      const frame: SharedThreeSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        lookTarget,
        viewport,
      };
      scene.updateMatrixWorld(true);
      for (const runtime of runtimes.values()) runtime.update(frame);
      scene.updateMatrixWorld(true);

      const currentDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const savedDepthRange: DepthRange = [
        currentDepthRange[0],
        currentDepthRange[1],
      ];
      renderer.resetState();
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
      depthRangeBridge?.render(savedDepthRange, () => {
        renderer?.render(scene, renderCamera);
      });
    },

    onRemove() {
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const runtime of runtimes.values()) runtime.dispose();
      runtimes.clear();
      scene.clear();
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
    },
  };

  return layer;
};
