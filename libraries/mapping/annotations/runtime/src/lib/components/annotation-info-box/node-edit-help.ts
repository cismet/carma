import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type { StoredAnnotation } from "../../store";

type AnnotationToolType = StoredAnnotation["toolType"];

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
    rightAlignInput: true,
    description: "→ auf der Oberfläche des 3D-Modells",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    leadingLabel: "Äußere Scheibe",
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DISC_OUTER]],
    rightAlignInput: true,
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
  inputAlternatives: [
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE],
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK],
  ],
  trailingLabel: "außerhalb des Punktes",
  trailingLabelAfterLastInput: true,
  description: "Bearbeitungsmodus verlassen",
} satisfies AnnotationInfoBoxHelpItem;

const deleteAction = (description: string): AnnotationInfoBoxHelpItem => ({
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
  description,
});

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
      return deleteAction("Punkt löschen (unter drei Punkten die Messung)");
    default:
      return deleteAction("Messung löschen");
  }
};

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
