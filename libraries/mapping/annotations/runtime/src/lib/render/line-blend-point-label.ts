import type { CSSProperties } from "react";
import {
  getPointLabelOverlayContentSignature,
  type PointLabelOverlayRenderState,
} from "@carma-providers/label-overlay";

import type { AnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import { RUNTIME_POINT_LABEL_RENDER_STYLE } from "./annotation-render-models";

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
