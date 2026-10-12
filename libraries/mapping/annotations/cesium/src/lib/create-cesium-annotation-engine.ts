import { useEffect, useMemo } from "react";
import {
  DEFAULT_ECEF_CAMERA_FOV_Y,
  readHorizontalFovFromVertical,
} from "@carma-commons/camera/model";
import type { Radians } from "@carma-units";
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma-cesium";
import {
  captureCesiumSceneProjectionSnapshot,
  flyToBoundingSphereExtent,
  getCesiumSceneFrameKey,
  getScreenPixelsPerMeterAtWorldPoint,
  pickCesiumSceneAtPosition,
  pickCesiumSceneFromRay,
  projectCesiumScenePoint,
  resolvePreferredSurfacePick,
  sampleSurfacePickNormalAtScreenPosition,
} from "@carma-mapping/engines/cesium/core";
import {
  clearCesiumScenePointerTracker,
  getCesiumScenePointerClientPosition,
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
  useCesiumPointQuery,
} from "@carma-mapping/engines/cesium/react/interactions";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";
import {
  ANNOTATION_ENGINE_KINDS,
  type AnnotationEngine,
  type AnnotationProjectionSnapshot,
} from "@carma-mapping/annotations/runtime";

import {
  cesiumGizmoOptions,
  cesiumPointQueryOptions,
  createGizmoInputCache,
} from "./cesium-tool-hook-options";
import { buildProjectionViewKey } from "./cesium-projection-view-key";
import {
  createCesiumDisc,
  createCesiumLineCollection,
  createCesiumPolygonFills,
  createCesiumRing,
} from "./cesium-scene-content";
import {
  cartesian2FromScreenPosition,
  cartesian3FromVector3,
  screenPositionFromCartesian2,
  vector3FromCartesian3,
  vector3FromOptionalCartesian3,
} from "./cesium-vector-conversions";

/**
 * Cesium adapter of the annotations engine contract: converts between the
 * runtime's ECEF `Vector3` and Cesium's `Cartesian3` at the boundary and
 * binds the Cesium scene, picking and interaction hooks to the contract.
 */

const resolvePickedIdCandidates = (pickedObject: unknown): string[] => {
  if (typeof pickedObject !== "object" || pickedObject === null) {
    return [];
  }
  const candidates: unknown[] = [];
  const directId = (pickedObject as { id?: unknown }).id;
  candidates.push(directId);
  if (typeof directId === "object" && directId !== null) {
    candidates.push((directId as { polygonGroupId?: unknown }).polygonGroupId);
  }
  const primitive = (pickedObject as { primitive?: unknown }).primitive;
  if (typeof primitive === "object" && primitive !== null) {
    candidates.push((primitive as { id?: unknown }).id);
  }
  return candidates.filter(
    (candidate): candidate is string => typeof candidate === "string"
  );
};

