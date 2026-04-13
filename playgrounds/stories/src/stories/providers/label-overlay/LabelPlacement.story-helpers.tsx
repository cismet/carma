import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";

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
import type { CssPixelPosition } from "@carma-units";
import { annotationTypographyDefaults } from "@carma-mapping/annotations/runtime-v2";
import {
  PREVIEW_LINE_LABEL_BACKGROUND_STYLE,
  PREVIEW_LINE_LABEL_THEME,
  previewLineLabelVisualDefaults,
  type PreviewLineLabelBackgroundStyle,
  type PreviewLineLabelTheme,
} from "../../../../../../libraries/mapping/annotations/runtime-v2/src/lib/config/previewLineLabelVisualDefaults";
import {
  applyLineLabel,
  buildPreviewDistanceTriangleLabelReferences,
  createSegmentLineLabels,
  hideLineLabels,
  previewControllerDefaults,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
} from "../../../../../../libraries/mapping/annotations/runtime-v2/src/lib/interaction/previewController.shared";
import barmenBackgroundUrl from "./assets/barmen-background.png";
import {
  LABEL_STORY_BACKGROUND_MODES,
  readStoryBackground,
  readStoryBackgroundStyle,
} from "./LabelMarkers.story-helpers";
import {
  ANNOTATION_TYPOGRAPHY_SAMPLE_IDS,
  ANNOTATION_TYPOGRAPHY_SAMPLES,
} from "./annotation-typography-samples";

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

const LINE_LABEL_SECTION_GAP = 24;
const LINE_LABEL_ROW_PREVIEW_WIDTH = 560;

const lineLabelPageStyle: CSSProperties = {
  userSelect: "text",
};

const lineLabelSectionStyle: CSSProperties = {
  marginBottom: 0,
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
};

const lineLabelSectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: LINE_LABEL_SECTION_GAP,
  alignItems: "start",
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
};

const lineLabelStoryTextSurfaceStyle: CSSProperties = {
  display: "inline-block",
  width: "fit-content",
  maxWidth: "100%",
  padding: "2px 5px 1px",
  borderRadius: 0,
  background: "rgba(255, 255, 255, 0.92)",
  lineHeight: 1,
};

const lineLabelSectionTitleStyle: CSSProperties = {
  ...distanceTrianglePanelTitleStyle,
  ...lineLabelStoryTextSurfaceStyle,
};

const lineLabelRowListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  background: "transparent",
};

const lineLabelRowStyle: CSSProperties = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.24)",
};

const lineLabelRowCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
  padding: "5px 0",
};

const lineLabelRowGraphicStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "flex-start",
  flex: "0 0 auto",
  minWidth: 0,
  maxWidth: "100%",
  height: "auto",
  minHeight: 0,
  overflow: "visible",
  padding: "3px 0",
  marginLeft: "auto",
  whiteSpace: "nowrap",
  width: LINE_LABEL_ROW_PREVIEW_WIDTH,
};

const lineLabelVariantGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  width: "100%",
  minWidth: 0,
};

const lineLabelVariantCellStyle: CSSProperties = {
  display: "grid",
  gap: 0,
  minWidth: 0,
};

const lineLabelComponentViewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: 52,
  height: 56,
  overflow: "visible",
};

