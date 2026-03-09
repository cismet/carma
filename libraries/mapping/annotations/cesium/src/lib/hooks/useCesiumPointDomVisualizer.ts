import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  useLabelOverlay,
  useLineVisualizers,
  usePointLabels,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "../types/AnnotationTypes";
import { useCesiumPointLabels } from "./useCesiumPointLabels";
import { type CesiumPointVisualizerOptions } from "./useCesiumPointVisualizer";

const LIVE_PREVIEW_HEIGHT_LABEL_ID = "measurement-live-preview-height";
const LIVE_PREVIEW_CROSSHAIR_ID = "measurement-live-preview-crosshair";
const LIVE_PREVIEW_VERTICAL_OFFSET_STEM_ID =
  "measurement-live-preview-vertical-offset-stem";

const CROSSHAIR_STROKE_COLOR = "rgba(255, 255, 255, 0.96)";
const CROSSHAIR_CONTRAST_FILTER =
  "drop-shadow(0 0 1px rgba(0, 0, 0, 1)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.95))";
const CROSSHAIR_THICKNESS_PX = 3;
const CROSSHAIR_CENTER_DOT_SIZE_PX = 1;
const CROSSHAIR_CENTER_GAP_PX = 5;
const CROSSHAIR_FAR_DASH_LENGTH_PX = 12;
const CROSSHAIR_INNER_TIP_PX = CROSSHAIR_THICKNESS_PX / 2;
const CROSSHAIR_HALF_EXTENT_PX =
  CROSSHAIR_CENTER_GAP_PX + CROSSHAIR_FAR_DASH_LENGTH_PX;
const CROSSHAIR_SIZE_PX =
  CROSSHAIR_HALF_EXTENT_PX * 2 + CROSSHAIR_CENTER_DOT_SIZE_PX;
const CROSSHAIR_CENTER_PX = CROSSHAIR_HALF_EXTENT_PX;
const CROSSHAIR_ANCHOR_OFFSET_Y_PX = 1;

const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";

const LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX = 24;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX = 8;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX = Math.max(
  0,
  LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX -
    LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX
);
const LIVE_PREVIEW_PILL_STEM_EXTRA_DISTANCE_PX = 4;

const formatMeters = (value: number): string => `${formatNumber(value)}m`;

