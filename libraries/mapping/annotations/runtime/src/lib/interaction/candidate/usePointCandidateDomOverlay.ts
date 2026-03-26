import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";
import { formatNumber } from "@carma-mapping/annotations/core";
import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  createPlacement,
  getPerspectiveStemAngleMagnitude,
  type PointLabelData,
  resolvePointLabelLayoutConfig,
  type PointLabelLayoutConfigOverrides,
  useLineVisualizers,
  usePointLabels,
} from "@carma-providers/label-overlay";
import { useCesiumOverlayView } from "@carma-mapping/engines/cesium/react/interactions";
import { useCesiumSceneVisibilityIndex } from "@carma-mapping/engines/cesium/react/visibility";
import type { CssPixelPosition } from "@carma/units/types";

const CANDIDATE_HEIGHT_LABEL_ID = "measurement-candidate-height";
const CANDIDATE_POINT_VISIBILITY_ID = "measurement-candidate-point";
const CANDIDATE_VERTICAL_OFFSET_STEM_ID =
  "measurement-candidate-vertical-offset-stem";

const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";

const CANDIDATE_HEIGHT_LABEL_ANCHOR_DISTANCE_PX = 24;
const CANDIDATE_HEIGHT_LABEL_STEM_START_DISTANCE_PX = 8;
const CANDIDATE_HEIGHT_LABEL_STEM_DISTANCE_PX = Math.max(
  0,
  CANDIDATE_HEIGHT_LABEL_ANCHOR_DISTANCE_PX -
    CANDIDATE_HEIGHT_LABEL_STEM_START_DISTANCE_PX
);
const CANDIDATE_PILL_STEM_EXTRA_DISTANCE_PX = 4;

const formatMeters = (value: number): string => `${formatNumber(value)}m`;

const formatCandidateElevationText = (
  pointHeightMeters: number,
  referenceElevation: number,
  hasReferenceElevation: boolean
): string => {
  if (!hasReferenceElevation) {
    return formatMeters(pointHeightMeters);
  }

  const elevationDelta = pointHeightMeters - referenceElevation;
  const elevationText = formatMeters(elevationDelta);

  if (Math.abs(elevationDelta) < ELEVATION_NEUTRAL_THRESHOLD_METERS) {
    return elevationText;
  }

  return `${elevationText} ${
    elevationDelta > 0 ? ELEVATION_GLYPH_UP : ELEVATION_GLYPH_DOWN
  }`;
};

export type PointCandidateDomOverlayOptions = {
  labelLayoutConfig?: PointLabelLayoutConfigOverrides;
  renderDomVisuals?: boolean;
};

export type PointCandidateDomOverlayCandidate = {
  pointECEF?: Cartesian3 | null;
  verticalOffsetAnchorECEF?: Cartesian3 | null;
  previewDistanceMeters?: number;
  referenceElevation?: number;
  hasReferenceElevation?: boolean;
  suppressLabelOverlay?: boolean;
} | null;

