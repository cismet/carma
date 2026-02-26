import { toAlphabeticSequence } from "../../utils/measurementTokens";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
  type MeasurementShortLabelKind,
} from "../../types/measurementKindRegistry";
export { toAlphabeticSequence } from "../../utils/measurementTokens";
export type { MeasurementShortLabelKind } from "../../types/measurementKindRegistry";

export type MeasurementShortLabelCounterStyle = "numeric" | "alphabetic";

export type MeasurementShortLabelStyleConfig = {
  prefix: string;
  counterStyle: MeasurementShortLabelCounterStyle;
  backgroundColor: string;
  textColor: string;
};

export type MeasurementShortLabelConfigMap = Record<
  MeasurementShortLabelKind,
  MeasurementShortLabelStyleConfig
>;

export const DEFAULT_MEASUREMENT_SHORT_LABEL_CONFIG: MeasurementShortLabelConfigMap =
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
  kind: MeasurementShortLabelKind,
  counter: number,
  configMap: MeasurementShortLabelConfigMap = DEFAULT_MEASUREMENT_SHORT_LABEL_CONFIG
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
