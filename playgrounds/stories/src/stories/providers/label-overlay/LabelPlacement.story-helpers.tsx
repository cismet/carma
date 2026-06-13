import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { DraggableDebugAnchor } from "@carma-commons/interaction/drag";
import {
  computePolygonSegmentLabelPlacements,
  createScreenPointSvgLineVisualizers,
  POLYGON_SEGMENT_LABEL_ROTATION_MODE,
  resolveLineLabelPlacement,
  resolveLineLabelPlacementWithReference,
  POLYGON_SEGMENT_LABEL_SIDE,
  POLYGON_SEGMENT_LABEL_WINDING_POLICY,
  type PolygonSegmentLabelSide,
  type PolygonSegmentLabelWindingOrder,
  type SvgLineCapStyle,
  type SvgLineLabelDominantBaseline,
  type SvgLineLabelRotationMode,
} from "@carma-commons/svg";
import {
  LabelOverlayProvider,
  useLabelOverlayHost,
  useLineVisualizers,
} from "@carma-providers/label-overlay";
import {
  radToDegNumeric,
  type CssPixels,
  type CssPixelPosition,
  type Radians,
} from "@carma-units";
import { buildDistanceTriangleLineLabelReferences } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY,
  ANNOTATION_THEME,
  applyLineLabel,
  applySecondaryLineLabelPlacementStrategy,
  annotationOverlayDefaults,
  createSegmentLineLabels,
  hideLineLabels,
  annotationLineLabelDefaults,
  resolveDistanceTriangleComponentLabelVisibility,
  type AnnotationLineLabelCollisionResolutionStrategy,
  type AnnotationThemeStyle,
} from "@carma-mapping/annotations/runtime";
import barmenBackgroundUrl from "./assets/barmen-background.png";

import { CenteredStoryFrame } from "../../common/ui/centered-story-frame";
const plotFrameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "calc(100vh - 120px)",
  minHeight: 560,
  overflow: "hidden",
  background: "#fff",
};

const distanceTriangleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 20,
  alignItems: "stretch",
};

const distanceTrianglePanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const distanceTrianglePanelTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#475569",
};

const distanceTrianglePanelMetaStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: "#64748b",
};

const distanceTrianglePanelFrameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: 260,
  height: 300,
  overflow: "hidden",
};

const distanceTriangleSvgStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "visible",
  pointerEvents: "none",
  zIndex: 1,
};

const distanceTriangleDefaultsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 8,
  padding: "14px 16px",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 10,
  background: "rgba(255, 255, 255, 0.82)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

const distanceTriangleDefaultsSectionStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const distanceTriangleDefaultsSectionTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#475569",
};

const distanceTriangleDefaultsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 148px) minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
  fontSize: 12,
  lineHeight: 1.35,
};

const distanceTriangleDefaultsKeyStyle: CSSProperties = {
  color: "#475569",
};

const distanceTriangleDefaultsValueStyle: CSSProperties = {
  color: "#0f172a",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  overflowWrap: "anywhere",
};

const lineLabelTableStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "fit-content",
  maxWidth: "100%",
  background: "transparent",
};

const lineLabelTableRowStyle: CSSProperties = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.24)",
};

const lineLabelTableRowCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
  padding: "6px 0",
};

const lineLabelTableLabelCellStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  textAlign: "left",
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.25,
  padding: 0,
};

const lineLabelTableSampleCellStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
  flex: "0 0 auto",
  minWidth: 0,
  maxWidth: "100%",
  height: 64,
  padding: "4px 0",
  marginLeft: "auto",
  whiteSpace: "nowrap",
};

const lineLabelComponentViewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: 52,
  height: 56,
  overflow: "hidden",
};

const singleLineCollisionObstacleStyle: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  padding: "8px 14px",
  borderRadius: 999,
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
  userSelect: "none",
  pointerEvents: "none",
};

const singleLineCollisionPrimaryObstacleStyle: CSSProperties = {
  ...singleLineCollisionObstacleStyle,
  background: "rgba(59, 130, 246, 0.95)",
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
};

const singleLineCollisionSecondaryObstacleStyle: CSSProperties = {
  ...singleLineCollisionObstacleStyle,
  background: "rgba(255, 255, 255, 0.95)",
  border: "1px solid rgba(59, 130, 246, 0.18)",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
};

const DISTANCE_TRIANGLE_DASH_PATTERN = "8 8";

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const formatStatusNumber = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const toLayoutRect = (domRect: DOMRect) => ({
  left: domRect.left,
  top: domRect.top,
  right: domRect.right,
  bottom: domRect.bottom,
});

const useContainerSize = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
};

const LabelAnchorAngleDebug = ({
  placement,
  color,
}: {
  placement: { textX: CssPixels; textY: CssPixels; angleRad: Radians } | null;
  color: string;
}) => {
  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;
  if (!placement) {
    return null;
  }

  const angleLengthPx = 64;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: 16,
          height: 16,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 18,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: hairlinePx,
            height: "100%",
            transform: "translateX(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            width: "100%",
            height: hairlinePx,
            transform: "translateY(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: angleLengthPx,
          height: hairlinePx,
          transform: `translateY(-50%) rotate(${placement.angleRad}rad)`,
          transformOrigin: "0 50%",
          backgroundColor: color,
          opacity: 0.7,
          pointerEvents: "none",
          zIndex: 18,
        }}
      />
    </>
  );
};

type SingleLineStoryArgs = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  hitTargetStrokeWidth: number;
  dashed: boolean;
  capStyle: SvgLineCapStyle;
  dashLengthRatio: number;
  dashGapRatio: number;
  collapseNegativeGaps: boolean;
  collapseCapThresholdEffectiveGapRatio: number;
  showDistanceLabel: boolean;
  labelText: string;
  labelColor: string;
  labelStroke: string;
  labelFontSize: number;
  labelFontFamily: string;
  labelFontWeight: string;
  labelPill: boolean;
  labelPillBackgroundColor: string;
  labelPillBorderColor: string;
  labelPillBorderWidth: number;
  labelMinLineLengthPx: number;
  labelOffsetPx: number;
  labelFlippedBaselineOffsetPx: number;
  labelRotationMode: SvgLineLabelRotationMode;
  labelDominantBaseline: SvgLineLabelDominantBaseline;
  visible: boolean;
  isHidden: boolean;
  contentSignature: string;
};

export type SingleLineCollisionStrategyStoryArgs = {
  labelText: string;
  allowEarlyRemoval: boolean;
  collisionResolutionStrategy: AnnotationLineLabelCollisionResolutionStrategy;
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
};

export type LabelPlacementStoryArgs = SingleLineStoryArgs & {
  polygonSidePreference?: PolygonSegmentLabelSide;
};

export const DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES = {
  BARMEN: "barmen",
  PLAIN: "plain",
  CHECKERBOARD: "checkerboard",
  URBAN: "urban",
  CUSTOM: "custom",
} as const;

export type DistanceTriangleOverlayBackgroundMode =
  (typeof DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES)[keyof typeof DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES];