const resolveLineLabelComponentStyleVars = ({
  backgroundStyle,
  theme,
  textColor,
  textBlendMode,
  textEchoColor,
  backdropBackgroundColor,
  backdropBlendMode,
  surfaceBlendMode,
  textEchoBlendMode,
  textEchoBlurPx,
  textEchoOpacity,
  backdropBlurPx,
  backdropBrightnessPct,
  backdropSaturatePct,
  backdropSurfaceAlpha,
  backdropRadiusEx,
  backdropEdgeBlurPx,
  backdropInsetBlockEx,
  backdropInsetInlineEx,
  framePaddingBlockEx,
  framePaddingInlineEx,
  showLayerBounds,
}: {
  backgroundStyle: PreviewLineLabelBackgroundStyle;
  theme: PreviewLineLabelTheme;
  textColor?: string;
  textBlendMode?: string;
  textEchoColor?: string;
  backdropBackgroundColor?: string;
  backdropBlendMode?: string;
  surfaceBlendMode?: string;
  textEchoBlendMode?: string;
  textEchoBlurPx?: number;
  textEchoOpacity?: number;
  backdropBlurPx?: number;
  backdropBrightnessPct?: number;
  backdropSaturatePct?: number;
  backdropSurfaceAlpha?: number;
  backdropRadiusEx?: number;
  backdropEdgeBlurPx?: number;
  backdropInsetBlockEx?: number;
  backdropInsetInlineEx?: number;
  framePaddingBlockEx?: number;
  framePaddingInlineEx?: number;
  showLayerBounds?: boolean;
}): CSSProperties => {
  const themePreset =
    theme === PREVIEW_LINE_LABEL_THEME.DARK_ON_BRIGHT
      ? LINE_LABEL_RUNTIME_THEME_PRESETS.darkOnBright
      : LINE_LABEL_RUNTIME_THEME_PRESETS.brightOnDark;
  const debugOutlineStyleVars =
    showLayerBounds === true
      ? ({
          "--carma-annotation-overlay-line-label-debug-content-outline":
            "1px solid rgba(14, 165, 233, 0.9)",
          "--carma-annotation-overlay-line-label-debug-backdrop-outline":
            "1px solid rgba(244, 63, 94, 0.95)",
          "--carma-annotation-overlay-line-label-debug-text-outline":
            "1px solid rgba(34, 197, 94, 0.95)",
          "--carma-annotation-overlay-line-label-debug-text-echo-outline":
            "1px dashed rgba(249, 115, 22, 0.9)",
        } as CSSProperties)
      : undefined;

  const hasFramePaddingOverride =
    (typeof framePaddingBlockEx === "number" &&
      Number.isFinite(framePaddingBlockEx)) ||
    (typeof framePaddingInlineEx === "number" &&
      Number.isFinite(framePaddingInlineEx));
  const hasBackdropInsetOverride =
    (typeof backdropInsetBlockEx === "number" &&
      Number.isFinite(backdropInsetBlockEx)) ||
    (typeof backdropInsetInlineEx === "number" &&
      Number.isFinite(backdropInsetInlineEx));
  const hasTextEchoOverride =
    (typeof textEchoBlurPx === "number" && Number.isFinite(textEchoBlurPx)) ||
    (typeof textEchoOpacity === "number" && Number.isFinite(textEchoOpacity));

  const layoutStyleVars = {
    ...(hasFramePaddingOverride
      ? {
          "--carma-annotation-overlay-line-label-frame-padding-block": `${
            typeof framePaddingBlockEx === "number" &&
            Number.isFinite(framePaddingBlockEx)
              ? Math.max(framePaddingBlockEx, 0)
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.framePaddingBlockEx
          }ex`,
          "--carma-annotation-overlay-line-label-frame-padding-inline": `${
            typeof framePaddingInlineEx === "number" &&
            Number.isFinite(framePaddingInlineEx)
              ? Math.max(framePaddingInlineEx, 0)
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.framePaddingInlineEx
          }ex`,
        }
      : undefined),
    ...(typeof backdropRadiusEx === "number" && Number.isFinite(backdropRadiusEx)
      ? {
          "--carma-annotation-overlay-line-label-backdrop-radius": `${Math.max(
            backdropRadiusEx,
            0
          )}ex`,
        }
      : undefined),
    ...(hasBackdropInsetOverride
      ? {
          "--carma-annotation-overlay-line-label-backdrop-inset": `${
            typeof backdropInsetBlockEx === "number" &&
            Number.isFinite(backdropInsetBlockEx)
              ? backdropInsetBlockEx
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.backdropInsetBlockEx
          }ex ${
            typeof backdropInsetInlineEx === "number" &&
            Number.isFinite(backdropInsetInlineEx)
              ? backdropInsetInlineEx
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.backdropInsetInlineEx
          }ex`,
        }
      : undefined),
  } as CSSProperties;

    const surfaceFxStyleVars = {
    ...(typeof backdropBlurPx === "number" && Number.isFinite(backdropBlurPx)
      ? {
          "--carma-annotation-overlay-line-label-surface-blur-px": `${Math.max(
            backdropBlurPx,
            0
          )}px`,
        }
      : undefined),
    ...(typeof backdropBrightnessPct === "number" &&
      Number.isFinite(backdropBrightnessPct)
      ? {
          "--carma-annotation-overlay-line-label-surface-brightness-pct": `${Math.max(
            backdropBrightnessPct,
            0
          )}%`,
        }
      : undefined),
    ...(typeof backdropSaturatePct === "number" &&
      Number.isFinite(backdropSaturatePct)
      ? {
          "--carma-annotation-overlay-line-label-surface-saturate-pct": `${Math.max(
            backdropSaturatePct,
            0
          )}%`,
        }
      : undefined),
    ...(typeof backdropEdgeBlurPx === "number" &&
      Number.isFinite(backdropEdgeBlurPx)
      ? {
          "--carma-annotation-overlay-line-label-surface-edge-blur-px": `${Math.max(
            backdropEdgeBlurPx,
            0
          )}px`,
        }
      : undefined),
  } as CSSProperties;

  const textEchoStyleVars =
    backgroundStyle === PREVIEW_LINE_LABEL_BACKGROUND_STYLE.TEXT_ECHO_DARKEN &&
    hasTextEchoOverride
      ? ({
          "--carma-annotation-overlay-line-label-text-echo-blur-px": `${Math.max(
            typeof textEchoBlurPx === "number" && Number.isFinite(textEchoBlurPx)
              ? textEchoBlurPx
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.textEchoBlurPx,
            0
          )}px`,
          "--carma-annotation-overlay-line-label-text-echo-opacity": `${
            typeof textEchoOpacity === "number" && Number.isFinite(textEchoOpacity)
              ? Math.min(Math.max(textEchoOpacity, 0), 1)
              : LINE_LABEL_RUNTIME_SHARED_DEFAULTS.textEchoOpacity
          }`,
        } as CSSProperties)
      : undefined;

  const colorOverrideStyleVars = {
    ...(typeof textColor === "string" && textColor.trim().length > 0
      ? {
          "--carma-annotation-overlay-line-label-text-color": textColor,
        }
      : undefined),
    ...(typeof textBlendMode === "string" && textBlendMode.length > 0
      ? {
          "--carma-annotation-overlay-line-label-text-blend-mode":
            textBlendMode,
        }
      : undefined),
    ...(typeof textEchoColor === "string" && textEchoColor.trim().length > 0
      ? {
          "--carma-annotation-overlay-line-label-text-echo-color":
            textEchoColor,
        }
      : undefined),
    ...(typeof backdropBackgroundColor === "string" &&
    backdropBackgroundColor.trim().length > 0
      ? {
          "--carma-annotation-overlay-line-label-backdrop-background":
            backdropBackgroundColor,
        }
      : undefined),
    ...(typeof backdropBlendMode === "string" && backdropBlendMode.length > 0
      ? {
          "--carma-annotation-overlay-line-label-backdrop-blend-mode":
            backdropBlendMode,
        }
      : undefined),
    ...(typeof surfaceBlendMode === "string" && surfaceBlendMode.length > 0
      ? {
          "--carma-annotation-overlay-line-label-surface-blend-mode":
            surfaceBlendMode,
        }
      : undefined),
    ...(typeof textEchoBlendMode === "string" &&
    textEchoBlendMode.length > 0
      ? {
          "--carma-annotation-overlay-line-label-text-echo-blend-mode":
            textEchoBlendMode,
        }
      : undefined),
  } as CSSProperties;

  return {
    ...debugOutlineStyleVars,
    ...layoutStyleVars,
    ...(typeof backdropSurfaceAlpha === "number" &&
    Number.isFinite(backdropSurfaceAlpha)
      ? {
          "--carma-annotation-overlay-line-label-backdrop-background": `rgba(${themePreset.backdropBackgroundRgb}, ${Math.min(
            Math.max(backdropSurfaceAlpha, 0),
            1
          )})`,
        }
      : undefined),
    ...surfaceFxStyleVars,
    ...textEchoStyleVars,
    ...colorOverrideStyleVars,
  } as CSSProperties;
};

