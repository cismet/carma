import {
  ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX,
  ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX,
  ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX,
  ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX,
} from "./annotation-cursor-overlay-style";

export type AnnotationCursorSvgPathDefinition = {
  key: string;
  pathD: string;
};

export const ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX =
  ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX +
  ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX;
export const ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX = 10;
export const ANNOTATION_CURSOR_DEFAULT_CANVAS_SIZE_PX =
  (ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
    ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX) *
  2;
export const ANNOTATION_CURSOR_DEFAULT_VIEWBOX = `${-(
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX
)} ${-(
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX
)} ${ANNOTATION_CURSOR_DEFAULT_CANVAS_SIZE_PX} ${ANNOTATION_CURSOR_DEFAULT_CANVAS_SIZE_PX}`;

const DEFAULT_HALF_STROKE_WIDTH_PX = ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX / 2;
const DEFAULT_GAP_PX = ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX;
const DEFAULT_DASH_LENGTH_PX = ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX;
const DEFAULT_INNER_TIP_PX = ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX;

export const ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS: readonly AnnotationCursorSvgPathDefinition[] =
  Object.freeze([
    {
      key: "right",
      pathD: `M ${DEFAULT_GAP_PX} 0 L ${
        DEFAULT_GAP_PX + DEFAULT_INNER_TIP_PX
      } ${-DEFAULT_HALF_STROKE_WIDTH_PX} L ${
        DEFAULT_GAP_PX + DEFAULT_DASH_LENGTH_PX
      } ${-DEFAULT_HALF_STROKE_WIDTH_PX} L ${
        DEFAULT_GAP_PX + DEFAULT_DASH_LENGTH_PX
      } ${DEFAULT_HALF_STROKE_WIDTH_PX} L ${
        DEFAULT_GAP_PX + DEFAULT_INNER_TIP_PX
      } ${DEFAULT_HALF_STROKE_WIDTH_PX} Z`,
    },
    {
      key: "left",
      pathD: `M ${
        -DEFAULT_GAP_PX - DEFAULT_DASH_LENGTH_PX
      } ${-DEFAULT_HALF_STROKE_WIDTH_PX} L ${
        -DEFAULT_GAP_PX - DEFAULT_INNER_TIP_PX
      } ${-DEFAULT_HALF_STROKE_WIDTH_PX} L ${-DEFAULT_GAP_PX} 0 L ${
        -DEFAULT_GAP_PX - DEFAULT_INNER_TIP_PX
      } ${DEFAULT_HALF_STROKE_WIDTH_PX} L ${
        -DEFAULT_GAP_PX - DEFAULT_DASH_LENGTH_PX
      } ${DEFAULT_HALF_STROKE_WIDTH_PX} Z`,
    },
    {
      key: "bottom",
      pathD: `M ${-DEFAULT_HALF_STROKE_WIDTH_PX} ${
        DEFAULT_GAP_PX + DEFAULT_INNER_TIP_PX
      } L 0 ${DEFAULT_GAP_PX} L ${DEFAULT_HALF_STROKE_WIDTH_PX} ${
        DEFAULT_GAP_PX + DEFAULT_INNER_TIP_PX
      } L ${DEFAULT_HALF_STROKE_WIDTH_PX} ${
        DEFAULT_GAP_PX + DEFAULT_DASH_LENGTH_PX
      } L ${-DEFAULT_HALF_STROKE_WIDTH_PX} ${
        DEFAULT_GAP_PX + DEFAULT_DASH_LENGTH_PX
      } Z`,
    },
    {
      key: "top",
      pathD: `M ${-DEFAULT_HALF_STROKE_WIDTH_PX} ${
        -DEFAULT_GAP_PX - DEFAULT_DASH_LENGTH_PX
      } L ${DEFAULT_HALF_STROKE_WIDTH_PX} ${
        -DEFAULT_GAP_PX - DEFAULT_DASH_LENGTH_PX
      } L ${DEFAULT_HALF_STROKE_WIDTH_PX} ${
        -DEFAULT_GAP_PX - DEFAULT_INNER_TIP_PX
      } L 0 ${-DEFAULT_GAP_PX} L ${-DEFAULT_HALF_STROKE_WIDTH_PX} ${
        -DEFAULT_GAP_PX - DEFAULT_INNER_TIP_PX
      } Z`,
    },
  ]);

