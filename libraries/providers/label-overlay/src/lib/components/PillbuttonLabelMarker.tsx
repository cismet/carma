import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointLabelAttach } from "../core/pointLabelAttach";

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

const COMPACT_DIAMETER_EM = 1.9;
const COMPACT_HORIZONTAL_PADDING_PX = 6;
const COMPACT_WIDTH_SHRINK_PX = 2;
const COMPACT_WIDTH_EXTRA_PADDING_PX = 6;
const COMPACT_PILL_TEXT_LENGTH_THRESHOLD = 2;
const EXTENDED_VERTICAL_PADDING_PX = 0;
const EXTENDED_HORIZONTAL_PADDING_PX = 8;
const COMPACT_EXTENDED_GAP_PX = 0;
const EXTENDED_LEFT_EXTRA_PADDING_PX = 0;
const EXTENDED_RIGHT_EXTRA_PADDING_PX = 0;
const GROW_SHRINK_WIDTH_TRANSITION_MS = 200;
const SHRINK_WIDTH_TRANSITION_DELAY_MS = 3000;
const SNAPPY_WIDTH_TRANSITION_MS = 115;
const SNAPPY_WIDTH_TRANSITION_DELAY_MS = 0;
const SNAPPY_WIDTH_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

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

const estimateCompactAnchorOffsetPx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return parsed * (COMPACT_DIAMETER_EM / 2);
};

