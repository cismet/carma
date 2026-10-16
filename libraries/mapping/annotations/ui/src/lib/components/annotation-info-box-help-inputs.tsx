import {
  faRowResize,
  resolveBackspaceDisplayLabel,
  type KeyboardDisplayLabels,
  type KeyboardDisplayPlatform,
} from "@carma-commons/ui/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCircleExclamation,
  faCircleInfo,
  faComputerMouse,
  faUpDownLeftRight,
} from "@fortawesome/free-solid-svg-icons";
import {
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS,
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  type AnnotationInfoBoxHelpActionInput,
  type AnnotationInfoBoxHelpActionIndicator,
  type AnnotationInfoBoxHelpAlertSeverity,
  type AnnotationInfoBoxHelpLayout,
  type AnnotationInfoBoxHelpActionInputCombination,
  type AnnotationInfoBoxHelpActionItem,
} from "./annotation-info-box-help-types";
import {
  triggerLabelStyle,
  startTriggerCellStyle,
  startTriggerTokenRowStyle,
  startTriggerAlternativeRowStyle,
  startTriggerRightAlignedTokenRowStyle,
  tokenGroupStyle,
  compactTokenGroupStyle,
  compactAlternativeLabelStyle,
  keyTokenStyle,
  pointerTokenStyle,
  actionIndicatorTokenStyle,
  actionIndicatorIconStyles,
  dragTargetTokenStyle,
} from "./annotation-info-box-help-styles";

export type PointerDisplayLabels = Readonly<{
  alternative: string;
  click: string;
  doubleClick: string;
}>;

export const POINTER_DISPLAY_LABELS_BY_LANGUAGE: Readonly<
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

export const resolvePointerDisplayLabels = (
  locale: string | undefined
): PointerDisplayLabels => {
  const language = locale?.split("-")[0];
  return language && POINTER_DISPLAY_LABELS_BY_LANGUAGE[language]
    ? POINTER_DISPLAY_LABELS_BY_LANGUAGE[language]
    : POINTER_DISPLAY_LABELS_BY_LANGUAGE.en;
};

export const renderKeyToken = (label: string) => (
  <span style={keyTokenStyle}>{label}</span>
);

export const renderPointerToken = (label: string) => (
  <span style={pointerTokenStyle}>
    <FontAwesomeIcon icon={faComputerMouse} />
    <span>{label}</span>
  </span>
);

export const renderDragTargetToken = (icon: IconDefinition) => (
  <span style={dragTargetTokenStyle}>
    <FontAwesomeIcon icon={icon} />
  </span>
);

export const renderActionIndicatorToken = (
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

export const renderAlertSeverityToken = (
  severity: AnnotationInfoBoxHelpAlertSeverity
) =>
  renderActionIndicatorToken(
    severity === ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING
      ? ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.WARNING
      : ANNOTATION_INFO_BOX_HELP_ACTION_INDICATORS.INFO
  );

export const renderBackspaceToken = (
  platform: KeyboardDisplayPlatform,
  keyboardLabels: KeyboardDisplayLabels
) => renderKeyToken(resolveBackspaceDisplayLabel(platform, keyboardLabels));

export const renderHelpActionInput = (
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

export const renderHelpActionInputCombination = (
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

export const renderHelpActionInputAlternatives = (
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

// Trigger cell for instruction rows: each input alternative gets its own line,
// with a half-baseline gap after the first. A qualifier can follow the final
// input token and wrap naturally within that line.
export const renderStartAlignedTrigger = (
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