export const usePointCandidateDomOverlay = (
  scene: Scene | null,
  candidate: PointCandidateDomOverlayCandidate = null,
  {
    labelLayoutConfig,
    renderDomVisuals = true,
  }: PointCandidateDomOverlayOptions = {}
) => {
  const candidatePointECEF = candidate?.pointECEF ?? null;
  const candidateVerticalOffsetAnchorECEF =
    candidate?.verticalOffsetAnchorECEF ?? null;
  const previewDistanceMeters = candidate?.previewDistanceMeters;
  const candidateReferenceElevation = candidate?.referenceElevation ?? 0;
  const candidateHasReferenceElevation =
    candidate?.hasReferenceElevation ?? false;
  const suppressCandidateLabelOverlay =
    candidate?.suppressLabelOverlay ?? false;
  const candidateElevatedPointRef = useRef<Cartesian3 | null>(null);
  const candidateAuxAnchorRef = useRef<Cartesian3 | null>(null);

  const hasCandidatePoint = Boolean(candidatePointECEF);
  const hasCandidateAuxAnchor = Boolean(candidateVerticalOffsetAnchorECEF);
  const overlayView = useCesiumOverlayView(scene);
  const cameraPitch = overlayView.derivedView?.pitch ?? 0;
  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: true,
      shouldTestOcclusion: true,
      realtimeOcclusionPointIds: hasCandidatePoint
        ? [CANDIDATE_POINT_VISIBILITY_ID]
        : [],
      viewportPaddingHorizontal: 12,
      viewportPaddingVertical: 8,
      occlusionToleranceMeters: 1.0,
    });

  candidateElevatedPointRef.current = candidatePointECEF;
  candidateAuxAnchorRef.current = candidateVerticalOffsetAnchorECEF;

  useEffect(() => {
    if (!candidatePointECEF) {
      unregisterPointIds([CANDIDATE_POINT_VISIBILITY_ID]);
      return;
    }

    registerPoints([
      {
        id: CANDIDATE_POINT_VISIBILITY_ID,
        positionECEF: candidatePointECEF,
      },
    ]);

    return () => {
      unregisterPointIds([CANDIDATE_POINT_VISIBILITY_ID]);
    };
  }, [candidatePointECEF, registerPoints, unregisterPointIds]);

  const candidateLabelLayoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(labelLayoutConfig),
    [labelLayoutConfig]
  );

  const candidateHeightLabelPlacement = useMemo(
    () =>
      createPlacement(
        "left",
        CANDIDATE_HEIGHT_LABEL_STEM_DISTANCE_PX,
        getPerspectiveStemAngleMagnitude(
          cameraPitch,
          candidateLabelLayoutConfig
        )
      ),
    [cameraPitch, candidateLabelLayoutConfig]
  );

  const candidateHeightLabelData = useMemo<PointLabelData[]>(() => {
    if (
      !renderDomVisuals ||
      suppressCandidateLabelOverlay ||
      !scene ||
      scene.isDestroyed() ||
      !candidatePointECEF
    ) {
      return [];
    }

    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(candidatePointECEF);
    if (!cartographic) {
      return [];
    }

    const pointHeightMeters = cartographic.height ?? 0;
    const showsDistancePreview = previewDistanceMeters !== undefined;
    const text = showsDistancePreview
      ? formatMeters(previewDistanceMeters)
      : formatCandidateElevationText(
          pointHeightMeters,
          candidateReferenceElevation,
          candidateHasReferenceElevation
        );

    return [
      {
        id: CANDIDATE_HEIGHT_LABEL_ID,
        getCanvasPosition: () => {
          return (
            visibilityStateById[CANDIDATE_POINT_VISIBILITY_ID]
              ?.screenPosition ?? null
          );
        },
        content: text,
        collapse: true,
        fullBorder: showsDistancePreview,
        resizeMode: "fast-grow-slow-shrink",
        pitch: cameraPitch,
        labelAngleRad: candidateHeightLabelPlacement.angleRad,
        labelAttach: candidateHeightLabelPlacement.attach,
        hideMarker: true,
        isOccluded:
          visibilityStateById[CANDIDATE_POINT_VISIBILITY_ID]?.isOccluded ??
          false,
        isHidden:
          visibilityStateById[CANDIDATE_POINT_VISIBILITY_ID]?.isHidden ?? false,
        labelDistance:
          candidateHeightLabelPlacement.distance +
          CANDIDATE_PILL_STEM_EXTRA_DISTANCE_PX,
        stemStartDistance: CANDIDATE_HEIGHT_LABEL_STEM_START_DISTANCE_PX,
      },
    ];
  }, [
    cameraPitch,
    candidateHeightLabelPlacement,
    renderDomVisuals,
    suppressCandidateLabelOverlay,
    scene,
    candidatePointECEF,
    previewDistanceMeters,
    candidateHasReferenceElevation,
    candidateReferenceElevation,
    visibilityStateById,
  ]);

  const candidateVerticalOffsetStemLines = useMemo(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasCandidatePoint ||
      !hasCandidateAuxAnchor
    ) {
      return [];
    }

    return [
      ...createSvgLineVisualizers({
        id: CANDIDATE_VERTICAL_OFFSET_STEM_ID,
        stroke: "rgba(255, 255, 255, 1)",
        strokeWidth: 2,
        dashed: true,
        dashLengthRatio: 0.25,
        opacity: 0.9,
        visible: true,
        getSvgLine: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = candidateElevatedPointRef.current;
          const auxAnchorPoint = candidateAuxAnchorRef.current;
          if (!elevatedPoint || !auxAnchorPoint) {
            return null;
          }
          const start = SceneTransforms.worldToWindowCoordinates(
            scene,
            elevatedPoint
          );
          const end = SceneTransforms.worldToWindowCoordinates(
            scene,
            auxAnchorPoint
          );
          if (!defined(start) || !defined(end)) {
            return null;
          }
          return {
            start: { x: start.x, y: start.y } as CssPixelPosition,
            end: { x: end.x, y: end.y } as CssPixelPosition,
          };
        },
      }),
    ];
  }, [renderDomVisuals, scene, hasCandidatePoint, hasCandidateAuxAnchor]);

  useLineVisualizers(
    candidateVerticalOffsetStemLines,
    renderDomVisuals && candidateVerticalOffsetStemLines.length > 0
  );

  usePointLabels(
    candidateHeightLabelData,
    renderDomVisuals && hasCandidatePoint && !suppressCandidateLabelOverlay,
    undefined,
    undefined,
    {
      transitionDurationMs: 0,
    }
  );
};
