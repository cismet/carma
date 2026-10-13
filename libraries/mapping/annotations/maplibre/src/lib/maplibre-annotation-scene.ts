import { removeVector3ComponentAlongAxis } from "@carma-commons/math";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-geo/proj";
import { degToRadNumeric, type CssPixels, type Degrees } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Group, Matrix4, type Object3D, Vector3, Vector4 } from "three";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  MAPLIBRE_EVENT,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";

import type {
  MapLibreAnnotationScene,
  MapLibreAnnotationSceneRay,
  MapLibreAnnotationSceneView,
} from "./maplibre-annotation-scene.types";

let nextAnnotationSceneId = 0;

const hasFiniteComponents = (vector: Vector3) =>
  Number.isFinite(vector.x) &&
  Number.isFinite(vector.y) &&
  Number.isFinite(vector.z);

const axisScratch = new Vector3();
const anchorScratch = new Vector3();
const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();
const translationScratch = new Vector3();

/** Affine from ECEF to shared-scene units around `anchorECEF`, or null while unprojectable. */
export const resolveSceneFromEcefAffine = (
  scene: MapLibreAnnotationScene,
  anchorECEF: Vector3,
  out: Matrix4 = new Matrix4()
): Matrix4 | null => {
  const anchorScene = scene.sceneFromEcef(anchorECEF, anchorScratch);
  if (!anchorScene) return null;
  const anchorSceneCopy = anchorScene.clone();
  const axis = (x: number, y: number, z: number, target: Vector3) => {
    axisScratch.set(anchorECEF.x + x, anchorECEF.y + y, anchorECEF.z + z);
    const projected = scene.sceneFromEcef(axisScratch, target);
    return projected ? projected.sub(anchorSceneCopy) : null;
  };
  if (
    !axis(1, 0, 0, basisX) ||
    !axis(0, 1, 0, basisY) ||
    !axis(0, 0, 1, basisZ)
  ) {
    return null;
  }
  out.makeBasis(basisX, basisY, basisZ);
  // scene = J · (ecef - anchor) + anchorScene
  translationScratch.copy(anchorECEF).applyMatrix4(out);
  return out.setPosition(anchorSceneCopy.sub(translationScratch));
};

/**
 * The annotation runtime's foothold in the shared Three.js scene of a
 * MapLibre map: one `SharedThreeSceneRuntime` whose root holds every
 * annotation primitive, plus the per-frame camera the adapter projects with.
 * Positions are ECEF metres on the runtime side and shared-scene units on the
 * Three side; both conversions go through the shared layer's own lng/lat
 * projection, so a local-frame refit or an origin change never leaves a
 * primitive behind.
 */
