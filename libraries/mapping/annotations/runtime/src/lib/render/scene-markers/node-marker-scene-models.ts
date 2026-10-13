import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type { Vector3 } from "three";

import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../annotation-render-models";
import { resolvePointLabelOcclusionLook } from "../point-label-overlay-state";
import type { SceneMarkerModel } from "./scene-marker-models";
import {
  resolveLabelMarkerSceneStyle,
  resolvePointMarkerSceneStyles,
} from "./scene-marker-styles";

/** The node's live drag anchor, else its stored position. */
const resolveNodePosition = (
  liveAnchors: LiveAnnotationAnchors,
  nodeId: string | undefined,
  storedECEF: Vector3
) => (nodeId ? liveAnchors.get(nodeId) : undefined) ?? storedECEF;

/**
 * Scene markers of the standalone node markers, each in the look of its
 * node's occlusion verdict (`readOccluded`, the DOM marker's verdict); the
 * overlay keeps their hit areas.
 */
export const buildPointMarkerSceneModels = (
  points: readonly RuntimePointMarkerRenderModel[],
  liveAnchors: LiveAnnotationAnchors,
  hoveredPointIds: ReadonlySet<string>,
  readOccluded: (pointId: string) => boolean
): SceneMarkerModel[] =>
  points.map((point) => {
    const storedECEF = ecefFromGeographicCoordinate(point.coordinate);
    return {
      id: point.id,
      ...resolvePointMarkerSceneStyles(point),
      place: () => ({
        positionECEF: resolveNodePosition(
          liveAnchors,
          point.nodeId,
          storedECEF
        ),
        hovered: hoveredPointIds.has(point.id),
        occluded: readOccluded(point.id),
      }),
    };
  });

/** What a label's marker needs from the label's state of the last frame. */
export type LabelMarkerAnchor = {
  /** The label is laid out and on screen. */
  visible: boolean;
  /** The coordinate the label resolved to (candidates, live anchors). */
  anchorECEF?: Vector3;
  /** The label's anchor occlusion verdict, which its stem and pill follow too. */
  isOccluded: boolean;
};

/**
 * Labels that draw their node marker themselves (the point tool's), as scene
 * markers in the label's occlusion look: dotted and at the label's opacity
 * while the anchor is hidden.
 */
export const buildLabelMarkerSceneModels = (
  labels: readonly (RuntimePointLabelRenderModel & {
    markerSize: number;
    markerStrokeWidth: number;
  })[],
  liveAnchors: LiveAnnotationAnchors,
  readAnchor: (labelId: string) => LabelMarkerAnchor | null
): SceneMarkerModel[] =>
  labels.map((label) => {
    const storedECEF = ecefFromGeographicCoordinate(label.coordinate);
    return {
      id: `${label.id}-marker`,
      style: resolveLabelMarkerSceneStyle(label),
      place: () => {
        const anchor = readAnchor(label.id);
        if (!anchor?.visible) return null;
        const look = resolvePointLabelOcclusionLook(label, anchor.isOccluded);
        return {
          positionECEF:
            anchor.anchorECEF ??
            resolveNodePosition(liveAnchors, label.nodeId, storedECEF),
          occluded: look.isOccluded,
          opacity: look.opacity,
        };
      },
    };
  });
