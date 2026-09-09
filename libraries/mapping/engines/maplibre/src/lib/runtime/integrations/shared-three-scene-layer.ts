import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap, CustomRenderMethodInput } from "maplibre-gl";
import * as THREE from "three";
import type {
  SharedThreeSceneLayer,
  SharedThreeSceneLayerOptions,
  SharedThreeSceneRuntime,
  SharedThreeSceneFrame,
} from "../../core/shared-three-scene-types";
import { createSharedThreeSceneAccumulation } from "./shared-three-scene-accumulation";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";
import {
  configureSharedRenderCamera,
  syncSharedCanvasViewport,
  installRenderTargetDepthRangeBridge,
  clearMapStyleGroundBeforeThreeTerrain,
  clearDepthForMapStyleOverlays,
  type DepthRange,
  type RenderTargetDepthRangeBridge,
} from "./shared-three-scene-render-context";
import { runMapLibreIdleRender } from "./maplibre-idle-render";
import { setSharedThreeShadedPresentation } from "./shared-three-scene-content-registry";
import { MAP_LOADING_PHASE } from "../../core/map-loading-progress";
import { publishMapLoadingProgress } from "./map-loading-progress";

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
  const renderCamera = new THREE.PerspectiveCamera();
  const lodCamera = new THREE.PerspectiveCamera();
  const accumulationRuntime = createSharedThreeSceneAccumulation(layerId);
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();
  const runtimes = new Map<string, SharedThreeSceneRuntime>();
  const mapStyleProjection = createSharedThreeMapStyleProjection(
    layerId,
    runtimes,
    viewport
  );
  let runtimeUpdateOrder: SharedThreeSceneRuntime[] = [];
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let depthRangeBridge: RenderTargetDepthRangeBridge | null = null;
  let originMerc: MercatorCoordinate | null = null;
  let meterScale = 0;
  let renderedFrames = 0;
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
      mapStyleProjection.removeRuntime(runtime.id);
      runtimeUpdateOrder = [...runtimes.values()].sort(
        (a, b) => (b.updatePriority ?? 0) - (a.updatePriority ?? 0)
      );
      scene.add(runtime.root);
      placeRuntime(runtime);
      if (map) runtime.onAdd?.(map);
      map?.triggerRepaint();
    },

    removeRuntime(runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (!runtime) return;
      runtimes.delete(runtimeId);
      mapStyleProjection.removeRuntime(runtimeId);
      runtimeUpdateOrder = runtimeUpdateOrder.filter(
        (candidate) => candidate !== runtime
      );
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

    getRuntimes() {
      return [...runtimes.values()];
    },

    getRenderer() {
      return renderer;
    },
    runIdleRender(render) {
      return renderer !== null && runMapLibreIdleRender(map, render);
    },

    setAccumulationController(controller) {
      accumulationRuntime.setController(controller, map, renderer);
    },

    getMapStyleProjectionState() {
      return mapStyleProjection.getState(renderedFrames);
    },
    setMapStyleProjectionVisible(visible) {
      mapStyleProjection.setVisible(visible);
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

    projectSceneToLngLat(position) {
      if (!originMerc || meterScale <= 0) return null;
      const [x, y, z] =
        position instanceof THREE.Vector3
          ? [position.x, position.y, position.z]
          : position;
      const coordinate = new MercatorCoordinate(
        originMerc.x + x * meterScale,
        originMerc.y + z * meterScale,
        originMerc.z + y * meterScale
      );
      const lngLat = coordinate.toLngLat();
      return [lngLat.lng, lngLat.lat];
    },

    detach() {
      if (map)
        publishMapLoadingProgress(map, MAP_LOADING_PHASE.SHADOW, layerId, 1);
      mapStyleProjection.dispose();
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
      mapStyleProjection.attach(mapInstance, renderer);
      depthRangeBridge = installRenderTargetDepthRangeBridge(renderer, gl);
      renderer.autoClear = false;
      // Direct/point-sun frames and the final HDR accumulation use the same
      // display transform. Ordinary unshaded tiles retain their original look.
      renderer.toneMapping = accumulationRuntime.controller
        ? THREE.AgXToneMapping
        : THREE.NoToneMapping;
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
      renderedFrames += 1;

      const mainMatrix = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const localFromScene = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      const sceneToClipMatrix = mainMatrix.multiply(localFromScene);

      syncSharedCanvasViewport(renderer, map.getCanvas(), viewport);
      // Same pose the MapLibre 3D Tiles layer works out for itself, so it
      // lives in the engine rather than here, see synthesizeLodCamera.
      const centerLngLat = map.getCenter();
      const mapLibreTerrainElevation = map.getTerrain()
        ? map.queryTerrainElevation(centerLngLat) ??
          map.getCameraTargetElevation()
        : 0;
      if (
        !synthesizeLodCamera(
          lodCamera,
          map,
          {
            originMerc,
            meterScale,
            viewport,
            centerElevationMeters: mapLibreTerrainElevation,
          },
          lookTarget
        )
      ) {
        return;
      }
      configureSharedRenderCamera(renderCamera, lodCamera, sceneToClipMatrix);

      const frame: SharedThreeSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        lookTarget,
        viewport,
      };
      scene.updateMatrixWorld(true);
      for (const runtime of runtimeUpdateOrder) {
        runtime.update(frame);
      }
      scene.updateMatrixWorld(true);

      const currentDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const savedDepthRange: DepthRange = [
        currentDepthRange[0],
        currentDepthRange[1],
      ];
      renderer.resetState();
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
      if (
        !mapStyleProjection.capture(
          sceneToClipMatrix,
          accumulationRuntime.controller !== null
        )
      )
        return;
      if (
        runtimeUpdateOrder.some(
          (runtime) =>
            runtime.providesTerrain === true ||
            Boolean(runtime.receivesMapStyleTexture)
        )
      ) {
        // The visible ground now belongs to Three. Keep MapLibre's color only
        // in the captured texture; discard its competing fill, DEM and skirts.
        clearMapStyleGroundBeforeThreeTerrain(gl, savedDepthRange);
      }

      accumulationRuntime.render(renderer, scene, frame, {
        styleEpoch: mapStyleProjection.epoch,
        depthRangeBridge,
        depthRange: savedDepthRange,
      });
      clearDepthForMapStyleOverlays(gl, savedDepthRange);
    },

    onRemove() {
      accumulationRuntime.dispose();
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          1,
          false
        );
      mapStyleProjection.dispose();
      if (map) setSharedThreeShadedPresentation(map, false);
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
    },

    dispose() {
      accumulationRuntime.dispose();
      if (disposed) return;
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          1,
          false
        );
      mapStyleProjection.dispose();
      if (map) setSharedThreeShadedPresentation(map, false);
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