const resolveLineLabelStoryBackgroundMode = (
  backgroundMode: DistanceTriangleOverlayBackgroundMode
) =>
  backgroundMode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CHECKERBOARD
    ? LABEL_STORY_BACKGROUND_MODES.CHECKERBOARD
    : backgroundMode === DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.PLAIN
    ? LABEL_STORY_BACKGROUND_MODES.PLAIN
    : LABEL_STORY_BACKGROUND_MODES.URBAN;

const DISTANCE_TRIANGLE_DASH_PATTERN = "8 8";

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const formatStatusNumber = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

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
  placement: { textX: number; textY: number; angleDeg: number } | null;
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
          transform: `translateY(-50%) rotate(${placement.angleDeg}deg)`,
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
  labelTheme?: PreviewLineLabelTheme;
  showDefaultsPanel?: boolean;
  customBackgroundLayer1?: string;
  customBackgroundLayer2?: string;
  customBackgroundLayer3?: string;
  customBackgroundLayer4?: string;
  customBackgroundBlendMode?: string;
};

export type LineLabelComponentStoryArgs = {
  backgroundMode?: DistanceTriangleOverlayBackgroundMode;
  fontFamily?: string;
  fontWeight?: string | number;
  brightOnDarkTextColor?: string;
  brightOnDarkTextBlendMode?: string;
  brightOnDarkTextEchoColor?: string;
  brightOnDarkBackdropBackgroundColor?: string;
  brightOnDarkBackdropBlendMode?: string;
  brightOnDarkSurfaceBlendMode?: string;
  brightOnDarkTextEchoBlendMode?: string;
  darkOnBrightTextColor?: string;
  darkOnBrightTextBlendMode?: string;
  darkOnBrightTextEchoColor?: string;
  darkOnBrightBackdropBackgroundColor?: string;
  darkOnBrightBackdropBlendMode?: string;
  darkOnBrightSurfaceBlendMode?: string;
  darkOnBrightTextEchoBlendMode?: string;
  textEchoBlurPx?: number;
  textEchoOpacity?: number;
  backdropBlurPx?: number;
  backdropBrightnessPct?: number;
  backdropSaturatePct?: number;
  backdropSurfaceAlpha?: number;
  backdropRadiusEx?: number;
  backdropEdgeBlurPx?: number;
  backdropInsetBlockEx?: number;
  backdropInsetInlineEx?: number;
  framePaddingBlockEx?: number;
  framePaddingInlineEx?: number;
  showLayerBounds?: boolean;
  showBackdrop?: boolean;
};

type LineLabelComponentPreviewArgs = LineLabelComponentStoryArgs & {
  backgroundStyle: PreviewLineLabelBackgroundStyle;
  labelTheme: PreviewLineLabelTheme;
  textColor?: string;
  textBlendMode?: string;
  textEchoColor?: string;
  backdropBackgroundColor?: string;
  backdropBlendMode?: string;
  surfaceBlendMode?: string;
  textEchoBlendMode?: string;
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
  text: string;
  fontSizePx: number;
  fontWeight?: string | number;
};

type LineLabelComponentSection = {
  id: string;
  title: string;
  theme: PreviewLineLabelTheme;
  rows: readonly LineLabelComponentRow[];
};

