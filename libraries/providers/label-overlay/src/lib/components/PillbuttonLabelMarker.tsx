import React, {
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { CssPixelPosition } from "@carma-units";

import {
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "../core/pointLabelAttach";

const DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME =
  "carma-default-annotation-typography";
import {
  DEFAULT_PILL_LABEL_HEIGHT_EM,
  resolvePillLabelHeightPx,
} from "../core/pillConnectorGeometry";
export const PILLBUTTON_BADGE_POSITIONS = {
  LEFT: "left",
  RIGHT: "right",
} as const;

const PILLBUTTON_LABEL_HEIGHT_EM = DEFAULT_PILL_LABEL_HEIGHT_EM;
const PILLBUTTON_CAP_RADIUS_EM = PILLBUTTON_LABEL_HEIGHT_EM / 2;
const PILLBUTTON_BADGE_HORIZONTAL_PADDING_EM = Math.max(
  0.08,
  PILLBUTTON_CAP_RADIUS_EM * 0.35
);

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
  fullBorder: boolean;
  solidBorderStyle?: string;
}>;

export type PillbuttonLabelMarkerLayoutMetrics = Readonly<{
  labelHeightPx: number;
  capRadiusPx: number;
}>;

export type PillbuttonLabelMarkerAnchorPoints = Readonly<{
  left: CssPixelPosition;
  center: CssPixelPosition;
  right: CssPixelPosition;
}>;

export type PillbuttonLabelMarkerPlacement = Readonly<{
  attach: PointLabelAttach;
  offsetX?: number;
  offsetY?: number;
  inline?: boolean;
}>;

export type PillbuttonLabelMarkerMotionOptions = Readonly<{
  resizeMode: PillbuttonLabelMarkerResizeMode;
  growShrinkWidthTransitionMs: number;
  shrinkWidthTransitionDelayMs: number;
  snappyWidthTransitionMs: number;
  snappyWidthTransitionDelayMs: number;
  snappyWidthTransitionEasing: string;
}>;

type PillbuttonMountSide = PointLabelAttach;

export const pillbuttonLabelMarkerBadgeDefaults: PillbuttonLabelMarkerBadgeOptions =
  Object.freeze({
    position: undefined,
    compactBorderless: false,
    fullBorder: false,
    solidBorderStyle: undefined,
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

export const resolvePillbuttonLabelMarkerMotionOptions = (
  motionOptions?: Partial<PillbuttonLabelMarkerMotionOptions>
): PillbuttonLabelMarkerMotionOptions => ({
  ...pillbuttonLabelMarkerMotionDefaults,
  ...motionOptions,
});

const parseFontSizePx = (fontSize: CSSProperties["fontSize"]): number => {
  const parsed =
    typeof fontSize === "number" && Number.isFinite(fontSize)
      ? fontSize
      : Number.parseFloat(
          typeof fontSize === "string" && fontSize.trim().length > 0
            ? fontSize
            : "14px"
        );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

export const resolvePillbuttonLabelMarkerLayoutMetrics = ({
  fontSize,
}: {
  fontSize: CSSProperties["fontSize"];
}): PillbuttonLabelMarkerLayoutMetrics => {
  const fontSizePx = parseFontSizePx(fontSize);
  const labelHeightPx = resolvePillLabelHeightPx(
    fontSizePx,
    PILLBUTTON_LABEL_HEIGHT_EM
  );
  return {
    labelHeightPx,
    capRadiusPx: labelHeightPx / 2,
  };
};

export const resolvePillbuttonLabelMarkerLocalAnchorPoints = ({
  fontSize,
  widthPx,
}: {
  fontSize: CSSProperties["fontSize"];
  widthPx: number;
}): PillbuttonLabelMarkerAnchorPoints => {
  const labelHeightPx = resolvePillLabelHeightPx(
    parseFontSizePx(fontSize),
    PILLBUTTON_LABEL_HEIGHT_EM
  );
  const capRadiusPx = labelHeightPx / 2;
  const centerY = labelHeightPx / 2;

  return {
    left: {
      x: capRadiusPx,
      y: centerY,
    } as CssPixelPosition,
    center: {
      x: widthPx / 2,
      y: centerY,
    } as CssPixelPosition,
    right: {
      x: widthPx - capRadiusPx,
      y: centerY,
    } as CssPixelPosition,
  };
};

export const resolvePillbuttonLabelMarkerPlacedAnchorPoints = ({
  fontSize,
  widthPx,
  placement,
}: {
  fontSize: CSSProperties["fontSize"];
  widthPx: number;
  placement: PillbuttonLabelMarkerPlacement;
}): PillbuttonLabelMarkerAnchorPoints => {
  const local = resolvePillbuttonLabelMarkerLocalAnchorPoints({
    fontSize,
    widthPx,
  });

  if (placement.inline) {
    return local;
  }

  const { attach, offsetX = 0, offsetY = 0 } = placement;
  const rootOriginX =
    attach === POINT_LABEL_ATTACH.RIGHT
      ? offsetX - local.right.x
      : attach === POINT_LABEL_ATTACH.CENTER
      ? offsetX - local.center.x
      : offsetX - local.left.x;
  const rootOriginY = offsetY - local.center.y;

  return {
    left: {
      x: rootOriginX + local.left.x,
      y: rootOriginY + local.left.y,
    } as CssPixelPosition,
    center: {
      x: rootOriginX + local.center.x,
      y: rootOriginY + local.center.y,
    } as CssPixelPosition,
    right: {
      x: rootOriginX + local.right.x,
      y: rootOriginY + local.right.y,
    } as CssPixelPosition,
  };
};

const setNullableNumberStateIfChanged = (
  setState: Dispatch<SetStateAction<number | null>>,
  nextValue: number | null
) => {
  setState((previousValue) =>
    previousValue === nextValue ? previousValue : nextValue
  );
};

const setNumberStateIfChanged = (
  setState: Dispatch<SetStateAction<number>>,
  nextValue: number
) => {
  setState((previousValue) =>
    previousValue === nextValue ? previousValue : nextValue
  );
};

const resolvePillbuttonMountSide = (
  labelAttach: PointLabelAttach
): PillbuttonMountSide => labelAttach;

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

export interface PillbuttonLabelMarkerProps {
  pointId?: string;
  placement: PillbuttonLabelMarkerPlacement;
  containerStyle: CSSProperties;
  badgeStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  collapse: boolean;
  badgeContent?: React.ReactNode;
  badgeOptions?: Partial<PillbuttonLabelMarkerBadgeOptions>;
  motionOptions?: Partial<PillbuttonLabelMarkerMotionOptions>;
  content: React.ReactNode;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseEnter: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLDivElement>) => void;
}

export const PillbuttonLabelMarker = ({
  pointId,
  placement,
  containerStyle,
  badgeStyle,
  contentStyle,
  collapse,
  badgeContent,
  badgeOptions,
  motionOptions,
  content,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PillbuttonLabelMarkerProps) => {
  const { attach, inline = false, offsetX = 0, offsetY = 0 } = placement;
  const resolvedBadgeOptions =
    resolvePillbuttonLabelMarkerBadgeOptions(badgeOptions);
  const resolvedMotionOptions =
    resolvePillbuttonLabelMarkerMotionOptions(motionOptions);
  const mountSide = resolvePillbuttonMountSide(attach);
  const resolvedBadgePosition = resolvePillbuttonBadgePosition(
    mountSide,
    resolvedBadgeOptions.position
  );
  const hasBadgeContent =
    badgeContent !== undefined &&
    badgeContent !== null &&
    (typeof badgeContent !== "string" || badgeContent.trim().length > 0);
  const hasExtendedContent =
    content !== undefined &&
    content !== null &&
    (typeof content !== "string" || content.trim().length > 0);
  const showExtended = !collapse && hasExtendedContent;
  const containerBorderStyle =
    typeof containerStyle.border === "string" ? containerStyle.border : "none";
  const effectiveMarkerBorderStyle =
    resolvedBadgeOptions.fullBorder && resolvedBadgeOptions.solidBorderStyle
      ? resolvedBadgeOptions.solidBorderStyle
      : containerBorderStyle;
  const extendedBorderStyle = resolvedBadgeOptions.fullBorder
    ? effectiveMarkerBorderStyle
    : "none";
  const capsuleRef = useRef<HTMLDivElement | null>(null);
  const [capsuleWidthPx, setCapsuleWidthPx] = useState<number | null>(null);
  const shouldRenderLabelShell = showExtended || !hasBadgeContent;
  const hasStartBadge =
    hasBadgeContent &&
    resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.LEFT;
  const hasEndBadge =
    hasBadgeContent &&
    resolvedBadgePosition === PILLBUTTON_BADGE_POSITIONS.RIGHT;
  const sharedSegmentStyles: CSSProperties = {
    boxSizing: "border-box",
    minHeight: `${PILLBUTTON_LABEL_HEIGHT_EM}em`,
    whiteSpace: "nowrap",
    lineHeight: 1,
    borderRadius: `${PILLBUTTON_CAP_RADIUS_EM}em`,
    verticalAlign: "baseline",
  };
  const badgeSegmentStyles: CSSProperties = {
    ...sharedSegmentStyles,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: `${PILLBUTTON_LABEL_HEIGHT_EM}em`,
    padding: `0 ${PILLBUTTON_BADGE_HORIZONTAL_PADDING_EM}em`,
    border: resolvedBadgeOptions.compactBorderless
      ? "none"
      : effectiveMarkerBorderStyle,
    backgroundColor: containerStyle.backgroundColor,
    color: containerStyle.color,
    ...badgeStyle,
  };
  const rootLabelShellStyles: CSSProperties = {
    ...sharedSegmentStyles,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: containerStyle.backgroundColor,
    color: containerStyle.color,
    border: extendedBorderStyle,
  };
  const contentPaddingStyles: CSSProperties = {
    paddingLeft: `${hasStartBadge ? 0 : PILLBUTTON_CAP_RADIUS_EM}em`,
    paddingRight: `${hasEndBadge ? 0 : PILLBUTTON_CAP_RADIUS_EM}em`,
    ...contentStyle,
  };

  useLayoutEffect(() => {
    const el = capsuleRef.current;
    if (!el) {
      setNullableNumberStateIfChanged(setCapsuleWidthPx, null);
      return;
    }
    setNullableNumberStateIfChanged(
      setCapsuleWidthPx,
      Math.ceil(el.scrollWidth)
    );
  }, [
    content,
    badgeContent,
    badgeStyle,
    containerStyle,
    contentStyle,
    hasEndBadge,
    hasStartBadge,
    shouldRenderLabelShell,
    resolvedBadgeOptions.compactBorderless,
    resolvedBadgeOptions.fullBorder,
    effectiveMarkerBorderStyle,
  ]);

  const previousCapsuleWidthPxRef = useRef<number | null>(null);
  const [animatedCapsuleWidthPx, setAnimatedCapsuleWidthPx] = useState<
    number | null
  >(null);
  const [extendedWidthTransitionMs, setExtendedWidthTransitionMs] = useState(0);
  const [extendedWidthTransitionDelayMs, setExtendedWidthTransitionDelayMs] =
    useState(0);

  const capsuleInlineStyles: CSSProperties = {
    whiteSpace: "nowrap",
    lineHeight: 1,
    verticalAlign: "baseline",
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
  };

  useLayoutEffect(() => {
    if (
      resolvedMotionOptions.resizeMode ===
        PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE ||
      capsuleWidthPx === null
    ) {
      previousCapsuleWidthPxRef.current = null;
      setNullableNumberStateIfChanged(setAnimatedCapsuleWidthPx, null);
      setNumberStateIfChanged(setExtendedWidthTransitionMs, 0);
      setNumberStateIfChanged(setExtendedWidthTransitionDelayMs, 0);
      return;
    }

    const nextWidthPx = capsuleWidthPx;
    const previousWidthPx = previousCapsuleWidthPxRef.current;

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

    previousCapsuleWidthPxRef.current = nextWidthPx;
    setNullableNumberStateIfChanged(setAnimatedCapsuleWidthPx, nextWidthPx);
  }, [
    capsuleWidthPx,
    resolvedMotionOptions.growShrinkWidthTransitionMs,
    resolvedMotionOptions.resizeMode,
    resolvedMotionOptions.shrinkWidthTransitionDelayMs,
    resolvedMotionOptions.snappyWidthTransitionDelayMs,
    resolvedMotionOptions.snappyWidthTransitionMs,
  ]);

  const anchorTransform =
    mountSide === POINT_LABEL_ATTACH.RIGHT
      ? `translate(calc(-100% + ${PILLBUTTON_CAP_RADIUS_EM}em), -50%)`
      : mountSide === POINT_LABEL_ATTACH.CENTER
      ? "translate(-50%, -50%)"
      : `translate(${-PILLBUTTON_CAP_RADIUS_EM}em, -50%)`;

  const rootPositionStyles: CSSProperties = inline
    ? {
        position: "relative",
      }
    : {
        position: "absolute",
        left: `${offsetX}px`,
        top: `${offsetY}px`,
        transform: anchorTransform,
      };

  return (
    <div
      ref={capsuleRef}
      data-point-label-interactive="true"
      data-point-label-id={pointId}
      data-pillbutton-root="true"
      data-pillbutton-label-shell={shouldRenderLabelShell ? "true" : undefined}
      style={{
        ...containerStyle,
        ...capsuleInlineStyles,
        ...(shouldRenderLabelShell ? rootLabelShellStyles : {}),
        padding: 0,
        display: shouldRenderLabelShell ? "inline-flex" : "inline-block",
        fontVariantNumeric: "tabular-nums lining-nums",
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        lineHeight: 1,
        verticalAlign: "baseline",
        ...rootPositionStyles,
        width:
          resolvedMotionOptions.resizeMode !==
            PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE &&
          animatedCapsuleWidthPx !== null
            ? `${animatedCapsuleWidthPx}px`
            : undefined,
        overflow:
          resolvedMotionOptions.resizeMode !==
          PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE
            ? "hidden"
            : "visible",
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasStartBadge ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-badge="true"
          data-pillbutton-badge-slot="start"
          style={badgeSegmentStyles}
        >
          {badgeContent}
        </span>
      ) : null}
      {shouldRenderLabelShell ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-content="true"
          data-pillbutton-segment="content"
          style={contentPaddingStyles}
        >
          {content}
        </span>
      ) : null}
      {hasEndBadge ? (
        <span
          className={DEFAULT_ANNOTATION_TYPOGRAPHY_CLASSNAME}
          data-pillbutton-badge="true"
          data-pillbutton-badge-slot="end"
          style={badgeSegmentStyles}
        >
          {badgeContent}
        </span>
      ) : null}
    </div>
  );
};
