import {
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX,
  ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX,
  ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  buildAnnotationCursorForegroundSvgMarkup,
  buildAnnotationCursorShadowSvgMarkup,
} from "@carma-commons/ui/components";

export const CURSOR_RENDER_MODES = {
  DOM: "dom",
  CURSOR_URL: "cursor-url",
} as const;

export type CursorRenderMode =
  (typeof CURSOR_RENDER_MODES)[keyof typeof CURSOR_RENDER_MODES];

const CURSOR_CANVAS_HALF_EXTENT_PX =
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX;
const CURSOR_CANVAS_SIZE_PX = CURSOR_CANVAS_HALF_EXTENT_PX * 2;
const CURSOR_VIEW_BOX = `${-CURSOR_CANVAS_HALF_EXTENT_PX} ${-CURSOR_CANVAS_HALF_EXTENT_PX} ${CURSOR_CANVAS_SIZE_PX} ${CURSOR_CANVAS_SIZE_PX}`;

const SHADOW_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
} as const;

const FOREGROUND_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
} as const;

const SVG_HOST_STYLE = {
  position: "absolute",
  inset: 0,
  width: CURSOR_CANVAS_SIZE_PX,
  height: CURSOR_CANVAS_SIZE_PX,
  pointerEvents: "none",
} as const;

const SHADOW_LAYER_MARKUP = buildAnnotationCursorShadowSvgMarkup({
  pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  rootStyleText: `display:block;overflow:visible;mix-blend-mode:${ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE};`,
  shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  shadowStrokeColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  shadowStrokeLinejoin: "round",
  shadowStrokeWidth: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
  sizePx: CURSOR_CANVAS_SIZE_PX,
  viewBox: CURSOR_VIEW_BOX,
});

const FOREGROUND_LAYER_MARKUP = buildAnnotationCursorForegroundSvgMarkup({
  pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  foregroundFill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  rootStyleText: "display:block;overflow:visible;mix-blend-mode:normal;",
  sizePx: CURSOR_CANVAS_SIZE_PX,
  viewBox: CURSOR_VIEW_BOX,
});

export const CursorOverlayGeometryLayers = () => (
  <>
    <div
      aria-hidden="true"
      style={{ ...SVG_HOST_STYLE, ...SHADOW_LAYER_STYLE }}
      dangerouslySetInnerHTML={{ __html: SHADOW_LAYER_MARKUP }}
    />
    <div
      aria-hidden="true"
      style={{ ...SVG_HOST_STYLE, ...FOREGROUND_LAYER_STYLE }}
      dangerouslySetInnerHTML={{ __html: FOREGROUND_LAYER_MARKUP }}
    />
  </>
);
