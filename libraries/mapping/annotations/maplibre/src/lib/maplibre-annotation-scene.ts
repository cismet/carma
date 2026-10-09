import type { Map as MaplibreMap } from "maplibre-gl";
import { getSharedThreeSceneRuntimes } from "@carma-mapping/engines/maplibre";
import { Group, Matrix4, type Object3D, Vector3, Vector4 } from "three";
import {
  acquireSharedThreeScene,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-mapping/annotations/core";
import type { AnnotationScreenPosition } from "@carma-mapping/annotations/runtime";
import { MAPLIBRE_EVENT } from "./maplibre-events";
import { degToRadNumeric } from "@carma-units";

/**
 * The annotation runtime's foothold in the shared Three.js scene of a
 * MapLibre map: one `SharedThreeSceneRuntime` whose root holds every
 * annotation primitive, plus the per-frame camera the adapter projects with.
 * Positions are ECEF metres on the runtime side and shared-scene units on the
 * Three side; both conversions go through the shared layer's own lng/lat
 * projection, so a local-frame refit or an origin change never leaves a
 * primitive behind. Follows the oblique viewer's query cursor
 * (`query-cursor-three.ts`), the first Three.js port of a Cesium annotation
 * primitive.
 */

export type MapLibreAnnotationSceneRay = {
  origin: Vector3;
  direction: Vector3;
  length: number;
};

export type MapLibreAnnotationScene = {
  readonly map: MaplibreMap;
  readonly root: Group;
  getFrame: () => SharedThreeSceneFrame | null;
  getFrameKey: () => number;
  /** Runs inside the shared scene update, before this frame's draw. */
  subscribeFrameUpdate: (
    listener: (frame: SharedThreeSceneFrame) => void
  ) => () => void;
  subscribePreRender: (listener: () => void) => () => void;
  subscribePostRender: (listener: () => void) => () => void;
  sceneFromEcef: (positionECEF: Vector3, out?: Vector3) => Vector3 | null;
  ecefFromScene: (scenePosition: Vector3, out?: Vector3) => Vector3 | null;
  worldToScreen: (
    positionECEF: Vector3,
    out?: { x: number; y: number }
  ) => AnnotationScreenPosition | null;
  sceneToScreen: (
    scenePosition: Vector3,
    out?: { x: number; y: number }
  ) => AnnotationScreenPosition | null;
  getPickRay: (
    screenPosition: AnnotationScreenPosition
  ) => MapLibreAnnotationSceneRay | null;
  getCssViewport: () => { width: number; height: number };
  /** Physical framebuffer pixels per CSS pixel of the map canvas. */
  getPixelRatio: () => number;
  getCameraScenePosition: (out?: Vector3) => Vector3 | null;
  getPixelsPerMeterAtScene: (scenePosition: Vector3) => number;
  requestRender: () => void;
  isDisposed: () => boolean;
  dispose: () => void;
};

let nextAnnotationSceneId = 0;

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
      width: Math.max(1, latestFrame?.cssViewport?.x ?? canvas.clientWidth),
      height: Math.max(1, latestFrame?.cssViewport?.y ?? canvas.clientHeight),
    };
  };

  const project = (lngLat: [number, number], altitude: number, out?: Vector3) =>
    lease.layer.projectLngLatToScene(lngLat, altitude, out);

  // Where a mesh or tileset is drawn, positions follow its own ECEF frame:
  // the tiles runtime shifts its content to a sampled ground reference and
  // mounts it on the layer's local-frame fit, and only that matrix puts a
  // measured point back onto the surface it was measured on, after a reload
  // or a refit as well. Without such a runtime the Mercator projection of
  // the layer places content (terrain-only maps).
  const ecefToScene = new Matrix4();
  const sceneToEcef = new Matrix4();
  let ecefFrameKey = -1;
  let ecefFrame: Object3D | null = null;
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
    ecefFrame = frame;
    if (frame) {
      frame.updateWorldMatrix(true, false);
      ecefToScene.copy(frame.matrixWorld);
      sceneToEcef.copy(ecefToScene).invert();
    }
    return frame;
  };

  /** A primitive parked at the ECEF origin or anywhere off the ellipsoid has no place in the scene. */
  const MIN_ECEF_RADIUS_SQUARED = 1e6;
  const sceneFromEcef = (positionECEF: Vector3, out?: Vector3) => {
    if (
      !Number.isFinite(positionECEF.x) ||
      !Number.isFinite(positionECEF.y) ||
      !Number.isFinite(positionECEF.z) ||
      positionECEF.lengthSq() < MIN_ECEF_RADIUS_SQUARED
    ) {
      return null;
    }
    if (resolveEcefFrame()) {
      return (out ?? new Vector3()).copy(positionECEF).applyMatrix4(ecefToScene);
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
    if (
      !Number.isFinite(scenePosition.x) ||
      !Number.isFinite(scenePosition.y) ||
      !Number.isFinite(scenePosition.z)
    ) {
      return null;
    }
    if (resolveEcefFrame()) {
      return (out ?? new Vector3()).copy(scenePosition).applyMatrix4(sceneToEcef);
    }
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
    const altitude =
      (scenePosition.x - base.x) * up.x +
      (scenePosition.y - base.y) * up.y +
      (scenePosition.z - base.z) * up.z;
    return ecefFromGeographicCoordinate(
      {
        longitude: lngLat[0],
        latitude: lngLat[1],
        altitude: altitude / upLengthSq,
      },
      out
    );
  };

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
    getPixelsPerMeterAtScene,
    requestRender: () => {
      if (!disposed) map.triggerRepaint();
    },
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
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
