import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type { StoredAnnotation } from "../../store";

// Editing help for measurement nodes (cismet/wupp#4078).
//
// Two layers live here:
//  - The STATE MODEL (`EDIT_STATUS`, `resolveEditStatus`, minimum node counts).
//    It is modeled so the edit tool can gracefully handle every state, and is
//    reserved for the behavioral edit lifecycle.
//  - The DISPLAYED HELP (`resolveNodeEditHelpItems`). For now this is a single
//    generic block per main geometry type (point / line / area), shown while
//    edit mode is active — it is intentionally NOT yet wired dynamically to the
//    live node count or status.

type AnnotationToolType = StoredAnnotation["toolType"];

export const EDIT_STATUS = {
  // Enough nodes and valid geometry: committable.
  COMPLETE: "complete",
  // Fewer nodes than the geometry minimum: needs another point.
  INCOMPLETE: "incomplete",
  // Minimum met but geometry invalid (e.g. self-intersection): not committable.
  DEGRADED: "degraded",
} as const;

export type EditStatus = (typeof EDIT_STATUS)[keyof typeof EDIT_STATUS];

// Minimum node count for a measurement of the given geometry to be valid.
// `null` => the geometry is not structurally node-edited (e.g. labels).
export const resolveMinimumNodeCountForToolType = (
  toolType: AnnotationToolType
): number | null => {
  switch (toolType) {
    case ANNOTATION_TYPES.POINT:
      return 1;
    case ANNOTATION_TYPES.DISTANCE:
    case ANNOTATION_TYPES.POLYLINE:
      return 2;
    case ANNOTATION_TYPES.AREA_GROUND:
    case ANNOTATION_TYPES.AREA_PLANAR:
    case ANNOTATION_TYPES.AREA_VERTICAL:
      return 3;
    default:
      return null;
  }
};

// Derived edit status — the model the edit tool uses to handle every state.
export const resolveEditStatus = ({
  toolType,
  nodeCount,
  isGeometryValid = true,
}: {
  toolType: AnnotationToolType;
  nodeCount: number;
  isGeometryValid?: boolean;
}): EditStatus => {
  const minimumNodeCount = resolveMinimumNodeCountForToolType(toolType);
  if (minimumNodeCount !== null && nodeCount < minimumNodeCount) {
    return EDIT_STATUS.INCOMPLETE;
  }
  if (!isGeometryValid) {
    return EDIT_STATUS.DEGRADED;
  }
  return EDIT_STATUS.COMPLETE;
};

// Main geometry categories that share one generic edit-help block.
export const EDIT_GEOMETRY_CATEGORY = {
  POINT: "point",
  LINE: "line",
  AREA: "area",
} as const;

export type EditGeometryCategory =
  (typeof EDIT_GEOMETRY_CATEGORY)[keyof typeof EDIT_GEOMETRY_CATEGORY];

export const resolveEditGeometryCategory = (
  toolType: AnnotationToolType
): EditGeometryCategory | null => {
  switch (toolType) {
    case ANNOTATION_TYPES.POINT:
      return EDIT_GEOMETRY_CATEGORY.POINT;
    case ANNOTATION_TYPES.DISTANCE:
    case ANNOTATION_TYPES.POLYLINE:
      return EDIT_GEOMETRY_CATEGORY.LINE;
    case ANNOTATION_TYPES.AREA_GROUND:
    case ANNOTATION_TYPES.AREA_PLANAR:
    case ANNOTATION_TYPES.AREA_VERTICAL:
      return EDIT_GEOMETRY_CATEGORY.AREA;
    default:
      return null;
  }
};

const DRAG_HELP_ITEMS: readonly AnnotationInfoBoxHelpItem[] = [
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Punkt ziehen:",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Scheibenmitte – auf Boden- bzw. Oberflächenhöhe.",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Äußere Scheibe – in der Höhenebene.",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Blaue Pfeile – entlang der Höhenachse.",
  },
];

const ADOPT_HEIGHT_ACTION = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
  description: "Klick auf einen anderen Punkt übernimmt dessen Höhe.",
} satisfies AnnotationInfoBoxHelpItem;

const LEAVE_EDIT_MODE_ACTION = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
  description:
    "Beendet die Bearbeitung (ebenso ein Klick außerhalb des Punktes).",
} satisfies AnnotationInfoBoxHelpItem;

const deleteAction = (description: string): AnnotationInfoBoxHelpItem => ({
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
  description,
});

// One generic, state-agnostic help block per main geometry category. The delete
// hint names the geometry minimum so the text stays correct in every state.
const GENERIC_EDIT_HELP_BY_CATEGORY: Readonly<
  Record<EditGeometryCategory, readonly AnnotationInfoBoxHelpItem[]>
> = {
  [EDIT_GEOMETRY_CATEGORY.POINT]: [
    ...DRAG_HELP_ITEMS,
    LEAVE_EDIT_MODE_ACTION,
    deleteAction("Löscht die Punktmessung (nach Rückfrage)."),
  ],
  [EDIT_GEOMETRY_CATEGORY.LINE]: [
    ...DRAG_HELP_ITEMS,
    ADOPT_HEIGHT_ACTION,
    LEAVE_EDIT_MODE_ACTION,
    deleteAction("Löscht diesen Punkt. Eine Strecke benötigt mindestens zwei Punkte."),
  ],
  [EDIT_GEOMETRY_CATEGORY.AREA]: [
    ...DRAG_HELP_ITEMS,
    ADOPT_HEIGHT_ACTION,
    LEAVE_EDIT_MODE_ACTION,
    deleteAction("Löscht diesen Punkt. Eine Fläche benötigt mindestens drei Punkte."),
  ],
};

// Resolve the generic editing help shown while a node of this measurement is
// being edited. Returns an empty list for geometries that are not node-edited.
export const resolveNodeEditHelpItems = ({
  toolType,
}: {
  toolType: AnnotationToolType;
}): readonly AnnotationInfoBoxHelpItem[] => {
  const category = resolveEditGeometryCategory(toolType);
  return category ? GENERIC_EDIT_HELP_BY_CATEGORY[category] : [];
};
