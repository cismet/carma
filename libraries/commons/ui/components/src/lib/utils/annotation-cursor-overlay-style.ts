export const ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR =
  "rgba(255, 255, 255, 0.96)";
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR = "rgba(56, 56, 56, 1)";
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_OPACITY = 0.3;
export const ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX = 0.5;
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX = 1;
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_DROP_SHADOW_RADIUS_PX = 1;
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE = "normal";
export const ANNOTATION_CURSOR_OVERLAY_SHADOW_FILTER = `drop-shadow(0 0 ${ANNOTATION_CURSOR_OVERLAY_SHADOW_DROP_SHADOW_RADIUS_PX}px ${ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR})`;
export const ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX = 3;
export const ANNOTATION_CURSOR_OVERLAY_CENTER_DOT_SIZE_PX = 1;
export const ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX = 5;
export const ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX = 12;
export const ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX =
  ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX / 2;
export const ANNOTATION_CURSOR_OVERLAY_HALF_EXTENT_PX =
  ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX +
  ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX;
export const ANNOTATION_CURSOR_OVERLAY_SIZE_PX =
  ANNOTATION_CURSOR_OVERLAY_HALF_EXTENT_PX * 2 +
  ANNOTATION_CURSOR_OVERLAY_CENTER_DOT_SIZE_PX;
export const ANNOTATION_CURSOR_OVERLAY_CENTER_PX =
  ANNOTATION_CURSOR_OVERLAY_HALF_EXTENT_PX;

export type AnnotationCursorOverlayStrokeCapMode = "round" | "square";

export type AnnotationCursorOverlayPartDefinition = {
  key: string;
  style: Readonly<Record<string, string>>;
};

export const annotationCursorOverlayElementStyle = Object.freeze({
  position: "absolute",
  left: "0",
  top: "0",
  width: `${ANNOTATION_CURSOR_OVERLAY_SIZE_PX}px`,
  height: `${ANNOTATION_CURSOR_OVERLAY_SIZE_PX}px`,
  pointerEvents: "none",
  willChange: "transform",
});

export const annotationCursorOverlayForegroundLayerStyle = Object.freeze({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
  mixBlendMode: "normal",
});

export const annotationCursorOverlayShadowLayerStyle = Object.freeze({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
  mixBlendMode: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
  filter: ANNOTATION_CURSOR_OVERLAY_SHADOW_FILTER,
  opacity: `${ANNOTATION_CURSOR_OVERLAY_SHADOW_OPACITY}`,
});

const resolvePolygonClipPath = (
  points: ReadonlyArray<readonly [number, number]>
) => `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(", ")})`;

const buildHorizontalRightDashPoints = ({
  widthPx,
  heightPx,
  innerTipPx,
}: {
  widthPx: number;
  heightPx: number;
  innerTipPx: number;
}) =>
  [
    [0, heightPx / 2],
    [innerTipPx, 0],
    [widthPx, 0],
    [widthPx, heightPx],
    [innerTipPx, heightPx],
  ] as const;

const buildHorizontalLeftDashPoints = ({
  widthPx,
  heightPx,
  innerTipPx,
}: {
  widthPx: number;
  heightPx: number;
  innerTipPx: number;
}) =>
  [
    [0, 0],
    [widthPx - innerTipPx, 0],
    [widthPx, heightPx / 2],
    [widthPx - innerTipPx, heightPx],
    [0, heightPx],
  ] as const;

const buildVerticalBottomDashPoints = ({
  widthPx,
  heightPx,
  innerTipPx,
}: {
  widthPx: number;
  heightPx: number;
  innerTipPx: number;
}) =>
  [
    [0, innerTipPx],
    [widthPx / 2, 0],
    [widthPx, innerTipPx],
    [widthPx, heightPx],
    [0, heightPx],
  ] as const;

const buildVerticalTopDashPoints = ({
  widthPx,
  heightPx,
  innerTipPx,
}: {
  widthPx: number;
  heightPx: number;
  innerTipPx: number;
}) =>
  [
    [0, 0],
    [widthPx, 0],
    [widthPx, heightPx - innerTipPx],
    [widthPx / 2, heightPx],
    [0, heightPx - innerTipPx],
  ] as const;