export const createCesiumAnnotationEngine = (
  scene: Scene
): AnnotationEngine => {
  const screenScratch = new Cartesian2();
  const worldScratch = new Cartesian3();
  const gizmoInputCache = createGizmoInputCache();
  let disposed = false;
  const isDestroyed = () => disposed || scene.isDestroyed();

  const worldToScreen: AnnotationEngine["worldToScreen"] = (
    positionECEF,
    out
  ) => {
    if (isDestroyed()) return null;
    const projected = SceneTransforms.worldToWindowCoordinates(
      scene,
      cartesian3FromVector3(positionECEF, worldScratch),
      screenScratch
    );
    if (!defined(projected)) return null;
    if (out) {
      out.x = projected.x;
      out.y = projected.y;
      return out;
    }
    return { x: projected.x, y: projected.y };
  };

  return {
    kind: ANNOTATION_ENGINE_KINDS.CESIUM,
    capabilities: { occludedLinesInScene: false, occlusionPerFrame: false },
    canvas: scene.canvas,
    getOverlayContainer: () => scene.canvas.parentElement,
    isDestroyed,
    requestRender: () => {
      if (!isDestroyed()) scene.requestRender();
    },
    subscribePreRender: (listener) =>
      isDestroyed()
        ? () => undefined
        : scene.preRender.addEventListener(listener),
    subscribePostRender: (listener) =>
      isDestroyed()
        ? () => undefined
        : scene.postRender.addEventListener(listener),
    subscribeCameraMove: ({ onMoveStart, onMoveEnd }) => {
      if (isDestroyed()) return () => undefined;
      const removeStart = onMoveStart
        ? scene.camera.moveStart.addEventListener(onMoveStart)
        : null;
      const removeEnd = onMoveEnd
        ? scene.camera.moveEnd.addEventListener(onMoveEnd)
        : null;
      return () => {
        removeStart?.();
        removeEnd?.();
      };
    },
    getFrameKey: () => (isDestroyed() ? null : getCesiumSceneFrameKey(scene)),
    captureProjectionSnapshot: (): AnnotationProjectionSnapshot | null => {
      if (isDestroyed()) return null;
      const snapshot = captureCesiumSceneProjectionSnapshot(scene);
      return snapshot
        ? {
            viewportWidth: snapshot.viewportWidth,
            viewportHeight: snapshot.viewportHeight,
            viewKey: buildProjectionViewKey(snapshot),
          }
        : null;
    },
    getCameraPositionECEF: (out) =>
      isDestroyed()
        ? null
        : vector3FromCartesian3(scene.camera.positionWC, out),
    getCameraPitchRad: () =>
      isDestroyed() || typeof scene.camera.pitch !== "number"
        ? 0
        : scene.camera.pitch,
    getCameraPose: () => {
      if (isDestroyed()) return null;
      const { camera } = scene;
      const frustum = camera.frustum as { fovy?: number };
      return {
        positionECEF: vector3FromCartesian3(camera.positionWC),
        directionECEF: vector3FromCartesian3(camera.directionWC),
        upECEF: vector3FromCartesian3(camera.upWC),
        verticalFovRad:
          typeof frustum.fovy === "number"
            ? (frustum.fovy as Radians)
            : DEFAULT_ECEF_CAMERA_FOV_Y,
      };
    },
    setCameraPose: (pose) => {
      if (isDestroyed()) return false;
      const { camera } = scene;
      camera.setView({
        destination: cartesian3FromVector3(pose.positionECEF),
        orientation: {
          direction: cartesian3FromVector3(pose.directionECEF),
          up: cartesian3FromVector3(pose.upECEF),
        },
      });
      // Cesium's fov is the horizontal one when the view is wider than tall
      const frustum = camera.frustum as { fov?: number; aspectRatio?: number };
      if (typeof frustum.fov === "number") {
        const aspect = frustum.aspectRatio ?? 1;
        frustum.fov =
          aspect > 1
            ? readHorizontalFovFromVertical(pose.verticalFovRad, aspect) ??
              frustum.fov
            : pose.verticalFovRad;
      }
      scene.requestRender();
      return true;
    },
    worldToScreen,
    projectPoint: (positionECEF, options) => {
      const state = projectCesiumScenePoint(
        isDestroyed() ? null : scene,
        cartesian3FromVector3(positionECEF),
        options
      );
      return {
        screenPosition: state.screenPosition,
        isInViewport: state.isInViewport,
        isHidden: state.isHidden,
        isOccluded: state.isOccluded,
      };
    },
    getPickRay: (screenPosition) => {
      if (isDestroyed()) return null;
      const ray = scene.camera.getPickRay(
        cartesian2FromScreenPosition(screenPosition)
      );
      return ray
        ? {
            origin: vector3FromCartesian3(ray.origin),
            direction: vector3FromCartesian3(ray.direction),
          }
        : null;
    },
    getScreenPixelsPerMeterAt: (positionECEF) =>
      isDestroyed()
        ? 0
        : getScreenPixelsPerMeterAtWorldPoint(
            scene,
            cartesian3FromVector3(positionECEF)
          ),
    resolveSurfacePick: (screenPosition, options) => {
      if (isDestroyed()) {
        return { surfacePositionECEF: null, globePositionECEF: null };
      }
      if (options?.excludeDragSampleOccluders) {
        const ray = scene.camera.getPickRay(
          cartesian2FromScreenPosition(screenPosition)
        );
        const rayPick = ray
          ? pickCesiumSceneFromRay(scene, ray, {
              includeDragSampleExclusions: true,
            })
          : undefined;
        const surfacePositionECEF = vector3FromOptionalCartesian3(
          rayPick?.position
        );
        if (!options.resolveGlobePosition) {
          return { surfacePositionECEF, globePositionECEF: null };
        }
        const globePick = resolvePreferredSurfacePick(
          scene,
          cartesian2FromScreenPosition(screenPosition),
          { resolveGlobePosition: true }
        );
        return {
          surfacePositionECEF,
          globePositionECEF: vector3FromOptionalCartesian3(
            globePick.globePositionECEF
          ),
        };
      }
      const pick = resolvePreferredSurfacePick(
        scene,
        cartesian2FromScreenPosition(screenPosition),
        options
      );
      return {
        surfacePositionECEF: vector3FromOptionalCartesian3(
          pick.surfacePositionECEF
        ),
        globePositionECEF: vector3FromOptionalCartesian3(
          pick.globePositionECEF
        ),
      };
    },
    sampleSurfaceNormalAt: (screenPosition, centerECEF) => {
      if (isDestroyed()) return null;
      const normal = sampleSurfacePickNormalAtScreenPosition(
        scene,
        cartesian2FromScreenPosition(screenPosition),
        cartesian3FromVector3(centerECEF)
      );
      return vector3FromOptionalCartesian3(normal);
    },
    pickAnnotationIdsAt: (screenPosition) =>
      isDestroyed()
        ? []
        : resolvePickedIdCandidates(
            pickCesiumSceneAtPosition(
              scene,
              cartesian2FromScreenPosition(screenPosition)
            )
          ),
    flyToPoints: (pointsECEF, options) => {
      if (isDestroyed() || pointsECEF.length === 0) return;
      const sphere = BoundingSphere.fromPoints(
        pointsECEF.map((point) => cartesian3FromVector3(point))
      );
      sphere.radius = Math.max(sphere.radius, options.minRadiusMeters);
      flyToBoundingSphereExtent(scene.camera, sphere, {
        minRange: options.minRadiusMeters,
        paddingFactor: options.paddingFactor,
      });
    },
    pointer: {
      register: () =>
        isDestroyed()
          ? () => undefined
          : registerCesiumScenePointerTracker(scene),
      getScreenPosition: () => {
        if (isDestroyed()) return null;
        const position = getCesiumScenePointerScreenPosition(scene);
        return position ? screenPositionFromCartesian2(position) : null;
      },
      getClientPosition: () =>
        isDestroyed() ? null : getCesiumScenePointerClientPosition(scene),
      subscribeClientPosition: (listener) =>
        isDestroyed()
          ? () => undefined
          : subscribeCesiumScenePointerClientPosition(scene, listener),
      clear: () => {
        if (!isDestroyed()) clearCesiumScenePointerTracker(scene);
      },
    },
    createLineCollection: (options) =>
      createCesiumLineCollection(scene, options),
    createRing: (options) => createCesiumRing(scene, options),
    createDisc: (options) => createCesiumDisc(scene, options),
    createPolygonFills: (options) => createCesiumPolygonFills(scene, options),
    hooks: {
      usePointQuery: (options) =>
        useCesiumPointQuery(
          isDestroyed() ? null : scene,
          cesiumPointQueryOptions(options)
        ),
      usePointMoveGizmo: (options) =>
        useCesiumPointMoveGizmo(
          isDestroyed() ? null : scene,
          cesiumGizmoOptions(options, gizmoInputCache)
        ),
    },
    dispose: () => {
      disposed = true;
    },
  };
};

/** One engine per scene instance, disposed when the scene changes or unmounts. */
export const useCesiumAnnotationEngine = (
  scene: Scene | null
): AnnotationEngine | null => {
  const engine = useMemo(
    () =>
      scene && !scene.isDestroyed()
        ? createCesiumAnnotationEngine(scene)
        : null,
    [scene]
  );
  useEffect(() => () => engine?.dispose(), [engine]);
  return engine;
};
