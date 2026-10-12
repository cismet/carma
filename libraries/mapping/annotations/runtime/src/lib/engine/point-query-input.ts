import {
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  type AnnotationEnginePointQueryInputModifier,
  type AnnotationPointQueryOptions,
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
export const CLEARED_POINTER_POSITION: AnnotationScreenPosition = {
  x: Number.NaN,
  y: Number.NaN,
};
export const EMPTY_INPUT_MODIFIERS: readonly AnnotationEnginePointQueryInputModifier[] =
  [];
/**
 * A left pointer release counts as a click while it stays closer than this
 * to its press position (camera drags never create points).
 */
export const CLICK_PIXEL_TOLERANCE = 5;
export const LEFT_POINTER_BUTTON = 0;
/** A held modifier the hook registers no input action for (ctrl, alt). */
const UNSUPPORTED_INPUT_MODIFIER = "unsupported";

type PointerEventInputModifier =
  | AnnotationEnginePointQueryInputModifier
  | typeof UNSUPPORTED_INPUT_MODIFIER
  | undefined;

export type AnnotationPointQueryCallbacks = Pick<
  AnnotationPointQueryOptions,
  | "onBeforePointCreate"
  | "onPointCreate"
  | "onLineFinish"
  | "onPointerMove"
  | "onScreenPositionChange"
>;

/** The modifier key held during a pointer event, if any. */
export const getPointerEventInputModifier = (
  event: MouseEvent
): PointerEventInputModifier => {
  if (event.shiftKey) {
    return ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT;
  }

  if (event.ctrlKey || event.altKey) {
    return UNSUPPORTED_INPUT_MODIFIER;
  }

  return undefined;
};

/** The pointer position relative to the canvas. */
export const getCanvasScreenPosition = (
  canvas: HTMLCanvasElement,
  event: MouseEvent
): AnnotationScreenPosition => {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

export const areScreenPositionsEqual = (
  left: AnnotationScreenPosition,
  right: AnnotationScreenPosition
) => left === right || (left.x === right.x && left.y === right.y);

export const copyScreenPosition = (
  source: AnnotationScreenPosition,
  target: AnnotationScreenPosition | null
): AnnotationScreenPosition => {
  if (!target) {
    return { x: source.x, y: source.y };
  }

  target.x = source.x;
  target.y = source.y;
  return target;
};
