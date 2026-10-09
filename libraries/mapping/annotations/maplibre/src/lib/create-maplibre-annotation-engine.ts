import { useEffect, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Raycaster, Vector3, type Object3D } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { degToRadNumeric, PI_OVER_TWO } from "@carma-units";
import {
  ANNOTATION_ENGINE_KINDS,
  createCanvasPointerTracker,
  useEnginePointMoveGizmo,
  useEnginePointQuery,
  type AnnotationEngine,
  type AnnotationProjectionOptions,
  type AnnotationProjectionState,
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/runtime";

import {
  createMapLibreAnnotationScene,
  type MapLibreAnnotationScene,
} from "./maplibre-annotation-scene";
import { MAPLIBRE_EVENT } from "./maplibre-events";
import { flyMapLibreToPoints } from "./maplibre-fly-to";
import { createMapLibreSceneLineCollection } from "./maplibre-scene-lines";
import {
  createMapLibreSceneDisc,
  createMapLibreScenePolygonFills,
  createMapLibreSceneRing,
} from "./maplibre-scene-primitives";
import { createMapLibreSurfacePicker } from "./maplibre-surface-pick";

/**
 * MapLibre + Three.js adapter of the annotations engine contract
 * (cismet/carma#680): the measurement tool drawn and picked inside the
 * shared Three.js scene of a MapLibre map, without Cesium. Projection,
 * picking, pointer tracking and the scene primitives come from the modules
 * next to this file; the point query and the point-move gizmo are the
 * engine-neutral runtime ports bound to this engine.
 */

/** Cesium's projection defaults the runtime relied on. */
const PROJECTION_DEFAULTS = Object.freeze({
  viewportPaddingHorizontal: 12,
  viewportPaddingVertical: 8,
  occlusionToleranceMeters: 1,
});

const HIDDEN_PROJECTION: AnnotationProjectionState = Object.freeze({
  screenPosition: null,
  isInViewport: false,
  isHidden: true,
  isOccluded: false,
});

const ANNOTATION_PICK_THRESHOLD_PX = 6;

const createProjectionCache = () => {
  let frameKey = -1;
  const states = new Map<string, AnnotationProjectionState>();
  return {
    read: (key: string, currentFrameKey: number) => {
      if (frameKey !== currentFrameKey) {
        frameKey = currentFrameKey;
        states.clear();
      }
      return states.get(key);
    },
    write: (key: string, state: AnnotationProjectionState) => {
      states.set(key, state);
      return state;
    },
  };
};

export const createMapLibreAnnotationEngine = (
  map: MaplibreMap
): AnnotationEngine => {
  const scene: MapLibreAnnotationScene = createMapLibreAnnotationScene(map);
  // A double click finishes a line or polygon, as in the Cesium viewer; it
  // must not zoom the map underneath the measurement meanwhile.
  const restoreDoubleClickZoom = map.doubleClickZoom.isEnabled();
  map.doubleClickZoom.disable();
  const picker = createMapLibreSurfacePicker(scene);
  const pointer = createCanvasPointerTracker(map.getCanvas());
  const projectionCache = createProjectionCache();
  const pickRaycaster = new Raycaster();
  pickRaycaster.params.Line2 = { threshold: ANNOTATION_PICK_THRESHOLD_PX };
  let disposed = false;
  const isDestroyed = () => disposed || scene.isDisposed();

  const worldToScreen: AnnotationEngine["worldToScreen"] = (
    positionECEF,
    out
  ) => (isDestroyed() ? null : scene.worldToScreen(positionECEF, out));

  const projectPoint = (
    positionECEF: Vector3,
    {
      shouldTestVisibility = true,
      shouldTestOcclusion = true,
      viewportPaddingHorizontal = PROJECTION_DEFAULTS.viewportPaddingHorizontal,
      viewportPaddingVertical = PROJECTION_DEFAULTS.viewportPaddingVertical,
      occlusionToleranceMeters = PROJECTION_DEFAULTS.occlusionToleranceMeters,
    }: AnnotationProjectionOptions = {}
  ): AnnotationProjectionState => {
    if (isDestroyed()) return HIDDEN_PROJECTION;
    const cacheKey = [
      positionECEF.x,
      positionECEF.y,
      positionECEF.z,
      shouldTestVisibility,
      shouldTestOcclusion,
      viewportPaddingHorizontal,
      viewportPaddingVertical,
      occlusionToleranceMeters,
    ].join(":");
    const cached = projectionCache.read(cacheKey, scene.getFrameKey());
    if (cached) return cached;
    const screenPosition = scene.worldToScreen(positionECEF);
    if (!screenPosition) {
      return projectionCache.write(cacheKey, {
        screenPosition: null,
        isInViewport: false,
        isHidden: shouldTestVisibility,
        isOccluded: false,
      });
    }
    const { width, height } = scene.getCssViewport();
    const isInViewport =
      screenPosition.x >= -viewportPaddingHorizontal &&
      screenPosition.y >= -viewportPaddingVertical &&
      screenPosition.x <= width + viewportPaddingHorizontal &&
      screenPosition.y <= height + viewportPaddingVertical;
    return projectionCache.write(cacheKey, {
      screenPosition:
        screenPosition as AnnotationProjectionState["screenPosition"],
      isInViewport,
      isHidden: shouldTestVisibility ? !isInViewport : false,
      isOccluded:
        shouldTestOcclusion && isInViewport
          ? picker.isPointOccluded(positionECEF, occlusionToleranceMeters)
          : false,
    });
  };

  const pickAnnotationIdsAt = (
    screenPosition: AnnotationScreenPosition
  ): readonly string[] => {
    const frame = scene.getFrame();
    const ray = scene.getPickRay(screenPosition);
    if (isDestroyed() || !frame || !ray) return [];
    pickRaycaster.camera = frame.renderCamera;
    pickRaycaster.set(ray.origin, ray.direction);
    pickRaycaster.near = 0;
    pickRaycaster.far = ray.length;
    // An unset Line2 has no instance attributes and would throw in its
    // raycast; hidden primitives are not pick targets either.
    const candidates: Object3D[] = [];
    scene.root.traverse((object) => {
      if (!object.visible || object === scene.root) return;
      const geometry = (
        object as { geometry?: { attributes?: Record<string, unknown> } }
      ).geometry;
      if (!geometry?.attributes) return;
      if (object instanceof Line2 && !geometry.attributes.instanceStart) return;
      candidates.push(object);
    });
    const ids: string[] = [];
    for (const hit of pickRaycaster.intersectObjects(candidates, false)) {
      const id = hit.object.userData.annotationPickId;
      if (typeof id === "string" && !ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const engine: AnnotationEngine = {
    kind: ANNOTATION_ENGINE_KINDS.MAPLIBRE_THREE,
    capabilities: { occludedLinesInScene: true },
    canvas: map.getCanvas(),
    getOverlayContainer: () => map.getCanvasContainer(),
    isDestroyed,
    requestRender: () => scene.requestRender(),
    subscribePreRender: (listener) => scene.subscribePreRender(listener),
    subscribePostRender: (listener) => scene.subscribePostRender(listener),
    subscribeCameraMove: ({ onMoveStart, onMoveEnd }) => {
      if (onMoveStart) map.on(MAPLIBRE_EVENT.MOVE_START, onMoveStart);
      if (onMoveEnd) map.on(MAPLIBRE_EVENT.MOVE_END, onMoveEnd);
      return () => {
        if (onMoveStart) map.off(MAPLIBRE_EVENT.MOVE_START, onMoveStart);
        if (onMoveEnd) map.off(MAPLIBRE_EVENT.MOVE_END, onMoveEnd);
      };
    },
    getFrameKey: () => (isDestroyed() ? null : scene.getFrameKey()),
    captureProjectionSnapshot: () => {
      if (isDestroyed()) return null;
      const { width, height } = scene.getCssViewport();
      const center = map.getCenter();
      return {
        viewportWidth: width,
        viewportHeight: height,
        viewKey: [
          center.lng.toFixed(9),
          center.lat.toFixed(9),
          map.getZoom().toFixed(6),
          map.getBearing().toFixed(4),
          map.getPitch().toFixed(4),
          map.getRoll?.()?.toFixed(4) ?? "0",
        ].join("|"),
      };
    },
    getCameraPositionECEF: (out) => {
      const cameraScene = scene.getCameraScenePosition();
      return cameraScene && !isDestroyed()
        ? scene.ecefFromScene(cameraScene, out)
        : null;
    },
    // MapLibre's pitch counts up from nadir; Cesium's from the horizon, downward negative.
    getCameraPitchRad: () =>
      isDestroyed() ? 0 : degToRadNumeric(map.getPitch()) - PI_OVER_TWO,
    worldToScreen,
    projectPoint,
    getPickRay: (screenPosition) => {
      const ray = isDestroyed() ? null : scene.getPickRay(screenPosition);
      if (!ray) return null;
      const origin = scene.ecefFromScene(ray.origin);
      const target = scene.ecefFromScene(
        ray.origin.clone().addScaledVector(ray.direction, ray.length)
      );
      if (!origin || !target) return null;
      return { origin, direction: target.sub(origin).normalize() };
    },
    getScreenPixelsPerMeterAt: (positionECEF) => {
      const scenePosition = isDestroyed()
        ? null
        : scene.sceneFromEcef(positionECEF);
      return scenePosition ? scene.getPixelsPerMeterAtScene(scenePosition) : 0;
    },
    resolveSurfacePick: (screenPosition, options) =>
      isDestroyed()
        ? { surfacePositionECEF: null, globePositionECEF: null }
        : picker.resolveSurfacePick(screenPosition, options),
    sampleSurfaceNormalAt: (screenPosition, centerECEF) =>
      isDestroyed()
        ? null
        : picker.sampleSurfaceNormalAt(screenPosition, centerECEF),
    pickAnnotationIdsAt,
    flyToPoints: (pointsECEF, options) => {
      if (!isDestroyed()) flyMapLibreToPoints(map, pointsECEF, options);
    },
    pointer,
    createLineCollection: (options) =>
      createMapLibreSceneLineCollection(scene, options),
    createRing: (options) => createMapLibreSceneRing(scene, options),
    createDisc: (options) => createMapLibreSceneDisc(scene, options),
    createPolygonFills: (options) =>
      createMapLibreScenePolygonFills(scene, options),
    hooks: {
      usePointQuery: (options) =>
        useEnginePointQuery(isDestroyed() ? null : engine, options),
      usePointMoveGizmo: (options) =>
        useEnginePointMoveGizmo(isDestroyed() ? null : engine, options),
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (restoreDoubleClickZoom) map.doubleClickZoom.enable();
      scene.dispose();
    },
  };
  return engine;
};

/** One engine per map instance, disposed when the map changes or unmounts. */
export const useMapLibreAnnotationEngine = (
  map: MaplibreMap | null
): AnnotationEngine | null => {
  const engine = useMemo(
    () => (map ? createMapLibreAnnotationEngine(map) : null),
    [map]
  );
  useEffect(() => () => engine?.dispose(), [engine]);
  return engine;
};