export const encodeAnnotationCursorSvgDataUrl = (svgMarkup: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

const CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT = 100;
const CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT = 300;

const buildCursorPathMarkup = ({
  additionalAttributes = "",
  fill,
  pathDefinitions,
  stroke,
  strokeLinejoin,
  strokeWidth,
}: {
  additionalAttributes?: string;
  fill: string;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  stroke?: string;
  strokeLinejoin?: "miter" | "round";
  strokeWidth?: number;
}) =>
  pathDefinitions
    .map(
      ({ pathD }) =>
        `<path d="${pathD}" fill="${fill}"${
          typeof stroke === "string" ? ` stroke="${stroke}"` : ""
        }${
          typeof strokeLinejoin === "string"
            ? ` stroke-linejoin="${strokeLinejoin}"`
            : ""
        }${
          typeof strokeWidth === "number"
            ? ` stroke-width="${strokeWidth}"`
            : ""
        }${additionalAttributes}/>`
    )
    .join("");

const buildSvgMarkupShell = ({
  contentMarkup,
  rootStyleText,
  sizePx,
  viewBox,
}: {
  contentMarkup: string;
  rootStyleText?: string;
  sizePx: number;
  viewBox: string;
}) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision"${
      typeof rootStyleText === "string" && rootStyleText.length > 0
        ? ` style="${rootStyleText}"`
        : ""
    }>`,
    contentMarkup,
    "</svg>",
  ].join("");

export const buildAnnotationCursorForegroundSvgMarkup = ({
  pathDefinitions,
  foregroundFill,
  rootStyleText,
  sizePx,
  viewBox,
}: {
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  foregroundFill: string;
  rootStyleText?: string;
  sizePx: number;
  viewBox: string;
}) =>
  buildSvgMarkupShell({
    contentMarkup: buildCursorPathMarkup({
      fill: foregroundFill,
      pathDefinitions,
    }),
    rootStyleText,
    sizePx,
    viewBox,
  });

export const buildAnnotationCursorForegroundSvgDataUrl = ({
  pathDefinitions,
  foregroundFill,
  sizePx,
  viewBox,
}: {
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  foregroundFill: string;
  sizePx: number;
  viewBox: string;
}) =>
  encodeAnnotationCursorSvgDataUrl(
    buildAnnotationCursorForegroundSvgMarkup({
      pathDefinitions,
      foregroundFill,
      sizePx,
      viewBox,
    })
  );

export const buildAnnotationCursorShadowSvgMarkup = ({
  pathDefinitions,
  shadowBlurPx,
  shadowStrokeColor,
  shadowStrokeLinejoin,
  shadowStrokeWidth,
  rootStyleText,
  sizePx,
  viewBox,
}: {
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shadowBlurPx: number;
  shadowStrokeColor: string;
  shadowStrokeLinejoin: "miter" | "round";
  shadowStrokeWidth: number;
  rootStyleText?: string;
  sizePx: number;
  viewBox: string;
}) => {
  const clampedShadowBlurPx = Math.max(shadowBlurPx, 0);
  const clampedShadowStrokeWidth = Math.max(shadowStrokeWidth, 0);
  const shadowFilterId = "cursor-shadow-blur";

  return buildSvgMarkupShell({
    contentMarkup: [
      clampedShadowBlurPx > 0
        ? `<defs><filter id="${shadowFilterId}" x="-${CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT}%" y="-${CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT}%" width="${CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT}%" height="${CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT}%"><feDropShadow dx="0" dy="0" stdDeviation="${clampedShadowBlurPx}" flood-color="${shadowStrokeColor}" flood-opacity="1"/></filter></defs>`
        : "",
      clampedShadowStrokeWidth > 0
        ? buildCursorPathMarkup({
            additionalAttributes:
              clampedShadowBlurPx > 0
                ? ` filter="url(#${shadowFilterId})"`
                : "",
            fill: shadowStrokeColor,
            pathDefinitions,
            stroke: shadowStrokeColor,
            strokeLinejoin: shadowStrokeLinejoin,
            strokeWidth: clampedShadowStrokeWidth,
          })
        : buildCursorPathMarkup({
            additionalAttributes:
              clampedShadowBlurPx > 0
                ? ` filter="url(#${shadowFilterId})"`
                : "",
            fill: shadowStrokeColor,
            pathDefinitions,
          }),
    ].join(""),
    rootStyleText,
    sizePx,
    viewBox,
  });
};

export const buildAnnotationCursorShadowSvgDataUrl = ({
  pathDefinitions,
  shadowBlurPx,
  shadowStrokeColor,
  shadowStrokeLinejoin,
  shadowStrokeWidth,
  sizePx,
  viewBox,
}: {
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shadowBlurPx: number;
  shadowStrokeColor: string;
  shadowStrokeLinejoin: "miter" | "round";
  shadowStrokeWidth: number;
  sizePx: number;
  viewBox: string;
}) =>
  encodeAnnotationCursorSvgDataUrl(
    buildAnnotationCursorShadowSvgMarkup({
      pathDefinitions,
      shadowBlurPx,
      shadowStrokeColor,
      shadowStrokeLinejoin,
      shadowStrokeWidth,
      sizePx,
      viewBox,
    })
  );
