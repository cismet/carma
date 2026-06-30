import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";

// Creation hints shown while a measurement tool is active (cismet/wupp#4078).
// The detailed editing controls are NOT part of the tools: they are resolved
// from the edited measurement's geometry in the runtime's node-edit help, so
// editing behaves consistently regardless of which tool is active.

// Default wording for multi-point measurements (polyline/area): the removed
// point is the most recently placed one.
export const DEFAULT_RUNNING_MEASUREMENT_REMOVE_POINT_DESCRIPTION =
  "Entfernt den zuletzt gesetzten Punkt der laufenden Messung.";

const buildRunningMeasurementRemovePointHint = (
  description: string
): AnnotationInfoBoxHelpItem => ({
  kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
  inputAlternatives: [
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE],
    [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE],
  ],
  description,
});

export type BuildMeasurementToolHelpItemsOptions = {
  primaryInstructions: readonly string[];
  // Only set while a measurement is actually in progress: there is no point to
  // remove before the first one is placed.
  includeRunningMeasurementStartPointHint?: boolean;
  // Override the remove-point wording. Distance passes the "Startpunkt" phrasing
  // (only the start point exists mid-measurement); multi-point tools keep the
  // default "zuletzt gesetzten Punkt" (cismet/wupp#4078).
  runningMeasurementRemovePointDescription?: string;
};

export const buildMeasurementToolHelpItems = ({
  primaryInstructions,
  includeRunningMeasurementStartPointHint = false,
  runningMeasurementRemovePointDescription = DEFAULT_RUNNING_MEASUREMENT_REMOVE_POINT_DESCRIPTION,
}: BuildMeasurementToolHelpItemsOptions): readonly AnnotationInfoBoxHelpItem[] => [
  ...primaryInstructions,
  ...(includeRunningMeasurementStartPointHint
    ? [
        buildRunningMeasurementRemovePointHint(
          runningMeasurementRemovePointDescription
        ),
      ]
    : []),
];