export const createMapLibreAnnotationScene = (
  map: MaplibreMap
): MapLibreAnnotationScene => {
  const lease = acquireSharedThreeScene(map);
  const root = new Group();
  root.name = "annotations";
  // The shared layer places runtime roots by their origin; an identity root
  // keeps everything in shared-scene coordinates straight from the projection.
  root.matrixAutoUpdate = false;
  const frameUpdateListeners = new Set<
    (frame: SharedThreeSceneFrame) => void
  >();
  const preRenderListeners = new Set<() => void>();
  const postRenderListeners = new Set<() => void>();
  let latestFrame: SharedThreeSceneFrame | null = null;
  let frameKey = 0;
  let disposed = false;
  let presentationRevision = 0;
  let cancelMaterialPreparation: (() => void) | null = null;

  const prepareMaterials = () => {
    if (disposed || cancelMaterialPreparation || !latestFrame) return;
    const prepare = () => {
      cancelMaterialPreparation = null;
      const renderer = lease.layer.getRenderer();
      if (disposed || !renderer || !latestFrame) return;
      // compileAsync only starts GPU work synchronously; its later completion
      // polls program status without changing MapLibre bindings.
      let compilation: Promise<unknown> | undefined;
      try {
        lease.layer.runIdleRender?.(() => {
          compilation = renderer.compileAsync(
            root,
            latestFrame!.renderCamera,
            lease.layer.getScene()
          );
        });
      } catch (error) {
        compilation = Promise.reject(error);
      }
      void compilation?.catch((error: unknown) => {
        if (!disposed)
          console.warn("Annotation shader preparation failed", error);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prepare, { timeout: 3000 });
      cancelMaterialPreparation = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(prepare, 0);
      cancelMaterialPreparation = () => window.clearTimeout(id);
    }
  };

  const sceneToClip = new Matrix4();
  const clipToScene = new Matrix4();
  let clipMatricesFrameKey = -1;
  const syncClipMatrices = (frame: SharedThreeSceneFrame) => {
    if (clipMatricesFrameKey === frameKey) return;
    sceneToClip
      .copy(frame.renderCamera.projectionMatrix)
      .multiply(frame.renderCamera.matrixWorldInverse);
    clipToScene.copy(sceneToClip).invert();
    clipMatricesFrameKey = frameKey;
  };

  const getCssViewport = () => {
    const canvas = map.getCanvas();
    return {
      width: Math.max(
        1,
        latestFrame?.cssViewport?.x ?? canvas.clientWidth
      ) as CssPixels,
      height: Math.max(
        1,
        latestFrame?.cssViewport?.y ?? canvas.clientHeight
      ) as CssPixels,
    };
  };

  const project = (lngLat: [number, number], altitude: number, out?: Vector3) =>
    lease.layer.projectLngLatToScene(lngLat, altitude, out);

  // Where a mesh or tileset is drawn, positions follow its own ECEF frame:
  // the tiles runtime shifts its content to a sampled ground reference, and
  // only its matrix puts a measured point back onto the surface it was
  // measured on, after a reload or a refit as well. Without such a runtime
  // the Mercator projection of the layer places content (terrain-only maps).
  const ecefToScene = new Matrix4();
  const sceneToEcef = new Matrix4();
  let ecefFrameKey = -1;
  let ecefFrame: Object3D | null = null;
  // Counts every change of the placement: the frame appearing or going, and
  // its matrix moving (the ground reference settling, a local-frame refit).
  // Overlays that cache their projections per camera view include it in the
  // view key, or they would keep positions from before the mesh mounted.
  let placementRevision = 0;
  const resolveEcefFrame = (): Object3D | null => {
    if (ecefFrameKey === frameKey) return ecefFrame;
    ecefFrameKey = frameKey;
    const frame =
      getSharedThreeSceneRuntimes(map)
        .map((runtime) =>
          runtime.root.visible && runtime.getEcefFrame
            ? runtime.getEcefFrame()
            : null
        )
        .find((candidate) => candidate !== null && candidate.parent !== null) ??
      null;
    const previousFrame = ecefFrame;
    ecefFrame = frame;
    if (frame) {
      frame.updateWorldMatrix(true, false);
      const moved =
        frame !== previousFrame ||
        frame.matrixWorld.elements.some(
          (value, index) => value !== ecefToScene.elements[index]
        );
      if (moved) {
        ecefToScene.copy(frame.matrixWorld);
        sceneToEcef.copy(ecefToScene).invert();
        placementRevision += 1;
      }
    } else if (previousFrame) {
      placementRevision += 1;
    }
    return frame;
  };
  const getPlacementRevision = () => {
    resolveEcefFrame();
    return placementRevision;
  };

  let projectionKeyFrameKey = -1;
  let projectionKey = "none";
  const getProjectionKey = () => {
    if (latestFrame && projectionKeyFrameKey !== frameKey) {
      syncClipMatrices(latestFrame);
      const { width, height } = getCssViewport();
      projectionKey = `${sceneToClip.elements
        .map((value) => value.toPrecision(10))
        .join(",")}|${width}x${height}`;
      projectionKeyFrameKey = frameKey;
    }
    return `${projectionKey}|${getPlacementRevision()}`;
  };

  /** A primitive parked at the ECEF origin or anywhere off the ellipsoid has no place in the scene. */
  const MIN_ECEF_RADIUS_SQUARED = 1e6;
  const sceneFromEcef = (positionECEF: Vector3, out?: Vector3) => {
    if (
      !hasFiniteComponents(positionECEF) ||
      positionECEF.lengthSq() < MIN_ECEF_RADIUS_SQUARED
    ) {
      return null;
    }
    if (resolveEcefFrame()) {
      return (out ?? new Vector3())
        .copy(positionECEF)
        .applyMatrix4(ecefToScene);
    }
    const geographic = geographicCoordinateFromEcef(positionECEF);
    if (
      !Number.isFinite(geographic.longitude) ||
      !Number.isFinite(geographic.latitude) ||
      !Number.isFinite(geographic.altitude)
    ) {
      return null;
    }
    return project(
      [geographic.longitude, geographic.latitude],
      geographic.altitude,
      out
    );
  };

  const altitudeScratchBase = new Vector3();
  const altitudeScratchUp = new Vector3();
  const ecefFromScene = (scenePosition: Vector3, out?: Vector3) => {
    if (!hasFiniteComponents(scenePosition)) return null;
    if (resolveEcefFrame()) {
      return (out ?? new Vector3())
        .copy(scenePosition)
        .applyMatrix4(sceneToEcef);
    }
    const located = lngLatAltitudeFromScene(scenePosition);
    if (!located) return null;
    return ecefFromGeographicCoordinate(
      {
        longitude: located.lngLat[0],
        latitude: located.lngLat[1],
        altitude: located.altitude,
      },
      out
    );
  };

  function lngLatAltitudeFromScene(scenePosition: Vector3) {
    if (!hasFiniteComponents(scenePosition)) return null;
    const lngLat = lease.layer.projectSceneToLngLat(scenePosition);
    if (!lngLat || !Number.isFinite(lngLat[0]) || !Number.isFinite(lngLat[1])) {
      return null;
    }
    const base = project(lngLat, 0, altitudeScratchBase);
    const raised = project(lngLat, 1, altitudeScratchUp);
    if (!base || !raised) return null;
    const up = raised.sub(base);
    const upLengthSq = up.lengthSq();
    if (!(upLengthSq > 0)) return null;
    return {
      lngLat: [lngLat[0], lngLat[1]] as [number, number],
      altitude: scenePosition.clone().sub(base).dot(up) / upLengthSq,
    };
  }

  const clipScratch = new Vector4();
  const sceneToScreen = (
    scenePosition: Vector3,
    out?: { x: number; y: number }
  ): AnnotationScreenPosition | null => {
    if (!latestFrame) return null;
    syncClipMatrices(latestFrame);
    clipScratch
      .set(scenePosition.x, scenePosition.y, scenePosition.z, 1)
      .applyMatrix4(sceneToClip);
    if (!(clipScratch.w > 0)) return null;
    const { width, height } = getCssViewport();
    const x = ((clipScratch.x / clipScratch.w + 1) / 2) * width;
    const y = ((1 - clipScratch.y / clipScratch.w) / 2) * height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (out) {
      out.x = x;
      out.y = y;
      return out;
    }
    return { x, y };
  };

  const worldScratch = new Vector3();
  const worldToScreen = (
    positionECEF: Vector3,
    out?: { x: number; y: number }
  ) => {
    const scenePosition = sceneFromEcef(positionECEF, worldScratch);
    return scenePosition ? sceneToScreen(scenePosition, out) : null;
  };

  const unprojectClip = (ndcX: number, ndcY: number, ndcZ: number) => {
    const clip = new Vector4(ndcX, ndcY, ndcZ, 1).applyMatrix4(clipToScene);
    if (!(Math.abs(clip.w) > 0)) return null;
    return new Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
  };

  const getCameraSceneView = (): MapLibreAnnotationSceneView | null => {
    if (!latestFrame) return null;
    syncClipMatrices(latestFrame);
    // the centre ray and the top edge of the near plane, as drawn
    const near = unprojectClip(0, 0, -1);
    const mid = unprojectClip(0, 0, 0);
    const nearTop = unprojectClip(0, 1, -1);
    if (!near || !mid || !nearTop) return null;
    const direction = mid.sub(near);
    if (!(direction.lengthSq() > 0)) return null;
    direction.normalize();
    const up = removeVector3ComponentAlongAxis(nearTop.sub(near), direction);
    if (!(up.lengthSq() > 0)) return null;
    return {
      position: latestFrame.lodCamera.position.clone(),
      direction,
      up: up.normalize(),
      verticalFovDeg: latestFrame.lodCamera.fov as Degrees,
    };
  };

  const getPickRay = (
    screenPosition: AnnotationScreenPosition
  ): MapLibreAnnotationSceneRay | null => {
    if (!latestFrame) return null;
    syncClipMatrices(latestFrame);
    const { width, height } = getCssViewport();
    const ndcX = (2 * screenPosition.x) / width - 1;
    const ndcY = 1 - (2 * screenPosition.y) / height;
    const near = unprojectClip(ndcX, ndcY, -1);
    const far = unprojectClip(ndcX, ndcY, 1);
    if (!near || !far) return null;
    const direction = far.clone().sub(near);
    const length = direction.length();
    if (!(length > 0)) return null;
    return { origin: near, direction: direction.divideScalar(length), length };
  };

  const getPixelRatio = () => {
    const cssWidth = latestFrame?.cssViewport?.x;
    const ratio =
      latestFrame && cssWidth && cssWidth > 0
        ? latestFrame.viewport.x / cssWidth
        : window.devicePixelRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  };

  const getCameraScenePosition = (out?: Vector3) =>
    latestFrame
      ? (out ?? new Vector3()).copy(latestFrame.lodCamera.position)
      : null;

  const getPixelsPerMeterAtScene = (scenePosition: Vector3) => {
    if (!latestFrame) return 0;
    const range = latestFrame.lodCamera.position.distanceTo(scenePosition);
    if (!Number.isFinite(range) || range <= 0) return 0;
    const { height } = getCssViewport();
    const halfFovTan = Math.tan(degToRadNumeric(latestFrame.lodCamera.fov) / 2);
    return height / (2 * range * halfFovTan);
  };

  const runtime: SharedThreeSceneRuntime = {
    getPresentationRevision: () => presentationRevision,
    id: "annotations-" + ++nextAnnotationSceneId,
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root,
    providesTerrain: false,
    receivesMapStyleTexture: false,
    // Annotations draw after every surface so their depth tests see the mesh.
    updatePriority: 1000,
    update: (frame) => {
      latestFrame = frame;
      frameKey += 1;
      for (const listener of frameUpdateListeners) listener(frame);
      for (const listener of preRenderListeners) listener();
    },
    dispose: () => undefined,
  };
  lease.layer.addRuntime(runtime);

  const handleMapRender = () => {
    for (const listener of postRenderListeners) listener();
  };
  map.on(MAPLIBRE_EVENT.RENDER, handleMapRender);

  return {
    map,
    root,
    getFrame: () => latestFrame,
    getFrameKey: () => frameKey,
    getPlacementRevision,
    getProjectionKey,
    subscribeFrameUpdate: (listener) => {
      frameUpdateListeners.add(listener);
      return () => {
        frameUpdateListeners.delete(listener);
      };
    },
    subscribePreRender: (listener) => {
      preRenderListeners.add(listener);
      return () => {
        preRenderListeners.delete(listener);
      };
    },
    subscribePostRender: (listener) => {
      postRenderListeners.add(listener);
      return () => {
        postRenderListeners.delete(listener);
      };
    },
    sceneFromEcef,
    ecefFromScene,
    worldToScreen,
    sceneToScreen,
    getPickRay,
    getCssViewport,
    getPixelRatio,
    getCameraScenePosition,
    getCameraSceneView,
    lngLatAltitudeFromScene,
    sceneFromLngLatAltitude: (lngLat, altitude, out) =>
      project(lngLat, altitude, out),
    getPixelsPerMeterAtScene,
    requestRender: (contentChanged = true) => {
      if (disposed) return;
      if (contentChanged) presentationRevision += 1;
      map.triggerRepaint();
    },
    prepareMaterials,
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelMaterialPreparation?.();
      cancelMaterialPreparation = null;
      map.off(MAPLIBRE_EVENT.RENDER, handleMapRender);
      frameUpdateListeners.clear();
      preRenderListeners.clear();
      postRenderListeners.clear();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
      map.triggerRepaint();
    },
  };
};