export type DistanceTriangleOverlayStoryArgs = {
  backgroundMode?: DistanceTriangleOverlayBackgroundMode;
  dashed?: boolean;
  themeStyle?: AnnotationThemeStyle;
  showDefaultsPanel?: boolean;
  customBackgroundLayer1?: string;
  customBackgroundLayer2?: string;
  customBackgroundLayer3?: string;
  customBackgroundLayer4?: string;
  customBackgroundBlendMode?: string;
};

export type LineLabelComponentStoryArgs = {
  backgroundMode?: DistanceTriangleOverlayBackgroundMode;
  themeStyle?: AnnotationThemeStyle;
  fontFamily?: string;
  fontWeight?: string | number;
  showBackdrop?: boolean;
};

type DistanceTrianglePreset = {
  id: string;
  title: string;
  coordinateSpace?: "relative" | "absolute";
  anchor: { x: number; y: number };
  aux: { x: number; y: number };
  target: { x: number; y: number };
};

type LineLabelComponentRow = {
  id: string;
  label: string;
  text: string;
  fontSizePx: number;
  themeStyle?: AnnotationThemeStyle;
  showBackdrop?: boolean;
};

const distanceTrianglePresets: readonly DistanceTrianglePreset[] = [
  {
    id: "short-vertical-left",
    title: "short equal components left",
    coordinateSpace: "absolute",
    anchor: { x: 164, y: 94 },
    aux: { x: 164, y: 114 },
    target: { x: 184, y: 114 },
  },
  {
    id: "short-vertical-right",
    title: "short equal components right",
    coordinateSpace: "absolute",
    anchor: { x: 196, y: 94 },
    aux: { x: 196, y: 114 },
    target: { x: 176, y: 114 },
  },
  {
    id: "20px-components",
    title: "long vertical · horizontal 1",
    coordinateSpace: "absolute",
    anchor: { x: 180, y: 54 },
    aux: { x: 180, y: 246 },
    target: { x: 181, y: 246 },
  },
  {
    id: "tall vertical left",
    title: "tall vertical centered",
    coordinateSpace: "absolute",
    anchor: { x: 122, y: 42 },
    aux: { x: 122, y: 242 },
    target: { x: 282, y: 242 },
  },
  {
    id: "long-horizontal-vertical-5",
    title: "long horizontal · vertical 1",
    coordinateSpace: "absolute",
    anchor: { x: 58, y: 148 },
    aux: { x: 58, y: 149 },
    target: { x: 302, y: 149 },
  },
  {
    id: "inverted diagonal",
    title: "inverted diagonal centered",
    coordinateSpace: "absolute",
    anchor: { x: 126, y: 244 },
    aux: { x: 126, y: 82 },
    target: { x: 294, y: 82 },
  },
] as const;

const lineLabelComponentRows: readonly LineLabelComponentRow[] = [
  {
    id: "line-label-metric",
    label: "metric short",
    text: "168,00 m",
    fontSizePx: 14,
  },
  {
    id: "line-label-route",
    label: "route long",
    text: "route 602 toward Barmen Rathaus",
    fontSizePx: 14,
  },
  {
    id: "line-label-large",
    label: "large selected",
    text: "selected segment label",
    fontSizePx: 18,
  },
  {
    id: "line-label-plain-dark",
    label: "dark on bright",
    text: "platform edge",
    fontSizePx: 14,
    themeStyle: ANNOTATION_THEME.style.DARK_ON_BRIGHT,
  },
  {
    id: "line-label-no-backdrop",
    label: "text only",
    text: "without backdrop shell",
    fontSizePx: 14,
    showBackdrop: false,
  },
] as const;

type StoryLineLabelPlacement = {
  textX: CssPixels;
  textY: CssPixels;
  angleRad: Radians;
};

type SingleLineCollisionStrategyStatus = {
  visible: boolean;
  anchorRatio: number | null;
  collisionCount: number;
};

const scalePresetPoint = (
  width: number,
  height: number,
  point: { x: number; y: number },
  coordinateSpace: "relative" | "absolute"
) =>
  toCssPixelPosition(
    coordinateSpace === "absolute" ? point.x : width * point.x,
    coordinateSpace === "absolute" ? point.y : height * point.y
  );

const resolveDistanceTriangleLengthLabel = (
  start: CssPixelPosition,
  end: CssPixelPosition
) => `${Math.hypot(end.x - start.x, end.y - start.y).toFixed(2)}`;

const resolveAnnotationLineLabelTextElement = (element: HTMLDivElement) =>
  element.querySelector(
    '[data-annotation-overlay-line-label-text="true"]'
  ) as HTMLSpanElement | null;

const applyStoryLineLabel = ({
  element,
  text,
  placement,
  fontSizePx,
  visible,
}: {
  element: HTMLDivElement;
  text: string;
  placement: StoryLineLabelPlacement | null;
  fontSizePx: number;
  visible: boolean;
}) => {
  const textElement = resolveAnnotationLineLabelTextElement(element);
  if (textElement) {
    textElement.textContent = text;
    textElement.style.fontSize = `${fontSizePx}px`;
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-font-size",
      `${fontSizePx}px`
    );
  } else {
    element.textContent = text;
  }

  if (!visible || !placement || text.trim().length === 0) {
    element.style.display = "none";
    return;
  }

  element.style.display = "block";
  element.style.transform = `translate(${Math.round(
    placement.textX
  )}px, ${Math.round(placement.textY)}px) translate(-50%, -50%) rotate(${
    placement.angleRad
  }rad)`;
};

