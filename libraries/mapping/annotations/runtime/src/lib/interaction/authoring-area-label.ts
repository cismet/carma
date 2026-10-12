import type { Vector3 } from "three";
import type { CssPixelPosition } from "@carma-units";

import {
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import {
  TEXT_OVERLAY_AREA_LABEL_STYLE,
  createTextOverlayElement,
  setTextOverlayText,
} from "../render/text-overlay";
import type { AnnotationEngine } from "../engine";
import { applyStyles } from "./authoring-overlay-layer";
import { worldToCssPixelPosition } from "./css-pixel-position";

export type AuthoringAreaLabelState = {
  text: string;
  screenPosition: CssPixelPosition | null;
};

/** An area label before it is projected: its text and the world point it hangs on. */
export type AuthoringAreaLabelAnchor = {
  text: string;
  anchorECEF: Vector3;
};

export const resolveAreaLabelScreenState = (
  engine: AnnotationEngine,
  label: AuthoringAreaLabelAnchor | null
): AuthoringAreaLabelState | null =>
  label
    ? {
        text: label.text,
        screenPosition: worldToCssPixelPosition(engine, label.anchorECEF),
      }
    : null;

export type AuthoringAreaLabelController = {
  setState: (state: AuthoringAreaLabelState | null) => void;
  destroy: () => void;
};

const applyAreaLabel = (
  element: HTMLDivElement,
  state: AuthoringAreaLabelState | null
) => {
  if (!state?.screenPosition) {
    element.style.display = "none";
    return;
  }

  setTextOverlayText(element, state.text);
  element.style.display = "inline-grid";
  element.style.transform = `translate(${Math.round(
    state.screenPosition.x
  )}px, ${Math.round(state.screenPosition.y)}px) translate(-50%, -50%)`;
};

export const createAreaLabelController = ({
  overlayLayer,
  accentColor,
  visualOptions,
}: {
  overlayLayer: HTMLElement | null;
  accentColor: string;
  visualOptions?: PartialAnnotationLineLabelOptions;
}): AuthoringAreaLabelController => {
  const element = createTextOverlayElement({
    accentColor,
    visualOptions: resolveAnnotationLineLabelOptions(visualOptions),
    styleOptions: TEXT_OVERLAY_AREA_LABEL_STYLE,
  });
  element.dataset.annotationOverlayLineLabelKind = "area";
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    willChange: "transform",
  });
  overlayLayer?.appendChild(element);

  return {
    setState: (state) => applyAreaLabel(element, state),
    destroy: () => element.remove(),
  };
};
