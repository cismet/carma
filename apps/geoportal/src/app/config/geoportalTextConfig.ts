import { resolveAnnotationModeText } from "@carma-mapping/annotations/builtin-tools/annotation-mode-text";

export const geoportalText = {
  annotationMode: resolveAnnotationModeText(),
} as const;

export type GeoportalTextConfig = typeof geoportalText;

export const geoportalAnnotationModeText = geoportalText.annotationMode;
