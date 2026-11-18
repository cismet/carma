import { type CSSProperties } from "react";
import { COLORS_HEX } from "@carma-commons/utils";
import {
  ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS,
  ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS,
  ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS,
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  type AnnotationInfoBoxHelpActionIndicator,
  type AnnotationInfoBoxHelpAlertSeverity,
  type AnnotationInfoBoxHelpLayout,
  type AnnotationInfoBoxHelpHeadingLevel,
  type AnnotationInfoBoxHelpActionTriggerAlignment,
} from "./annotation-info-box-help-types";

export const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_COLOR_CSS = "#00d9ff";

export const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_BACKDROP_CSS =
  "rgba(0, 217, 255, 0.2)";

export const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_TEXT_COLOR_CSS = "#004b5c";

export const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_COLOR_CSS = "#ef4444";

export const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_BACKDROP_CSS =
  "rgba(239, 68, 68, 0.18)";

export const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_TEXT_COLOR_CSS =
  "#7f1d1d";

// Vertical rhythm. Every line of help content — text, headings, key tokens and
// cursor glyphs — occupies exactly one baseline step, and every gap is a whole
// number of steps, so content lands on a constant interval in y. Sizing the step
// in `em` keeps it locked to the info box's font size.
export const HELP_BASELINE_VARIABLE = "--carma-help-baseline";

export const HELP_BASELINE_STEP = "1.5em";

export const HELP_LINE_HEIGHT = 1.5;

export const oneBaselineStep = `var(${HELP_BASELINE_VARIABLE})`;

// Rows are separated by half a step: line boxes stay one full step, wrapped
// continuation lines inside a cell stay step-tight (so they read as one row),
// and every distance remains on the half-step lattice (18 / 27 / 36px at 12px).
export const halfBaselineStep = `calc(var(${HELP_BASELINE_VARIABLE}) / 2)`;

// An unregistered custom property is substituted as raw tokens, so the `em` in
// the step above resolves against whichever element *uses* it, not the root that
// declares it. Elements that scale their own font-size would therefore read a
// shrunken step (a 0.74em key token read 13.3px instead of 18px), so they
// express one step in their own em instead.
export const KEY_TOKEN_FONT_SCALE = 0.74;

// 16px at the info box's 12px font.
export const DRAG_GLYPH_FONT_SCALE = 4 / 3;

export const baselineStepInOwnEm = (fontScale: number) =>
  `${HELP_LINE_HEIGHT / fontScale}em`;

export const helpContentRootStyle = {
  [HELP_BASELINE_VARIABLE]: HELP_BASELINE_STEP,
  lineHeight: HELP_LINE_HEIGHT,
} as CSSProperties;

export const paragraphStyle: CSSProperties = {
  margin: `0 0 ${oneBaselineStep}`,
  lineHeight: HELP_LINE_HEIGHT,
};

export const headingStyles = {
  [ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.TITLE]: {
    margin: 0,
    fontWeight: 700,
    lineHeight: HELP_LINE_HEIGHT,
  },
  // Half a step of own margin — the shared row gap brings the total space
  // above a section to one full step.
  [ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.SECTION]: {
    margin: `${halfBaselineStep} 0 0`,
    fontWeight: 700,
    lineHeight: HELP_LINE_HEIGHT,
  },
} satisfies Record<AnnotationInfoBoxHelpHeadingLevel, CSSProperties>;

// In the shared subgrid (COMPACT) a heading must span both columns.
export const compactHeadingSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

export const triggerLabelStyle: CSSProperties = {
  whiteSpace: "normal",
};

// Left-aligned trigger cell for the instruction-table style. The leading label
// and input tokens sit on one line; a trailing label always drops to the next
// line (wrap after the icon) so the trigger column stays narrow instead of
// growing to icon-plus-text width.
export const startTriggerCellStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  minWidth: 0,
};

// Each sub-row is exactly one baseline step tall, so a trigger cell that wraps
// stays on the grid.
export const startTriggerTokenRowStyle: CSSProperties = {
  display: "inline-flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.34em",
  minHeight: oneBaselineStep,
};

export const startTriggerAlternativeRowStyle: CSSProperties = {
  ...startTriggerTokenRowStyle,
  marginTop: halfBaselineStep,
};

export const startTriggerRightAlignedTokenRowStyle: CSSProperties = {
  ...startTriggerTokenRowStyle,
  justifyContent: "space-between",
  width: "100%",
};

export const actionColumnGap = "1em";

export const startAlignedActionColumnGap = "0.5em";

export const actionGridTemplateColumns = "max-content minmax(0, 1fr)";

// The edit-mode instruction table has labels, icons, and multi-line shortcut
// qualifiers in its first column. Give it a stable measure so longer left-hand
// entries do not change where the effects column begins.
export const startAlignedActionGridTemplateColumns = "7.75rem minmax(0, 1fr)";

