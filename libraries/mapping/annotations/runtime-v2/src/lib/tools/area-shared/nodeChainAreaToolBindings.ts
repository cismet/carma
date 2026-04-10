import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";

import type { NodeChainAreaToolAction } from "./nodeChainAreaToolActions";

export const resolveNodeChainAreaToolKeyAction = (
  event: KeyboardEvent
): NodeChainAreaToolAction | null => {
  const action = resolveAnnotationCommonShortcutAction(event);

  if (action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL) {
    return "cancelPreview";
  }

  if (action === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT) {
    return "undoLastPoint";
  }

  return null;
};