const resolveDistanceTrianglePanelFrameStyle = (
  args: DistanceTriangleOverlayStoryArgs
): CSSProperties => {
  const mode = args.backgroundMode;
  if (mode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CHECKERBOARD) {
    return {
      ...distanceTrianglePanelFrameStyle,
      background: [
        "linear-gradient(45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
        "linear-gradient(-45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
        "linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
        "linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
        "#f8fafc",
      ].join(", "),
      backgroundSize: "24px 24px",
      backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
    };
  }

  if (mode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.URBAN) {
    return {
      ...distanceTrianglePanelFrameStyle,
      background: [
        "radial-gradient(circle at 18% 22%, rgba(184, 142, 104, 0.24) 0%, rgba(184, 142, 104, 0) 34%)",
        "radial-gradient(circle at 76% 28%, rgba(120, 104, 89, 0.16) 0%, rgba(120, 104, 89, 0) 38%)",
        "radial-gradient(circle at 62% 78%, rgba(148, 122, 98, 0.2) 0%, rgba(148, 122, 98, 0) 30%)",
        "linear-gradient(135deg, #d7d0c6 0%, #bdb4aa 26%, #8f8479 52%, #716b67 76%, #d4d0cb 100%)",
      ].join(", "),
      backgroundBlendMode: "normal, normal, normal, multiply",
    };
  }

  if (mode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CUSTOM) {
    const backgroundLayers = [
      args.customBackgroundLayer1,
      args.customBackgroundLayer2,
      args.customBackgroundLayer3,
      args.customBackgroundLayer4,
    ].filter(
      (layer): layer is string =>
        typeof layer === "string" && layer.trim().length > 0
    );

    return {
      ...distanceTrianglePanelFrameStyle,
      background:
        backgroundLayers.length > 0
          ? backgroundLayers.join(", ")
          : "transparent",
      backgroundBlendMode: args.customBackgroundBlendMode?.trim() || undefined,
    };
  }

  if (mode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.PLAIN) {
    return {
      ...distanceTrianglePanelFrameStyle,
      background: "transparent",
    };
  }

  return {
    ...distanceTrianglePanelFrameStyle,
    backgroundImage: `url(${barmenBackgroundUrl})`,
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
};

const readDistanceTriangleStoryBackground = (
  mode: DistanceTriangleOverlayBackgroundMode | undefined
): string => {
  return "#f8fafc";
};

const readDistanceTriangleStoryBackgroundStyle = (
  mode: DistanceTriangleOverlayBackgroundMode | undefined
): CSSProperties | undefined => undefined;

const LineLabelComponentSample = ({
  row,
  args,
}: {
  row: LineLabelComponentRow;
  args: LineLabelComponentStoryArgs;
}) => {
  const resolvedTheme =
    row.themeStyle ?? args.themeStyle ?? ANNOTATION_THEME.style.BRIGHT_ON_DARK;
  const showBackdrop = row.showBackdrop ?? args.showBackdrop ?? true;
  const fontFamily =
    args.fontFamily ?? annotationLineLabelDefaults.text.fontFamily;
  const fontWeight =
    args.fontWeight ?? annotationLineLabelDefaults.text.fontWeight;
  const sampleRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<ReturnType<typeof createSegmentLineLabels> | null>(
    null
  );

  useEffect(() => {
    const sample = sampleRef.current;
    if (!sample) {
      return;
    }

    const labels = createSegmentLineLabels({
      appearance: {
        themeStyle: resolvedTheme,
      },
      background: {
        showBackdrop,
      },
      text: {
        fontFamily,
        fontWeight,
      },
    });
    labelsRef.current = labels;
    sample.append(labels.direct);

    return () => {
      hideLineLabels(labels);
      labels.direct.remove();
      labels.vertical.remove();
      labels.horizontal.remove();
      labelsRef.current = null;
    };
  }, [fontFamily, fontWeight, resolvedTheme, showBackdrop]);

  useEffect(() => {
    const label = labelsRef.current?.direct;
    if (!label) {
      return;
    }

    label.style.setProperty(
      "--carma-annotation-text-overlay-font-size",
      `${row.fontSizePx}px`
    );
    applyLineLabel({
      element: label,
      text: row.text,
      start: { x: 18, y: 28 },
      end: { x: 318, y: 28 },
      outsideReferencePoint: { x: 168, y: 4 },
    });
  }, [
    fontFamily,
    fontWeight,
    resolvedTheme,
    row.fontSizePx,
    row.text,
    showBackdrop,
  ]);

  return (
    <div
      ref={sampleRef}
      style={{
        ...lineLabelComponentViewportStyle,
        ...resolveDistanceTrianglePanelFrameStyle({
          backgroundMode:
            args.backgroundMode ??
            DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
        }),
        minHeight: 52,
        height: 56,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          top: "50%",
          borderTop: "1px dashed rgba(100, 116, 139, 0.36)",
          transform: "translateY(-50%)",
        }}
      />
    </div>
  );
};

const DistanceTriangleDefaultsPanel = ({
  args,
}: {
  args: DistanceTriangleOverlayStoryArgs;
}) => {
  const runtimeDefaults = [
    ["lineStrokeWidthPx", String(annotationOverlayDefaults.lineStrokeWidthPx)],
    ["layerZIndex", annotationOverlayDefaults.layerZIndex],
    [
      "lineLabelOffsetPx",
      String(annotationOverlayDefaults.lineLabelOffsetPx),
    ],
    [
      "lineLabelMinLengthPx",
      String(annotationOverlayDefaults.lineLabelMinLengthPx),
    ],
    [
      "geometryEpsilonMeters",
      String(annotationOverlayDefaults.geometryEpsilonMeters),
    ],
    ["directLineColor", annotationOverlayDefaults.directLineColor],
    ["verticalLineColor", annotationOverlayDefaults.verticalLineColor],
    ["horizontalLineColor", annotationOverlayDefaults.horizontalLineColor],
    ["draftChainColor", annotationOverlayDefaults.draftChainColor],
  ] as const;

  const lineLabelDefaults = [
    ["text.fontFamily", annotationLineLabelDefaults.text.fontFamily],
    ["text.fontWeight", String(annotationLineLabelDefaults.text.fontWeight)],
    ["background.style", annotationLineLabelDefaults.background.style],
    [
      "appearance.themeStyle",
      annotationLineLabelDefaults.appearance.themeStyle,
    ],
    [
      "collision.allowEarlyRemoval",
      String(annotationLineLabelDefaults.collision.allowEarlyRemoval),
    ],
    [
      "collision.resolutionStrategy",
      annotationLineLabelDefaults.collision.resolutionStrategy,
    ],
    [
      "collision.anchorSlideStepRatio",
      String(annotationLineLabelDefaults.collision.anchorSlideStepRatio),
    ],
    [
      "collision.maxAnchorSlideDeltaRatio",
      String(annotationLineLabelDefaults.collision.maxAnchorSlideDeltaRatio),
    ],
    [
      "position.shortEdgeOffsetPx",
      String(annotationLineLabelDefaults.layout.shortEdgeOffsetPx),
    ],
  ] as const;

  const storyDefaults = [
    [
      "backgroundMode",
      String(
        args.backgroundMode ?? DISTANCE_TRIANGLE_OVERLAY_ARGS.backgroundMode
      ),
    ],
    ["dashed", String(args.dashed ?? DISTANCE_TRIANGLE_OVERLAY_ARGS.dashed)],
    [
      "themeStyle",
      String(args.themeStyle ?? DISTANCE_TRIANGLE_OVERLAY_ARGS.themeStyle),
    ],
  ] as const;

  return (
    <section style={distanceTrianglePanelStyle}>
      <div style={distanceTrianglePanelTitleStyle}>shared runtime defaults</div>
      <div style={distanceTrianglePanelMetaStyle}>
        Complete default parameter snapshot for the current distance-triangle
        preview path.
      </div>
      <div style={distanceTriangleDefaultsGridStyle}>
        <div style={distanceTriangleDefaultsSectionStyle}>
          <div style={distanceTriangleDefaultsSectionTitleStyle}>
            annotationOverlayDefaults
          </div>
          {runtimeDefaults.map(([key, value]) => (
            <div key={key} style={distanceTriangleDefaultsRowStyle}>
              <div style={distanceTriangleDefaultsKeyStyle}>{key}</div>
              <div style={distanceTriangleDefaultsValueStyle}>{value}</div>
            </div>
          ))}
        </div>
        <div style={distanceTriangleDefaultsSectionStyle}>
          <div style={distanceTriangleDefaultsSectionTitleStyle}>
            annotationLineLabelDefaults
          </div>
          {lineLabelDefaults.map(([key, value]) => (
            <div key={key} style={distanceTriangleDefaultsRowStyle}>
              <div style={distanceTriangleDefaultsKeyStyle}>{key}</div>
              <div style={distanceTriangleDefaultsValueStyle}>{value}</div>
            </div>
          ))}
        </div>
        <div style={distanceTriangleDefaultsSectionStyle}>
          <div style={distanceTriangleDefaultsSectionTitleStyle}>
            story defaults
          </div>
          {storyDefaults.map(([key, value]) => (
            <div key={key} style={distanceTriangleDefaultsRowStyle}>
              <div style={distanceTriangleDefaultsKeyStyle}>{key}</div>
              <div style={distanceTriangleDefaultsValueStyle}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const DistanceTriangleOverlayPanel = ({
  preset,
  args,
}: {
  preset: DistanceTrianglePreset;
  args: DistanceTriangleOverlayStoryArgs;
}) => {
  const dashed = args.dashed ?? true;
  const themeStyle = args.themeStyle ?? ANNOTATION_THEME.style.BRIGHT_ON_DARK;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<ReturnType<typeof createSegmentLineLabels> | null>(
    null
  );
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(panelRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 360;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 300;

  const defaults = useMemo(
    () => ({
      anchor: scalePresetPoint(
        resolvedWidth,
        resolvedHeight,
        preset.anchor,
        preset.coordinateSpace ?? "relative"
      ),
      aux: scalePresetPoint(
        resolvedWidth,
        resolvedHeight,
        preset.aux,
        preset.coordinateSpace ?? "relative"
      ),
      target: scalePresetPoint(
        resolvedWidth,
        resolvedHeight,
        preset.target,
        preset.coordinateSpace ?? "relative"
      ),
    }),
    [
      preset.anchor,
      preset.aux,
      preset.coordinateSpace,
      preset.target,
      resolvedHeight,
      resolvedWidth,
    ]
  );

  const [anchor, setAnchor] = useState<CssPixelPosition>(defaults.anchor);
  const [aux, setAux] = useState<CssPixelPosition>(defaults.aux);
  const [target, setTarget] = useState<CssPixelPosition>(defaults.target);

  useEffect(() => {
    setAnchor(defaults.anchor);
    setAux(defaults.aux);
    setTarget(defaults.target);
  }, [defaults]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const labels = createSegmentLineLabels({
      appearance: {
        themeStyle,
      },
    });
    labelsRef.current = labels;
    panel.append(labels.direct, labels.vertical, labels.horizontal);

    return () => {
      hideLineLabels(labels);
      labels.direct.remove();
      labels.vertical.remove();
      labels.horizontal.remove();
      labelsRef.current = null;
    };
  }, [themeStyle]);

  useEffect(() => {
    const labels = labelsRef.current;
    if (!labels) {
      return;
    }

    const references = buildDistanceTriangleLineLabelReferences({
      anchor,
      target,
      aux,
      anchorAltitudeMeters: resolvedHeight - anchor.y,
      targetAltitudeMeters: resolvedHeight - target.y,
    });
    const directLabelText = resolveDistanceTriangleLengthLabel(anchor, target);
    const verticalLabelText = resolveDistanceTriangleLengthLabel(anchor, aux);
    const horizontalLabelText = resolveDistanceTriangleLengthLabel(aux, target);
    const componentLabelVisibility =
      resolveDistanceTriangleComponentLabelVisibility({
        directLabelText,
        verticalLabelText,
        horizontalLabelText,
      });

    applyLineLabel({
      element: labels.direct,
      text: directLabelText,
      start: anchor,
      end: target,
      outsideReferencePoint: references.directOutsideReferencePoint,
    });

    if (componentLabelVisibility.showVerticalLabel) {
      applyLineLabel({
        element: labels.vertical,
        text: verticalLabelText,
        start: anchor,
        end: aux,
        outsideReferencePoint: references.verticalOutsideReferencePoint,
        flipReadingDirection: true,
      });
    } else {
      labels.vertical.style.display = "none";
    }

    if (componentLabelVisibility.showHorizontalLabel) {
      applyLineLabel({
        element: labels.horizontal,
        text: horizontalLabelText,
        start: aux,
        end: target,
        outsideReferencePoint: references.horizontalOutsideReferencePoint,
      });
    } else {
      labels.horizontal.style.display = "none";
    }
  }, [anchor, aux, resolvedHeight, target]);

  return (
    <section style={distanceTrianglePanelStyle}>
      <div style={distanceTrianglePanelTitleStyle}>{preset.title}</div>
      <div ref={panelRef} style={resolveDistanceTrianglePanelFrameStyle(args)}>
        <svg width="100%" height="100%" style={distanceTriangleSvgStyle}>
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={target.x}
            y2={target.y}
            stroke={annotationOverlayDefaults.directLineColor}
            strokeWidth={2}
            strokeDasharray={
              dashed ? DISTANCE_TRIANGLE_DASH_PATTERN : undefined
            }
            strokeLinecap="round"
          />
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={aux.x}
            y2={aux.y}
            stroke={annotationOverlayDefaults.verticalLineColor}
            strokeWidth={2}
            strokeDasharray={
              dashed ? DISTANCE_TRIANGLE_DASH_PATTERN : undefined
            }
            strokeLinecap="round"
          />
          <line
            x1={aux.x}
            y1={aux.y}
            x2={target.x}
            y2={target.y}
            stroke={annotationOverlayDefaults.horizontalLineColor}
            strokeWidth={2}
            strokeDasharray={
              dashed ? DISTANCE_TRIANGLE_DASH_PATTERN : undefined
            }
            strokeLinecap="round"
          />
        </svg>
        <DraggableDebugAnchor
          anchorId={`${preset.id}-anchor`}
          position={anchor}
          color="#1d4ed8"
          containerRef={panelRef}
          onChange={setAnchor}
        />
        <DraggableDebugAnchor
          anchorId={`${preset.id}-aux`}
          position={aux}
          color="#1d4ed8"
          containerRef={panelRef}
          onChange={setAux}
        />
        <DraggableDebugAnchor
          anchorId={`${preset.id}-target`}
          position={target}
          color="#1d4ed8"
          containerRef={panelRef}
          onChange={setTarget}
        />
      </div>
    </section>
  );
};

const TrianglePlacementToggle = ({
  a,
  b,
  c,
  sidePreference,
  windingOrder,
  onToggleSidePreference,
}: {
  a: CssPixelPosition;
  b: CssPixelPosition;
  c: CssPixelPosition;
  sidePreference: PolygonSegmentLabelSide;
  windingOrder: PolygonSegmentLabelWindingOrder;
  onToggleSidePreference: () => void;
}) => {
  const pointList = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "auto",
        zIndex: 16,
      }}
    >
      <polygon
        points={pointList}
        fill="rgba(249, 115, 22, 0.5)"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleSidePreference();
        }}
      />
      <text
        x={(a.x + b.x + c.x) / 3}
        y={(a.y + b.y + c.y) / 3}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111827"
        fontSize={12}
        fontFamily="monospace"
        pointerEvents="none"
      >
        {`${windingOrder.toUpperCase()} • ${sidePreference}`}
      </text>
    </svg>
  );
};

const SingleLineLabelDebugOverlay = ({
  containerRef,
  args,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  args: SingleLineStoryArgs;
}) => {
  const labelRef = useRef<ReturnType<typeof createSegmentLineLabels> | null>(
    null
  );
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.44),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.56),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults]);

  const labelPlacement = useMemo(
    () => resolveLineLabelPlacement({ start, end, offsetPx: 14 }),
    [end, start]
  );
  const lineDx = end.x - start.x;
  const lineDy = end.y - start.y;
  const lineLengthPx = Math.hypot(lineDx, lineDy);
  const lineAngleDeg = radToDegNumeric(Math.atan2(lineDy, lineDx) as Radians)!;
  const statusValues = useMemo(
    () => [
      `start (${formatStatusNumber(start.x, 1)}, ${formatStatusNumber(
        start.y,
        1
      )})`,
      `end (${formatStatusNumber(end.x, 1)}, ${formatStatusNumber(end.y, 1)})`,
      `length ${formatStatusNumber(lineLengthPx, 1)}px`,
      `lineAngle ${formatStatusNumber(lineAngleDeg, 1)}°`,
      `labelAngle ${
        labelPlacement
          ? `${formatStatusNumber(
              radToDegNumeric(labelPlacement.angleRad)!,
              1
            )}°`
          : "n/a"
      }`,
    ],
    [end.x, end.y, labelPlacement, lineAngleDeg, lineLengthPx, start.x, start.y]
  );

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "single-line-label-debug",
        start,
        end,
        stroke: args.stroke,
        strokeWidth: args.strokeWidth,
        opacity: args.opacity,
        hitTargetStrokeWidth: args.hitTargetStrokeWidth,
        dashed: args.dashed,
        capStyle: args.capStyle,
        dashLengthRatio: args.dashLengthRatio,
        dashGapRatio: args.dashGapRatio,
        collapseNegativeGaps: args.collapseNegativeGaps,
        collapseCapThresholdEffectiveGapRatio:
          args.collapseCapThresholdEffectiveGapRatio,
        visible: args.visible,
        isHidden: args.isHidden,
        contentSignature:
          args.contentSignature.trim().length > 0
            ? args.contentSignature
            : undefined,
      }),
    ],
    [args, end, start]
  );

  useLineVisualizers(lines, true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const labels = createSegmentLineLabels({
      appearance: {
        themeStyle: ANNOTATION_THEME.style.BRIGHT_ON_DARK,
      },
      text: {
        fontFamily: args.labelFontFamily,
        fontWeight: args.labelFontWeight,
      },
    });
    labelRef.current = labels;
    container.append(labels.direct);

    return () => {
      labels.direct.remove();
      labels.vertical.remove();
      labels.horizontal.remove();
      labelRef.current = null;
    };
  }, [args.labelFontFamily, args.labelFontWeight, containerRef]);

  useEffect(() => {
    const labelElement = labelRef.current?.direct;
    if (!labelElement) {
      return;
    }

    applyStoryLineLabel({
      element: labelElement,
      text: args.labelText,
      placement: labelPlacement,
      fontSizePx: args.labelFontSize,
      visible: args.visible && !args.isHidden,
    });
  }, [
    args.isHidden,
    args.labelFontSize,
    args.labelText,
    args.visible,
    labelPlacement,
  ]);

  return (
    <>
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableDebugAnchor
        anchorId="single-line-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableDebugAnchor
        anchorId="single-line-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
    </>
  );
};