export const resolveCompactContentStyle = (
  triggerAlign: AnnotationInfoBoxHelpActionTriggerAlignment
): CSSProperties => ({
  ...helpContentRootStyle,
  display: "grid",
  gridTemplateColumns:
    triggerAlign === ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.START
      ? startAlignedActionGridTemplateColumns
      : actionGridTemplateColumns,
  columnGap:
    triggerAlign === ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.START
      ? startAlignedActionColumnGap
      : actionColumnGap,
  rowGap: halfBaselineStep,
  alignItems: "start",
});

export const compactParagraphStyle: CSSProperties = {
  ...paragraphStyle,
  gridColumn: "1 / -1",
};

export const compactLastParagraphStyle: CSSProperties = {
  ...compactParagraphStyle,
  margin: 0,
};

export const actionRowStyles = {
  [ANNOTATION_INFO_BOX_HELP_LAYOUTS.STANDARD]: {
    display: "grid",
    gridTemplateColumns: actionGridTemplateColumns,
    columnGap: actionColumnGap,
    alignItems: "start",
    margin: `0 0 ${halfBaselineStep}`,
    lineHeight: HELP_LINE_HEIGHT,
  },
  [ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT]: {
    display: "contents",
  },
} satisfies Record<AnnotationInfoBoxHelpLayout, CSSProperties>;

export const tokenGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.22em",
  minHeight: oneBaselineStep,
  whiteSpace: "nowrap",
};

// Stacked alternatives in the key column: one baseline step per entry.
export const compactTokenGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 0,
  whiteSpace: "nowrap",
};

export const compactAlternativeLabelStyle: CSSProperties = {
  lineHeight: 1,
};

export const alertContainerStyles = {
  [ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO]: {
    margin: "-0.2rem 0 0.8rem",
    padding: "0.48rem 0.56rem",
    borderRadius: 4,
    background: ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_BACKDROP_CSS,
    color: ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_TEXT_COLOR_CSS,
  },
  [ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING]: {
    margin: "-0.2rem 0 0.8rem",
    padding: "0.48rem 0.56rem",
    borderRadius: 4,
    background: ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_BACKDROP_CSS,
    color: ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_TEXT_COLOR_CSS,
  },
} satisfies Record<AnnotationInfoBoxHelpAlertSeverity, CSSProperties>;

export const compactAlertContainerStyles = {
  [ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO]: {
    ...alertContainerStyles[ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO],
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
    columnGap: actionColumnGap,
    rowGap: "0.58rem",
    margin: "-0.2rem 0 0.8rem",
    padding: "0.48rem 0",
  },
  [ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING]: {
    ...alertContainerStyles[ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING],
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
    columnGap: actionColumnGap,
    rowGap: "0.58rem",
    margin: "-0.2rem 0 0.8rem",
    padding: "0.48rem 0",
  },
} satisfies Record<AnnotationInfoBoxHelpAlertSeverity, CSSProperties>;

export const alertTextStyle: CSSProperties = {
  minWidth: 0,
  fontWeight: 600,
  lineHeight: HELP_LINE_HEIGHT,
};

export const actionDescriptionStyles = {
  [ANNOTATION_INFO_BOX_HELP_LAYOUTS.STANDARD]: {
    minWidth: 0,
    lineHeight: HELP_LINE_HEIGHT,
    whiteSpace: "nowrap",
  },
  [ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT]: {
    minWidth: 0,
    lineHeight: HELP_LINE_HEIGHT,
  },
} satisfies Record<AnnotationInfoBoxHelpLayout, CSSProperties>;

// Exactly one baseline step tall (border-box), so a key never inflates its row.
export const keyTokenStyle: CSSProperties = {
  display: "inline-flex",
  boxSizing: "border-box",
  minWidth: "3.4em",
  height: baselineStepInOwnEm(KEY_TOKEN_FONT_SCALE),
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(0, 0, 0, 0.34)",
  borderRadius: "0.28rem",
  background: "rgba(255, 255, 255, 0.68)",
  boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.2)",
  color: "#1f2937",
  fontSize: `${KEY_TOKEN_FONT_SCALE}em`,
  fontWeight: 700,
  lineHeight: 1,
  padding: "0 0.58em",
};

export const pointerTokenStyle: CSSProperties = {
  ...keyTokenStyle,
  gap: "0.22rem",
};

export const actionIndicatorTokenStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: oneBaselineStep,
  height: oneBaselineStep,
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

export const actionIndicatorIconStyles = {
  [ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.INFO]: {
    color: ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_COLOR_CSS,
  },
  [ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.WARNING]: {
    color: ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_COLOR_CSS,
  },
} satisfies Record<AnnotationInfoBoxHelpActionIndicator, CSSProperties>;

// Cursor symbols render without the key/pointer backdrop, at the same effective
// footprint as the bordered tokens, with a 16px glyph in the info box's action
// icon grey.
export const dragTargetTokenStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: baselineStepInOwnEm(DRAG_GLYPH_FONT_SCALE),
  height: baselineStepInOwnEm(DRAG_GLYPH_FONT_SCALE),
  fontSize: `${DRAG_GLYPH_FONT_SCALE}em`,
  lineHeight: 1,
  color: COLORS_HEX.ACCENT_NEUTRALS,
};
