import { DevelopmentOnlyUiBackdrop } from "@carma-commons/ui/components";
import type { AnnotationToolbarTool } from "@carma-mapping/annotations/ui";

import {
  GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS,
  isGeoportalDevelopmentPreviewAnnotationToolId,
} from "../../helper/annotation-info-box-visual-options";

/** Hatches the buttons of tools that are still in development preview. */
export const renderGeoportalAnnotationToolButtonBackdrop = (
  tool: AnnotationToolbarTool
) =>
  isGeoportalDevelopmentPreviewAnnotationToolId(tool.id) ? (
    <DevelopmentOnlyUiBackdrop
      patternOptions={GEOPORTAL_ANNOTATION_DEVELOPMENT_PREVIEW_PATTERN_OPTIONS}
    />
  ) : null;
