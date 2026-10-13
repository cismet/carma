import React, { type CSSProperties } from "react";

import type { CssPixelPosition } from "@carma-units";

import { resolveSegmentEndOutsideCircle } from "../core/pillConnectorGeometry";
import { POINT_LABEL_ATTACH } from "../core/pointLabelAttach";
import { buildOverlayGlowBoxShadowCss } from "../overlayAffordanceDefaults";
import {
  DEFAULT_POINT_LABEL_FONT_FAMILY,
  DEFAULT_POINT_LABEL_FONT_SIZE,
  DEFAULT_POINT_LABEL_FONT_WEIGHT,
  PillbuttonLabelMarker,
} from "./PillbuttonLabelMarker";
import { PointLabelStem } from "./PointLabelStem";
import {
  POINT_LABEL_MARKER_BORDER_COLOR,
  hasRenderableLabelContent,
  labelShellBaseStyles,
  nodeMarkerBaseStyles,
  readPointLabelTransform,
  resolvePointLabelPillLayoutMetrics,
  stripLeadingBadgeFromText,
} from "./point-label-helpers";
import { POINT_LABEL_STYLE, type PointLabelProps } from "./point-label-types";
import {
  DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME,
  POINT_LABEL_COMPONENT_DEFAULTS,
  POINT_LABEL_INTERACTION_DEFAULTS,
  POINT_LABEL_LAYOUT_DEFAULTS,
  POINT_LABEL_OCCLUDED_OPACITY,
  POINT_LABEL_THEME_DEFAULTS,
} from "./pointLabelDefaults";
import { useLabelAttachTransition } from "./use-label-attach-transition";
import { usePointLabelInteraction } from "./use-point-label-interaction";

