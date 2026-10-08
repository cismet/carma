import {
  ANNOTATION_CURSOR_DEFAULT_CANVAS_SIZE_PX,
  ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  ANNOTATION_CURSOR_DEFAULT_VIEWBOX,
  ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  buildAnnotationCursorForegroundSvgMarkup,
  buildAnnotationCursorShadowSvgMarkup,
  encodeAnnotationCursorSvgDataUrl,
} from "@carma-commons/ui/components";

/** Host attribute that switches the canvas and the photo preview to the query cursor. */
export const QUERY_CURSOR_HOST_ATTRIBUTE = "data-oblique-query-cursor";
/** Elements inside the photo preview that keep the query cursor. */
export const QUERY_SURFACE_SELECTOR = "[data-oblique-preview-surface]";
const QUERY_SURFACE_EXCLUDED_SELECTOR =
  "button,a,input,select,textarea,[data-oblique-coverage-ui]";

let cursorCssValue: string | null = null;

/**
 * The crosshair of the Cesium point query (`useCursorOverlay`: shadow aura plus
 * foreground strokes from `@carma-commons/ui/components`) as one CSS cursor
 * image, hot spot in its centre.
 */
export const resolveQueryCursorCssValue = (): string => {
  if (cursorCssValue) return cursorCssValue;
  const size = ANNOTATION_CURSOR_DEFAULT_CANVAS_SIZE_PX;
  const layer = {
    pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
    sizePx: size,
    viewBox: ANNOTATION_CURSOR_DEFAULT_VIEWBOX,
  };
  const markup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    buildAnnotationCursorShadowSvgMarkup({
      ...layer,
      shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
      shadowStrokeColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
      shadowStrokeLinejoin: "round",
      shadowStrokeWidth: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
    }),
    buildAnnotationCursorForegroundSvgMarkup({
      ...layer,
      foregroundFill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
    }),
    "</svg>",
  ].join("");
  const hotSpot = Math.floor(size / 2);
  cursorCssValue = `url("${encodeAnnotationCursorSvgDataUrl(
    markup
  )}") ${hotSpot} ${hotSpot}, crosshair`;
  return cursorCssValue;
};

/** The map canvas and the photo preview, excluding controls on top of it. */
export const isQuerySurfaceTarget = (
  target: EventTarget | null,
  canvas: HTMLCanvasElement
): boolean =>
  target === canvas ||
  (target instanceof Element &&
    !!target.closest(QUERY_SURFACE_SELECTOR) &&
    !target.closest(QUERY_SURFACE_EXCLUDED_SELECTOR));

let styleElement: HTMLStyleElement | null = null;
let styleUsers = 0;

/**
 * Shows the query cursor over the map canvas and the photo preview below
 * `host`. The rule is `!important` because MapLibre, the footprint hover and
 * the preview backdrop set inline cursors on those elements.
 */
export const mountQueryCursorStyle = (host: HTMLElement): (() => void) => {
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.setAttribute(QUERY_CURSOR_HOST_ATTRIBUTE, "style");
    const scope = `[${QUERY_CURSOR_HOST_ATTRIBUTE}="true"]`;
    styleElement.textContent = `${scope} canvas.maplibregl-canvas,${scope} ${QUERY_SURFACE_SELECTOR},${scope} ${QUERY_SURFACE_SELECTOR} *{cursor:${resolveQueryCursorCssValue()} !important;}`;
    document.head.appendChild(styleElement);
  }
  styleUsers++;
  host.setAttribute(QUERY_CURSOR_HOST_ATTRIBUTE, "true");
  let mounted = true;
  return () => {
    if (!mounted) return;
    mounted = false;
    host.removeAttribute(QUERY_CURSOR_HOST_ATTRIBUTE);
    styleUsers--;
    if (styleUsers === 0) {
      styleElement?.remove();
      styleElement = null;
    }
  };
};