const PolygonSegmentLabelDebugOverlay = ({
  containerRef,
  requestedSidePreference,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  requestedSidePreference: PolygonSegmentLabelSide;
}) => {
  const labelRef = useRef<ReturnType<typeof createSegmentLineLabels> | null>(
    null
  );
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.36),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.46),
      apex: toCssPixelPosition(resolvedWidth * 0.56, resolvedHeight * 0.2),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);
  const [apex, setApex] = useState<CssPixelPosition>(defaults.apex);
  const [sidePreference, setSidePreference] = useState<PolygonSegmentLabelSide>(
    requestedSidePreference
  );

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
    setApex(defaults.apex);
  }, [defaults]);

  useEffect(() => {
    setSidePreference(requestedSidePreference);
  }, [requestedSidePreference]);

  const primarySegmentLabelPlacement = useMemo(
    () =>
      computePolygonSegmentLabelPlacements({
        polygon: [start, end, apex],
        closed: true,
        side: sidePreference,
        offsetPx: 72,
        rotationMode: POLYGON_SEGMENT_LABEL_ROTATION_MODE.READABLE,
        windingPolicy: POLYGON_SEGMENT_LABEL_WINDING_POLICY.RESPECT_INPUT,
      }).find((placement) => placement.segmentIndex === 0) ?? null,
    [apex, end, sidePreference, start]
  );

  const labelPlacement = useMemo(() => {
    if (!primarySegmentLabelPlacement) {
      return null;
    }

    return resolveLineLabelPlacementWithReference({
      start,
      end,
      targetReferencePoint:
        sidePreference === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
          ? primarySegmentLabelPlacement.outsideReferencePoint
          : primarySegmentLabelPlacement.insideReferencePoint,
      offsetPx: 14,
    });
  }, [end, primarySegmentLabelPlacement, sidePreference, start]);

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-0",
        start,
        end,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
        getLabelOutsideReferencePoint:
          sidePreference === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
            ? () => primarySegmentLabelPlacement?.outsideReferencePoint ?? null
            : undefined,
        getLabelInsideReferencePoint:
          sidePreference === POLYGON_SEGMENT_LABEL_SIDE.INSIDE
            ? () => primarySegmentLabelPlacement?.insideReferencePoint ?? null
            : undefined,
      }),
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-1",
        start: end,
        end: apex,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
      }),
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-2",
        start: apex,
        end: start,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
      }),
    ],
    [
      apex,
      end,
      primarySegmentLabelPlacement?.insideReferencePoint,
      primarySegmentLabelPlacement?.outsideReferencePoint,
      sidePreference,
      start,
    ]
  );

  useLineVisualizers(lines, true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const labels = createSegmentLineLabels({
      appearance: {
        themeStyle: ANNOTATION_THEME.style.BRIGHT_ON_DARK,
      },
    });
    labelRef.current = labels;
    container.append(labels.direct);

    return () => {
      labels.direct.remove();
      labels.vertical.remove();
      labels.horizontal.remove();
      labelRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    const labelElement = labelRef.current?.direct;
    if (!labelElement) {
      return;
    }

    applyStoryLineLabel({
      element: labelElement,
      text: `triangle edge (${sidePreference})`,
      placement: labelPlacement,
      fontSizePx: 14,
      visible: primarySegmentLabelPlacement !== null,
    });
  }, [labelPlacement, primarySegmentLabelPlacement, sidePreference]);

  return (
    <>
      {primarySegmentLabelPlacement ? (
        <TrianglePlacementToggle
          a={start}
          b={end}
          c={apex}
          sidePreference={sidePreference}
          windingOrder={primarySegmentLabelPlacement.resolvedWindingOrder}
          onToggleSidePreference={() =>
            setSidePreference((previous) =>
              previous === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
                ? POLYGON_SEGMENT_LABEL_SIDE.INSIDE
                : POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
            )
          }
        />
      ) : null}
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-apex"
        position={apex}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setApex}
      />
    </>
  );
};

