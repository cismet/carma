import { useEffect, useMemo, useRef, useState } from "react";

import {
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";
import { formatNumber } from "@carma-mapping/annotations/core";
import {
  createPlacement,
  getPerspectiveStemAngleMagnitude,
  type PointLabelData,
  resolvePointLabelLayoutConfig,
  type LineVisualizerData,
  type PointLabelLayoutConfigOverrides,
  useLineVisualizers,
  usePointLabels,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";
import type { EdgeCandidateLine } from "../annotationVisualization.types";

const CANDIDATE_HEIGHT_LABEL_ID = "measurement-candidate-height";
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
  candidate?: {
    pointECEF?: Cartesian3 | null;
    verticalOffsetAnchorECEF?: Cartesian3 | null;
    distanceLine?: EdgeCandidateLine;
    referenceElevation?: number;
    hasReferenceElevation?: boolean;
    suppressLabelOverlay?: boolean;
  } | null;
  renderDomVisuals?: boolean;
};

export const usePointCandidateDomOverlay = ({
  scene,
  labelLayoutConfig,
  candidate = null,
  renderDomVisuals = true,
}: PointCandidateDomOverlayOptions & {
  scene: Scene | null;
}) => {
  const candidatePointECEF = candidate?.pointECEF ?? null;
  const candidateVerticalOffsetAnchorECEF =
    candidate?.verticalOffsetAnchorECEF ?? null;
  const candidateEdgeLine = candidate?.distanceLine ?? null;
  const candidateReferenceElevation = candidate?.referenceElevation ?? 0;
  const candidateHasReferenceElevation =
    candidate?.hasReferenceElevation ?? false;
  const suppressCandidateLabelOverlay =
    candidate?.suppressLabelOverlay ?? false;
  const candidateElevatedPointRef = useRef<Cartesian3 | null>(null);
  const candidateAuxAnchorRef = useRef<Cartesian3 | null>(null);

  const hasCandidatePoint = Boolean(candidatePointECEF);
  const hasCandidateAuxAnchor = Boolean(candidateVerticalOffsetAnchorECEF);
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);

  candidateElevatedPointRef.current = candidatePointECEF;
  candidateAuxAnchorRef.current = candidateVerticalOffsetAnchorECEF;

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

  useEffect(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasCandidatePoint
    ) {
      return;
    }

    const camera = scene.camera;
    const updatePitch = () => {
      const currentPitch = camera.pitch;
      setCameraPitch((previousPitch) =>
        Math.abs(currentPitch - previousPitch) > 0.001
          ? currentPitch
          : previousPitch
      );
    };

    updatePitch();
    const removeChangedListener = camera.changed.addEventListener(updatePitch);
    const removeMoveEndListener = camera.moveEnd.addEventListener(updatePitch);

    return () => {
      removeChangedListener?.();
      removeMoveEndListener?.();
    };
  }, [scene, hasCandidatePoint, renderDomVisuals]);

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
    const showsDistancePreview =
      candidateEdgeLine?.previewTotalDistanceMeters !== undefined;
    const text = showsDistancePreview
      ? formatMeters(candidateEdgeLine.previewTotalDistanceMeters)
      : formatCandidateElevationText(
          pointHeightMeters,
          candidateReferenceElevation,
          candidateHasReferenceElevation
        );

    return [
      {
        id: CANDIDATE_HEIGHT_LABEL_ID,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = candidateElevatedPointRef.current;
          if (!elevatedPoint) {
            return null;
          }
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            elevatedPoint
          );
          if (!defined(canvasPosition)) {
            return null;
          }
          return {
            x: canvasPosition.x,
            y: canvasPosition.y,
          } as CssPixelPosition;
        },
        content: text,
        collapse: true,
        fullBorder: showsDistancePreview,
        resizeMode: "fast-grow-slow-shrink",
        pitch: cameraPitch,
        labelAngleRad: candidateHeightLabelPlacement.angleRad,
        labelAttach: candidateHeightLabelPlacement.attach,
        hideMarker: true,
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
    candidateEdgeLine,
    candidateHasReferenceElevation,
    candidateReferenceElevation,
  ]);

  const candidateVerticalOffsetStemLines = useMemo<LineVisualizerData[]>(() => {
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
      {
        id: CANDIDATE_VERTICAL_OFFSET_STEM_ID,
        stroke: "rgba(255, 255, 255, 1)",
        strokeWidth: 2,
        strokeDasharray: "0 3",
        strokeDashoffset: 0,
        opacity: 0.9,
        visible: true,
        getCanvasLine: () => {
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
      } satisfies LineVisualizerData,
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