const resolvePillbuttonBadgePosition = (
  mountSide: PillbuttonMountSide,
  badgePosition?: PillbuttonBadgePosition
): PillbuttonBadgePosition => {
  if (badgePosition !== undefined) {
    return badgePosition;
  }

  return mountSide === "right"
    ? PILLBUTTON_BADGE_POSITIONS.RIGHT
    : PILLBUTTON_BADGE_POSITIONS.LEFT;
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
  badgePosition?: PillbuttonBadgePosition;
  compactBorderless?: boolean;
  anchorAtSemicircleCenter?: boolean;
  fullBorder?: boolean;
  solidBorderStyle?: string;
  resizeMode?: "none" | "fast-grow-slow-shrink" | "snappy";
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
  badgePosition,
  compactBorderless = false,
  anchorAtSemicircleCenter: anchorAtSemicircleCenterOverride,
  fullBorder = false,
  solidBorderStyle,
  resizeMode = "none",
  content,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PillbuttonLabelMarkerProps) => {
  const mountSide = resolvePillbuttonMountSide(labelAttach);
  const resolvedBadgePosition = resolvePillbuttonBadgePosition(
    mountSide,
    badgePosition
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
  const effectiveMarkerBorderStyle =
    fullBorder && solidBorderStyle ? solidBorderStyle : labelBorderStyle;
  const extendedBorderStyle = fullBorder ? effectiveMarkerBorderStyle : "none";
  const compactAnchorOffsetPx = estimateCompactAnchorOffsetPx(fontSize);
  const anchorAtSemicircleCenter =
    anchorAtSemicircleCenterOverride ?? (hasCompact || fullBorder);
  const extendedPaddingBySide =
    hasCompact && showExtended
      ? resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT
        ? {
            paddingRight: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${COMPACT_DIAMETER_EM}em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_RIGHT_EXTRA_PADDING_PX}px)`,
            paddingLeft: `${
              EXTENDED_HORIZONTAL_PADDING_PX + EXTENDED_LEFT_EXTRA_PADDING_PX
            }px`,
          }
        : {
            paddingLeft: `calc(${EXTENDED_HORIZONTAL_PADDING_PX}px + ${COMPACT_DIAMETER_EM}em + ${COMPACT_EXTENDED_GAP_PX}px + ${EXTENDED_LEFT_EXTRA_PADDING_PX}px)`,
            paddingRight: `${
              EXTENDED_HORIZONTAL_PADDING_PX + EXTENDED_RIGHT_EXTRA_PADDING_PX
            }px`,
          }
      : null;
  const compactRef = useRef<HTMLSpanElement | null>(null);
  const [compactWidthPx, setCompactWidthPx] = useState<number | null>(null);
  const compactTextLength =
    typeof markerContent === "string" ? markerContent.trim().length : 0;
  const shouldForceCompactPill =
    compactTextLength > COMPACT_PILL_TEXT_LENGTH_THRESHOLD;

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
            COMPACT_HORIZONTAL_PADDING_PX * 2 +
            COMPACT_WIDTH_EXTRA_PADDING_PX -
            COMPACT_WIDTH_SHRINK_PX,
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
    if (resizeMode === "none" || !showExtended) {
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
    } else if (resizeMode === "snappy") {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        SNAPPY_WIDTH_TRANSITION_MS
      );
      setNumberStateIfChanged(
        setExtendedWidthTransitionDelayMs,
        SNAPPY_WIDTH_TRANSITION_DELAY_MS
      );
    } else if (nextWidthPx > previousWidthPx) {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        GROW_SHRINK_WIDTH_TRANSITION_MS
      );
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
    } else if (nextWidthPx < previousWidthPx) {
      setNumberStateIfChanged(
        setExtendedWidthTransitionMs,
        GROW_SHRINK_WIDTH_TRANSITION_MS
      );
      setNumberStateIfChanged(
        setExtendedWidthTransitionDelayMs,
        SHRINK_WIDTH_TRANSITION_DELAY_MS
      );
    } else {
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
    }

    previousExtendedWidthPxRef.current = nextWidthPx;
    setNullableNumberStateIfChanged(setAnimatedExtendedWidthPx, nextWidthPx);
  }, [resizeMode, showExtended, content, fontFamily, fontSize, fontWeight]);

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
    if (mountSide === "right") {
      if (!anchorAtSemicircleCenter) {
        return "translate(-100%, -50%)";
      }
      return `translate(calc(-100% + ${compactAnchorOffsetPx}px), -50%)`;
    }
    if (mountSide === "center") {
      return "translate(-50%, -50%)";
    }
    if (!anchorAtSemicircleCenter) {
      return "translate(0%, -50%)";
    }
    return `translate(${-compactAnchorOffsetPx}px, -50%)`;
  }, [anchorAtSemicircleCenter, compactAnchorOffsetPx, mountSide]);

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
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum"',
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
                : `${COMPACT_DIAMETER_EM}em`,
            minWidth: `${COMPACT_DIAMETER_EM}em`,
            height: `${COMPACT_DIAMETER_EM}em`,
            padding:
              compactWidthPx != null
                ? `0 ${COMPACT_HORIZONTAL_PADDING_PX}px`
                : 0,
            borderRadius: "999px",
            border: compactBorderless ? "none" : effectiveMarkerBorderStyle,
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
          {markerContent}
        </span>
      ) : null}

      {showExtended ? (
        <span
          ref={extendedRef}
          data-pillbutton-content="true"
          style={{
            borderRadius: "999px",
            padding: `${EXTENDED_VERTICAL_PADDING_PX}px ${EXTENDED_HORIZONTAL_PADDING_PX}px`,
            paddingLeft: `${
              EXTENDED_HORIZONTAL_PADDING_PX + EXTENDED_LEFT_EXTRA_PADDING_PX
            }px`,
            ...(extendedPaddingBySide ?? null),
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.9em",
            position: "relative",
            zIndex: 1,
            width:
              resizeMode !== "none" && animatedExtendedWidthPx !== null
                ? `${animatedExtendedWidthPx}px`
                : undefined,
            overflow: resizeMode !== "none" ? "hidden" : undefined,
            transition:
              resizeMode !== "none"
                ? `width ${extendedWidthTransitionMs}ms ${
                    resizeMode === "snappy"
                      ? SNAPPY_WIDTH_TRANSITION_EASING
                      : "ease"
                  } ${extendedWidthTransitionDelayMs}ms`
                : undefined,
          }}
        >
          {content}
        </span>
      ) : !hasCompact ? (
        <span
          data-pillbutton-content="true"
          style={{
            borderRadius: "999px",
            padding: `${EXTENDED_VERTICAL_PADDING_PX}px ${EXTENDED_HORIZONTAL_PADDING_PX}px`,
            backgroundColor,
            color: textColor,
            border: extendedBorderStyle,
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.9em",
          }}
        >
          {content}
        </span>
      ) : null}
    </div>
  );
};
