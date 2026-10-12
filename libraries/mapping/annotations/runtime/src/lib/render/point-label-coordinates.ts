import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-geo/proj";

import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  type RuntimePointLabelCoordinateCandidate,
  type RuntimePointLabelRenderModel,
} from "./annotation-render-models";

const resolveCoordinateCandidates = (
  label: RuntimePointLabelRenderModel
): readonly RuntimePointLabelCoordinateCandidate[] =>
  label.coordinateCandidates && label.coordinateCandidates.length > 0
    ? label.coordinateCandidates
    : [{ coordinate: label.coordinate, nodeId: label.nodeId }];

const projectCandidate = (
  engine: AnnotationEngine,
  candidate: RuntimePointLabelCoordinateCandidate
) => {
  const canvasPosition = engine.worldToScreen(
    ecefFromGeographicCoordinate(candidate.coordinate)
  );
  return canvasPosition === null
    ? null
    : { candidate, x: canvasPosition.x, y: canvasPosition.y };
};

/** The label's anchor candidate that wins its screen-space selection rule. */
export const resolveEffectivePointLabelCoordinateCandidate = ({
  engine,
  label,
}: {
  engine: AnnotationEngine | null;
  label: RuntimePointLabelRenderModel;
}): RuntimePointLabelCoordinateCandidate => {
  const candidates = resolveCoordinateCandidates(label);
  const fallbackCandidate = candidates[0] ?? {
    coordinate: label.coordinate,
    nodeId: label.nodeId,
  };

  if (
    !isValidAnnotationEngine(engine) ||
    !label.coordinateSelection ||
    candidates.length <= 1
  ) {
    return fallbackCandidate;
  }

  const projectedCandidates = candidates.flatMap((candidate) => {
    const projected = projectCandidate(engine, candidate);
    return projected ? [projected] : [];
  });
  if (projectedCandidates.length === 0) {
    return fallbackCandidate;
  }

  const isLeftmost =
    label.coordinateSelection ===
    RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;
  const sortedCandidates = projectedCandidates.sort((left, right) =>
    isLeftmost ? left.x - right.x : right.x - left.x
  );

  return sortedCandidates[0]?.candidate ?? fallbackCandidate;
};

/** The live drag anchor wins over the React-fed coordinate so a dragged node's label tracks it every frame. */
export const resolveLiveLabelCoordinate = (
  candidate: RuntimePointLabelCoordinateCandidate,
  liveAnchors: LiveAnnotationAnchors
) => {
  const liveAnchor = candidate.nodeId
    ? liveAnchors.get(candidate.nodeId)
    : undefined;
  return liveAnchor
    ? geographicCoordinateFromEcef(liveAnchor)
    : candidate.coordinate;
};
