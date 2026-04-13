import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";

import type { PolylineToolAction } from "./polylineToolActions";
export const resolvePolylineToolKeyAction = (
  event: KeyboardEvent
): PolylineToolAction | null => {
  if (
    resolveAnnotationCommonShortcutAction(event) ===
    ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
  ) {
    return "cancelPreview";
  }

  return null;
};
