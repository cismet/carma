import type { CSSProperties, ReactNode } from "react";
import {
  faRowResize,
  resolveBackspaceDisplayLabel,
  resolveKeyboardDisplayLabels,
  resolveKeyboardDisplayPlatform,
  type KeyboardDisplayLabels,
  type KeyboardDisplayPlatform,
} from "@carma-commons/ui/components";
import { COLORS_HEX } from "@carma-commons/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCircleExclamation,
  faCircleInfo,
  faComputerMouse,
  faUpDownLeftRight,
} from "@fortawesome/free-solid-svg-icons";

export const ANNOTATION_INFO_BOX_HELP_ITEM_KINDS = {
  TEXT: "text",
  ACTION: "action",
  ALERT: "alert",
  HEADING: "heading",
} as const;

export const ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS = {
  // Block title (e.g. "Bearbeitungsmodus"); section subheading (e.g.
  // "Weitere Funktionen"). Both render bold and without a trailing colon.
  TITLE: "title",
  SECTION: "section",
} as const;

export const ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS = {
  // Trigger tokens hug the description (default key-hint style) vs. start of the
  // trigger column (instruction-table style, e.g. the node-edit help).
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
  // Drag-target cursor symbols for the point-move gizmo (cismet/wupp#4078):
  // the disc centre uses a row-resize cursor, the outer disc a move cursor.
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

// Bold heading (block title or section subheading), rendered without a trailing
// colon. Spans both columns in the grid. (cismet/wupp#4078)
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
  // Punkt" (cismet/wupp#4078).
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

const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_COLOR_CSS = "#00d9ff";
const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_BACKDROP_CSS =
  "rgba(0, 217, 255, 0.2)";
const ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_TEXT_COLOR_CSS = "#004b5c";
const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_COLOR_CSS = "#ef4444";
const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_BACKDROP_CSS =
  "rgba(239, 68, 68, 0.18)";
const ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_TEXT_COLOR_CSS = "#7f1d1d";

type AnnotationInfoBoxHelpContentProps = {
  items: readonly AnnotationInfoBoxHelpItem[];
  layout?: AnnotationInfoBoxHelpLayout;
  locale?: string;
  platform?: KeyboardDisplayPlatform;
  // Where the trigger tokens sit in their column: "end" (default, key-hint
  // style, hugging the description) or "start" (instruction-table style).
  actionTriggerAlign?: AnnotationInfoBoxHelpActionTriggerAlignment;
};

const resolveAnnotationInfoBoxHelpLocale = (): string | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.language;

type PointerDisplayLabels = Readonly<{
  alternative: string;
  click: string;
  doubleClick: string;
}>;

const POINTER_DISPLAY_LABELS_BY_LANGUAGE: Readonly<
  Record<string, PointerDisplayLabels>
> = {
  de: {
    alternative: "oder",
    click: "Klick",
    doubleClick: "2x Klick",
  },
  en: {
    alternative: "or",
    click: "Click",
    doubleClick: "Double click",
  },
};

const resolvePointerDisplayLabels = (
  locale: string | undefined
): PointerDisplayLabels => {
  const language = locale?.split("-")[0];
  return language && POINTER_DISPLAY_LABELS_BY_LANGUAGE[language]
    ? POINTER_DISPLAY_LABELS_BY_LANGUAGE[language]
    : POINTER_DISPLAY_LABELS_BY_LANGUAGE.en;
};

// Vertical rhythm. Every line of help content — text, headings, key tokens and
// cursor glyphs — occupies exactly one baseline step, and every gap is a whole
// number of steps, so content lands on a constant interval in y. Sizing the step
// in `em` keeps it locked to the info box's font size. (cismet/wupp#4078)
const HELP_BASELINE_VARIABLE = "--carma-help-baseline";
const HELP_BASELINE_STEP = "1.5em";
const HELP_LINE_HEIGHT = 1.5;
const oneBaselineStep = `var(${HELP_BASELINE_VARIABLE})`;
// Rows are separated by half a step: line boxes stay one full step, wrapped
// continuation lines inside a cell stay step-tight (so they read as one row),
// and every distance remains on the half-step lattice (18 / 27 / 36px at 12px).
const halfBaselineStep = `calc(var(${HELP_BASELINE_VARIABLE}) / 2)`;

// An unregistered custom property is substituted as raw tokens, so the `em` in
// the step above resolves against whichever element *uses* it, not the root that
// declares it. Elements that scale their own font-size would therefore read a
// shrunken step (a 0.74em key token read 13.3px instead of 18px), so they
// express one step in their own em instead.
const KEY_TOKEN_FONT_SCALE = 0.74;
// 16px at the info box's 12px font.
const DRAG_GLYPH_FONT_SCALE = 4 / 3;
const baselineStepInOwnEm = (fontScale: number) =>
  `${HELP_LINE_HEIGHT / fontScale}em`;

const helpContentRootStyle = {
  [HELP_BASELINE_VARIABLE]: HELP_BASELINE_STEP,
  lineHeight: HELP_LINE_HEIGHT,
} as CSSProperties;

const paragraphStyle: CSSProperties = {
  margin: `0 0 ${oneBaselineStep}`,
  lineHeight: HELP_LINE_HEIGHT,
};

const headingStyles = {
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
const compactHeadingSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const triggerLabelStyle: CSSProperties = {
  whiteSpace: "normal",
};

// Left-aligned trigger cell for the instruction-table style. The leading label
// and input tokens sit on one line; a trailing label always drops to the next
// line (wrap after the icon) so the trigger column stays narrow instead of
// growing to icon-plus-text width. (cismet/wupp#4078)
const startTriggerCellStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  minWidth: 0,
};

// Each sub-row is exactly one baseline step tall, so a trigger cell that wraps
// stays on the grid.
const startTriggerTokenRowStyle: CSSProperties = {
  display: "inline-flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.34em",
  minHeight: oneBaselineStep,
};

const startTriggerAlternativeRowStyle: CSSProperties = {
  ...startTriggerTokenRowStyle,
  marginTop: halfBaselineStep,
};

const startTriggerRightAlignedTokenRowStyle: CSSProperties = {
  ...startTriggerTokenRowStyle,
  justifyContent: "space-between",
  width: "100%",
};

const actionColumnGap = "1em";
const startAlignedActionColumnGap = "0.5em";
const actionGridTemplateColumns = "max-content minmax(0, 1fr)";
// The edit-mode instruction table has labels, icons, and multi-line shortcut
// qualifiers in its first column. Give it a stable measure so longer left-hand
// entries do not change where the effects column begins. (cismet/wupp#4078)
const startAlignedActionGridTemplateColumns = "7.75rem minmax(0, 1fr)";

const resolveCompactContentStyle = (
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

const compactParagraphStyle: CSSProperties = {
  ...paragraphStyle,
  gridColumn: "1 / -1",
};

const compactLastParagraphStyle: CSSProperties = {
  ...compactParagraphStyle,
  margin: 0,
};

const actionRowStyles = {
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

const tokenGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.22em",
  minHeight: oneBaselineStep,
  whiteSpace: "nowrap",
};

// Stacked alternatives in the key column: one baseline step per entry.
const compactTokenGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 0,
  whiteSpace: "nowrap",
};

const compactAlternativeLabelStyle: CSSProperties = {
  lineHeight: 1,
};

const alertContainerStyles = {
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

const compactAlertContainerStyles = {
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

const alertTextStyle: CSSProperties = {
  minWidth: 0,
  fontWeight: 600,
  lineHeight: HELP_LINE_HEIGHT,
};

const actionDescriptionStyles = {
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

const resolveAnnotationInfoBoxHelpLayout = (
  layout: AnnotationInfoBoxHelpLayout | undefined
): AnnotationInfoBoxHelpLayout =>
  layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
    ? layout
    : ANNOTATION_INFO_BOX_HELP_LAYOUTS.STANDARD;

const isTextHelpItem = (
  item: AnnotationInfoBoxHelpItem
): item is string | AnnotationInfoBoxHelpTextItem =>
  typeof item === "string" ||
  item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT;

const isAlertHelpItem = (
  item: AnnotationInfoBoxHelpItem
): item is AnnotationInfoBoxHelpAlertItem =>
  typeof item !== "string" &&
  item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT;

const orderAnnotationInfoBoxHelpItems = (
  items: readonly AnnotationInfoBoxHelpItem[]
): readonly AnnotationInfoBoxHelpItem[] => {
  const firstTextIndex = items.findIndex(isTextHelpItem);
  if (firstTextIndex <= 0) {
    return items;
  }

  const leadingItems = items.slice(0, firstTextIndex);
  const leadingAlerts = leadingItems.filter(isAlertHelpItem);
  if (leadingAlerts.length === 0) {
    return items;
  }

  return [
    ...leadingItems.filter((item) => !isAlertHelpItem(item)),
    items[firstTextIndex]!,
    ...leadingAlerts,
    ...items.slice(firstTextIndex + 1),
  ];
};

// Exactly one baseline step tall (border-box), so a key never inflates its row.
const keyTokenStyle: CSSProperties = {
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

const pointerTokenStyle: CSSProperties = {
  ...keyTokenStyle,
  gap: "0.22rem",
};

const actionIndicatorTokenStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: oneBaselineStep,
  height: oneBaselineStep,
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

const actionIndicatorIconStyles = {
  [ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.INFO]: {
    color: ANNOTATION_INFO_BOX_HELP_SAMPLE_GUIDE_COLOR_CSS,
  },
  [ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.WARNING]: {
    color: ANNOTATION_INFO_BOX_HELP_REJECTED_SAMPLE_COLOR_CSS,
  },
} satisfies Record<AnnotationInfoBoxHelpActionIndicator, CSSProperties>;

const renderTextItem = (
  item: string | AnnotationInfoBoxHelpTextItem,
  layout: AnnotationInfoBoxHelpLayout,
  isLastCompactItem = false
) => {
  const text = typeof item === "string" ? item : item.text;
  return (
    <p
      key={text}
      style={
        layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
          ? isLastCompactItem
            ? compactLastParagraphStyle
            : compactParagraphStyle
          : paragraphStyle
      }
    >
      {text}
    </p>
  );
};

const renderKeyToken = (label: string) => (
  <span style={keyTokenStyle}>{label}</span>
);

const renderPointerToken = (label: string) => (
  <span style={pointerTokenStyle}>
    <FontAwesomeIcon icon={faComputerMouse} />
    <span>{label}</span>
  </span>
);

// Cursor symbols render without the key/pointer backdrop, at the same effective
// footprint as the bordered tokens, with a 16px glyph in the info box's action
// icon grey.
const dragTargetTokenStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: baselineStepInOwnEm(DRAG_GLYPH_FONT_SCALE),
  height: baselineStepInOwnEm(DRAG_GLYPH_FONT_SCALE),
  fontSize: `${DRAG_GLYPH_FONT_SCALE}em`,
  lineHeight: 1,
  color: COLORS_HEX.ACCENT_NEUTRALS,
};

const renderDragTargetToken = (icon: IconDefinition) => (
  <span style={dragTargetTokenStyle}>
    <FontAwesomeIcon icon={icon} />
  </span>
);

const renderActionIndicatorToken = (
  indicator: AnnotationInfoBoxHelpActionIndicator
) => (
  <span style={actionIndicatorTokenStyle}>
    <FontAwesomeIcon
      style={actionIndicatorIconStyles[indicator]}
      icon={
        indicator === ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.WARNING
          ? faCircleExclamation
          : faCircleInfo
      }
    />
  </span>
);

const renderAlertSeverityToken = (
  severity: AnnotationInfoBoxHelpAlertSeverity
) =>
  renderActionIndicatorToken(
    severity === ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING
      ? ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.WARNING
      : ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.INFO
  );

const renderBackspaceToken = (
  platform: KeyboardDisplayPlatform,
  keyboardLabels: KeyboardDisplayLabels
) => renderKeyToken(resolveBackspaceDisplayLabel(platform, keyboardLabels));

const renderHelpActionInput = (
  input: AnnotationInfoBoxHelpActionInput,
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels
) => {
  switch (input) {
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK:
      return renderPointerToken(pointerLabels.click);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK:
      return renderPointerToken(pointerLabels.doubleClick);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER:
      return renderKeyToken("Enter");
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE:
      return renderBackspaceToken(keyboardPlatform, keyboardLabels);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE:
      return renderKeyToken(keyboardLabels.escape);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT:
      return renderKeyToken(keyboardLabels.shift);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DISC_CENTER:
      return renderDragTargetToken(faRowResize);
    case ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DISC_OUTER:
      return renderDragTargetToken(faUpDownLeftRight);
  }
};

const renderHelpActionInputCombination = (
  inputs: AnnotationInfoBoxHelpActionInputCombination,
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels
) => (
  <span style={tokenGroupStyle}>
    {inputs.map((input, index) => (
      <span
        key={`${input}-${index}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.22rem",
        }}
      >
        {index > 0 ? <span>+</span> : null}
        {renderHelpActionInput(
          input,
          keyboardLabels,
          keyboardPlatform,
          pointerLabels
        )}
      </span>
    ))}
  </span>
);

const renderHelpActionInputAlternatives = (
  indicator: AnnotationInfoBoxHelpActionIndicator | undefined,
  inputAlternatives: readonly AnnotationInfoBoxHelpActionInputCombination[],
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels,
  layout: AnnotationInfoBoxHelpLayout
) => {
  if (layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT) {
    return (
      <span style={compactTokenGroupStyle}>
        {indicator ? renderActionIndicatorToken(indicator) : null}
        {inputAlternatives.map((inputCombination, index) => (
          <span
            key={`${inputCombination.join("+")}-${index}`}
            style={compactTokenGroupStyle}
          >
            {index > 0 ? (
              <span style={compactAlternativeLabelStyle}>
                {pointerLabels.alternative}
              </span>
            ) : null}
            {renderHelpActionInputCombination(
              inputCombination,
              keyboardLabels,
              keyboardPlatform,
              pointerLabels
            )}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span style={tokenGroupStyle}>
      {indicator ? renderActionIndicatorToken(indicator) : null}
      {inputAlternatives.map((inputCombination, index) => (
        <span
          key={`${inputCombination.join("+")}-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.22rem",
          }}
        >
          {index > 0 ? <span>{pointerLabels.alternative}</span> : null}
          {renderHelpActionInputCombination(
            inputCombination,
            keyboardLabels,
            keyboardPlatform,
            pointerLabels
          )}
        </span>
      ))}
    </span>
  );
};

const renderHeadingItem = (
  item: AnnotationInfoBoxHelpHeadingItem,
  index: number,
  layout: AnnotationInfoBoxHelpLayout
) => {
  const level = item.level ?? ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS.SECTION;
  return (
    <div
      key={`heading-${item.text}-${index}`}
      data-testid="annotation-help-heading"
      data-level={level}
      style={
        layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
          ? { ...headingStyles[level], ...compactHeadingSpanStyle }
          : headingStyles[level]
      }
    >
      {item.text}
    </div>
  );
};

// Trigger cell for instruction rows: each input alternative gets its own line,
// with a half-baseline gap after the first. A qualifier can follow the final
// input token and wrap naturally within that line. (cismet/wupp#4078)
const renderStartAlignedTrigger = (
  item: AnnotationInfoBoxHelpActionItem,
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels
) => {
  const lastAlternativeIndex = item.inputAlternatives.length - 1;

  return (
    <span style={startTriggerCellStyle}>
      {item.inputAlternatives.length === 0
        ? item.leadingLabel && (
            <span style={startTriggerTokenRowStyle}>
              <span style={triggerLabelStyle}>{item.leadingLabel}</span>
            </span>
          )
        : item.inputAlternatives.map((inputCombination, index) => (
            <span
              key={`${inputCombination.join("+")}-${index}`}
              style={
                item.rightAlignInput && index === 0
                  ? startTriggerRightAlignedTokenRowStyle
                  : index === 0
                  ? startTriggerTokenRowStyle
                  : startTriggerAlternativeRowStyle
              }
            >
              {index === 0 && item.leadingLabel ? (
                <span style={triggerLabelStyle}>{item.leadingLabel}</span>
              ) : null}
              {index === 0 && item.indicator
                ? renderActionIndicatorToken(item.indicator)
                : null}
              {renderHelpActionInputCombination(
                inputCombination,
                keyboardLabels,
                keyboardPlatform,
                pointerLabels
              )}
              {index < lastAlternativeIndex ? (
                <span>{pointerLabels.alternative}</span>
              ) : null}
              {index === lastAlternativeIndex &&
              item.trailingLabelAfterLastInput &&
              item.trailingLabel ? (
                <span style={triggerLabelStyle}>{item.trailingLabel}</span>
              ) : null}
            </span>
          ))}
      {item.trailingLabel && !item.trailingLabelAfterLastInput ? (
        <span style={triggerLabelStyle}>{item.trailingLabel}</span>
      ) : null}
    </span>
  );
};

const renderActionItem = (
  item: AnnotationInfoBoxHelpActionItem,
  index: number,
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels,
  layout: AnnotationInfoBoxHelpLayout,
  triggerAlign: AnnotationInfoBoxHelpActionTriggerAlignment = ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.END
) => {
  const isStartAligned =
    triggerAlign === ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.START;

  const trigger = isStartAligned
    ? renderStartAlignedTrigger(
        item,
        keyboardLabels,
        keyboardPlatform,
        pointerLabels
      )
    : (item.inputAlternatives.length > 0 || item.indicator
        ? renderHelpActionInputAlternatives(
            item.indicator,
            item.inputAlternatives,
            keyboardLabels,
            keyboardPlatform,
            pointerLabels,
            layout
          )
        : null) ?? <span style={tokenGroupStyle} />;

  return (
    <div
      key={`${item.inputAlternatives
        .map((inputCombination) => inputCombination.join("+"))
        .join("-")}-${item.leadingLabel ?? ""}-${index}`}
      data-testid="annotation-help-action"
      style={actionRowStyles[layout]}
    >
      {trigger}
      <span style={actionDescriptionStyles[layout]}>{item.description}</span>
    </div>
  );
};

const renderAlertItem = (
  item: AnnotationInfoBoxHelpAlertItem,
  index: number,
  keyboardLabels: KeyboardDisplayLabels,
  keyboardPlatform: KeyboardDisplayPlatform,
  pointerLabels: PointerDisplayLabels,
  layout: AnnotationInfoBoxHelpLayout
) => {
  const actions = item.actions ?? [];
  const alertStyle =
    layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
      ? compactAlertContainerStyles[item.severity]
      : alertContainerStyles[item.severity];

  return (
    <div
      key={`${item.severity}-${item.text}-${index}`}
      data-testid="annotation-help-alert"
      data-severity={item.severity}
      style={alertStyle}
    >
      <div style={actionRowStyles[layout]}>
        <span
          style={
            layout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT
              ? compactTokenGroupStyle
              : tokenGroupStyle
          }
        >
          {renderAlertSeverityToken(item.severity)}
        </span>
        <span style={alertTextStyle}>{item.text}</span>
      </div>
      {actions.map((action, actionIndex) =>
        renderActionItem(
          action,
          actionIndex,
          keyboardLabels,
          keyboardPlatform,
          pointerLabels,
          layout
        )
      )}
    </div>
  );
};

export const AnnotationInfoBoxHelpContent = ({
  items,
  layout,
  locale,
  platform,
  actionTriggerAlign = ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.END,
}: AnnotationInfoBoxHelpContentProps) => {
  const resolvedLayout = resolveAnnotationInfoBoxHelpLayout(layout);
  const resolvedLocale = locale ?? resolveAnnotationInfoBoxHelpLocale();
  const keyboardLabels = resolveKeyboardDisplayLabels(resolvedLocale);
  const keyboardPlatform = resolveKeyboardDisplayPlatform(platform);
  const pointerLabels = resolvePointerDisplayLabels(resolvedLocale);
  const displayItems = orderAnnotationInfoBoxHelpItems(items);

  if (resolvedLayout === ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT) {
    const content: ReactNode[] = displayItems.map((item, index) =>
      typeof item === "string"
        ? renderTextItem(
            item,
            resolvedLayout,
            index === displayItems.length - 1
          )
        : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT
        ? renderTextItem(
            item,
            resolvedLayout,
            index === displayItems.length - 1
          )
        : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING
        ? renderHeadingItem(item, index, resolvedLayout)
        : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT
        ? renderAlertItem(
            item,
            index,
            keyboardLabels,
            keyboardPlatform,
            pointerLabels,
            resolvedLayout
          )
        : renderActionItem(
            item,
            index,
            keyboardLabels,
            keyboardPlatform,
            pointerLabels,
            resolvedLayout,
            actionTriggerAlign
          )
    );

    return (
      <div
        data-testid="annotation-help-content"
        style={resolveCompactContentStyle(actionTriggerAlign)}
      >
        {content}
      </div>
    );
  }

  const content = displayItems.map((item, index) =>
    typeof item === "string"
      ? renderTextItem(item, resolvedLayout)
      : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT
      ? renderTextItem(item, resolvedLayout)
      : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.HEADING
      ? renderHeadingItem(item, index, resolvedLayout)
      : item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT
      ? renderAlertItem(
          item,
          index,
          keyboardLabels,
          keyboardPlatform,
          pointerLabels,
          resolvedLayout
        )
      : renderActionItem(
          item,
          index,
          keyboardLabels,
          keyboardPlatform,
          pointerLabels,
          resolvedLayout,
          actionTriggerAlign
        )
  );

  // A root element also carries the baseline step down to the nested tokens.
  return (
    <div data-testid="annotation-help-content" style={helpContentRootStyle}>
      {content}
    </div>
  );
};
