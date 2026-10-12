import { type ReactNode } from "react";
import {
  resolveKeyboardDisplayLabels,
  resolveKeyboardDisplayPlatform,
  type KeyboardDisplayLabels,
  type KeyboardDisplayPlatform,
} from "@carma-commons/ui/components";
import {
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS,
  ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  type AnnotationInfoBoxHelpLayout,
  type AnnotationInfoBoxHelpActionTriggerAlignment,
  type AnnotationInfoBoxHelpTextItem,
  type AnnotationInfoBoxHelpHeadingItem,
  type AnnotationInfoBoxHelpActionItem,
  type AnnotationInfoBoxHelpAlertItem,
  type AnnotationInfoBoxHelpItem,
} from "./annotation-info-box-help-types";
import {
  type PointerDisplayLabels,
  resolvePointerDisplayLabels,
  renderAlertSeverityToken,
  renderHelpActionInputAlternatives,
  renderStartAlignedTrigger,
} from "./annotation-info-box-help-inputs";
import {
  helpContentRootStyle,
  paragraphStyle,
  headingStyles,
  compactHeadingSpanStyle,
  resolveCompactContentStyle,
  compactParagraphStyle,
  compactLastParagraphStyle,
  actionRowStyles,
  tokenGroupStyle,
  compactTokenGroupStyle,
  alertContainerStyles,
  compactAlertContainerStyles,
  alertTextStyle,
  actionDescriptionStyles,
} from "./annotation-info-box-help-styles";

export { ANNOTATION_INFO_BOX_HELP_ITEM_KINDS } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_HEADING_LEVELS } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES } from "./annotation-info-box-help-types";
export { ANNOTATION_INFO_BOX_HELP_LAYOUTS } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpItemKind } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpActionInput } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpActionIndicator } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpAlertSeverity } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpLayout } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpHeadingLevel } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpActionTriggerAlignment } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpActionInputCombination } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpTextItem } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpHeadingItem } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpActionItem } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpAlertItem } from "./annotation-info-box-help-types";
export type { AnnotationInfoBoxHelpItem } from "./annotation-info-box-help-types";

type AnnotationInfoBoxHelpContentProps = {
  items: readonly AnnotationInfoBoxHelpItem[];
  layout?: AnnotationInfoBoxHelpLayout;
  locale?: string;
  platform?: KeyboardDisplayPlatform;
  actionTriggerAlign?: AnnotationInfoBoxHelpActionTriggerAlignment;
};

const resolveAnnotationInfoBoxHelpLocale = (): string | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.language;

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
