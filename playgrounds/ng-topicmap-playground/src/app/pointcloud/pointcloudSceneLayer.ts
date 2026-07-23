import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";

export interface PointcloudSceneFrame {
  map: MaplibreMap;
  renderCamera: THREE.Camera;
  lodCamera: THREE.PerspectiveCamera;
  viewport: THREE.Vector2;
}

export interface PointcloudSceneRuntime {
  id: string;
  originLngLat: [number, number];
  root: THREE.Object3D;
  onAdd?: (map: MaplibreMap) => void;
  update: (frame: PointcloudSceneFrame) => void;
  dispose: () => void;
}

export interface PointcloudSceneLayer extends CustomLayerInterface {
  addRuntime: (runtime: PointcloudSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  /** Detach the custom layer without destroying runtimes preserved across HMR. */
  detach: () => void;
  dispose: () => void;
}

const rotationX = new THREE.Matrix4().makeRotationAxis(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);

/**
 * One MapLibre custom layer and one Three.js scene for all streamed point and
 * mesh content. Opaque meshes and transparent splats therefore share Three's
 * render ordering and MapLibre's existing depth buffer in a single draw.
 */
export const buildPointcloudSceneLayer = (
  layerId: string
): PointcloudSceneLayer => {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const renderCamera = new THREE.Camera();
  const lodCamera = new THREE.PerspectiveCamera();
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();
  const runtimes = new Map<string, PointcloudSceneRuntime>();
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let originMerc: MercatorCoordinate | null = null;
  let meterScale = 0;
  let disposed = false;

  const placeRuntime = (runtime: PointcloudSceneRuntime) => {
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

  const layer: PointcloudSceneLayer = {
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

    detach() {
      for (const runtime of runtimes.values()) scene.remove(runtime.root);
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
      renderer.autoClear = false;
      for (const runtime of runtimes.values()) {
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

      renderer.getDrawingBufferSize(viewport);
      const transform = (
        map as unknown as {
          transform: {
            _fov?: number;
            cameraToCenterDistance?: number;
            worldSize?: number;
          };
        }
      ).transform;
      const fovRad = transform._fov ?? 0.6435011087932844;
      const distancePx = transform.cameraToCenterDistance ?? 0;
      const worldSize = transform.worldSize ?? 1;
      if (!distancePx || !worldSize) return;
      const distanceMeters = distancePx / worldSize / meterScale;
      const centerLngLat = map.getCenter();
      const centerMerc = MercatorCoordinate.fromLngLat(
        centerLngLat,
        map.queryTerrainElevation(centerLngLat) ?? 0
      );
      lookTarget.set(
        (centerMerc.x - originMerc.x) / meterScale,
        (centerMerc.z - originMerc.z) / meterScale,
        (centerMerc.y - originMerc.y) / meterScale
      );
      const pitch = THREE.MathUtils.degToRad(map.getPitch());
      const bearing = THREE.MathUtils.degToRad(map.getBearing());
      lodCamera.position.set(
        lookTarget.x - Math.sin(bearing) * Math.sin(pitch) * distanceMeters,
        lookTarget.y + Math.cos(pitch) * distanceMeters,
        lookTarget.z + Math.cos(bearing) * Math.sin(pitch) * distanceMeters
      );
      if (map.getPitch() < 5) {
        lodCamera.up.set(-Math.sin(bearing), 0, -Math.cos(bearing));
      } else {
        lodCamera.up.set(0, 1, 0);
      }
      lodCamera.lookAt(lookTarget);
      lodCamera.fov = THREE.MathUtils.radToDeg(fovRad);
      lodCamera.aspect = viewport.x / Math.max(1, viewport.y);
      lodCamera.near = 2;
      lodCamera.far = 1_000_000;
      lodCamera.updateProjectionMatrix();
      lodCamera.updateMatrixWorld(true);

      const frame: PointcloudSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        viewport,
      };
      scene.updateMatrixWorld(true);
      for (const runtime of runtimes.values()) runtime.update(frame);
      scene.updateMatrixWorld(true);

      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, renderCamera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },

    onRemove() {
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
      renderer?.dispose();
      renderer = null;
      map = null;
    },
  };

  return layer;
};
