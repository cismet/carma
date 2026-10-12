import {
  annotationLineLabelDefaults,
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { annotationVisualDefaults } from "../config/annotation-visual-defaults";
import {
  createTextOverlayElement,
  setTextOverlayText,
} from "../render/text-overlay";
import type { AnnotationScreenPosition } from "../engine";
import {
  resolveAnnotationLineLabelTransform,
  resolveLabelOffsetPosition,
  type AnnotationLineLabelKind,
} from "./line-label-placement";

import "./annotation-overlay-line-label.css";

export type AuthoringSegmentLineLabels = {
  direct: HTMLDivElement;
  vertical: HTMLDivElement;
  horizontal: HTMLDivElement;
};

const LINE_LABEL_CLASS_NAME = "carma-annotation-overlay-line-label";
const LINE_LABEL_FRAME_CLASS_NAME =
  "carma-annotation-overlay-line-label__frame";

const createDiv = (className: string) => {
  const element = document.createElement("div");
  element.className = className;
  return element;
};

const readLineLabelKind = (element: HTMLDivElement): AnnotationLineLabelKind =>
  element.dataset.annotationOverlayLineLabelKind === "vertical" ||
  element.dataset.annotationOverlayLineLabelKind === "horizontal"
    ? element.dataset.annotationOverlayLineLabelKind
    : "direct";

const readShortEdgeOffsetPx = (element: HTMLDivElement): number => {
  const rawValue = element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx;
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  return Number.isFinite(parsedValue)
    ? parsedValue
    : annotationLineLabelDefaults.layout.shortEdgeOffsetPx;
};

export const createLineLabel = (
  accentColor: string,
  visualOptions?: PartialAnnotationLineLabelOptions
) => {
  const resolvedVisualOptions =
    resolveAnnotationLineLabelOptions(visualOptions);
  const element = createDiv(LINE_LABEL_CLASS_NAME);
  const frame = createDiv(LINE_LABEL_FRAME_CLASS_NAME);
  const textOverlay = createTextOverlayElement({
    accentColor,
    visualOptions: resolvedVisualOptions,
  });
  element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx = String(
    resolvedVisualOptions.layout.shortEdgeOffsetPx
  );
  frame.append(textOverlay);
  element.appendChild(frame);
  return element;
};

export const createSegmentLineLabels = (
  visualOptions?: PartialAnnotationLineLabelOptions
): AuthoringSegmentLineLabels => {
  const resolvedVisualOptions =
    resolveAnnotationLineLabelOptions(visualOptions);
  const accents = annotationVisualDefaults.colors.componentLabelAccents;
  const createKindLabel = (kind: AnnotationLineLabelKind) => {
    const label = createLineLabel(accents[kind], resolvedVisualOptions);
    label.dataset.annotationOverlayLineLabelKind = kind;
    return label;
  };

  return {
    direct: createKindLabel("direct"),
    vertical: createKindLabel("vertical"),
    horizontal: createKindLabel("horizontal"),
  };
};

export const hideLineLabels = (lineLabels: AuthoringSegmentLineLabels) => {
  lineLabels.direct.style.display = "none";
  lineLabels.vertical.style.display = "none";
  lineLabels.horizontal.style.display = "none";
};

export const applyLineLabel = ({
  element,
  text,
  start,
  end,
  outsideReferencePoint,
  anchorRatio,
}: {
  element: HTMLDivElement;
  text: string;
  start: AnnotationScreenPosition;
  end: AnnotationScreenPosition;
  outsideReferencePoint?: AnnotationScreenPosition | null;
  /** No effect: short-edge labels read horizontally. Kept for existing callers. */
  flipReadingDirection?: boolean;
  anchorRatio?: number;
}) => {
  const kind = readLineLabelKind(element);
  const labelPosition = resolveLabelOffsetPosition({
    start,
    end,
    kind,
    outsideReferencePoint,
    shortEdgeOffsetPx: readShortEdgeOffsetPx(element),
    useShortEdgeRules: kind === "vertical",
    anchorRatio,
    previousShouldFlip:
      element.dataset.annotationOverlayLineLabelNormalFlip === "1",
  });
  if (!labelPosition) {
    element.style.display = "none";
    return;
  }

  setTextOverlayText(element, text);

  element.style.display = "block";

  element.dataset.annotationOverlayLineLabelShortEdge =
    labelPosition.isShortEdge ? "true" : "false";
  element.dataset.annotationOverlayLineLabelAnchorRatio = `${labelPosition.anchorRatio}`;
  element.dataset.annotationOverlayLineLabelNormalFlip =
    labelPosition.shouldFlip ? "1" : "0";
  element.style.transform = resolveAnnotationLineLabelTransform(labelPosition);
};
