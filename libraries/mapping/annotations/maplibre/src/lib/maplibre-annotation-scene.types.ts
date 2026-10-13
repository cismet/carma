import type { Map as MaplibreMap } from "maplibre-gl";
import type { Group, Vector3 } from "three";
import type { CssPixels, Degrees } from "@carma-units";
import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";
import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";

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
  /** Changes whenever the ECEF placement of content changes under a static camera. */
  getPlacementRevision: () => number;
  /**
   * Identifies what `worldToScreen` projects with right now: the matrices of
   * the last rendered frame, its viewport and the placement. The map's live
   * camera runs ahead of these between a camera change and the next frame,
   * so a projection cached under the live camera would keep the old frame.
   */
  getProjectionKey: () => string;
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
  getCssViewport: () => { width: CssPixels; height: CssPixels };
  /** Physical framebuffer pixels per CSS pixel of the map canvas. */
  getPixelRatio: () => number;
  getCameraScenePosition: (out?: Vector3) => Vector3 | null;
  /**
   * The camera as the last frame drew it, in scene coordinates: the eye,
   * and the view direction and screen-up taken from MapLibre's own
   * scene-to-clip matrix, so a roll is in it as drawn.
   */
  getCameraSceneView: () => MapLibreAnnotationSceneView | null;
  /** Geographic position and MapLibre altitude (meters) of a scene position. */
  lngLatAltitudeFromScene: (
    scenePosition: Vector3
  ) => { lngLat: [number, number]; altitude: number } | null;
  /** Scene position of a geographic position at a MapLibre altitude. */
  sceneFromLngLatAltitude: (
    lngLat: [number, number],
    altitude: number,
    out?: Vector3
  ) => Vector3 | null;
  getPixelsPerMeterAtScene: (scenePosition: Vector3) => number;
  requestRender: () => void;
  isDisposed: () => boolean;
  dispose: () => void;
};

export type MapLibreAnnotationSceneView = {
  position: Vector3;
  /** unit view direction */
  direction: Vector3;
  /** unit screen-up, orthogonal to the direction */
  up: Vector3;
  verticalFovDeg: Degrees;
};
