import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";

// Creation hints shown while a measurement tool is active (cismet/wupp#4078).
// The detailed editing controls are NOT part of the tools: they are resolved
// from the edited measurement's geometry in the runtime's node-edit help, so
// editing behaves consistently regardless of which tool is active.

const RUNNING_MEASUREMENT_START_POINT_HINT = {
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE],
  ],
  description: "Entfernt den zuletzt gesetzten Punkt der laufenden Messung.",
} satisfies AnnotationInfoBoxHelpItem;

export type BuildMeasurementToolHelpItemsOptions = {
  primaryInstructions: readonly string[];
  // Only set while a measurement is actually in progress: there is no point to
  // remove before the first one is placed.
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
];
