import { toAlphabeticSequence } from "../../utils/annotationTokens";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
  type AnnotationShortLabelKind,
} from "../../types/annotationTypes";
export { toAlphabeticSequence } from "../../utils/annotationTokens";
export type { AnnotationShortLabelKind } from "../../types/annotationTypes";

export type AnnotationShortLabelCounterStyle = "numeric" | "alphabetic";

export type AnnotationShortLabelStyleConfig = {
  prefix: string;
  counterStyle: AnnotationShortLabelCounterStyle;
  backgroundColor: string;
  textColor: string;
};

export type AnnotationShortLabelConfigMap = Record<
  AnnotationShortLabelKind,
  AnnotationShortLabelStyleConfig
>;

export const DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG: AnnotationShortLabelConfigMap =
  {
    [SPATIAL_MARKUP_KIND_POINT]: {
      prefix: "",
      counterStyle: "numeric",
      backgroundColor: "rgba(200, 200, 200, 0.92)",
      textColor: "#111111",
    },
    [SPATIAL_MARKUP_KIND_DISTANCE]: {
      prefix: "",
      counterStyle: "alphabetic",
      backgroundColor: "rgba(102, 126, 234, 0.95)",
      textColor: "#ffffff",
    },
    [SPATIAL_MARKUP_KIND_POLYLINE]: {
      prefix: "L",
      counterStyle: "numeric",
      backgroundColor: "rgba(226, 178, 60, 0.95)",
      textColor: "#111111",
    },
    [SPATIAL_MARKUP_KIND_AREA]: {
      prefix: "A",
      counterStyle: "numeric",
      backgroundColor: "rgba(111, 188, 123, 0.95)",
      textColor: "#ffffff",
    },
    [SPATIAL_MARKUP_KIND_PLANAR]: {
      prefix: "D",
      counterStyle: "numeric",
      backgroundColor: "rgba(111, 188, 123, 0.95)",
      textColor: "#ffffff",
    },
    [SPATIAL_MARKUP_KIND_VERTICAL]: {
      prefix: "F",
      counterStyle: "numeric",
      backgroundColor: "rgba(88, 152, 255, 0.95)",
      textColor: "#ffffff",
    },
    [SPATIAL_MARKUP_KIND_LABEL]: {
      prefix: "T",
      counterStyle: "numeric",
      backgroundColor: "rgba(88, 152, 255, 0.95)",
      textColor: "#ffffff",
    },
  };

export const formatMeasurementShortLabelToken = (
  kind: AnnotationShortLabelKind,
  counter: number,
  configMap: AnnotationShortLabelConfigMap = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG
): string => {
  const config = configMap[kind];
  const safeCounter =
    Number.isFinite(counter) && counter > 0 ? Math.floor(counter) : 1;
  const counterToken =
    config.counterStyle === "alphabetic"
      ? toAlphabeticSequence(safeCounter - 1)
      : `${safeCounter}`;
  return `${config.prefix}${counterToken}`;
};
