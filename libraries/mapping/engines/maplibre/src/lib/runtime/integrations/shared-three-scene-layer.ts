import {
  EARTH_RADIUS,
  getCameraLocalMercatorFit,
  getPixelResolutionFromZoomAtLatitudeRad,
} from "@carma-geo/proj";
import { distanceMeters } from "@carma-geo/utils";
import { degToRad } from "@carma-units";
import type { CssPixels, Degrees, Meters } from "@carma-units";
import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap, CustomRenderMethodInput } from "maplibre-gl";
import * as THREE from "three";
import type {
  SharedThreeSceneLayer,
  SharedThreeSceneLayerOptions,
  SharedThreeSceneLocalFrame,
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

const MAPLIBRE_TILE_SIZE = 512;
/** Screen error the local frame may accumulate before it is refitted. */
const LOCAL_FRAME_MAX_ERROR_PIXELS = 0.5 as CssPixels;
/**
 * Content height the up-vector tilt is charged against. Tall buildings and
 * terrain relief in the served cities stay under it; a taller scene shows the
 * tilt a little earlier than the pixel budget promises.
 */
const LOCAL_FRAME_NOMINAL_HEIGHT_METERS = 200 as Meters;

/**
 * Screen-space error, in CSS pixels, that the current view would show if the
 * scene kept the frame fitted `distance` metres away from its centre.
 *
 * Decision: LOCAL-FRAME-MOUNT-20260918 in engines/maplibre/README.md.
 * The frame is a tangent-plane affine at its anchor, so three errors grow with
 * the distance d to it and all are exact at d = 0: the Mercator scale drifts by
 * tan(lat) * d / R and that drift acts across the whole visible half width; the
 * surface sags by d^2 / 2R, visible in proportion to the pitch; and the up
 * vector tilts by d / R, which moves content in proportion to its height. The
 * sum is compared with half a pixel at the current metres per pixel, so a
 * zoomed-in view refits after a few hundred metres and a city overview almost
 * never. Only scalars are touched per frame; vectors move on a refit.
 */
const localFrameErrorPixels = (
  distance: Meters,
  latitude: Degrees,
  zoom: number,
  pitch: Degrees,
  viewportWidth: CssPixels
): CssPixels => {
  const latitudeRad = degToRad(latitude);
  const metersPerPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: MAPLIBRE_TILE_SIZE }
  );
  const halfViewMeters = (viewportWidth / 2) * metersPerPixel;
  const scaleDrift = (Math.tan(latitudeRad) * distance) / EARTH_RADIUS;
  const scaleErrorMeters = (distance + halfViewMeters) * scaleDrift;
  const sagMeters =
    ((distance * distance) / (2 * EARTH_RADIUS)) * Math.sin(degToRad(pitch));
  const tiltMeters =
    (LOCAL_FRAME_NOMINAL_HEIGHT_METERS * distance) / EARTH_RADIUS;
  return ((scaleErrorMeters + sagMeters + tiltMeters) /
    metersPerPixel) as CssPixels;
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
  let localFrame: SharedThreeSceneLocalFrame | null = null;

  /**
   * Fit the local frame at the current map centre. The frame is kept while
   * the current view would show at most `LOCAL_FRAME_MAX_ERROR_PIXELS` from
   * it, so the runtimes and lights mounted on it are not disturbed on every
   * pan frame; `force` refits regardless, on attach.
   */
  const refitLocalFrame = (
    force = false
  ): SharedThreeSceneLocalFrame | null => {
    if (!map || !originLngLat) return localFrame;
    const center = map.getCenter();
    const lngLat: readonly [number, number] = [center.lng, center.lat];
    if (
      !force &&
      localFrame &&
      localFrameErrorPixels(
        distanceMeters(
          {
            longitude: localFrame.lngLat[0] as Degrees,
            latitude: localFrame.lngLat[1] as Degrees,
          },
          { longitude: center.lng as Degrees, latitude: center.lat as Degrees }
        ) as Meters,
        center.lat as Degrees,
        map.getZoom?.() ?? 16,
        (map.getPitch?.() ?? 0) as Degrees,
        (map.getCanvas?.()?.clientWidth || 1920) as CssPixels
      ) <= LOCAL_FRAME_MAX_ERROR_PIXELS
    ) {
      return localFrame;
    }
    const sceneFromLocal = getCameraLocalMercatorFit(
      [originLngLat[0], originLngLat[1]],
      [lngLat[0], lngLat[1]],
      { correctEllipsoidMetric: true }
    );
    const referenceLngLat = localFrame?.referenceLngLat ?? lngLat;
    const sceneFromLocalReference =
      localFrame?.sceneFromLocalReference ?? sceneFromLocal;
    const referenceToCurrent = localFrame
      ? sceneFromLocal
          .clone()
          .multiply(sceneFromLocalReference.clone().invert())
      : new THREE.Matrix4();
    localFrame = {
      lngLat,
      revision: (localFrame?.revision ?? 0) + 1,
      sceneFromLocal,
      sceneFromLocalRotation: new THREE.Matrix4().extractRotation(
        sceneFromLocal
      ),
      referenceLngLat,
      sceneFromLocalReference,
      referenceToCurrent,
      currentToReference: referenceToCurrent.clone().invert(),
    };
    localFrameGroup.matrix.copy(referenceToCurrent);
    localFrameGroup.updateMatrixWorld(true);
    return localFrame;
  };

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
      return localFrame;
    },

    getLocalFrameGroup() {
      return localFrameGroup;
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
      for (const runtime of runtimes.values()) runtime.root.removeFromParent();
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
      originMerc = null;
      meterScale = 0;
      originLngLat = null;
      localFrame = null;
    },

    onAdd(mapInstance, gl) {
      map = mapInstance;
      const center = mapInstance.getCenter();
      originMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
      meterScale = originMerc.meterInMercatorCoordinateUnits();
      originLngLat = [center.lng, center.lat];
      refitLocalFrame(true);
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

      const currentLocalFrame = refitLocalFrame();
      if (!currentLocalFrame) return;
      const frame: SharedThreeSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        lookTarget,
        viewport,
        localFrame: currentLocalFrame,
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
