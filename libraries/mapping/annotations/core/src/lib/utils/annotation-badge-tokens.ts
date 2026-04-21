import {
  ANNOTATION_TYPES,
  type AnnotationType,
} from "../types/annotation-types";
import {
  getAnnotationShortLabelBackgroundCssColor,
  getAnnotationTextCssColor,
} from "./annotation-visual-tokens";
import { toAlphabeticSequence } from "./alphabetic-sequence";

export const ANNOTATION_SHORT_LABEL_COUNTER_STYLES = {
  NUMERIC: "numeric",
  ALPHABETIC: "alphabetic",
} as const;

export type AnnotationShortLabelCounterStyle =
  (typeof ANNOTATION_SHORT_LABEL_COUNTER_STYLES)[keyof typeof ANNOTATION_SHORT_LABEL_COUNTER_STYLES];

export type AnnotationShortLabelStyleConfig = {
  prefix: string;
  counterStyle: AnnotationShortLabelCounterStyle;
  backgroundColor: string;
  textColor: string;
};

export type AnnotationShortLabelConfigMap = Record<
  AnnotationType,
  AnnotationShortLabelStyleConfig
>;

export const DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG: AnnotationShortLabelConfigMap =
  {
    [ANNOTATION_TYPES.POINT]: {
      prefix: "",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.POINT
      ),
      textColor: getAnnotationTextCssColor("dark"),
    },
    [ANNOTATION_TYPES.DISTANCE]: {
      prefix: "",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.ALPHABETIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.DISTANCE
      ),
      textColor: getAnnotationTextCssColor("light"),
    },
    [ANNOTATION_TYPES.POLYLINE]: {
      prefix: "L",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.POLYLINE
      ),
      textColor: getAnnotationTextCssColor("dark"),
    },
    [ANNOTATION_TYPES.AREA_GROUND]: {
      prefix: "A",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.AREA_GROUND
      ),
      textColor: getAnnotationTextCssColor("light"),
    },
    [ANNOTATION_TYPES.AREA_PLANAR]: {
      prefix: "D",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.AREA_PLANAR
      ),
      textColor: getAnnotationTextCssColor("light"),
    },
    [ANNOTATION_TYPES.AREA_VERTICAL]: {
      prefix: "F",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.AREA_VERTICAL
      ),
      textColor: getAnnotationTextCssColor("light"),
    },
    [ANNOTATION_TYPES.LABEL]: {
      prefix: "T",
      counterStyle: ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC,
      backgroundColor: getAnnotationShortLabelBackgroundCssColor(
        ANNOTATION_TYPES.LABEL
      ),
      textColor: getAnnotationTextCssColor("light"),
    },
  };

export const formatMeasurementShortLabelToken = (
  kind: AnnotationType,
  counter: number,
  configMap: AnnotationShortLabelConfigMap = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG
): string => {
  const config = configMap[kind];
  const safeCounter =
    Number.isFinite(counter) && counter > 0 ? Math.floor(counter) : 1;
  const counterToken =
    config.counterStyle === ANNOTATION_SHORT_LABEL_COUNTER_STYLES.ALPHABETIC
      ? toAlphabeticSequence(safeCounter - 1)
      : `${safeCounter}`;
  return `${config.prefix}${counterToken}`;
};