type LineLabelComponentStyleVariant = {
  id: string;
  backgroundStyle: PreviewLineLabelBackgroundStyle;
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

const readLineLabelBackgroundStyleLabel = (
  backgroundStyle: PreviewLineLabelBackgroundStyle
) =>
  backgroundStyle === PREVIEW_LINE_LABEL_BACKGROUND_STYLE.TEXT_ECHO_DARKEN
    ? "text echo darken"
    : "soft rect fade";

const readLineLabelHeadingText = (
  backgroundStyle: PreviewLineLabelBackgroundStyle
) => `Label Heading · ${readLineLabelBackgroundStyleLabel(backgroundStyle)}`;

const readLineLabelComponentRows = (
  _backgroundMode: DistanceTriangleOverlayBackgroundMode
): readonly LineLabelComponentRow[] =>
  ANNOTATION_TYPOGRAPHY_SAMPLES.map((sample) => {
    switch (sample.id) {
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.HEADING:
        return {
          id: "line-label-heading",
          text: "Label Heading",
          fontSizePx: annotationTypographyDefaults.headingFontSizePx,
          fontWeight: annotationTypographyDefaults.headingFontWeight,
        };
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.ROOT_MEDIUM:
        return {
          id: "line-label-root-medium",
          text: sample.example,
          fontSizePx: annotationTypographyDefaults.rootFontSizePx,
          fontWeight: annotationTypographyDefaults.badgeFontWeight,
        };
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.ROOT_REGULAR:
        return {
          id: "line-label-root-regular",
          text: sample.example,
          fontSizePx: annotationTypographyDefaults.rootFontSizePx,
          fontWeight: 400,
        };
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_SEMIBOLD:
        return {
          id: "line-label-support-semibold",
          text: sample.example,
          fontSizePx: annotationTypographyDefaults.supportFontSizePx,
          fontWeight: annotationTypographyDefaults.sectionTitleFontWeight,
        };
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_SUBTITLE:
        return {
          id: "line-label-support-subtitle",
          text: sample.example,
          fontSizePx: annotationTypographyDefaults.supportFontSizePx,
          fontWeight: 600,
        };
      case ANNOTATION_TYPOGRAPHY_SAMPLE_IDS.SUPPORT_REGULAR:
        return {
          id: "line-label-support-regular",
          text: sample.example,
          fontSizePx: annotationTypographyDefaults.supportFontSizePx,
          fontWeight: 400,
        };
    }
  });

const lineLabelComponentStyleVariants: readonly LineLabelComponentStyleVariant[] =
  [
    {
      id: "soft-rect-fade",
      backgroundStyle: PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE,
    },
    {
      id: "text-echo-darken",
      backgroundStyle: PREVIEW_LINE_LABEL_BACKGROUND_STYLE.TEXT_ECHO_DARKEN,
    },
  ] as const;

const LINE_LABEL_COMPONENT_SURFACE_VARIANTS: readonly LineLabelComponentStyleVariant[] =
  [lineLabelComponentStyleVariants[0]];

const LINE_LABEL_COMPONENT_ECHO_VARIANTS: readonly LineLabelComponentStyleVariant[] =
  [lineLabelComponentStyleVariants[1]];

const lineLabelComponentSections: readonly LineLabelComponentSection[] = [
  {
    id: "line-label-bright-on-dark",
    title: "bright on dark",
    theme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
    rows: [],
  },
  {
    id: "line-label-dark-on-bright",
    title: "dark on bright",
    theme: PREVIEW_LINE_LABEL_THEME.DARK_ON_BRIGHT,
    rows: [],
  },
] as const;

const LINE_LABEL_COMPONENT_BACKGROUND_MODE_OPTIONS = [
  DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
  DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.PLAIN,
  DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.CHECKERBOARD,
  DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.URBAN,
] as const;

const LINE_LABEL_FONT_WEIGHT_OPTIONS = [400, 500, 600, 700] as const;

const LINE_LABEL_BLEND_MODE_OPTIONS = [
  "",
  "darken",
  "lighten",
  "normal",
] as const;

const LINE_LABEL_BLEND_MODE_OPTION_LABELS = {
  "": "auto",
  darken: "darken",
  lighten: "lighten",
  normal: "normal",
} as const;

const LINE_LABEL_COLOR_PRESET_OPTIONS = [
  "#0f172a",
  "#e2e8f0",
  "#ffffff",
  "rgba(0, 0, 0, 0.98)",
  "rgba(15, 23, 42, 0.92)",
  "rgba(15, 23, 42, 0.28)",
  "rgba(255, 255, 255, 0.92)",
  "rgba(96, 106, 124, 0.62)",
  "rgba(255, 255, 255, 0.32)",
  "rgba(87, 96, 112, 0.76)",
] as const;

const LINE_LABEL_RUNTIME_SHARED_DEFAULTS = {
  backdropBlurPx: 8,
  textEchoBlurPx: 4,
  textEchoOpacity: 0.82,
  framePaddingBlockEx: 0.25,
  framePaddingInlineEx: 0.65,
  backdropInsetBlockEx: -0.35,
  backdropInsetInlineEx: -0.75,
} as const;

const LINE_LABEL_RUNTIME_THEME_PRESETS = {
  brightOnDark: {
    textColor: "rgba(255, 255, 255, 0.98)",
    textEchoColor: "rgba(15, 23, 42, 0.92)",
    backdropBackgroundColor: "rgba(15, 23, 42, 0.28)",
    backdropBackgroundRgb: "15, 23, 42",
    backdropBrightnessPct: 78,
    backdropSaturatePct: 55,
    backdropSurfaceAlpha: 0.28,
    backdropBlendMode: "darken",
    textEchoBlendMode: "darken",
  },
  darkOnBright: {
    textColor: "rgba(0, 0, 0, 0.98)",
    textEchoColor: "rgba(255, 255, 255, 0.92)",
    backdropBackgroundColor: "rgba(255, 255, 255, 0.32)",
    backdropBackgroundRgb: "255, 255, 255",
    backdropBrightnessPct: 118,
    backdropSaturatePct: 45,
    backdropSurfaceAlpha: 0.32,
    backdropBlendMode: "lighten",
    textEchoBlendMode: "lighten",
  },
} as const;

const resolveLineLabelThemeOverrideArgs = (
  args: LineLabelComponentStoryArgs,
  theme: PreviewLineLabelTheme
): Pick<
  LineLabelComponentPreviewArgs,
  | "textColor"
  | "textBlendMode"
  | "textEchoColor"
  | "backdropBackgroundColor"
  | "backdropBlendMode"
  | "surfaceBlendMode"
  | "textEchoBlendMode"
> =>
  theme === PREVIEW_LINE_LABEL_THEME.DARK_ON_BRIGHT
    ? {
        textColor: args.darkOnBrightTextColor,
        textBlendMode: args.darkOnBrightTextBlendMode,
        textEchoColor: args.darkOnBrightTextEchoColor,
        backdropBackgroundColor: args.darkOnBrightBackdropBackgroundColor,
        backdropBlendMode: args.darkOnBrightBackdropBlendMode,
        surfaceBlendMode: args.darkOnBrightSurfaceBlendMode,
        textEchoBlendMode: args.darkOnBrightTextEchoBlendMode,
      }
    : {
        textColor: args.brightOnDarkTextColor,
        textBlendMode: args.brightOnDarkTextBlendMode,
        textEchoColor: args.brightOnDarkTextEchoColor,
        backdropBackgroundColor: args.brightOnDarkBackdropBackgroundColor,
        backdropBlendMode: args.brightOnDarkBackdropBlendMode,
        surfaceBlendMode: args.brightOnDarkSurfaceBlendMode,
        textEchoBlendMode: args.brightOnDarkTextEchoBlendMode,
      };

const buildLineLabelThemeOverrideArgTypes = ({
  themeLabel,
  includeEchoControls,
}: {
  themeLabel: string;
  includeEchoControls: boolean;
}) => ({
  textColor: {
    name: "Text Color",
    control: {
      type: "color",
      presetColors: LINE_LABEL_COLOR_PRESET_OPTIONS,
    },
    table: { category: `Theme: ${themeLabel}` },
  },
  textBlendMode: {
    name: "Text Blend",
    control: { type: "inline-radio" },
    options: LINE_LABEL_BLEND_MODE_OPTIONS,
    labels: LINE_LABEL_BLEND_MODE_OPTION_LABELS,
    table: { category: `Theme: ${themeLabel}` },
  },
  backdropBackgroundColor: {
    name: "Backdrop Tint",
    control: {
      type: "color",
      presetColors: LINE_LABEL_COLOR_PRESET_OPTIONS,
    },
    table: { category: `Theme: ${themeLabel}` },
  },
  backdropBlendMode: {
    name: "Backdrop Blend",
    control: { type: "inline-radio" },
    options: LINE_LABEL_BLEND_MODE_OPTIONS,
    labels: LINE_LABEL_BLEND_MODE_OPTION_LABELS,
    table: { category: `Theme: ${themeLabel}` },
  },
  surfaceBlendMode: {
    name: "Surface FX Blend",
    control: { type: "inline-radio" },
    options: LINE_LABEL_BLEND_MODE_OPTIONS,
    labels: LINE_LABEL_BLEND_MODE_OPTION_LABELS,
    table: { category: `Theme: ${themeLabel}` },
  },
  ...(includeEchoControls
    ? {
        textEchoColor: {
          name: "Echo Color",
          control: {
            type: "color",
            presetColors: LINE_LABEL_COLOR_PRESET_OPTIONS,
          },
          table: { category: `Theme: ${themeLabel}` },
        },
        textEchoBlendMode: {
          name: "Echo Blend",
          control: { type: "inline-radio" },
          options: LINE_LABEL_BLEND_MODE_OPTIONS,
          labels: LINE_LABEL_BLEND_MODE_OPTION_LABELS,
          table: { category: `Theme: ${themeLabel}` },
        },
      }
    : undefined),
});

const LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES = buildLineLabelThemeOverrideArgTypes({
  themeLabel: "Bright on Dark",
  includeEchoControls: true,
});
const LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES = buildLineLabelThemeOverrideArgTypes({
  themeLabel: "Dark on Bright",
  includeEchoControls: true,
});
const LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES =
  buildLineLabelThemeOverrideArgTypes({
    themeLabel: "Bright on Dark",
    includeEchoControls: false,
  });
const LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES =
  buildLineLabelThemeOverrideArgTypes({
    themeLabel: "Dark on Bright",
    includeEchoControls: false,
  });

type StoryLineLabelPlacement = {
  textX: number;
  textY: number;
  angleDeg: number;
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

const resolvePreviewLineLabelTextElement = (element: HTMLDivElement) =>
  element.querySelector(
    '[data-annotation-overlay-line-label-text="foreground"]'
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
  const textElement = resolvePreviewLineLabelTextElement(element);
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
    placement.angleDeg
  }deg)`;
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

const LineLabelInlineRow = ({ children }: { children: ReactNode }) => (
  <div style={lineLabelRowStyle}>
    <div style={lineLabelRowCellStyle}>
      <div style={lineLabelRowGraphicStyle}>{children}</div>
    </div>
  </div>
);

const LineLabelVariantGrid = ({
  row,
  theme,
  args,
  variants,
}: {
  row: LineLabelComponentRow;
  theme: PreviewLineLabelTheme;
  args: LineLabelComponentStoryArgs;
  variants: readonly LineLabelComponentStyleVariant[];
}) => {
  const themeOverrideArgs = resolveLineLabelThemeOverrideArgs(args, theme);

  return (
    <div style={lineLabelVariantGridStyle}>
      {variants.map((variant) => (
        <div key={`${row.id}-${theme}-${variant.id}`} style={lineLabelVariantCellStyle}>
          <LineLabelComponentPreview
            row={row}
            args={{
              ...args,
              ...themeOverrideArgs,
              labelTheme: theme,
              backgroundStyle: variant.backgroundStyle,
            }}
          />
        </div>
      ))}
    </div>
  );
};

type LineLabelDragSession = {
  pointerStartPosition: {
    x: number;
    y: number;
  };
  labelStartOffset: {
    x: number;
    y: number;
  };
};

const LineLabelComponentPreview = ({
  row,
  args,
}: {
  row: LineLabelComponentRow;
  args: LineLabelComponentPreviewArgs;
}) => {
  const resolvedTheme = args.labelTheme;
  const resolvedBackgroundStyle = args.backgroundStyle;
  const showBackdrop = args.showBackdrop ?? true;
  const resolvedBackgroundMode =
    args.backgroundMode ?? DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN;
  const resolvedRowText =
    row.id === "line-label-heading"
      ? readLineLabelHeadingText(resolvedBackgroundStyle)
      : row.text;
  const [labelOffset, setLabelOffset] = useState({ x: 0, y: 0 });
  const labelOffsetRef = useRef(labelOffset);
  const labelDragSessionRef = useRef<LineLabelDragSession | null>(null);
  const lineLabelComponentStyleVars = resolveLineLabelComponentStyleVars({
    backgroundStyle: resolvedBackgroundStyle,
    theme: resolvedTheme,
    textColor: args.textColor,
    textBlendMode: args.textBlendMode,
    textEchoColor: args.textEchoColor,
    backdropBackgroundColor: args.backdropBackgroundColor,
    backdropBlendMode: args.backdropBlendMode,
    surfaceBlendMode: args.surfaceBlendMode,
    textEchoBlendMode: args.textEchoBlendMode,
    textEchoBlurPx: args.textEchoBlurPx,
    textEchoOpacity: args.textEchoOpacity,
    backdropBlurPx: args.backdropBlurPx,
    backdropBrightnessPct: args.backdropBrightnessPct,
    backdropSaturatePct: args.backdropSaturatePct,
    backdropSurfaceAlpha: args.backdropSurfaceAlpha,
    backdropRadiusEx: args.backdropRadiusEx,
    backdropEdgeBlurPx: args.backdropEdgeBlurPx,
    backdropInsetBlockEx: args.backdropInsetBlockEx,
    backdropInsetInlineEx: args.backdropInsetInlineEx,
    framePaddingBlockEx: args.framePaddingBlockEx,
    framePaddingInlineEx: args.framePaddingInlineEx,
    showLayerBounds: args.showLayerBounds,
  });

  const handleLabelDragMove = useCallback((event: MouseEvent) => {
    const activeSession = labelDragSessionRef.current;
    if (!activeSession) {
      return;
    }

    const nextOffset = {
      x:
        activeSession.labelStartOffset.x +
        (event.clientX - activeSession.pointerStartPosition.x),
      y:
        activeSession.labelStartOffset.y +
        (event.clientY - activeSession.pointerStartPosition.y),
    };

    labelOffsetRef.current = nextOffset;
    setLabelOffset(nextOffset);
  }, []);

  const handleLabelDragEnd = useCallback(() => {
    labelDragSessionRef.current = null;
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("mousemove", handleLabelDragMove);
    window.removeEventListener("mouseup", handleLabelDragEnd);
  }, [handleLabelDragMove]);

  useEffect(
    () => () => {
      handleLabelDragEnd();
    },
    [handleLabelDragEnd]
  );

  const handleLabelDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    labelDragSessionRef.current = {
      pointerStartPosition: {
        x: event.clientX,
        y: event.clientY,
      },
      labelStartOffset: labelOffsetRef.current,
    };

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("mousemove", handleLabelDragMove);
    window.addEventListener("mouseup", handleLabelDragEnd);
  };

  return (
    <div
      style={{
        ...lineLabelComponentViewportStyle,
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
      <div
        className="carma-annotation-overlay-line-label"
        data-annotation-overlay-line-label-background-style={
          resolvedBackgroundStyle
        }
        data-annotation-overlay-line-label-theme={resolvedTheme}
        style={
          {
            position: "absolute",
            left: `calc(168px + ${labelOffset.x}px)`,
            top: `calc(50% + ${labelOffset.y}px)`,
            display: "block",
            pointerEvents: "auto",
            cursor: "grab",
            transform: "translate(-50%, -50%)",
            "--carma-annotation-overlay-line-label-font-family":
              args.fontFamily ?? annotationTypographyDefaults.fontFamily,
            "--carma-annotation-overlay-line-label-font-size": `${row.fontSizePx}px`,
            "--carma-annotation-overlay-line-label-font-weight": `${
              row.fontWeight ??
              args.fontWeight ??
              previewLineLabelVisualDefaults.fontWeight
            }`,
            ...lineLabelComponentStyleVars,
          } as CSSProperties
        }
        onMouseDown={handleLabelDragStart}
        onMouseUp={handleLabelDragEnd}
      >
        <div className="carma-annotation-overlay-line-label__frame">
          <div className="carma-annotation-overlay-line-label__content">
            {showBackdrop ? (
              <>
                <div
                  className="carma-annotation-overlay-line-label__backdrop"
                  data-annotation-overlay-line-label-background-style={
                    resolvedBackgroundStyle
                  }
                  style={{ pointerEvents: "none" }}
                />
                <div
                  className="carma-annotation-overlay-line-label__surface"
                  style={{ pointerEvents: "none" }}
                />
              </>
            ) : null}
            <div
              className="carma-annotation-overlay-line-label__text-echo"
              data-annotation-overlay-line-label-text-echo="true"
            >
              {resolvedRowText}
            </div>
            <div
              className="carma-annotation-overlay-line-label__text"
              data-annotation-overlay-line-label-text="foreground"
            >
              {resolvedRowText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DistanceTriangleDefaultsPanel = ({
  args,
}: {
  args: DistanceTriangleOverlayStoryArgs;
}) => {
  const runtimeDefaults = [
    ["lineStrokeWidthPx", String(previewControllerDefaults.lineStrokeWidthPx)],
    ["layerZIndex", previewControllerDefaults.layerZIndex],
    ["lineLabelOffsetPx", String(previewControllerDefaults.lineLabelOffsetPx)],
    [
      "lineLabelMinLengthPx",
      String(previewControllerDefaults.lineLabelMinLengthPx),
    ],
    [
      "geometryEpsilonMeters",
      String(previewControllerDefaults.geometryEpsilonMeters),
    ],
    [
      "labelReferenceMinDistancePx",
      String(previewControllerDefaults.labelReferenceMinDistancePx),
    ],
    [
      "labelReferenceMaxDistancePx",
      String(previewControllerDefaults.labelReferenceMaxDistancePx),
    ],
    [
      "labelReferenceInsideBlendFactor",
      String(previewControllerDefaults.labelReferenceInsideBlendFactor),
    ],
    [
      "labelSideSwitchThresholdPx",
      String(previewControllerDefaults.labelSideSwitchThresholdPx),
    ],
    ["directLineColor", previewControllerDefaults.directLineColor],
    ["verticalLineColor", previewControllerDefaults.verticalLineColor],
    ["horizontalLineColor", previewControllerDefaults.horizontalLineColor],
    ["draftChainColor", previewControllerDefaults.draftChainColor],
  ] as const;

  const lineLabelDefaults = [
    ["fontFamily", annotationTypographyDefaults.fontFamily],
    ["fontWeight", String(previewLineLabelVisualDefaults.fontWeight)],
    ["backgroundStyle", previewLineLabelVisualDefaults.backgroundStyle],
    ["theme", previewLineLabelVisualDefaults.theme],
    [
      "shortEdgeOffsetPx",
      String(previewLineLabelVisualDefaults.shortEdgeOffsetPx),
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
      "labelTheme",
      String(args.labelTheme ?? DISTANCE_TRIANGLE_OVERLAY_ARGS.labelTheme),
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
            previewControllerDefaults
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
            previewLineLabelVisualDefaults
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
  const labelTheme = args.labelTheme ?? PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK;
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
      theme: labelTheme,
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
  }, [labelTheme]);

  useEffect(() => {
    const labels = labelsRef.current;
    if (!labels) {
      return;
    }

    const references = buildPreviewDistanceTriangleLabelReferences({
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
      resolvePreviewDistanceTriangleComponentLabelVisibility({
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
            stroke={previewControllerDefaults.directLineColor}
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
            stroke={previewControllerDefaults.verticalLineColor}
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
            stroke={previewControllerDefaults.horizontalLineColor}
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
  const lineAngleDeg = (Math.atan2(lineDy, lineDx) * 180) / Math.PI;
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
          ? `${formatStatusNumber(labelPlacement.angleDeg, 1)}°`
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
      fontFamily: args.labelFontFamily,
      fontWeight: args.labelFontWeight,
      theme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
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
      theme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
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
  labelTheme = PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
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
      "runtime-v2 label shell",
      dashed ? "dashed triangle segments" : "solid triangle segments",
      "drag all three nodes",
      `bg ${backgroundMode}`,
      `labels ${labelTheme}`,
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
          labelTheme,
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
          labelTheme,
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

const LineLabelComponentMatrixStory = ({
  label,
  variantSummary,
  variants,
  args,
}: {
  label: string;
  variantSummary: string;
  variants: readonly LineLabelComponentStyleVariant[];
  args: LineLabelComponentStoryArgs;
}) => {
  const {
    backgroundMode = DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
    fontFamily = annotationTypographyDefaults.fontFamily,
    fontWeight = previewLineLabelVisualDefaults.fontWeight,
    brightOnDarkTextColor,
    brightOnDarkTextBlendMode,
    brightOnDarkTextEchoColor,
    brightOnDarkBackdropBackgroundColor,
    brightOnDarkBackdropBlendMode,
    brightOnDarkSurfaceBlendMode,
    brightOnDarkTextEchoBlendMode,
    darkOnBrightTextColor,
    darkOnBrightTextBlendMode,
    darkOnBrightTextEchoColor,
    darkOnBrightBackdropBackgroundColor,
    darkOnBrightBackdropBlendMode,
    darkOnBrightSurfaceBlendMode,
    darkOnBrightTextEchoBlendMode,
    textEchoBlurPx,
    textEchoOpacity,
    backdropBlurPx,
    backdropBrightnessPct,
    backdropSaturatePct,
    backdropSurfaceAlpha,
    backdropRadiusEx,
    backdropEdgeBlurPx,
    backdropInsetBlockEx,
    backdropInsetInlineEx,
    framePaddingBlockEx,
    framePaddingInlineEx,
    showLayerBounds = false,
    showBackdrop = true,
  } = args;
  const statusBackdropBlurPx =
    backdropBlurPx ?? LINE_LABEL_RUNTIME_SHARED_DEFAULTS.backdropBlurPx;
  const pageBackgroundMode = resolveLineLabelStoryBackgroundMode(backgroundMode);
  const lineLabelComponentRows = readLineLabelComponentRows(backgroundMode);

  return (
    <CenteredStoryFrame
      label={label}
      values={[
        "runtime-v2 line label shell",
        `bg ${backgroundMode}`,
        variantSummary,
        "themes bright-on-dark / dark-on-bright",
        `bg blur ${statusBackdropBlurPx}px`,
        `bounds ${showLayerBounds ? "on" : "off"}`,
        `backdrop ${showBackdrop ? "on" : "off"}`,
      ]}
      contentStyle={lineLabelPageStyle}
      background={readStoryBackground(pageBackgroundMode)}
      backgroundStyle={readStoryBackgroundStyle(pageBackgroundMode)}
    >
      <div style={lineLabelSectionGridStyle}>
        {lineLabelComponentSections.map((section) => (
          <section key={section.id} style={lineLabelSectionStyle}>
            <div style={lineLabelSectionTitleStyle}>{section.title}</div>
            <div style={lineLabelRowListStyle}>
              {lineLabelComponentRows.map((row) => (
                <LineLabelInlineRow key={row.id}>
                  <LineLabelVariantGrid
                    row={row}
                    theme={section.theme}
                    variants={variants}
                    args={{
                      backgroundMode,
                      fontFamily,
                      fontWeight,
                      brightOnDarkTextColor,
                      brightOnDarkTextBlendMode,
                      brightOnDarkTextEchoColor,
                      brightOnDarkBackdropBackgroundColor,
                      brightOnDarkBackdropBlendMode,
                      brightOnDarkSurfaceBlendMode,
                      brightOnDarkTextEchoBlendMode,
                      darkOnBrightTextColor,
                      darkOnBrightTextBlendMode,
                      darkOnBrightTextEchoColor,
                      darkOnBrightBackdropBackgroundColor,
                      darkOnBrightBackdropBlendMode,
                      darkOnBrightSurfaceBlendMode,
                      darkOnBrightTextEchoBlendMode,
                      textEchoBlurPx,
                      textEchoOpacity,
                      backdropBlurPx,
                      backdropBrightnessPct,
                      backdropSaturatePct,
                      backdropSurfaceAlpha,
                      backdropRadiusEx,
                      backdropEdgeBlurPx,
                      backdropInsetBlockEx,
                      backdropInsetInlineEx,
                      framePaddingBlockEx,
                      framePaddingInlineEx,
                      showLayerBounds,
                      showBackdrop,
                    }}
                  />
                </LineLabelInlineRow>
              ))}
            </div>
          </section>
        ))}
      </div>
    </CenteredStoryFrame>
  );
};

export const LineLabelComponentStory = (args: LineLabelComponentStoryArgs) =>
  LineLabelComponentMatrixStory({
    label: "line component",
    variantSummary: "style soft-rect-fade",
    variants: LINE_LABEL_COMPONENT_SURFACE_VARIANTS,
    args,
  });

export const LineLabelEchoComponentStory = (args: LineLabelComponentStoryArgs) =>
  LineLabelComponentMatrixStory({
    label: "line component echo",
    variantSummary: `style text-echo-darken · echo ${
      (args.textEchoBlurPx ?? 4).toFixed(0)
    }px · alpha ${(args.textEchoOpacity ?? 0.82).toFixed(2)}`,
    variants: LINE_LABEL_COMPONENT_ECHO_VARIANTS,
    args,
  });

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
  labelTheme: {
    control: { type: "inline-radio" },
    options: [
      PREVIEW_LINE_LABEL_THEME.DARK_ON_BRIGHT,
      PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
    ],
    table: { category: "Line Label" },
  },
};

const LINE_LABEL_COMPONENT_BASE_ARG_TYPES = {
  backgroundMode: {
    name: "Background",
    control: { type: "inline-radio" },
    options: LINE_LABEL_COMPONENT_BACKGROUND_MODE_OPTIONS,
    table: { category: "Canvas" },
  },
  fontFamily: {
    name: "Font Family",
    control: { type: "text" },
    table: { category: "Typography" },
  },
  fontWeight: {
    name: "Fallback Weight",
    control: { type: "select" },
    options: LINE_LABEL_FONT_WEIGHT_OPTIONS,
    table: { category: "Typography" },
  },
  backdropBlurPx: {
    name: "Surface Blur",
    control: { type: "range", min: 0, max: 24, step: 1 },
    table: { category: "Surface FX" },
  },
  backdropBrightnessPct: {
    name: "Surface Brightness",
    control: { type: "range", min: 0, max: 180, step: 1 },
    table: { category: "Surface FX" },
  },
  backdropSaturatePct: {
    name: "Surface Saturation",
    control: { type: "range", min: 0, max: 180, step: 1 },
    table: { category: "Surface FX" },
  },
  backdropSurfaceAlpha: {
    name: "Backdrop Alpha",
    control: { type: "range", min: 0, max: 1, step: 0.01 },
    table: { category: "Backdrop" },
  },
  backdropRadiusEx: {
    name: "Corner Radius",
    control: { type: "range", min: 0, max: 12, step: 0.05 },
    table: { category: "Backdrop" },
  },
  backdropEdgeBlurPx: {
    name: "Surface Edge Softness",
    control: { type: "range", min: 0, max: 16, step: 1 },
    table: { category: "Surface FX" },
  },
  backdropInsetBlockEx: {
    name: "Backdrop Block Inset",
    control: { type: "range", min: -3, max: 3, step: 0.05 },
    table: { category: "Backdrop" },
  },
  backdropInsetInlineEx: {
    name: "Backdrop Inline Inset",
    control: { type: "range", min: -4, max: 4, step: 0.05 },
    table: { category: "Backdrop" },
  },
  framePaddingBlockEx: {
    name: "Block Padding",
    control: { type: "range", min: 0, max: 2, step: 0.05 },
    table: { category: "Frame Layout" },
  },
  framePaddingInlineEx: {
    name: "Inline Padding",
    control: { type: "range", min: 0, max: 3, step: 0.05 },
    table: { category: "Frame Layout" },
  },
  showLayerBounds: {
    name: "Show Layer Bounds",
    control: { type: "boolean" },
    table: { category: "Debug" },
  },
  showBackdrop: {
    name: "Show Backdrop",
    control: { type: "boolean" },
    table: { category: "Backdrop" },
  },
};

export const LINE_LABEL_COMPONENT_ARG_TYPES = {
  ...LINE_LABEL_COMPONENT_BASE_ARG_TYPES,
  brightOnDarkTextColor: LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES.textColor,
  brightOnDarkTextBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES.textBlendMode,
  brightOnDarkBackdropBackgroundColor:
    LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES.backdropBackgroundColor,
  brightOnDarkBackdropBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES.backdropBlendMode,
  brightOnDarkSurfaceBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_SURFACE_ARG_TYPES.surfaceBlendMode,
  darkOnBrightTextColor: LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES.textColor,
  darkOnBrightTextBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES.textBlendMode,
  darkOnBrightBackdropBackgroundColor:
    LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES.backdropBackgroundColor,
  darkOnBrightBackdropBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES.backdropBlendMode,
  darkOnBrightSurfaceBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_SURFACE_ARG_TYPES.surfaceBlendMode,
};

export const LINE_LABEL_ECHO_COMPONENT_ARG_TYPES = {
  ...LINE_LABEL_COMPONENT_BASE_ARG_TYPES,
  brightOnDarkTextColor: LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.textColor,
  brightOnDarkTextBlendMode: LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.textBlendMode,
  brightOnDarkTextEchoColor: LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.textEchoColor,
  brightOnDarkBackdropBackgroundColor:
    LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.backdropBackgroundColor,
  brightOnDarkBackdropBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.backdropBlendMode,
  brightOnDarkSurfaceBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.surfaceBlendMode,
  brightOnDarkTextEchoBlendMode:
    LINE_LABEL_BRIGHT_ON_DARK_ARG_TYPES.textEchoBlendMode,
  darkOnBrightTextColor: LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.textColor,
  darkOnBrightTextBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.textBlendMode,
  darkOnBrightTextEchoColor:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.textEchoColor,
  darkOnBrightBackdropBackgroundColor:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.backdropBackgroundColor,
  darkOnBrightBackdropBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.backdropBlendMode,
  darkOnBrightSurfaceBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.surfaceBlendMode,
  darkOnBrightTextEchoBlendMode:
    LINE_LABEL_DARK_ON_BRIGHT_ARG_TYPES.textEchoBlendMode,
  textEchoBlurPx: {
    name: "Echo Blur",
    control: { type: "range", min: 0, max: 16, step: 1 },
    table: { category: "Echo Layer" },
  },
  textEchoOpacity: {
    name: "Echo Opacity",
    control: { type: "range", min: 0, max: 1, step: 0.01 },
    table: { category: "Echo Layer" },
  },
};

export const DISTANCE_TRIANGLE_OVERLAY_ARGS: DistanceTriangleOverlayStoryArgs =
  {
    backgroundMode: DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
    dashed: true,
    labelTheme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
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

const LINE_LABEL_COMPONENT_BASE_ARGS: LineLabelComponentStoryArgs = {
  backgroundMode: DISTANCE_TRIANGLE_OVERLAY_BACKGROUND_MODES.BARMEN,
  fontFamily: annotationTypographyDefaults.fontFamily,
  fontWeight: previewLineLabelVisualDefaults.fontWeight,
  showLayerBounds: false,
  showBackdrop: true,
};

export const LINE_LABEL_COMPONENT_ARGS: LineLabelComponentStoryArgs = {
  ...LINE_LABEL_COMPONENT_BASE_ARGS,
};

export const LINE_LABEL_ECHO_COMPONENT_ARGS: LineLabelComponentStoryArgs = {
  ...LINE_LABEL_COMPONENT_BASE_ARGS,
  showBackdrop: false,
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