const DEFAULT_SINGLE_LINE_COLLISION_STRATEGY_STATUS: SingleLineCollisionStrategyStatus =
  {
    visible: false,
    anchorRatio: null,
    collisionCount: 0,
  };

const SingleLineCollisionStrategyDebugOverlay = ({
  containerRef,
  args,
  onStatusChange,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  args: SingleLineCollisionStrategyStoryArgs;
  onStatusChange: (status: SingleLineCollisionStrategyStatus) => void;
}) => {
  const labelRef = useRef<ReturnType<typeof createSegmentLineLabels> | null>(
    null
  );
  const primaryObstacleRef = useRef<HTMLDivElement | null>(null);
  const secondaryObstacleRef = useRef<HTMLDivElement | null>(null);
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.18, resolvedHeight * 0.46),
      end: toCssPixelPosition(resolvedWidth * 0.82, resolvedHeight * 0.58),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults]);

  const obstacleLayout = useMemo(
    () => ({
      primary: toCssPixelPosition(resolvedWidth * 0.49, resolvedHeight * 0.43),
      secondary: toCssPixelPosition(
        resolvedWidth * 0.62,
        resolvedHeight * 0.585
      ),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "single-line-collision-strategy-debug",
        start,
        end,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        opacity: 1,
        hitTargetStrokeWidth: 12,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1.5,
        collapseNegativeGaps: true,
        collapseCapThresholdEffectiveGapRatio: -0.1,
        visible: true,
        isHidden: false,
      }),
    ],
    [end, start]
  );

  useLineVisualizers(lines, true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const labels = createSegmentLineLabels({
      appearance: {
        themeStyle: ANNOTATION_THEME.style.BRIGHT_ON_DARK,
      },
    });
    labelRef.current = labels;
    container.append(labels.direct);

    return () => {
      labels.direct.remove();
      labels.vertical.remove();
      labels.horizontal.remove();
      labelRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    const labelElement = labelRef.current?.direct;
    if (!labelElement) {
      onStatusChange(DEFAULT_SINGLE_LINE_COLLISION_STRATEGY_STATUS);
      return;
    }

    const occupiedLabelRects = [
      primaryObstacleRef.current,
      secondaryObstacleRef.current,
    ]
      .map((element) =>
        element ? toLayoutRect(element.getBoundingClientRect()) : null
      )
      .filter(
        (rect): rect is ReturnType<typeof toLayoutRect> =>
          rect !== null && rect.right > rect.left && rect.bottom > rect.top
      );

    const placementResult = applySecondaryLineLabelPlacementStrategy({
      candidate: {
        element: labelElement,
        text: args.labelText,
        start,
        end,
      },
      occupiedLabelRects,
      allowEarlyRemoval: args.allowEarlyRemoval,
      collisionResolutionStrategy: args.collisionResolutionStrategy,
      anchorSlideStepRatio: args.anchorSlideStepRatio,
      maxAnchorSlideDeltaRatio: args.maxAnchorSlideDeltaRatio,
    });

    onStatusChange({
      visible: placementResult.visible,
      anchorRatio: placementResult.anchorRatio,
      collisionCount: placementResult.collisionCount,
    });
  }, [
    args.allowEarlyRemoval,
    args.anchorSlideStepRatio,
    args.collisionResolutionStrategy,
    args.labelText,
    args.maxAnchorSlideDeltaRatio,
    end,
    onStatusChange,
    start,
  ]);

  return (
    <>
      <div
        ref={primaryObstacleRef}
        style={{
          ...singleLineCollisionPrimaryObstacleStyle,
          left: obstacleLayout.primary.x,
          top: obstacleLayout.primary.y,
        }}
      >
        primary pill label
      </div>
      <div
        ref={secondaryObstacleRef}
        style={{
          ...singleLineCollisionSecondaryObstacleStyle,
          left: obstacleLayout.secondary.x,
          top: obstacleLayout.secondary.y,
        }}
      >
        proper label
      </div>
      <DraggableDebugAnchor
        anchorId="single-line-collision-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableDebugAnchor
        anchorId="single-line-collision-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
    </>
  );
};