const formatLivePreviewElevationText = (
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

export const useCesiumPointDomVisualizer = (
  scene: Scene | null,
  annotations: AnnotationCollection = [],
  {
    showLabels = false,
    referenceElevation = 0,
    selectedPointId = null,
    selectedPointIds = [],
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds,
    suppressCompactLabelPointIds,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    onPointVerticalOffsetStemLongPress,
    selectionModeEnabled = false,
    selectionRectangleModeEnabled = false,
    selectionAdditiveMode = false,
    onPointRectangleSelect,
    pointLongPressDurationMs = 300,
    occlusionChecksEnabled = true,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    referenceLabelPointId = null,
    polylinePointLabelTextByPointId,
    labelInputPromptPointId = null,
    markerOnlyOverlayNodeInteractions = false,
    livePreviewPointECEF = null,
    livePreviewVerticalOffsetAnchorECEF = null,
    livePreviewDistanceLine = null,
    livePreviewReferenceElevation = 0,
    livePreviewHasReferenceElevation = false,
    suppressLivePreviewLabelOverlay = false,
    moveGizmoPointId = null,
    moveGizmoMarkerSizeScale = 1,
    moveGizmoLabelDistanceScale = 1,
    moveGizmoIsDragging = false,
    renderDomVisuals = true,
  }: CesiumPointVisualizerOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const livePreviewPointRef = useRef<Cartesian3 | null>(null);
  const livePreviewElevatedPointRef = useRef<Cartesian3 | null>(null);
  const livePreviewAuxAnchorRef = useRef<Cartesian3 | null>(null);

  const hasLivePreviewPoint = Boolean(livePreviewPointECEF);
  const hasLivePreviewAuxAnchor = Boolean(livePreviewVerticalOffsetAnchorECEF);
  const showLivePreviewCrosshair =
    hasLivePreviewPoint && !hasLivePreviewAuxAnchor;
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);
  const pointLabelsEnabled = showLabels && renderDomVisuals;

  livePreviewPointRef.current =
    livePreviewVerticalOffsetAnchorECEF ?? livePreviewPointECEF;
  livePreviewElevatedPointRef.current = livePreviewPointECEF;
  livePreviewAuxAnchorRef.current = livePreviewVerticalOffsetAnchorECEF;

  const livePreviewLabelLayoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(labelLayoutConfig),
    [labelLayoutConfig]
  );

  const livePreviewHeightLabelPlacement = useMemo(() => {
    return createPlacement(
      "left",
      LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX,
      getPerspectiveStemAngleMagnitude(
        cameraPitch,
        livePreviewLabelLayoutConfig
      )
    );
  }, [cameraPitch, livePreviewLabelLayoutConfig]);

  useEffect(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasLivePreviewPoint
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
  }, [scene, hasLivePreviewPoint, renderDomVisuals]);

  const points = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );

  useCesiumPointLabels(
    scene,
    points,
    pointLabelsEnabled,
    referenceElevation,
    selectedPointId,
    selectedPointIds,
    moveGizmoPointId,
    moveGizmoIsDragging,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    onPointVerticalOffsetStemLongPress,
    selectionModeEnabled,
    selectionRectangleModeEnabled,
    selectionAdditiveMode,
    onPointRectangleSelect,
    pointLongPressDurationMs,
    occlusionChecksEnabled,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    referenceLabelPointId,
    polylinePointLabelTextByPointId,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    moveGizmoMarkerSizeScale,
    moveGizmoLabelDistanceScale,
    labelInputPromptPointId,
    pointMarkerBadgeByPointId,
    suppressCompactLabelPointIds,
    markerOnlyOverlayNodeInteractions
  );

  const livePreviewHeightLabelData = useMemo<PointLabelData[]>(() => {
    if (
      !renderDomVisuals ||
      suppressLivePreviewLabelOverlay ||
      !scene ||
      scene.isDestroyed() ||
      !livePreviewPointECEF
    ) {
      return [];
    }

    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(livePreviewPointECEF);
    if (!cartographic) {
      return [];
    }

    const pointHeightMeters = cartographic.height ?? 0;
    const showsDistancePreview =
      livePreviewDistanceLine?.previewTotalDistanceMeters !== undefined;
    const text = showsDistancePreview
      ? formatMeters(livePreviewDistanceLine.previewTotalDistanceMeters)
      : formatLivePreviewElevationText(
          pointHeightMeters,
          livePreviewReferenceElevation,
          livePreviewHasReferenceElevation
        );

    return [
      {
        id: LIVE_PREVIEW_HEIGHT_LABEL_ID,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = livePreviewElevatedPointRef.current;
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
        labelAngleRad: livePreviewHeightLabelPlacement.angleRad,
        labelAttach: livePreviewHeightLabelPlacement.attach,
        hideMarker: true,
        labelDistance:
          livePreviewHeightLabelPlacement.distance +
          LIVE_PREVIEW_PILL_STEM_EXTRA_DISTANCE_PX,
        stemStartDistance: LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX,
      },
    ];
  }, [
    cameraPitch,
    livePreviewHeightLabelPlacement,
    renderDomVisuals,
    suppressLivePreviewLabelOverlay,
    scene,
    livePreviewPointECEF,
    livePreviewDistanceLine,
    livePreviewHasReferenceElevation,
    livePreviewReferenceElevation,
  ]);

  const livePreviewVerticalOffsetStemLines = useMemo<
    LineVisualizerData[]
  >(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasLivePreviewPoint ||
      !hasLivePreviewAuxAnchor
    ) {
      return [];
    }

    return [
      {
        id: LIVE_PREVIEW_VERTICAL_OFFSET_STEM_ID,
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
          const elevatedPoint = livePreviewElevatedPointRef.current;
          const auxAnchorPoint = livePreviewAuxAnchorRef.current;
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
  }, [renderDomVisuals, scene, hasLivePreviewPoint, hasLivePreviewAuxAnchor]);

  useLineVisualizers(
    livePreviewVerticalOffsetStemLines,
    renderDomVisuals && livePreviewVerticalOffsetStemLines.length > 0
  );

  usePointLabels(
    livePreviewHeightLabelData,
    renderDomVisuals && hasLivePreviewPoint && !suppressLivePreviewLabelOverlay,
    undefined,
    undefined,
    {
      transitionDurationMs: 0,
    }
  );

  const livePreviewCrosshairContent = useMemo(() => {
    const crosshairStrokeBlendStyle = {
      backgroundColor: CROSSHAIR_STROKE_COLOR,
    };

    return createElement(
      "div",
      {
        style: {
          position: "relative",
          width: `${CROSSHAIR_SIZE_PX}px`,
          height: `${CROSSHAIR_SIZE_PX}px`,
          pointerEvents: "none",
          filter: CROSSHAIR_CONTRAST_FILTER,
        },
      },
      createElement("div", {
        key: "center-dot",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_CENTER_DOT_SIZE_PX}px`,
          height: `${CROSSHAIR_CENTER_DOT_SIZE_PX}px`,
          transform: "translate(-50%, -50%)",
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "h-right-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX + CROSSHAIR_CENTER_GAP_PX}px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          height: `${CROSSHAIR_THICKNESS_PX}px`,
          transform: "translateY(-50%)",
          clipPath: `polygon(0 50%, ${CROSSHAIR_INNER_TIP_PX}px 0, 100% 0, 100% 100%, ${CROSSHAIR_INNER_TIP_PX}px 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "h-left-dash",
        style: {
          position: "absolute",
          left: `${
            CROSSHAIR_CENTER_PX -
            CROSSHAIR_CENTER_GAP_PX -
            CROSSHAIR_FAR_DASH_LENGTH_PX
          }px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          height: `${CROSSHAIR_THICKNESS_PX}px`,
          transform: "translateY(-50%)",
          clipPath: `polygon(0 0, calc(100% - ${CROSSHAIR_INNER_TIP_PX}px) 0, 100% 50%, calc(100% - ${CROSSHAIR_INNER_TIP_PX}px) 100%, 0 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "v-bottom-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${CROSSHAIR_CENTER_PX + CROSSHAIR_CENTER_GAP_PX}px`,
          width: `${CROSSHAIR_THICKNESS_PX}px`,
          height: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          transform: "translateX(-50%)",
          clipPath: `polygon(0 ${CROSSHAIR_INNER_TIP_PX}px, 50% 0, 100% ${CROSSHAIR_INNER_TIP_PX}px, 100% 100%, 0 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "v-top-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${
            CROSSHAIR_CENTER_PX -
            CROSSHAIR_CENTER_GAP_PX -
            CROSSHAIR_FAR_DASH_LENGTH_PX
          }px`,
          width: `${CROSSHAIR_THICKNESS_PX}px`,
          height: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          transform: "translateX(-50%)",
          clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CROSSHAIR_INNER_TIP_PX}px), 50% 100%, 0 calc(100% - ${CROSSHAIR_INNER_TIP_PX}px))`,
          ...crosshairStrokeBlendStyle,
        },
      })
    );
  }, []);

  const getLivePreviewCanvasPosition = useCallback((): CssPixelPosition | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }
    const position = livePreviewPointRef.current;
    if (!position) {
      return null;
    }
    const canvasPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      position
    );
    if (!defined(canvasPosition)) {
      return null;
    }
    return {
      x: canvasPosition.x,
      y: canvasPosition.y + CROSSHAIR_ANCHOR_OFFSET_Y_PX,
    } as CssPixelPosition;
  }, [scene]);

  useEffect(() => {
    if (!renderDomVisuals || !scene || scene.isDestroyed()) {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
      return;
    }

    addLabelOverlayElement({
      id: LIVE_PREVIEW_CROSSHAIR_ID,
      zIndex: 22,
      getCanvasPosition: getLivePreviewCanvasPosition,
      content: livePreviewCrosshairContent,
      visible: showLivePreviewCrosshair,
    });

    return () => {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
    };
  }, [
    scene,
    renderDomVisuals,
    showLivePreviewCrosshair,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    getLivePreviewCanvasPosition,
    livePreviewCrosshairContent,
  ]);
};
