import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  type AnnotationGeographicCoordinate,
  type AnnotationToolId,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
} from "@carma-mapping/annotations/core";
import {
  RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS,
  type AnnotationToolPlugin,
  type AreaOcclusionStyleOptions,
} from "@carma-mapping/annotations/runtime";
import { undoAreaPreviewPoint } from "../area-shared/node-chain-area-tool-actions";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "../area-shared/node-chain-area-tool-render-models";
import { toolType } from "./area-planar-tool-config";
import {
  AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK,
  AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK,
} from "./area-planar-tool-help";
import {
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  doesAreaPlanarTrapezoidSampleRequireLimiterOverride,
  resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters,
  resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters,
  resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg,
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter,
} from "./area-planar-trapezoid";

export const createAreaPlanarToolKeyboard = ({
  toolId,
}: {
  toolId: AnnotationToolId;
}): NonNullable<AnnotationToolPlugin["keyboard"]> => ({
  onKeyDown: ({ event, activeToolSession, sessionContext }) => {
    const shortcutAction = resolveAnnotationCommonShortcutAction(event);
    if (
      shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
    ) {
      activeToolSession?.discardDraft();
      event.preventDefault();
      return true;
    }

    if (shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT) {
      const currentDraft = sessionContext.drafts.get(toolId);
      if (currentDraft.coordinates.length === 0) {
        return false;
      }

      sessionContext.drafts.set(toolId, {
        coordinates: undoAreaPreviewPoint(currentDraft.coordinates),
        linkedNodeGroupIds: undoAreaPreviewPoint(
          currentDraft.linkedNodeGroupIds
        ),
        feedback: null,
      });
      event.preventDefault();
      return true;
    }

    return false;
  },
});

export const createAreaPlanarToolVisualModels = ({
  renderStoredPlanarAnnotations,
  areaPlanarToolVisuals,
  resolvedOcclusionStyleOptions,
}: {
  renderStoredPlanarAnnotations: boolean;
  areaPlanarToolVisuals: ReturnType<typeof createNodeChainAreaToolVisuals>;
  resolvedOcclusionStyleOptions: AreaOcclusionStyleOptions;
}): NonNullable<AnnotationToolPlugin["visualModels"]> => ({
  build: ({
    nodes,
    annotationEntries,
    selectedAnnotationIds,
    setSelectedAnnotationId,
    formatOptions,
    onNodeLongPress,
  }) => {
    if (!renderStoredPlanarAnnotations) {
      return null;
    }

    return buildNodeChainAreaToolRenderModels({
      toolType,
      visuals: areaPlanarToolVisuals,
      nodes,
      annotations: annotationEntries,
      selectedAnnotationIds: selectedAnnotationIds,
      fillPlacement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
      formatOptions,
      onSelect: setSelectedAnnotationId,
      onNodeLongPress,
      occlusionStyleOptions: resolvedOcclusionStyleOptions,
    });
  },
});

/** The trapezoid input's limits, resolved once from the tool options. */
export type AreaPlanarTrapezoidLimits = {
  horizontalPlaneToleranceMeters: number;
  horizontalLineMaxLengthMeters: number;
  thirdPointRightAngleToleranceDeg: number;
};

export const resolveAreaPlanarTrapezoidLimits = (limits: {
  horizontalPlaneToleranceMeters?: number | null;
  horizontalLineMaxLengthMeters?: number | null;
  thirdPointRightAngleToleranceDeg?: number | null;
}): AreaPlanarTrapezoidLimits => ({
  horizontalPlaneToleranceMeters:
    resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters(
      limits.horizontalPlaneToleranceMeters
    ),
  horizontalLineMaxLengthMeters:
    resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters(
      limits.horizontalLineMaxLengthMeters
    ),
  thirdPointRightAngleToleranceDeg:
    resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg(
      limits.thirdPointRightAngleToleranceDeg
    ),
});

type TrapezoidPointInput = {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  limits: AreaPlanarTrapezoidLimits;
};

/**
 * Why a placed trapezoid point is refused (second point too far or off the
 * first point's horizontal plane), null when it is taken. Suspended
 * limiters take every point.
 */
export const resolveAreaPlanarTrapezoidPointRejection = ({
  coordinate,
  previousCoordinates,
  limits,
  limitersSuspended,
}: TrapezoidPointInput & { limitersSuspended: boolean }): string | null => {
  if (
    !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
      coordinate,
      previousCoordinates,
      maxLengthMeters: limitersSuspended
        ? Number.POSITIVE_INFINITY
        : limits.horizontalLineMaxLengthMeters,
    })
  ) {
    return AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK;
  }
  if (
    !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
      coordinate,
      previousCoordinates,
      toleranceMeters: limitersSuspended
        ? Number.POSITIVE_INFINITY
        : limits.horizontalPlaneToleranceMeters,
    })
  ) {
    return AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK;
  }
  return null;
};

/** Whether a previewed second point stays within the horizontal-line limits. */
export const isAreaPlanarTrapezoidSecondPointWithinLimits = ({
  coordinate,
  previousCoordinates,
  limits,
}: TrapezoidPointInput): boolean =>
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
    coordinate,
    previousCoordinates,
    maxLengthMeters: limits.horizontalLineMaxLengthMeters,
  }) &&
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
    coordinate,
    previousCoordinates,
    toleranceMeters: limits.horizontalPlaneToleranceMeters,
  });

/** The sample guide colour while the right-angle limiter holds the sample. */
export const resolveAreaPlanarTrapezoidSampleStyle = ({
  coordinate,
  previousCoordinates,
  limits,
}: TrapezoidPointInput) =>
  doesAreaPlanarTrapezoidSampleRequireLimiterOverride({
    coordinate,
    previousCoordinates,
    ...limits,
  }) &&
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter(previousCoordinates.length)
    ? { color: RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS }
    : undefined;
