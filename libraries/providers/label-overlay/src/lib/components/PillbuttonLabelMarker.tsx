import React, { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "../core/pointLabelAttach";
import {
  DEFAULT_PILL_LABEL_HEIGHT_EM,
  resolvePillLabelHeightPx,
} from "../core/pillConnectorGeometry";
import {
  resolvePillbuttonMountSide,
  type PillbuttonMountSide,
} from "./PointLabelMarker";
export const PILLBUTTON_BADGE_POSITIONS = {
  LEFT: "left",
  RIGHT: "right",
} as const;

export type PillbuttonBadgePosition =
  (typeof PILLBUTTON_BADGE_POSITIONS)[keyof typeof PILLBUTTON_BADGE_POSITIONS];

export const PILLBUTTON_LABEL_MARKER_RESIZE_MODE = {
  NONE: "none",
  FAST_GROW_SLOW_SHRINK: "fast-grow-slow-shrink",
  SNAPPY: "snappy",
} as const;

export type PillbuttonLabelMarkerResizeMode =
  (typeof PILLBUTTON_LABEL_MARKER_RESIZE_MODE)[keyof typeof PILLBUTTON_LABEL_MARKER_RESIZE_MODE];

export type PillbuttonLabelMarkerBadgeOptions = Readonly<{
  position?: PillbuttonBadgePosition;
  compactBorderless: boolean;
  anchorAtSemicircleCenter?: boolean;
  fullBorder: boolean;
  solidBorderStyle?: string;
}>;

export type PillbuttonLabelMarkerLayoutOptions = Readonly<{
  labelHeightEm: number;
  compactHorizontalPaddingEm: number;
  compactWidthShrinkEm: number;
  compactWidthExtraPaddingEm: number;
  compactPillTextLengthThreshold: number;
  extendedVerticalPaddingEm: number;
  extendedHorizontalPaddingEm: number;
  compactExtendedGapEm: number;
  extendedLeftExtraPaddingEm: number;
  extendedRightExtraPaddingEm: number;
  contentBaselineShiftEm: number;
}>;

export type PillbuttonLabelMarkerLayoutMetrics = Readonly<{
  labelHeightPx: number;
  capRadiusPx: number;
  compactHorizontalPaddingPx: number;
  compactWidthShrinkPx: number;
  compactWidthExtraPaddingPx: number;
  extendedVerticalPaddingPx: number;
  extendedHorizontalPaddingPx: number;
  compactExtendedGapPx: number;
  extendedLeftExtraPaddingPx: number;
  extendedRightExtraPaddingPx: number;
  contentBaselineShiftPx: number;
}>;

export type PillbuttonLabelMarkerMotionOptions = Readonly<{
  resizeMode: PillbuttonLabelMarkerResizeMode;
  growShrinkWidthTransitionMs: number;
  shrinkWidthTransitionDelayMs: number;
  snappyWidthTransitionMs: number;
  snappyWidthTransitionDelayMs: number;
  snappyWidthTransitionEasing: string;
}>;

export const pillbuttonLabelMarkerBadgeDefaults: PillbuttonLabelMarkerBadgeOptions =
  Object.freeze({
    position: undefined,
    compactBorderless: false,
    anchorAtSemicircleCenter: undefined,
    fullBorder: false,
    solidBorderStyle: undefined,
  });

export const pillbuttonLabelMarkerLayoutDefaults: PillbuttonLabelMarkerLayoutOptions =
  Object.freeze({
    labelHeightEm: DEFAULT_PILL_LABEL_HEIGHT_EM,
    compactHorizontalPaddingEm: 0,
    compactWidthShrinkEm: 0,
    compactWidthExtraPaddingEm: 0,
    compactPillTextLengthThreshold: 2,
    extendedVerticalPaddingEm: 0.5,
    extendedHorizontalPaddingEm: 0,
    compactExtendedGapEm: 0,
    extendedLeftExtraPaddingEm: 0,
    extendedRightExtraPaddingEm: 0,
    contentBaselineShiftEm: 0,
  });

export const pillbuttonLabelMarkerMotionDefaults: PillbuttonLabelMarkerMotionOptions =
  Object.freeze({
    resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
    growShrinkWidthTransitionMs: 200,
    shrinkWidthTransitionDelayMs: 3000,
    snappyWidthTransitionMs: 115,
    snappyWidthTransitionDelayMs: 0,
    snappyWidthTransitionEasing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });

export const resolvePillbuttonLabelMarkerBadgeOptions = (
  badgeOptions?: Partial<PillbuttonLabelMarkerBadgeOptions>
): PillbuttonLabelMarkerBadgeOptions => ({
  ...pillbuttonLabelMarkerBadgeDefaults,
  ...badgeOptions,
});

export const resolvePillbuttonLabelMarkerLayoutOptions = (
  layoutOptions?: Partial<PillbuttonLabelMarkerLayoutOptions>
): PillbuttonLabelMarkerLayoutOptions => ({
  ...pillbuttonLabelMarkerLayoutDefaults,
  ...layoutOptions,
});

export const resolvePillbuttonLabelMarkerMotionOptions = (
  motionOptions?: Partial<PillbuttonLabelMarkerMotionOptions>
): PillbuttonLabelMarkerMotionOptions => ({
  ...pillbuttonLabelMarkerMotionDefaults,
  ...motionOptions,
});

const parseFontSizePx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

const resolveFontScaledPx = (
  fontSizePx: number,
  scaleEm: number,
  minimumPx: number = 0
): number => Math.max(minimumPx, Math.round(fontSizePx * scaleEm));

export const resolvePillbuttonLabelMarkerLayoutMetrics = ({
  fontSize,
  layoutOptions,
}: {
  fontSize: string;
  layoutOptions?: Partial<PillbuttonLabelMarkerLayoutOptions>;
}): PillbuttonLabelMarkerLayoutMetrics => {
  const resolvedLayoutOptions =
    resolvePillbuttonLabelMarkerLayoutOptions(layoutOptions);
  const fontSizePx = parseFontSizePx(fontSize);
  const labelHeightPx = resolvePillLabelHeightPx(
    fontSizePx,
    resolvedLayoutOptions.labelHeightEm
  );

  return {
    labelHeightPx,
    capRadiusPx: labelHeightPx / 2,
    compactHorizontalPaddingPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.compactHorizontalPaddingEm
    ),
    compactWidthShrinkPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.compactWidthShrinkEm
    ),
    compactWidthExtraPaddingPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.compactWidthExtraPaddingEm
    ),
    extendedVerticalPaddingPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.extendedVerticalPaddingEm
    ),
    extendedHorizontalPaddingPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.extendedHorizontalPaddingEm
    ),
    compactExtendedGapPx: resolveFontScaledPx(
      fontSizePx,
      resolvedLayoutOptions.compactExtendedGapEm
    ),
    extendedLeftExtraPaddingPx: Math.round(
      fontSizePx * resolvedLayoutOptions.extendedLeftExtraPaddingEm
    ),
    extendedRightExtraPaddingPx: Math.round(
      fontSizePx * resolvedLayoutOptions.extendedRightExtraPaddingEm
    ),
    contentBaselineShiftPx: Math.round(
      fontSizePx * resolvedLayoutOptions.contentBaselineShiftEm
    ),
  };
};