export const SingleLineLabelDebugStory = ({
  args,
}: {
  args: SingleLineStoryArgs;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayHost = useLabelOverlayHost({
    kind: "dom",
    containerRef: rootRef,
  });

  const statusValues = [
    `line ${args.strokeWidth}px`,
    `dash ${args.dashed ? "on" : "off"}`,
    `label ${args.labelText || "off"}`,
    `drag endpoints`,
  ];

  return (
    <CenteredStoryFrame label="placement single line" values={statusValues}>
      <div ref={rootRef} style={plotFrameStyle}>
        <LabelOverlayProvider host={overlayHost}>
          <SingleLineLabelDebugOverlay containerRef={rootRef} args={args} />
        </LabelOverlayProvider>
      </div>
    </CenteredStoryFrame>
  );
};

export const SingleLineCollisionResolutionDebugStory = ({
  args,
}: {
  args: SingleLineCollisionStrategyStoryArgs;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayHost = useLabelOverlayHost({
    kind: "dom",
    containerRef: rootRef,
  });
  const [status, setStatus] = useState<SingleLineCollisionStrategyStatus>(
    DEFAULT_SINGLE_LINE_COLLISION_STRATEGY_STATUS
  );

  const statusValues = [
    `strategy ${args.collisionResolutionStrategy}`,
    `early removal ${args.allowEarlyRemoval ? "on" : "off"}`,
    `visible ${status.visible ? "yes" : "no"}`,
    `anchor ${
      status.anchorRatio === null
        ? "hidden"
        : formatStatusNumber(status.anchorRatio, 2)
    }`,
    `collisions ${status.collisionCount}`,
    "drag endpoints",
  ];

  return (
    <CenteredStoryFrame
      label="placement single line collision strategy"
      values={statusValues}
    >
      <div ref={rootRef} style={plotFrameStyle}>
        <LabelOverlayProvider host={overlayHost}>
          <SingleLineCollisionStrategyDebugOverlay
            containerRef={rootRef}
            args={args}
            onStatusChange={setStatus}
          />
        </LabelOverlayProvider>
      </div>
    </CenteredStoryFrame>
  );
};

export const PolygonSegmentLabelDebugStory = ({
  sidePreference,
}: {
  sidePreference: PolygonSegmentLabelSide;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayHost = useLabelOverlayHost({
    kind: "dom",
    containerRef: rootRef,
  });

  const statusValues = [`side ${sidePreference}`, `drag triangle vertices`];

  return (
    <CenteredStoryFrame label="placement polygon segment" values={statusValues}>
      <div ref={rootRef} style={plotFrameStyle}>
        <LabelOverlayProvider host={overlayHost}>
          <PolygonSegmentLabelDebugOverlay
            containerRef={rootRef}
            requestedSidePreference={sidePreference}
          />
        </LabelOverlayProvider>
      </div>
    </CenteredStoryFrame>
  );
};

export const DistanceTriangleOverlayDebugStory = ({
  backgroundMode = DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
  dashed = true,
  themeStyle = ANNOTATION_THEME.style.BRIGHT_ON_DARK,
  showDefaultsPanel = true,
  customBackgroundLayer1 = `radial-gradient(circle at 18% 22%, rgba(184, 142, 104, 0.24) 0%, rgba(184, 142, 104, 0) 34%)`,
  customBackgroundLayer2 = `radial-gradient(circle at 76% 28%, rgba(120, 104, 89, 0.16) 0%, rgba(120, 104, 89, 0) 38%)`,
  customBackgroundLayer3 = `radial-gradient(circle at 62% 78%, rgba(148, 122, 98, 0.2) 0%, rgba(148, 122, 98, 0) 30%)`,
  customBackgroundLayer4 = `linear-gradient(135deg, #d7d0c6 0%, #bdb4aa 26%, #8f8479 52%, #716b67 76%, #d4d0cb 100%)`,
  customBackgroundBlendMode = "normal, normal, normal, multiply",
}: DistanceTriangleOverlayStoryArgs) => (
  <CenteredStoryFrame
    label="distance triangle overlay"
    values={[
      "runtime label shell",
      dashed ? "dashed triangle segments" : "solid triangle segments",
      "drag all three nodes",
      `bg ${backgroundMode}`,
      `labels ${themeStyle}`,
      `defaults ${showDefaultsPanel ? "shown" : "hidden"}`,
    ]}
    contentStyle={distanceTriangleGridStyle}
    background={readDistanceTriangleStoryBackground(backgroundMode)}
    backgroundStyle={readDistanceTriangleStoryBackgroundStyle(backgroundMode)}
  >
    {distanceTrianglePresets.map((preset) => (
      <DistanceTriangleOverlayPanel
        key={preset.id}
        preset={preset}
        args={{
          backgroundMode,
          dashed,
          themeStyle,
          showDefaultsPanel,
          customBackgroundLayer1,
          customBackgroundLayer2,
          customBackgroundLayer3,
          customBackgroundLayer4,
          customBackgroundBlendMode,
        }}
      />
    ))}
    {showDefaultsPanel ? (
      <DistanceTriangleDefaultsPanel
        args={{
          backgroundMode,
          dashed,
          themeStyle,
          showDefaultsPanel,
          customBackgroundLayer1,
          customBackgroundLayer2,
          customBackgroundLayer3,
          customBackgroundLayer4,
          customBackgroundBlendMode,
        }}
      />
    ) : null}
  </CenteredStoryFrame>
);

export const LineLabelComponentStory = ({
  backgroundMode = DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
  themeStyle = ANNOTATION_THEME.style.BRIGHT_ON_DARK,
  fontFamily = annotationLineLabelDefaults.text.fontFamily,
  fontWeight = annotationLineLabelDefaults.text.fontWeight,
  showBackdrop = true,
}: LineLabelComponentStoryArgs) => (
  <CenteredStoryFrame
    label="line component"
    values={[
      "runtime line label shell",
      `bg ${backgroundMode}`,
      `theme ${themeStyle}`,
      `backdrop ${showBackdrop ? "on" : "off"}`,
    ]}
  >
    <section style={{ display: "grid", gap: 10, width: "min(980px, 100%)" }}>
      <div style={distanceTrianglePanelTitleStyle}>line label variants</div>
      <div style={distanceTrianglePanelMetaStyle}>
        Shared line-label shell as its own component surface, separate from
        pillbox and badge labels.
      </div>
      <div style={lineLabelTableStyle}>
        {lineLabelComponentRows.map((row) => (
          <div key={row.id} style={lineLabelTableRowStyle}>
            <div style={lineLabelTableRowCellStyle}>
              <div style={lineLabelTableLabelCellStyle}>{row.label}</div>
              <div style={lineLabelTableSampleCellStyle}>
                <LineLabelComponentSample
                  row={row}
                  args={{
                    backgroundMode,
                    themeStyle,
                    fontFamily,
                    fontWeight,
                    showBackdrop,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  </CenteredStoryFrame>
);

export const DISTANCE_TRIANGLE_OVERLAY_ARG_TYPES = {
  backgroundMode: {
    control: { type: "inline-radio" },
    options: [
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.PLAIN,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CHECKERBOARD,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.URBAN,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CUSTOM,
    ],
    table: { category: "Canvas" },
  },
  showDefaultsPanel: {
    control: { type: "boolean" },
    table: { category: "Canvas" },
  },
  customBackgroundLayer1: {
    control: { type: "text" },
    table: { category: "Custom Background" },
  },
  customBackgroundLayer2: {
    control: { type: "text" },
    table: { category: "Custom Background" },
  },
  customBackgroundLayer3: {
    control: { type: "text" },
    table: { category: "Custom Background" },
  },
  customBackgroundLayer4: {
    control: { type: "text" },
    table: { category: "Custom Background" },
  },
  customBackgroundBlendMode: {
    control: { type: "text" },
    table: { category: "Custom Background" },
  },
  dashed: {
    control: { type: "boolean" },
    table: { category: "Line" },
  },
  themeStyle: {
    control: { type: "inline-radio" },
    options: [
      ANNOTATION_THEME.style.DARK_ON_BRIGHT,
      ANNOTATION_THEME.style.BRIGHT_ON_DARK,
    ],
    table: { category: "Line Label" },
  },
};

export const LINE_LABEL_COMPONENT_ARG_TYPES = {
  backgroundMode: {
    control: { type: "inline-radio" },
    options: [
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.PLAIN,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CHECKERBOARD,
      DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.URBAN,
    ],
    table: { category: "Canvas" },
  },
  themeStyle: {
    control: { type: "inline-radio" },
    options: [
      ANNOTATION_THEME.style.DARK_ON_BRIGHT,
      ANNOTATION_THEME.style.BRIGHT_ON_DARK,
    ],
    table: { category: "Label" },
  },
  fontFamily: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  fontWeight: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  showBackdrop: {
    control: { type: "boolean" },
    table: { category: "Label" },
  },
};

export const DISTANCE_TRIANGLE_OVERLAY_ARGS: DistanceTriangleOverlayStoryArgs =
  {
    backgroundMode: DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
    dashed: true,
    themeStyle: ANNOTATION_THEME.style.BRIGHT_ON_DARK,
    showDefaultsPanel: true,
    customBackgroundLayer1:
      "radial-gradient(circle at 18% 22%, rgba(184, 142, 104, 0.24) 0%, rgba(184, 142, 104, 0) 34%)",
    customBackgroundLayer2:
      "radial-gradient(circle at 76% 28%, rgba(120, 104, 89, 0.16) 0%, rgba(120, 104, 89, 0) 38%)",
    customBackgroundLayer3:
      "radial-gradient(circle at 62% 78%, rgba(148, 122, 98, 0.2) 0%, rgba(148, 122, 98, 0) 30%)",
    customBackgroundLayer4:
      "linear-gradient(135deg, #d7d0c6 0%, #bdb4aa 26%, #8f8479 52%, #716b67 76%, #d4d0cb 100%)",
    customBackgroundBlendMode: "normal, normal, normal, multiply",
  };

export const LINE_LABEL_COMPONENT_ARGS: LineLabelComponentStoryArgs = {
  backgroundMode: DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
  themeStyle: ANNOTATION_THEME.style.BRIGHT_ON_DARK,
  fontFamily: annotationLineLabelDefaults.text.fontFamily,
  fontWeight: annotationLineLabelDefaults.text.fontWeight,
  showBackdrop: true,
};

export const LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES = {
  stroke: { control: { type: "color" }, table: { category: "Line" } },
  strokeWidth: {
    control: { type: "range", min: 1, max: 30, step: 1 },
    table: { category: "Line" },
  },
  opacity: {
    control: { type: "range", min: 0, max: 1, step: 0.01 },
    table: { category: "Line" },
  },
  hitTargetStrokeWidth: {
    control: { type: "range", min: 1, max: 64, step: 1 },
    table: { category: "Line" },
  },
  visible: { control: { type: "boolean" }, table: { category: "Line" } },
  isHidden: { control: { type: "boolean" }, table: { category: "Line" } },
  contentSignature: {
    control: { type: "text" },
    table: { category: "Line" },
  },
  dashed: { control: { type: "boolean" }, table: { category: "Dash" } },
  capStyle: {
    control: { type: "inline-radio" },
    options: ["round", "square"],
    table: { category: "Dash" },
  },
  dashLengthRatio: {
    control: { type: "range", min: 1, max: 12, step: 0.1 },
    table: { category: "Dash" },
  },
  dashGapRatio: {
    control: { type: "range", min: -1, max: 12, step: 0.1 },
    table: { category: "Dash" },
  },
  collapseNegativeGaps: {
    control: { type: "boolean" },
    table: { category: "Dash" },
  },
  collapseCapThresholdEffectiveGapRatio: {
    control: { type: "range", min: -1, max: 2, step: 0.01 },
    table: { category: "Dash" },
  },
  showDistanceLabel: {
    control: { type: "boolean" },
    table: { category: "Label" },
  },
  labelText: { control: { type: "text" }, table: { category: "Label" } },
  labelColor: { control: { type: "color" }, table: { category: "Label" } },
  labelStroke: { control: { type: "color" }, table: { category: "Label" } },
  labelFontSize: {
    control: { type: "range", min: 8, max: 40, step: 1 },
    table: { category: "Label" },
  },
  labelFontFamily: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  labelFontWeight: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  labelPill: { control: { type: "boolean" }, table: { category: "Label" } },
  labelPillBackgroundColor: {
    control: { type: "color" },
    table: { category: "Label" },
  },
  labelPillBorderColor: {
    control: { type: "color" },
    table: { category: "Label" },
  },
  labelPillBorderWidth: {
    control: { type: "range", min: 0, max: 8, step: 0.5 },
    table: { category: "Label" },
  },
  labelMinLineLengthPx: {
    control: { type: "range", min: 0, max: 500, step: 1 },
    table: { category: "Label" },
  },
  labelOffsetPx: {
    control: { type: "range", min: -64, max: 128, step: 1 },
    table: { category: "Label" },
  },
  labelFlippedBaselineOffsetPx: {
    control: { type: "range", min: -64, max: 128, step: 1 },
    table: { category: "Label" },
  },
  labelRotationMode: {
    control: { type: "inline-radio" },
    options: ["auto", "clockwise"],
    table: { category: "Label" },
  },
  labelDominantBaseline: {
    control: { type: "select" },
    options: [
      "auto",
      "middle",
      "central",
      "text-before-edge",
      "text-after-edge",
      "alphabetic",
      "hanging",
      "ideographic",
    ],
    table: { category: "Label" },
  },
};

export const LABEL_PLACEMENT_SINGLE_LINE_ARGS = {
  stroke: "rgba(30, 64, 175, 0.95)",
  strokeWidth: 10,
  opacity: 1,
  hitTargetStrokeWidth: 12,
  dashed: true,
  capStyle: "round",
  dashLengthRatio: 1,
  dashGapRatio: 1.5,
  collapseNegativeGaps: true,
  collapseCapThresholdEffectiveGapRatio: -0.1,
  showDistanceLabel: false,
  labelText: "single line",
  labelColor: "#111827",
  labelStroke: "rgba(255, 255, 255, 0.98)",
  labelFontSize: 14,
  labelFontFamily: "monospace",
  labelFontWeight: "600",
  labelPill: false,
  labelPillBackgroundColor: "rgba(255,255,255,0.9)",
  labelPillBorderColor: "rgba(17,24,39,0.35)",
  labelPillBorderWidth: 1,
  labelMinLineLengthPx: 0,
  labelOffsetPx: 14,
  labelFlippedBaselineOffsetPx: 0,
  labelRotationMode: "auto",
  labelDominantBaseline: "middle",
  visible: true,
  isHidden: false,
  contentSignature: "",
};

export const LABEL_PLACEMENT_SINGLE_LINE_COLLISION_ARG_TYPES = {
  labelText: { control: { type: "text" }, table: { category: "Label" } },
  allowEarlyRemoval: {
    control: { type: "boolean" },
    table: { category: "Collision" },
  },
  collisionResolutionStrategy: {
    control: { type: "inline-radio" },
    options: Object.values(ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY),
    table: { category: "Collision" },
  },
  anchorSlideStepRatio: {
    control: { type: "range", min: 0.02, max: 0.25, step: 0.01 },
    table: { category: "Collision" },
  },
  maxAnchorSlideDeltaRatio: {
    control: { type: "range", min: 0, max: 0.5, step: 0.01 },
    table: { category: "Collision" },
  },
};

export const LABEL_PLACEMENT_SINGLE_LINE_COLLISION_ARGS: SingleLineCollisionStrategyStoryArgs =
  {
    labelText: "30,38 m",
    allowEarlyRemoval: true,
    collisionResolutionStrategy:
      ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY.MOVE_ON_LINE,
    anchorSlideStepRatio:
      annotationLineLabelDefaults.collision.anchorSlideStepRatio,
    maxAnchorSlideDeltaRatio:
      annotationLineLabelDefaults.collision.maxAnchorSlideDeltaRatio,
  };

export const LABEL_PLACEMENT_POLYGON_ARG_TYPES = {
  polygonSidePreference: {
    control: { type: "inline-radio" },
    options: ["outside", "inside"],
    table: { category: "Label Placement" },
  },
};

export const LABEL_PLACEMENT_POLYGON_ARGS = {
  polygonSidePreference: POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE,
};
