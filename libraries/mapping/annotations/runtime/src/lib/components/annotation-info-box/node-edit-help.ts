import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS,
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

// Two-section edit-mode help laid out per the #4078 review: bold headings, the
// drag-target label on the left of its cursor icon, the effect (with a leading
// arrow) on the right, and the discrete actions as icon + text. Rendered with
// actionTriggerAlign="start". (cismet/wupp#4078)
const EDIT_HELP_TITLE = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING,
  text: "Bearbeitungsmodus",
  level: ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.TITLE,
} satisfies AnnotationInfoBoxHelpItem;

const DRAG_SECTION_HEADING = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING,
  text: "Punkt verschieben durch ziehen von",
  level: ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.SECTION,
} satisfies AnnotationInfoBoxHelpItem;

const OTHER_SECTION_HEADING = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING,
  text: "Weitere Funktionen",
  level: ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.SECTION,
} satisfies AnnotationInfoBoxHelpItem;

const DRAG_HELP_ITEMS: readonly AnnotationInfoBoxHelpItem[] = [
  DRAG_SECTION_HEADING,
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    leadingLabel: "Scheibenmitte",
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DISC_CENTER]],
    description: "→ auf der Oberfläche des 3D-Modells",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    leadingLabel: "Äußere Scheibe",
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DISC_OUTER]],
    description: "→ in der Höhenebene",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    leadingLabel: "Blaue Pfeilspitzen",
    inputAlternatives: [],
    description: "→ entlang der Höhenachse",
  },
];

const ADOPT_HEIGHT_ACTION = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
  trailingLabel: "auf anderen Punkt",
  description: "Höhe des Punktes übernehmen",
} satisfies AnnotationInfoBoxHelpItem;

const LEAVE_EDIT_MODE_ACTION = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
  trailingLabel: "/ Klick außerhalb des Punktes",
  description: "Bearbeitungsmodus verlassen",
} satisfies AnnotationInfoBoxHelpItem;

const deleteAction = (description: string): AnnotationInfoBoxHelpItem => ({
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
  description,
});

// Delete hint per tool type. For a point or distance measurement, removing a
// node drops below the geometry minimum and deletes the whole measurement, so
// the hint says exactly that (Stefan, #4078). For a polyline/area above the
// minimum, removing a node keeps the measurement, so the hint stays accurate.
const resolveDeleteAction = (
  toolType: AnnotationToolType
): AnnotationInfoBoxHelpItem => {
  switch (toolType) {
    case ANNOTATION_TYPES.POINT:
    case ANNOTATION_TYPES.DISTANCE:
      return deleteAction("Messung löschen");
    case ANNOTATION_TYPES.POLYLINE:
      return deleteAction(
        "Punkt löschen (beim letzten verbleibenden Punkt die Messung)"
      );
    case ANNOTATION_TYPES.AREA_GROUND:
    case ANNOTATION_TYPES.AREA_PLANAR:
    case ANNOTATION_TYPES.AREA_VERTICAL:
      return deleteAction(
        "Punkt löschen (unter drei Punkten die Messung)"
      );
    default:
      return deleteAction("Messung löschen");
  }
};

// Resolve the editing help shown while a node of this measurement is being
// edited. The adopt-height action only applies where another node exists (line
// / area), never on a single-point measurement. Returns an empty list for
// geometries that are not node-edited.
export const resolveNodeEditHelpItems = ({
  toolType,
}: {
  toolType: AnnotationToolType;
}): readonly AnnotationInfoBoxHelpItem[] => {
  const category = resolveEditGeometryCategory(toolType);
  if (!category) {
    return [];
  }

  const otherFunctions: AnnotationInfoBoxHelpItem[] = [
    OTHER_SECTION_HEADING,
    ...(category === EDIT_GEOMETRY_CATEGORY.POINT ? [] : [ADOPT_HEIGHT_ACTION]),
    LEAVE_EDIT_MODE_ACTION,
    resolveDeleteAction(toolType),
  ];

  return [EDIT_HELP_TITLE, ...DRAG_HELP_ITEMS, ...otherFunctions];
};