const setNullableNumberStateIfChanged = (
  setState: React.Dispatch<React.SetStateAction<number | null>>,
  nextValue: number | null
) => {
  setState((previousValue) =>
    previousValue === nextValue ? previousValue : nextValue
  );
};

const setNumberStateIfChanged = (
  setState: React.Dispatch<React.SetStateAction<number>>,
  nextValue: number
) => {
  setState((previousValue) =>
    previousValue === nextValue ? previousValue : nextValue
  );
};

const resolvePillbuttonBadgePosition = (
  mountSide: PillbuttonMountSide,
  badgePosition?: PillbuttonBadgePosition
): PillbuttonBadgePosition => {
  if (badgePosition !== undefined) {
    return badgePosition;
  }

  return mountSide === POINT_LABEL_ATTACH.RIGHT
    ? PILLBUTTON_BADGE_POSITIONS.RIGHT
    : PILLBUTTON_BADGE_POSITIONS.LEFT;
};

const getExtendedContentAlignmentStyles = (
  badgePosition: PillbuttonBadgePosition
): React.CSSProperties =>
  badgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT
    ? {
        justifyContent: "flex-end",
        textAlign: "right",
      }
    : {
        justifyContent: "flex-start",
        textAlign: "left",
      };

const resolveCompactOccupiedSpace = (
  compactWidthPx: number | null,
  labelHeightPx: number
): string =>
  compactWidthPx != null ? `${compactWidthPx}px` : `${labelHeightPx}px`;

