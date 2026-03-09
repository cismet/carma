import { toAlphabeticSequence } from "../../utils/alphabeticSequence";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_VERTICAL,
  type AnnotationShortLabelKind,
} from "../../types/annotationTypes";
export { toAlphabeticSequence } from "../../utils/alphabeticSequence";
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
    [ANNOTATION_TYPE_POINT]: {
      prefix: "",
      counterStyle: "numeric",
      backgroundColor: "rgba(200, 200, 200, 0.92)",
      textColor: "#111111",
    },
    [ANNOTATION_TYPE_DISTANCE]: {
      prefix: "",
      counterStyle: "alphabetic",
      backgroundColor: "rgba(102, 126, 234, 0.95)",
      textColor: "#ffffff",
    },
    [ANNOTATION_TYPE_POLYLINE]: {
      prefix: "L",
      counterStyle: "numeric",
      backgroundColor: "rgba(226, 178, 60, 0.95)",
      textColor: "#111111",
    },
    [ANNOTATION_TYPE_AREA_GROUND]: {
      prefix: "A",
      counterStyle: "numeric",
      backgroundColor: "rgba(111, 188, 123, 0.95)",
      textColor: "#ffffff",
    },
    [ANNOTATION_TYPE_AREA_PLANAR]: {
      prefix: "D",
      counterStyle: "numeric",
      backgroundColor: "rgba(111, 188, 123, 0.95)",
      textColor: "#ffffff",
    },
    [ANNOTATION_TYPE_AREA_VERTICAL]: {
      prefix: "F",
      counterStyle: "numeric",
      backgroundColor: "rgba(88, 152, 255, 0.95)",
      textColor: "#ffffff",
    },
    [ANNOTATION_TYPE_LABEL]: {
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
