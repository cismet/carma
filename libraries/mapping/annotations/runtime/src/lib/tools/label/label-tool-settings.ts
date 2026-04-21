import {
  annotationTypographyTokens,
  type AnnotationLabelAppearance,
} from "@carma-mapping/annotations/core";

import { pointLabelVisualDefaults } from "../../config/runtime-point-label-visual-defaults";

export const labelToolDefaultAppearance = Object.freeze({
  fontSizePx: annotationTypographyTokens.fontSizePx.measurementLabel,
  backgroundColor: pointLabelVisualDefaults.textBackgroundColor,
  textColor: pointLabelVisualDefaults.textColor,
} satisfies Required<AnnotationLabelAppearance>);
