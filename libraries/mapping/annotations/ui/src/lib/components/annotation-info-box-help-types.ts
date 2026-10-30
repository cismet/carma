export const ANNOTATION_INFO_BOX_HELP_ITEM_KINDS = {
  TEXT: "text",
  ACTION: "action",
  ALERT: "alert",
  HEADING: "heading",
} as const;

export const ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS = {
  TITLE: "title",
  SECTION: "section",
} as const;

export const ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS = {
  END: "end",
  START: "start",
} as const;

export const ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS = {
  CLICK: "click",
  DOUBLE_CLICK: "double-click",
  ENTER: "enter",
  BACKSPACE: "backspace",
  ESCAPE: "escape",
  SHIFT: "shift",
  DISC_CENTER: "disc-center",
  DISC_OUTER: "disc-outer",
} as const;

export const ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS = {
  INFO: "info",
  WARNING: "warning",
} as const;

export const ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES = {
  INFO: "info",
  WARNING: "warning",
} as const;

export const ANNOTATION_INFO_BOX_HELP_LAYOUTS = {
  STANDARD: "standard",
  COMPACT: "compact",
} as const;

export type AnnotationInfoBoxHelpItemKind =
  (typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS)[keyof typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS];

export type AnnotationInfoBoxHelpActionInput =
  (typeof ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS)[keyof typeof ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS];

export type AnnotationInfoBoxHelpActionIndicator =
  (typeof ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS)[keyof typeof ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS];

export type AnnotationInfoBoxHelpAlertSeverity =
  (typeof ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES)[keyof typeof ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES];

export type AnnotationInfoBoxHelpLayout =
  (typeof ANNOTATION_INFO_BOX_HELP_LAYOUTS)[keyof typeof ANNOTATION_INFO_BOX_HELP_LAYOUTS];

export type AnnotationInfoBoxHelpHeadingLevel =
  (typeof ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS)[keyof typeof ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS];

export type AnnotationInfoBoxHelpActionTriggerAlignment =
  (typeof ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS)[keyof typeof ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS];

export type AnnotationInfoBoxHelpActionInputCombination =
  readonly AnnotationInfoBoxHelpActionInput[];

export type AnnotationInfoBoxHelpTextItem = Readonly<{
  kind: typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT;
  text: string;
}>;

export type AnnotationInfoBoxHelpHeadingItem = Readonly<{
  kind: typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING;
  text: string;
  level?: AnnotationInfoBoxHelpHeadingLevel;
}>;

export type AnnotationInfoBoxHelpActionItem = Readonly<{
  kind: typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION;
  indicator?: AnnotationInfoBoxHelpActionIndicator;
  // May be empty for a label-only trigger cell (e.g. "Blaue Pfeilspitzen").
  inputAlternatives: readonly AnnotationInfoBoxHelpActionInputCombination[];
  // Optional text rendered before / after the input tokens inside the trigger
  // cell, so a row can read "Scheibenmitte [icon]" or "[icon] auf anderen
  // Punkt".
  leadingLabel?: string;
  trailingLabel?: string;
  // Align a single input token to the right edge of the trigger column, keeping
  // its leading label on the left.
  rightAlignInput?: boolean;
  // Keep a qualifier beside the final input token. Its text may wrap naturally
  // within that line's baseline grid.
  trailingLabelAfterLastInput?: boolean;
  description: string;
}>;

export type AnnotationInfoBoxHelpAlertItem = Readonly<{
  kind: typeof ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT;
  severity: AnnotationInfoBoxHelpAlertSeverity;
  text: string;
  actions?: readonly AnnotationInfoBoxHelpActionItem[];
}>;

export type AnnotationInfoBoxHelpItem =
  | string
  | AnnotationInfoBoxHelpTextItem
  | AnnotationInfoBoxHelpHeadingItem
  | AnnotationInfoBoxHelpActionItem
  | AnnotationInfoBoxHelpAlertItem;