const resolveWideBadgeAnchorTransform = ({
  mountSide,
  badgePosition,
  compactWidthPx,
  compactAnchorOffsetPx,
}: {
  mountSide: PillbuttonMountSide;
  badgePosition: PillbuttonBadgePosition;
  compactWidthPx: number | null;
  compactAnchorOffsetPx: number;
}): string | null => {
  if (compactWidthPx === null) {
    return null;
  }

  if (
    mountSide === POINT_LABEL_ATTACH.LEFT &&
    badgePosition === PILLBUTTON_BADGE_POSITIONS.LEFT
  ) {
    return `translate(${-(compactWidthPx - compactAnchorOffsetPx)}px, -50%)`;
  }

  if (
    mountSide === POINT_LABEL_ATTACH.RIGHT &&
    badgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT
  ) {
    return `translate(calc(-100% + ${
      compactWidthPx - compactAnchorOffsetPx
    }px), -50%)`;
  }

  return null;
};

export interface PillbuttonLabelMarkerProps {
  pointId?: string;
  labelAttach: PointLabelAttach;
  labelOffsetX: number;
  labelOffsetY: number;
  baseStyles: React.CSSProperties;
  labelBorderStyle: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string | number;
  backgroundColor: string;
  textColor: string;
  pointerEvents: React.CSSProperties["pointerEvents"];
  cursor: React.CSSProperties["cursor"];
  transition?: string;
  collapse: boolean;
  markerContent?: React.ReactNode;
  markerBackgroundColor?: string;
  markerTextColor?: string;
  badgeOptions?: Partial<PillbuttonLabelMarkerBadgeOptions>;
  layoutOptions?: Partial<PillbuttonLabelMarkerLayoutOptions>;
  motionOptions?: Partial<PillbuttonLabelMarkerMotionOptions>;
  content: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const PillbuttonLabelMarker = ({
  pointId,
  labelAttach,
  labelOffsetX,
  labelOffsetY,
  baseStyles,
  labelBorderStyle,
  fontSize,
  fontFamily,
  fontWeight,
  backgroundColor,
  textColor,
  pointerEvents,
  cursor,
  transition,
  collapse,
  markerContent,
  markerBackgroundColor,
  markerTextColor,
  badgeOptions,
  layoutOptions,
  motionOptions,
  content,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PillbuttonLabelMarkerProps) => {
  const resolvedBadgeOptions =
    resolvePillbuttonLabelMarkerBadgeOptions(badgeOptions);
  const resolvedLayoutMetrics = resolvePillbuttonLabelMarkerLayoutMetrics({
    fontSize,
    layoutOptions,
  });
  const resolvedMotionOptions =
    resolvePillbuttonLabelMarkerMotionOptions(motionOptions);
  const mountSide = resolvePillbuttonMountSide(labelAttach);
  const resolvedBadgePosition = resolvePillbuttonBadgePosition(
    mountSide,
    resolvedBadgeOptions.position
  );
  const hasCompact =
    markerContent !== undefined &&
    markerContent !== null &&
    (typeof markerContent !== "string" || markerContent.trim().length > 0);
  const hasExtendedContent =
    content !== undefined &&
    content !== null &&
    (typeof content !== "string" || content.trim().length > 0);
  const showExtended = !collapse && hasExtendedContent;
  const isCompactOnly = hasCompact && !showExtended;
  const effectiveMarkerBorderStyle =
    resolvedBadgeOptions.fullBorder && resolvedBadgeOptions.solidBorderStyle
      ? resolvedBadgeOptions.solidBorderStyle
      : labelBorderStyle;
  const extendedBorderStyle = resolvedBadgeOptions.fullBorder
    ? effectiveMarkerBorderStyle
    : "none";
  const compactAnchorOffsetPx = resolvedLayoutMetrics.capRadiusPx;
  const anchorAtSemicircleCenter =
    resolvedBadgeOptions.anchorAtSemicircleCenter ??
    (hasCompact || resolvedBadgeOptions.fullBorder);
  const compactRef = useRef<HTMLSpanElement | null>(null);
  const [compactWidthPx, setCompactWidthPx] = useState<number | null>(null);
  const compactOccupiedSpace = resolveCompactOccupiedSpace(
    compactWidthPx,
    resolvedLayoutMetrics.labelHeightPx
  );
  const extendedPaddingBySide =
    hasCompact && showExtended
      ? resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT
        ? {
            paddingRight: `calc(${resolvedLayoutMetrics.extendedHorizontalPaddingPx}px + ${compactOccupiedSpace} + ${resolvedLayoutMetrics.compactExtendedGapPx}px + ${resolvedLayoutMetrics.extendedRightExtraPaddingPx}px)`,
            paddingLeft: `${
              resolvedLayoutMetrics.extendedHorizontalPaddingPx +
              resolvedLayoutMetrics.extendedLeftExtraPaddingPx
            }px`,
          }
        : {
            paddingLeft: `calc(${resolvedLayoutMetrics.extendedHorizontalPaddingPx}px + ${compactOccupiedSpace} + ${resolvedLayoutMetrics.compactExtendedGapPx}px + ${resolvedLayoutMetrics.extendedLeftExtraPaddingPx}px)`,
            paddingRight: `${
              resolvedLayoutMetrics.extendedHorizontalPaddingPx +
              resolvedLayoutMetrics.extendedRightExtraPaddingPx
            }px`,
          }
      : null;
  const compactCenterOffsetPx =
    compactWidthPx != null ? compactWidthPx / 2 : compactAnchorOffsetPx;
  const compactTextLength =
    typeof markerContent === "string" ? markerContent.trim().length : 0;
  const shouldForceCompactPill =
    compactTextLength >
    resolvePillbuttonLabelMarkerLayoutOptions(layoutOptions)
      .compactPillTextLengthThreshold;
  const contentBaselineShiftStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
    transform: `translateY(${resolvedLayoutMetrics.contentBaselineShiftPx}px)`,
  };

  useLayoutEffect(() => {
    const el = compactRef.current;
    if (!el || !hasCompact) {
      setNullableNumberStateIfChanged(setCompactWidthPx, null);
      return;
    }
    const scrollW = Math.ceil(el.scrollWidth);
    const circlePx = el.offsetHeight;
    if (shouldForceCompactPill || scrollW > circlePx) {
      setNullableNumberStateIfChanged(
        setCompactWidthPx,
        Math.max(
          scrollW +
            resolvedLayoutMetrics.compactHorizontalPaddingPx * 2 +
            resolvedLayoutMetrics.compactWidthExtraPaddingPx -
            resolvedLayoutMetrics.compactWidthShrinkPx,
          circlePx + 1
        )
      );
    } else {
      setNullableNumberStateIfChanged(setCompactWidthPx, null);
    }
  }, [
    hasCompact,
    markerContent,
    fontSize,
    fontFamily,
    fontWeight,
    resolvedLayoutMetrics.compactHorizontalPaddingPx,
    resolvedLayoutMetrics.compactWidthExtraPaddingPx,
    resolvedLayoutMetrics.compactWidthShrinkPx,
    shouldForceCompactPill,
  ]);

  const extendedRef = useRef<HTMLSpanElement | null>(null);
  const previousExtendedWidthPxRef = useRef<number | null>(null);
  const [animatedExtendedWidthPx, setAnimatedExtendedWidthPx] = useState<
    number | null
  >(null);
  const [extendedWidthTransitionMs, setExtendedWidthTransitionMs] = useState(0);
  const [extendedWidthTransitionDelayMs, setExtendedWidthTransitionDelayMs] =
    useState(0);

  useLayoutEffect(() => {
    if (
      resolvedMotionOptions.resizeMode ===
        PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE ||
      !showExtended
    ) {
      previousExtendedWidthPxRef.current = null;
      setNullableNumberStateIfChanged(setAnimatedExtendedWidthPx, null);
      setNumberStateIfChanged(setExtendedWidthTransitionMs, 0);
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
      return;
    }

    const extendedElement = extendedRef.current;
    if (!extendedElement) return;

    const nextWidthPx = Math.ceil(extendedElement.scrollWidth);
    const previousWidthPx = previousExtendedWidthPxRef.current;

    if (previousWidthPx === null) {
      setNumberStateIfChanged(setExtendedWidthTransitionMs, 0);
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
    } else if (
      resolvedMotionOptions.resizeMode ===
      PILLBUTTON_LABEL_MARKER_RESIZE_MODE.SNAPPY
    ) {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        resolvedMotionOptions.snappyWidthTransitionMs
      );
      setNumberStateIfChanged(
        setExtendedWidthTransitionDelayMs,
        resolvedMotionOptions.snappyWidthTransitionDelayMs
      );
    } else if (nextWidthPx > previousWidthPx) {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        resolvedMotionOptions.growShrinkWidthTransitionMs
      );
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
    } else if (nextWidthPx < previousWidthPx) {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        resolvedMotionOptions.growShrinkWidthTransitionMs
      );
      setNumberStateIfChanged(
        setExtendedWidthTransitionDelayMs,
        resolvedMotionOptions.shrinkWidthTransitionDelayMs
      );
    } else {
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
    }

