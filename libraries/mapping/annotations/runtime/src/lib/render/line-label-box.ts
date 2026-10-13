import type { Rect } from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import { setTextOverlayText } from "./text-overlay";
import type { AnnotationLineLabelPlacement } from "../interaction/line-label-placement";

/** Unrotated border-box size of a line label showing `text`. */
export type LineLabelBox = {
  text: string;
  width: number;
  height: number;
  layoutKey?: string;
};

const MEASURE_TRANSFORM =
  "translate(0px, 0px) translate(-50%, -50%) rotate(0rad)";

const lineLabelBoxByElement = new WeakMap<HTMLElement, LineLabelBox>();
const fontLayoutVersions = new WeakMap<Document, number>();
const POSITION_DECLARATIONS = /(?:^|\s)(?:display|left|top|transform):[^;]*;/g;

/** Style/content/viewport changes invalidate size without per-candidate style reads. */
const readLayoutKey = (element: HTMLElement) => {
  const document = element.ownerDocument;
  if (!fontLayoutVersions.has(document)) {
    fontLayoutVersions.set(document, 0);
    document.fonts?.addEventListener("loadingdone", () => {
      fontLayoutVersions.set(
        document,
        (fontLayoutVersions.get(document) ?? 0) + 1
      );
    });
  }
  const view = document.defaultView;
  return `${fontLayoutVersions.get(document)}|${view?.innerWidth}:${
    view?.innerHeight
  }|${element.className}|${element.style.cssText.replace(
    POSITION_DECLARATIONS,
    ""
  )}|${element.innerHTML}`;
};

const ORIGIN = Object.freeze({ x: 0, y: 0 }) as CssPixelPosition;

/** Client position of the box the label is laid out in (its layer has no border). */
export const readLineLabelLayerOrigin = (
  element: HTMLElement
): CssPixelPosition => {
  const rect = element.parentElement?.getBoundingClientRect();
  return rect ? ({ x: rect.left, y: rect.top } as CssPixelPosition) : ORIGIN;
};

const writeMeasureState = (element: HTMLElement, text: string) => {
  setTextOverlayText(element, text);
  element.style.display = "block";
  element.style.transform = MEASURE_TRANSFORM;
};

const readMeasuredBox = (
  element: HTMLElement,
  text: string
): LineLabelBox | null => {
  const { width, height } = element.getBoundingClientRect();
  if (!(width > 0 && height > 0)) return null;
  const box = { text, width, height, layoutKey: readLayoutKey(element) };
  lineLabelBoxByElement.set(element, box);
  return box;
};

/**
 * The label's size for `text`, measured once per text (one layout read) and
 * cached per element; null while the label has no layout. Leaves the label
 * shown at the layer origin when it measures: the caller places it after.
 */
export const measureLineLabelBox = (
  element: HTMLElement,
  text: string
): LineLabelBox | null => {
  const cached = lineLabelBoxByElement.get(element);
  if (cached?.text === text && cached.layoutKey === readLayoutKey(element))
    return cached;
  writeMeasureState(element, text);
  return readMeasuredBox(element, text);
};

/** Measures every uncached label with all writes before all reads: one layout for the batch. */
export const measureLineLabelBoxes = (
  labels: readonly { element: HTMLElement; text: string }[]
) => {
  const misses = labels.filter(({ element, text }) => {
    const cached = lineLabelBoxByElement.get(element);
    return cached?.text !== text || cached.layoutKey !== readLayoutKey(element);
  });
  misses.forEach(({ element, text }) => writeMeasureState(element, text));
  misses.forEach(({ element, text }) => readMeasuredBox(element, text));
};

/**
 * The client rect `getBoundingClientRect` reports for the label placed with
 * `resolveAnnotationLineLabelTransform`: the box centred on the rounded
 * anchor (shifted half a width for a left or right anchor), rotated about its
 * centre, as its axis-aligned bounds.
 */
export const resolveLineLabelBoxRect = (
  { x, y, angleRad, anchor }: AnnotationLineLabelPlacement,
  { width, height }: LineLabelBox,
  origin: CssPixelPosition
): Rect => {
  const centerX =
    origin.x +
    Math.round(x) +
    (anchor === "left" ? width / 2 : anchor === "right" ? -width / 2 : 0);
  const centerY = origin.y + Math.round(y);
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  const halfWidth = (width * cos + height * sin) / 2;
  const halfHeight = (width * sin + height * cos) / 2;
  return {
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
  };
};
