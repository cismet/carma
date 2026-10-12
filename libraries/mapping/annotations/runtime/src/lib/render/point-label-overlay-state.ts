import type { CSSProperties } from "react";
import type { Radians } from "@carma-units";
import {
  POINT_LABEL_ANCHOR_KIND,
  resolvePointLabelLayoutConfig,
  type PointLabelAttach,
  type PointLabelOverlayRenderState,
} from "@carma-providers/label-overlay";

import { annotationVisualDefaults } from "../config/annotation-visual-defaults";
import {
  RUNTIME_OVERLAY_DISTANCE_Z_INDEX,
  type RuntimePointLabelRenderModel,
} from "./annotation-render-models";
import type { OverlayVisibilityState } from "./overlay-visibility.shared";

export const pointLabelVisualizerDefaults = Object.freeze({
  layoutConfig: resolvePointLabelLayoutConfig(undefined),
  markerPixelSize: 10,
  markerOutlineWidth: annotationVisualDefaults.sizes.pointOutlineWidth,
  stemColor: annotationVisualDefaults.colors.surface,
  activeMoveGizmoLabelZIndex: RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MAX + 1,
});

export type PointLabelOverlayState = OverlayVisibilityState & {
  hiddenByLayout: boolean;
  angleRad: Radians;
  distance: number;
  attach: PointLabelAttach;
  zIndex: number;
};

export const createEmptyLabelOverlayState = (): PointLabelOverlayState => ({
  screenPosition: null,
  isInViewport: false,
  isHidden: true,
  isOccluded: false,
  hiddenByLayout: true,
  angleRad: 0 as Radians,
  distance: pointLabelVisualizerDefaults.layoutConfig.stemDistance,
  attach: "center",
  zIndex: 0,
});

export const getPointLabelOverlayId = (
  overlayIdPrefix: string,
  labelId: string
) => `${overlayIdPrefix}-${labelId}`;

export const buildPointLabelOverlayRenderState = ({
  label,
  overlayState,
  areaLabelSurfaceBlendMode,
}: {
  label: RuntimePointLabelRenderModel;
  overlayState: PointLabelOverlayState;
  areaLabelSurfaceBlendMode: CSSProperties["mixBlendMode"];
}): PointLabelOverlayRenderState => {
  const markerSize =
    label.markerPixelSize ?? pointLabelVisualizerDefaults.markerPixelSize;
  const markerStrokeWidth =
    label.markerOutlineWidth ?? pointLabelVisualizerDefaults.markerOutlineWidth;
  const isHidden = overlayState.isHidden || overlayState.hiddenByLayout;

  return {
    pointId: label.id,
    content: label.content,
    badgeContent: label.badgeContent,
    selected: label.selected,
    hideLabelAndStem: label.hideLabelAndStem,
    hideMarker: label.hideMarker ?? false,
    markerSize,
    markerStrokeWidth,
    stemStartDistance:
      label.stemStartDistance ??
      (label.hideMarker ? 0 : markerSize / 2 + markerStrokeWidth / 2),
    markerBackgroundColor: label.markerBackgroundColor,
    markerTextColor: label.markerTextColor,
    lineColor: label.lineColor ?? pointLabelVisualizerDefaults.stemColor,
    labelStyle: label.labelStyle,
    collapse: label.collapse,
    textBackgroundColor: label.textBackgroundColor,
    textColor: label.textColor,
    selectedBackgroundColor: label.selectedBackgroundColor,
    selectedTextColor: label.selectedTextColor,
    selectedGlowColor: label.selectedGlowColor,
    selectedGlowRadiusPx: label.selectedGlowRadiusPx,
    preserveFillOnSelection: label.preserveFillOnSelection,
    hoverBackgroundColor: label.hoverBackgroundColor,
    textShadow: label.textShadow,
    fontSize: label.fontSize,
    fontFamily: label.fontFamily,
    fontWeight: label.fontWeight,
    mixBlendMode:
      label.mixBlendMode ??
      (label.anchorKind === POINT_LABEL_ANCHOR_KIND.AREA_CENTROID
        ? areaLabelSurfaceBlendMode
        : undefined),
    onClick: label.onClick,
    onDoubleClick: label.onDoubleClick,
    onHoverChange: label.onHoverChange,
    onLongPress: label.onLongPress,
    markerOnlyPointerEvents: label.markerOnlyPointerEvents,
    longPressDurationMs: label.longPressDurationMs,
    longPressOnlyOnMarker:
      Boolean(label.onLongPress) && Boolean(label.hideLabelAndStem),
    renderHiddenMarkerInteractionTarget: Boolean(
      label.onLongPress && label.markerOnlyPointerEvents === true
    ),
    screenPosition: isHidden ? null : overlayState.screenPosition,
    angleRad: overlayState.angleRad,
    distance: overlayState.distance,
    attach: overlayState.attach,
    isOccluded: overlayState.isOccluded,
    visible: !isHidden,
    zIndex: overlayState.zIndex,
  };
};