    previousExtendedWidthPxRef.current = nextWidthPx;
    setNullableNumberStateIfChanged(setAnimatedExtendedWidthPx, nextWidthPx);
  }, [
    resolvedMotionOptions.growShrinkWidthTransitionMs,
    resolvedMotionOptions.resizeMode,
    resolvedMotionOptions.shrinkWidthTransitionDelayMs,
    resolvedMotionOptions.snappyWidthTransitionDelayMs,
    resolvedMotionOptions.snappyWidthTransitionMs,
    showExtended,
    content,
    fontFamily,
    fontSize,
    fontWeight,
  ]);

  const getCompactStylesByBadgePosition = (
    side: PillbuttonBadgePosition
  ): React.CSSProperties => {
    if (side === PILLBUTTON_BADGE_POSITIONS.RIGHT) {
      return {
        right: 0,
        transform: "translate(0, -50%)",
      };
    }
    return {
      left: 0,
      transform: "translate(0, -50%)",
    };
  };

  const anchorTransform = useMemo(() => {
    const wideBadgeAnchorTransform =
      hasCompact && showExtended
        ? resolveWideBadgeAnchorTransform({
            mountSide,
            badgePosition: resolvedBadgePosition,
            compactWidthPx,
            compactAnchorOffsetPx,
          })
        : null;
    if (wideBadgeAnchorTransform) {
      return wideBadgeAnchorTransform;
    }

    if (mountSide === POINT_LABEL_ATTACH.RIGHT) {
      if (!anchorAtSemicircleCenter) {
        return "translate(-100%, -50%)";
      }
      return `translate(calc(-100% + ${compactAnchorOffsetPx}px), -50%)`;
    }
    if (mountSide === POINT_LABEL_ATTACH.CENTER) {
      if (isCompactOnly) {
        return `translate(${-compactCenterOffsetPx}px, -50%)`;
      }
      return "translate(-50%, -50%)";
    }
    if (!anchorAtSemicircleCenter) {
      return "translate(0%, -50%)";
    }
    return `translate(${-compactAnchorOffsetPx}px, -50%)`;
  }, [
    anchorAtSemicircleCenter,
    compactAnchorOffsetPx,
    compactCenterOffsetPx,
    compactWidthPx,
    hasCompact,
    isCompactOnly,
    mountSide,
    resolvedBadgePosition,
    showExtended,
  ]);

  return (
    <div
      data-point-label-interactive="true"
      data-point-label-id={pointId}
      data-pillbutton-root="true"
      style={{
        ...baseStyles,
        padding: 0,
        display: "inline-block",
        fontSize,
        fontFamily,
        fontWeight,
        fontVariantNumeric: "tabular-nums lining-nums",
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        position: "absolute",
        left: `${labelOffsetX}px`,
        top: `${labelOffsetY}px`,
        transform: anchorTransform,
        pointerEvents,
        cursor,
        transition,
        overflow: "visible",
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasCompact ? (
        <span
          ref={compactRef}
          data-pillbutton-badge="true"
          style={{
            position: "absolute",
            ...getCompactStylesByBadgePosition(resolvedBadgePosition),
            top: "50%",
            width:
              compactWidthPx != null
                ? `${compactWidthPx}px`
                : `${resolvedLayoutMetrics.labelHeightPx}px`,
            minWidth: `${resolvedLayoutMetrics.labelHeightPx}px`,
            height: `${resolvedLayoutMetrics.labelHeightPx}px`,
            padding:
              compactWidthPx != null
                ? `0 ${resolvedLayoutMetrics.compactHorizontalPaddingPx}px`
                : 0,
            borderRadius: `${resolvedLayoutMetrics.capRadiusPx}px`,
            border: resolvedBadgeOptions.compactBorderless
              ? "none"
              : effectiveMarkerBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            whiteSpace: "nowrap",
            backgroundColor: markerBackgroundColor ?? backgroundColor,
            color: markerTextColor ?? textColor,
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          <span style={contentBaselineShiftStyles}>{markerContent}</span>
        </span>
      ) : null}

      {showExtended ? (
        <span
          ref={extendedRef}
          data-pillbutton-content="true"
          style={{
            borderRadius: `${resolvedLayoutMetrics.capRadiusPx}px`,
            padding: `${resolvedLayoutMetrics.extendedVerticalPaddingPx}px ${resolvedLayoutMetrics.extendedHorizontalPaddingPx}px`,
            paddingLeft: `${
              resolvedLayoutMetrics.extendedHorizontalPaddingPx +
              resolvedLayoutMetrics.extendedLeftExtraPaddingPx
            }px`,
            ...(extendedPaddingBySide ?? null),
            ...getExtendedContentAlignmentStyles(resolvedBadgePosition),
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: `${resolvedLayoutMetrics.labelHeightPx}px`,
            position: "relative",
            zIndex: 1,
            width:
              resolvedMotionOptions.resizeMode !==
                PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE &&
              animatedExtendedWidthPx !== null
                ? `${animatedExtendedWidthPx}px`
                : undefined,
            overflow:
              resolvedMotionOptions.resizeMode !==
              PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE
                ? "hidden"
                : undefined,
            transition:
              resolvedMotionOptions.resizeMode !==
              PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE
                ? `width ${extendedWidthTransitionMs}ms ${
                    resolvedMotionOptions.resizeMode ===
                    PILLBUTTON_LABEL_MARKER_RESIZE_MODE.SNAPPY
                      ? resolvedMotionOptions.snappyWidthTransitionEasing
                      : "ease"
                  } ${extendedWidthTransitionDelayMs}ms`
                : undefined,
          }}
        >
          <span style={contentBaselineShiftStyles}>{content}</span>
        </span>
      ) : !hasCompact ? (
        <span
          data-pillbutton-content="true"
          style={{
            borderRadius: `${resolvedLayoutMetrics.capRadiusPx}px`,
            padding: `${resolvedLayoutMetrics.extendedVerticalPaddingPx}px ${resolvedLayoutMetrics.extendedHorizontalPaddingPx}px`,
            ...getExtendedContentAlignmentStyles(resolvedBadgePosition),
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: `${resolvedLayoutMetrics.labelHeightPx}px`,
          }}
        >
          <span style={contentBaselineShiftStyles}>{content}</span>
        </span>
      ) : null}
    </div>
  );
};