export const PointLabel = React.memo(
  ({
    pointId,
    content,
    selected = false,
    fontSize = DEFAULT_POINT_LABEL_FONT_SIZE,
    fontFamily = DEFAULT_POINT_LABEL_FONT_FAMILY,
    fontWeight = DEFAULT_POINT_LABEL_FONT_WEIGHT,
    markerCursor,
    labelCursor,
    textColor = POINT_LABEL_COMPONENT_DEFAULTS.textColor,
    textBackgroundColor = POINT_LABEL_THEME_DEFAULTS.textBackgroundColor,
    selectedBackgroundColor = POINT_LABEL_THEME_DEFAULTS.selectedBackgroundColor,
    selectedTextColor = POINT_LABEL_COMPONENT_DEFAULTS.selectedTextColor,
    selectedGlowColor,
    selectedGlowRadiusPx = POINT_LABEL_COMPONENT_DEFAULTS.selectedGlowRadiusPx,
    preserveFillOnSelection = POINT_LABEL_COMPONENT_DEFAULTS.preserveFillOnSelection,
    hoverBackgroundColor = POINT_LABEL_THEME_DEFAULTS.hoverBackgroundColor,
    textShadow,
    mixBlendMode,
    isOccluded = false,
    pitch = POINT_LABEL_COMPONENT_DEFAULTS.pitch,
    labelAngleRad,
    labelAttach = POINT_LABEL_ATTACH.LEFT,
    transitionDurationMs = POINT_LABEL_COMPONENT_DEFAULTS.transitionDurationMs,
    hideLabelAndStem = false,
    hideStem = false,
    hideMarker = false,
    lineColor = POINT_LABEL_COMPONENT_DEFAULTS.lineColor,
    lineWidth = POINT_LABEL_COMPONENT_DEFAULTS.lineWidth,
    markerSize = POINT_LABEL_COMPONENT_DEFAULTS.markerSize,
    markerStrokeWidth = POINT_LABEL_COMPONENT_DEFAULTS.markerStrokeWidth,
    stemReferenceMarkerSize,
    stemStartDistance,
    nodeContent,
    badgeContent,
    markerContent,
    markerBackgroundColor = POINT_LABEL_COMPONENT_DEFAULTS.markerBackgroundColor,
    markerTextColor = POINT_LABEL_COMPONENT_DEFAULTS.markerTextColor,
    badgePosition,
    labelStyle = POINT_LABEL_STYLE.AUTO,
    collapse = false,
    labelDistance = 20,
    onClick,
    onDoubleClick,
    onLongPress,
    longPressDurationMs,
    longPressOnlyOnMarker = false,
    renderHiddenMarkerInteractionTarget = false,
    onHoverChange,
    markerOnlyPointerEvents = false,
    forceMarkerInteractionTarget = false,
    onMarkerDragStart,
    onMarkerDragMove,
    onMarkerDragEnd,
  }: PointLabelProps) => {
    const {
      isHovered,
      isInteractive,
      handleClick,
      handleDoubleClick,
      handleMouseDown,
      handleMouseUp,
      handleMouseEnter,
      handleMouseLeave,
    } = usePointLabelInteraction({
      pointId,
      selected,
      onClick,
      onDoubleClick,
      onLongPress,
      longPressDurationMs,
      onHoverChange,
      onMarkerDragStart,
      onMarkerDragMove,
      onMarkerDragEnd,
    });
    const isAttachTransitionActive = useLabelAttachTransition(
      labelAttach,
      transitionDurationMs
    );

    const effectiveLabelAngleRad =
      labelAngleRad !== undefined ? labelAngleRad : -Math.abs(Math.cos(pitch));
    const resolvedNodeContent = nodeContent ?? markerContent;
    const hasNodeMarkerContent =
      resolvedNodeContent !== null && resolvedNodeContent !== undefined;
    const xComponent = Math.cos(effectiveLabelAngleRad);
    const yComponent = Math.sin(effectiveLabelAngleRad);
    const radius = markerSize / 2;
    const stemReferenceRadius = (stemReferenceMarkerSize ?? markerSize) / 2;
    const pillLayoutMetrics = resolvePointLabelPillLayoutMetrics(fontSize);
    const regularLabelHorizontalPaddingPx = Math.round(
      pillLayoutMetrics.labelHeightPx / 2
    );
    const hasCompactContent = hasRenderableLabelContent(badgeContent);
    const useCapsuleStyle = labelStyle === POINT_LABEL_STYLE.CAPSULE;
    const hasAnyPillShape = useCapsuleStyle || collapse || hasCompactContent;
    const resolvedStemStartDistance = Math.max(
      0,
      stemStartDistance ?? (hideMarker ? 0 : radius)
    );
    const stemEndInsetDistance = hideMarker ? 0 : stemReferenceRadius;
    const baseLineLength = Math.max(0, labelDistance - stemEndInsetDistance);
    const pillCapRadiusPx =
      hasAnyPillShape && labelAttach !== POINT_LABEL_ATTACH.CENTER
        ? pillLayoutMetrics.capRadiusPx
        : 0;
    const stemStartPoint = {
      x: xComponent * resolvedStemStartDistance,
      y: yComponent * resolvedStemStartDistance,
    } as CssPixelPosition;
    const labelAnchorPoint = {
      x:
        xComponent *
        (resolvedStemStartDistance + baseLineLength + pillCapRadiusPx),
      y:
        yComponent *
        (resolvedStemStartDistance + baseLineLength + pillCapRadiusPx),
    } as CssPixelPosition;
    const visibleStemEndPoint =
      pillCapRadiusPx > 0
        ? resolveSegmentEndOutsideCircle(
            stemStartPoint,
            labelAnchorPoint,
            pillCapRadiusPx + POINT_LABEL_LAYOUT_DEFAULTS.pillStemEndInsetPx
          )
        : labelAnchorPoint;
    const hasClickHandler = Boolean(onClick || onDoubleClick || onLongPress);
    const markerCapturesPointer = isInteractive || Boolean(markerCursor);
    const labelCapturesPointer =
      (isInteractive && !markerOnlyPointerEvents) || Boolean(labelCursor);
    const renderInvisibleInteractionMarker =
      markerCapturesPointer &&
      hideMarker &&
      (forceMarkerInteractionTarget ||
        markerOnlyPointerEvents ||
        renderHiddenMarkerInteractionTarget);
    const resolvedMarkerCursor = forceMarkerInteractionTarget
      ? "none"
      : markerCursor ?? (hasClickHandler ? "pointer" : "default");
    const resolvedLabelCursor =
      labelCursor ??
      (forceMarkerInteractionTarget
        ? "none"
        : hasClickHandler
        ? "pointer"
        : "default");
    const effectiveTextColor = selected ? selectedTextColor : textColor;
    const effectiveBackgroundColor = selected
      ? preserveFillOnSelection
        ? textBackgroundColor
        : selectedBackgroundColor
      : isHovered
      ? hoverBackgroundColor
      : textBackgroundColor;
    const selectedGlowBoxShadow =
      selected && selectedGlowColor !== undefined && selectedGlowRadiusPx > 0
        ? buildOverlayGlowBoxShadowCss({
            color: selectedGlowColor,
            blurRadiusPx: selectedGlowRadiusPx,
          })
        : undefined;
    const effectiveCompactBackgroundColor = selected
      ? preserveFillOnSelection
        ? markerBackgroundColor
        : effectiveBackgroundColor
      : isHovered
      ? hoverBackgroundColor
      : markerBackgroundColor;
    const effectiveCompactTextColor = selected
      ? effectiveTextColor
      : markerTextColor;
    const effectiveBadgeBorder = selected
      ? `1px solid ${selectedGlowColor ?? selectedTextColor}`
      : "none";
    const effectiveMarkerBorderColor = selected
      ? selectedGlowColor ??
        selectedTextColor ??
        POINT_LABEL_MARKER_BORDER_COLOR
      : POINT_LABEL_MARKER_BORDER_COLOR;
    const markerDiameterPx = renderInvisibleInteractionMarker
      ? Math.max(
          markerSize,
          POINT_LABEL_INTERACTION_DEFAULTS.hiddenInteractionMarkerDiameterPx
        )
      : markerSize;
    const hiddenInteractionMarkerStyles: CSSProperties | null =
      renderInvisibleInteractionMarker
        ? {
            borderWidth: 0,
            borderStyle: "none",
            borderColor: "transparent",
            backgroundColor: "transparent",
            color: "transparent",
            boxShadow: "none",
            opacity: 0,
          }
        : null;
    const markerStyles: CSSProperties = {
      ...nodeMarkerBaseStyles,
      width: `${markerDiameterPx}px`,
      minWidth: `${markerDiameterPx}px`,
      height: `${markerDiameterPx}px`,
      borderWidth: renderInvisibleInteractionMarker ? 0 : markerStrokeWidth,
      borderStyle: isOccluded ? "dotted" : "solid",
      borderColor: effectiveMarkerBorderColor,
      backgroundColor:
        renderInvisibleInteractionMarker || !hasNodeMarkerContent
          ? "rgba(0, 0, 0, 0)"
          : markerBackgroundColor,
      color: renderInvisibleInteractionMarker ? "transparent" : markerTextColor,
      fontSize: markerDiameterPx <= 16 ? "10px" : "11px",
      fontFamily,
      fontWeight,
      pointerEvents: markerCapturesPointer ? "auto" : "none",
      cursor: resolvedMarkerCursor,
      ...(hiddenInteractionMarkerStyles ?? null),
    };
    const collapseToCompact =
      hasCompactContent && collapse && !selected && !isHovered;
    const pillContent = collapseToCompact
      ? undefined
      : stripLeadingBadgeFromText(content, badgeContent);
    const labelPointerEvents = labelCapturesPointer ? "auto" : "none";
    const labelTransform = readPointLabelTransform(labelAttach);
    const pillLabelTransform = readPointLabelTransform(
      labelAttach,
      POINT_LABEL_LAYOUT_DEFAULTS.pillLabelCapRadiusEm
    );
    const labelBorderStyle = `${lineWidth}px ${
      isOccluded ? "dashed" : "solid"
    } ${lineColor}`;
    const labelTop = `${labelAnchorPoint.y}px`;
    const sharedAttachTransition =
      isAttachTransitionActive && transitionDurationMs > 0
        ? `${transitionDurationMs}ms ease`
        : undefined;
    const positionTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, transform ${sharedAttachTransition}`
      : undefined;
    const stemTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, width ${sharedAttachTransition}, transform ${sharedAttachTransition}`
      : undefined;

    return (
      <div
        data-point-label-root="true"
        style={{
          position: "relative",
          mixBlendMode: mixBlendMode ?? "normal",
          opacity: isOccluded ? POINT_LABEL_OCCLUDED_OPACITY : 1,
        }}
      >
        {(!hideMarker || renderInvisibleInteractionMarker) && (
          <div
            data-point-label-interactive="true"
            data-point-label-id={pointId}
            data-point-label-hidden-marker-target={
              renderInvisibleInteractionMarker ? "true" : undefined
            }
            data-point-label-marker-content={
              !renderInvisibleInteractionMarker && resolvedNodeContent
                ? "true"
                : undefined
            }
            className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
            style={markerStyles}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseDown={(event) => handleMouseDown(event, true, true)}
            onMouseUp={handleMouseUp}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {renderInvisibleInteractionMarker ? null : resolvedNodeContent}
          </div>
        )}

        {!hideLabelAndStem && (
          <>
            <PointLabelStem
              startPoint={stemStartPoint}
              endPoint={visibleStemEndPoint}
              lineColor={lineColor}
              lineWidth={lineWidth}
              isOccluded={isOccluded}
              hidden={hideStem}
              transition={stemTransition}
            />

            {hasAnyPillShape ? (
              <PillbuttonLabelMarker
                pointId={pointId}
                attach={labelAttach}
                containerStyle={{
                  ...labelShellBaseStyles,
                  border: labelBorderStyle,
                  fontSize,
                  fontFamily,
                  fontWeight,
                  backgroundColor: effectiveBackgroundColor,
                  color: effectiveTextColor,
                  textShadow,
                  boxShadow: selectedGlowBoxShadow,
                  position: "absolute",
                  left: `${labelAnchorPoint.x}px`,
                  top: labelTop,
                  transform: pillLabelTransform,
                  pointerEvents: labelPointerEvents,
                  cursor: resolvedLabelCursor,
                  transition: positionTransition,
                }}
                badgeStyle={{
                  backgroundColor: effectiveCompactBackgroundColor,
                  color: effectiveCompactTextColor,
                  border: effectiveBadgeBorder,
                  fontWeight: DEFAULT_POINT_LABEL_FONT_WEIGHT,
                }}
                badgeContent={hasCompactContent ? badgeContent : undefined}
                badgePosition={badgePosition}
                content={pillContent}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(event) =>
                  handleMouseDown(event, false, !longPressOnlyOnMarker)
                }
                onMouseUp={handleMouseUp}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
            ) : (
              <div
                data-point-label-content-root="true"
                data-point-label-interactive="true"
                data-point-label-id={pointId}
                className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
                style={{
                  ...labelShellBaseStyles,
                  padding: `0px ${regularLabelHorizontalPaddingPx}px`,
                  border: labelBorderStyle,
                  fontSize,
                  fontFamily,
                  fontWeight,
                  fontVariantNumeric: "tabular-nums lining-nums",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  backgroundColor: effectiveBackgroundColor,
                  color: effectiveTextColor,
                  textShadow,
                  boxShadow: selectedGlowBoxShadow,
                  position: "absolute",
                  left: `${labelAnchorPoint.x}px`,
                  top: labelTop,
                  transform: labelTransform,
                  pointerEvents: labelPointerEvents,
                  cursor: resolvedLabelCursor,
                  transition: positionTransition,
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(event) =>
                  handleMouseDown(event, false, !longPressOnlyOnMarker)
                }
                onMouseUp={handleMouseUp}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {content}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);
