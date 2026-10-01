import { createSharedSceneLocalFrame } from "./shared-three-scene-local-frame";
import { createSharedSceneZoomPrefetch } from "./shared-three-scene-zoom-prefetch";
import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MAPLIBRE_EARTH_RADIUS } from "@carma-geo/proj";
import { degToRadNumeric, PI_OVER_TWO } from "@carma-units";
import {
  snapshotTileCameraViews,
  type TileCameraView,
} from "../../core/tile-camera-demand";
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
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

const rotationX = new THREE.Matrix4().makeRotationAxis(
  new THREE.Vector3(1, 0, 0),
  PI_OVER_TWO
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
  // Frame-mounted content is expressed in the local frame's reference fit and
  // carried to the current fit by this group alone; a refit is one matrix.
  const localFrameGroup = new THREE.Group();
  localFrameGroup.name = "shared-three-scene-local-frame";
  localFrameGroup.matrixAutoUpdate = false;
  scene.add(localFrameGroup);
  const runtimeHost = (runtime: SharedThreeSceneRuntime) =>
    runtime.mountsOnLocalFrame ? localFrameGroup : scene;
  const renderCamera = new THREE.PerspectiveCamera();
  const lodCamera = new THREE.PerspectiveCamera();
  const accumulationRuntime = createSharedThreeSceneAccumulation(layerId);
  const viewport = new THREE.Vector2(1, 1);
  const cssViewport = new THREE.Vector2(1, 1);
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
  let originLngLat: readonly [number, number] | null = null;

  const localFrameState = createSharedSceneLocalFrame(localFrameGroup);

  let renderingPaused = false;
  const screenRenderPasses = new Set<() => void>();
  const renderScreenPasses = () => {
    if (!renderer || disposed || renderingPaused) return;
    for (const render of screenRenderPasses) render();
  };
  const tileCameraViews = new Map<string, TileCameraView>();
  const zoomPrefetch = createSharedSceneZoomPrefetch(
    layerId,
    () => runtimeUpdateOrder
  );

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
    setRenderingPaused(paused) {
      renderingPaused = paused;
      if (!paused) map?.triggerRepaint();
    },
    isRenderingPaused: () => renderingPaused,

    setTileCameraView(view) {
      if (disposed) return;
      snapshotTileCameraViews([view]);
      tileCameraViews.set(view.id, view);
      map?.triggerRepaint();
    },

    removeTileCameraView(id) {
      if (tileCameraViews.delete(id)) map?.triggerRepaint();
    },

    requestTileCameraAhead(viewAt, aheadMs, validForMs = 250) {
      if (
        !Number.isFinite(aheadMs) ||
        aheadMs < 0 ||
        aheadMs > 5000 ||
        !Number.isFinite(validForMs) ||
        validForMs <= 0 ||
        validForMs > 2000
      )
        throw new Error(
          "Prediction needs aheadMs in [0, 5000] and validity in (0, 2000] ms"
        );
      const [view] = snapshotTileCameraViews([viewAt(aheadMs)]);
      if (!disposed) {
        for (const runtime of runtimeUpdateOrder)
          runtime.setPrefetchCameraView?.(view, view.id, validForMs);
        map?.triggerRepaint();
      }
      return view.id;
    },

    removePrefetchCameraView(id) {
      for (const runtime of runtimeUpdateOrder)
        runtime.setPrefetchCameraView?.(null, id);
      map?.triggerRepaint();
    },

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
      runtimeHost(runtime).add(runtime.root);
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
      runtime.root.removeFromParent();
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

    getLocalFrame() {
      return localFrameState.current;
    },

    getLocalFrameGroup() {
      return localFrameGroup;
    },

    getRenderer() {
      return renderer;
    },
    addScreenRenderPass(render) {
      screenRenderPasses.add(render);
      map?.triggerRepaint();
      return () => {
        screenRenderPasses.delete(render);
        map?.triggerRepaint();
      };
    },
    requestScreenRender() {
      map?.triggerRepaint();
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
    setMapStylePresentationEnabled(enabled) {
      mapStyleProjection.setEnabled(enabled);
    },
    setMapStyleProjectionVisible(visible) {
      mapStyleProjection.setVisible(visible);
    },

    setMapStyleSurfaceOverlay(id, overlay) {
      if (!overlay || !originMerc || meterScale <= 0) {
        mapStyleProjection.setSurfaceOverlay(id, null);
        return;
      }
      const [west, south, east, north] = overlay.bounds;
      const min = MercatorCoordinate.fromLngLat([west, north]);
      const max = MercatorCoordinate.fromLngLat([east, south]);
      const width = (max.x - min.x) / meterScale;
      const height = (max.y - min.y) / meterScale;
      if (!(width > 0 && height > 0)) return;
      const minX = (min.x - originMerc.x) / meterScale;
      const maxZ = (max.y - originMerc.y) / meterScale;
      mapStyleProjection.setSurfaceOverlay(id, {
        texture: overlay.texture,
        opacity: overlay.opacity,
        sceneToTexture: new THREE.Matrix4().set(
          1 / width,
          0,
          0,
          -minX / width,
          0,
          0,
          -1 / height,
          maxZ / height,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          1
        ),
      });
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
      map?.off?.(MAPLIBRE_EVENT.RENDER, renderScreenPasses);
      if (map)
        publishMapLoadingProgress(map, MAP_LOADING_PHASE.SHADOW, layerId, 1);
      mapStyleProjection.dispose();
      for (const runtime of runtimes.values()) runtime.root.removeFromParent();
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
      originMerc = null;
      meterScale = 0;
      originLngLat = null;
      localFrameState.reset();
    },

    onAdd(mapInstance, gl) {
      map = mapInstance;
      map.on?.(MAPLIBRE_EVENT.RENDER, renderScreenPasses);
      zoomPrefetch.attach(map);
      const center = mapInstance.getCenter();
      originMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
      meterScale = originMerc.meterInMercatorCoordinateUnits();
      originLngLat = [center.lng, center.lat];
      localFrameState.refit(map, originLngLat, true);
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
        const host = runtimeHost(runtime);
        if (runtime.root.parent !== host) host.add(runtime.root);
        placeRuntime(runtime);
        runtime.onAdd?.(mapInstance);
      }
    },

    render(gl, options: CustomRenderMethodInput) {
      if (renderingPaused) return;
      if (!map || !renderer || !originMerc || meterScale <= 0) return;
      renderedFrames += 1;

      const mainMatrix = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const localFromScene = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      if (options.defaultProjectionData.projectionTransition > 0) {
        // Local tangent mount on MapLibre's sphere (not WGS84 ECEF).
        // Keep the resident scene unchanged; only its scene-to-clip mapping changes.
        const origin = originMerc.toLngLat();
        const radius = MAPLIBRE_EARTH_RADIUS;
        localFromScene
          .makeRotationY(degToRadNumeric(origin.lng))
          .multiply(
            new THREE.Matrix4().makeRotationX(degToRadNumeric(-origin.lat))
          )
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1))
          .multiply(rotationX)
          .scale(new THREE.Vector3(1 / radius, 1 / radius, 1 / radius));
      }
      const sceneToClipMatrix = mainMatrix.multiply(localFromScene);

      syncSharedCanvasViewport(
        renderer,
        map.getCanvas(),
        viewport,
        cssViewport
      );
      // Same pose the MapLibre 3D Tiles layer works out for itself, so it
      // lives in the engine rather than here, see synthesizeLodCamera.
      const centerLngLat = map.getCenter();
      const centerElevation = map.getCenterElevation?.();
      const mapLibreTerrainElevation =
        typeof centerElevation === "number" && Number.isFinite(centerElevation)
          ? centerElevation
          : map.getTerrain()
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

      const currentLocalFrame = localFrameState.refit(map, originLngLat);
      if (!currentLocalFrame) return;
      const frame: SharedThreeSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        lookTarget,
        viewport,
        cssViewport,
        localFrame: currentLocalFrame,
        tileCameraViews: snapshotTileCameraViews([...tileCameraViews.values()]),
      };
      scene.updateMatrixWorld(true);
      for (const runtime of runtimeUpdateOrder) {
        runtime.update(frame);
      }
      zoomPrefetch.update(renderCamera, viewport);
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
            (runtime.providesTerrain !== false &&
              Boolean(runtime.receivesMapStyleTexture))
        )
      ) {
        // Explicit building-only receivers retain MapLibre's ground. Otherwise
        // the visible ground belongs to Three. Keep MapLibre's color only
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
      map?.off?.(MAPLIBRE_EVENT.RENDER, renderScreenPasses);
      zoomPrefetch.detach();
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
      map?.off?.(MAPLIBRE_EVENT.RENDER, renderScreenPasses);
      screenRenderPasses.clear();
      zoomPrefetch.detach();
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
      tileCameraViews.clear();
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
