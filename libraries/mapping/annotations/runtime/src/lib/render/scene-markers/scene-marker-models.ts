import type { Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationSceneMarkerCollection,
  AnnotationSceneMarkerStyle,
} from "@carma-mapping/annotations/core";

export type SceneMarkerPlacement = {
  positionECEF: Vector3;
  /** The direction a bar lies across on screen (its edge). */
  acrossECEF?: Vector3;
  /** The pointer is on the marker's hit area: draw `hoverStyle`. */
  hovered?: boolean;
  /**
   * The occlusion verdict of the marker's anchor, the one its DOM counterpart
   * read: the marker draws whole in the occluded look. Default false.
   */
  occluded?: boolean;
  /** Opacity of the whole marker (a label's marker shares the label's). Default 1. */
  opacity?: number;
};

/**
 * A screen-constant marker in the scene: the render model of a node marker,
 * an insert tick or a corner dot, the counterpart of `EdgeSceneLine`.
 */
export type SceneMarkerModel = {
  id: string;
  style: AnnotationSceneMarkerStyle;
  hoverStyle?: AnnotationSceneMarkerStyle;
  /** This frame's placement; null hides the marker. */
  place: () => SceneMarkerPlacement | null;
};

/**
 * The style a placement draws: the hover style while hovered, as a whole in
 * the look of the anchor's verdict, at the placement's opacity.
 */
export const resolvePlacedSceneMarkerStyle = (
  model: Pick<SceneMarkerModel, "style" | "hoverStyle">,
  placement: SceneMarkerPlacement | null
): AnnotationSceneMarkerStyle => ({
  ...(placement?.hovered && model.hoverStyle ? model.hoverStyle : model.style),
  occluded: placement?.occluded === true,
  opacity: placement?.opacity ?? 1,
});

export type SceneMarkerEngine = AnnotationEngine & {
  createMarkerCollection: () => AnnotationSceneMarkerCollection;
};

/**
 * The engine draws markers and dashes the occluded part of scene lines: node
 * markers, insert ticks, the distance corner handle and the label stems then
 * draw in the scene and the overlay keeps only their hit areas. The whole set
 * switches together, so one view never mixes both looks. Markers draw over
 * the scene like the DOM did; node markers take their anchor's occlusion
 * verdict, ticks and the corner dot never had one.
 */
export const canDrawHandlesInScene = (
  engine: AnnotationEngine | null
): engine is SceneMarkerEngine =>
  engine?.capabilities.occludedLinesInScene === true &&
  typeof engine.createMarkerCollection === "function";