const buildAnnotationCursorOverlayTickPartDefinitions = ({
  backgroundColor,
  outlinePx,
}: {
  backgroundColor: string;
  outlinePx: number;
}): readonly AnnotationCursorOverlayPartDefinition[] => {
  const clampedOutlinePx = Math.max(outlinePx, 0);
  const widthPx =
    ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX + clampedOutlinePx * 2;
  const heightPx =
    ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX + clampedOutlinePx * 2;
  const innerTipPx = ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX + clampedOutlinePx;

  return [
    {
      key: "center-dot",
      style: Object.freeze({
        position: "absolute",
        left: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        top: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        width: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_DOT_SIZE_PX + clampedOutlinePx * 2
        }px`,
        height: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_DOT_SIZE_PX + clampedOutlinePx * 2
        }px`,
        transform: "translate(-50%, -50%)",
        borderRadius: "999px",
        backgroundColor,
      }),
    },
    {
      key: "h-right-dash",
      style: Object.freeze({
        position: "absolute",
        left: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_PX +
          ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX -
          clampedOutlinePx
        }px`,
        top: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        transform: "translateY(-50%)",
        clipPath: resolvePolygonClipPath(
          buildHorizontalRightDashPoints({
            widthPx,
            heightPx,
            innerTipPx,
          })
        ),
        backgroundColor,
      }),
    },
    {
      key: "h-left-dash",
      style: Object.freeze({
        position: "absolute",
        left: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_PX -
          ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX -
          ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX -
          clampedOutlinePx
        }px`,
        top: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        transform: "translateY(-50%)",
        clipPath: resolvePolygonClipPath(
          buildHorizontalLeftDashPoints({
            widthPx,
            heightPx,
            innerTipPx,
          })
        ),
        backgroundColor,
      }),
    },
    {
      key: "v-bottom-dash",
      style: Object.freeze({
        position: "absolute",
        left: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        top: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_PX +
          ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX -
          clampedOutlinePx
        }px`,
        width: `${heightPx}px`,
        height: `${widthPx}px`,
        transform: "translateX(-50%)",
        clipPath: resolvePolygonClipPath(
          buildVerticalBottomDashPoints({
            widthPx: heightPx,
            heightPx: widthPx,
            innerTipPx,
          })
        ),
        backgroundColor,
      }),
    },
    {
      key: "v-top-dash",
      style: Object.freeze({
        position: "absolute",
        left: `${ANNOTATION_CURSOR_OVERLAY_CENTER_PX}px`,
        top: `${
          ANNOTATION_CURSOR_OVERLAY_CENTER_PX -
          ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX -
          ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX -
          clampedOutlinePx
        }px`,
        width: `${heightPx}px`,
        height: `${widthPx}px`,
        transform: "translateX(-50%)",
        clipPath: resolvePolygonClipPath(
          buildVerticalTopDashPoints({
            widthPx: heightPx,
            heightPx: widthPx,
            innerTipPx,
          })
        ),
        backgroundColor,
      }),
    },
  ];
};

const buildAnnotationCursorOverlayForegroundPartDefinitions = (
  backgroundColor: string
): readonly AnnotationCursorOverlayPartDefinition[] =>
  buildAnnotationCursorOverlayTickPartDefinitions({
    backgroundColor,
    outlinePx: 0,
  });

export const buildAnnotationCursorOverlayForegroundStrokePartDefinitions = ({
  backgroundColor,
  strokeCap: _strokeCap = "round",
}: {
  backgroundColor: string;
  strokeCap?: AnnotationCursorOverlayStrokeCapMode;
}): readonly AnnotationCursorOverlayPartDefinition[] =>
  buildAnnotationCursorOverlayForegroundPartDefinitions(backgroundColor);

export const buildAnnotationCursorOverlayShadowPartDefinitions = ({
  backgroundColor,
  outlinePx = ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  strokeCap: _strokeCap = "round",
}: {
  backgroundColor: string;
  outlinePx?: number;
  strokeCap?: AnnotationCursorOverlayStrokeCapMode;
}): readonly AnnotationCursorOverlayPartDefinition[] =>
  buildAnnotationCursorOverlayTickPartDefinitions({
    backgroundColor,
    outlinePx,
  });

export const annotationCursorOverlayForegroundPartDefinitions =
  buildAnnotationCursorOverlayForegroundPartDefinitions(
    ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR
  );

export const annotationCursorOverlayShadowPartDefinitions =
  buildAnnotationCursorOverlayShadowPartDefinitions({
    backgroundColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  });

export const annotationCursorOverlayPartDefinitions =
  annotationCursorOverlayForegroundPartDefinitions;
