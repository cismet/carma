import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";

// Single, non-staged operating-hint block shared by the select, point and
// distance measurement tools (cismet/wupp#4078). Unlike the trapezoid tool this
// help text does not change per interaction step — it always documents the same
// editing options. It also reflects that the horizontal (East/West, North/South)
// drag arrows are no longer shown; only height editing remains.

const RUNNING_MEASUREMENT_START_POINT_HINT = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE],
  ],
  description: "Entfernen bei laufender Messung den Startpunkt.",
} satisfies AnnotationInfoBoxHelpItem;

const MEASUREMENT_EDIT_MODE_HELP_ITEMS: readonly AnnotationInfoBoxHelpItem[] = [
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Bearbeitungsmodus: Langer Klick auf einen Punkt öffnet die Bearbeitung.",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
    text: "Punkt ziehen: Scheibenmitte auf Boden- bzw. Oberflächenhöhe, äußere Scheibe in der Höhenebene, blaue Pfeile entlang der Höhenachse.",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
    description: "Klick auf einen anderen Punkt übernimmt dessen Höhe.",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
    description:
      "Beendet den Bearbeitungsmodus (ebenso ein Klick außerhalb des Punktes).",
  },
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
    description:
      "Löscht den Punkt – beim letzten verbleibenden Punkt die gesamte Messung.",
  },
];

export type BuildMeasurementToolHelpItemsOptions = {
  primaryInstructions: readonly string[];
  includeRunningMeasurementStartPointHint?: boolean;
};

export const buildMeasurementToolHelpItems = ({
  primaryInstructions,
  includeRunningMeasurementStartPointHint = false,
}: BuildMeasurementToolHelpItemsOptions): readonly AnnotationInfoBoxHelpItem[] => [
  ...primaryInstructions,
  ...(includeRunningMeasurementStartPointHint
    ? [RUNNING_MEASUREMENT_START_POINT_HINT]
    : []),
  ...MEASUREMENT_EDIT_MODE_HELP_ITEMS,
];
