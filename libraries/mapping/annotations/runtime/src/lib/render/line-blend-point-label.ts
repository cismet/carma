import type { CSSProperties, ReactNode } from "react";
import {
  getPointLabelOverlayContentSignature,
  type PointLabelOverlayRenderState,
} from "@carma-providers/label-overlay";

import type { AnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import { RUNTIME_POINT_LABEL_RENDER_STYLE } from "./annotation-render-models";

/** An area value whose area lies behind something shows at half strength. */
export const AREA_LABEL_OCCLUDED_OPACITY = "0.5";

export type AreaLabelSize = { width: number; height: number };

/** A first guess at an area value's drawn size, before it was ever measured. */
export const estimateAreaLabelSize = (content: ReactNode): AreaLabelSize => {
  const text = typeof content === "string" ? content : String(content ?? "");
  return { width: text.length * 8.5, height: 18 };
};

/** The glyphs' size only: the text's padding, halo and backdrop may reach over the area's edges. */
export const measureAreaLabelGlyphs = (
  elementDiv: HTMLElement
): AreaLabelSize | null => {
  const text = elementDiv.firstElementChild as HTMLElement | null;
  if (!text || text.offsetWidth <= 0) {
    return null;
  }

  const style = getComputedStyle(text);
  const width =
    text.offsetWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  const height =
    text.offsetHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);
  return width > 0 && height > 0 ? { width, height } : null;
};

export const getLineBlendPointLabelContentSignature = ({
  state,
  lineLabelOptions,
  surfaceBlendMode,
}: {
  state: PointLabelOverlayRenderState;
  lineLabelOptions: AnnotationLineLabelOptions;
  surfaceBlendMode?: CSSProperties["mixBlendMode"];
}) =>
  [
    RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND,
    getPointLabelOverlayContentSignature(state),
    lineLabelOptions.appearance.themeStyle,
    lineLabelOptions.background.style,
    lineLabelOptions.text.fontFamily,
    lineLabelOptions.text.fontWeight,
    surfaceBlendMode ?? "",
  ].join(":");

export const applyLineBlendPointLabelOverlayState = ({
  elementDiv,
  state,
}: {
  elementDiv: HTMLElement;
  state: PointLabelOverlayRenderState;
}) => {
  if (!state.screenPosition || state.visible === false) {
    return false;
  }

  elementDiv.style.left = `${state.screenPosition.x}px`;
  elementDiv.style.top = `${state.screenPosition.y}px`;
  elementDiv.style.transform = "translate(-50%, -50%)";
  elementDiv.style.zIndex = `${state.zIndex ?? 0}`;
  elementDiv.style.opacity = state.isOccluded ? "0.75" : "1";
  return true;
};
