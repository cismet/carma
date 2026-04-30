import type { AnnotationsToolbarClassNames } from "@carma-mapping/annotations/ui";

import "./cismap-annotation-toolbar.css";

export const CISMAP_ANNOTATION_TOOLBAR_CLASS_NAMES = {
  toolButtonBase: "cismap-annotation-tool-button",
  toolButtonActive: "cismap-annotation-tool-button-active",
  toolButtonDisabled: "cismap-annotation-tool-button-disabled",
} satisfies Partial<AnnotationsToolbarClassNames>;
