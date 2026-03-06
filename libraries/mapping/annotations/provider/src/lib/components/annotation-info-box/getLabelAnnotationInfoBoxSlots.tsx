import type { ReactNode } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import type {
  AnnotationSlots,
  LabelAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";
import {
  LABEL_TITLE,
  renderEditableAnnotationSubtitle,
  stopInputEventPropagation,
} from "./annotationInfoBoxSlots.shared";

const LABEL_MODE_INSTRUCTION =
  "Klick auf das Modell, um eine Beschriftung zu platzieren.";
const DEFAULT_LABEL_BACKGROUND_HEX = "#c8c8c8";
const DEFAULT_LABEL_TEXT_HEX = "#000000";

const toHexChannel = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

const normalizeColorToHex = (
  value: string | undefined,
  fallbackHex: string
): string => {
  const trimmed = value?.trim();
  if (!trimmed) return fallbackHex;

  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }
    return `#${hex.toLowerCase()}`;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?)\s*)?\)$/
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${toHexChannel(Number(r))}${toHexChannel(Number(g))}${toHexChannel(
      Number(b)
    )}`;
  }

  return fallbackHex;
};

const renderPureLabelContent = (
  input: LabelAnnotationSlotsInput
): ReactNode => {
  if (input.isLivePreview) {
    return (
      <div className="text-[12px] mb-0">
        <div className="mt-1 text-sm pl-2 pr-1 text-gray-500">
          {LABEL_MODE_INSTRUCTION}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[12px] mb-0">
      <div className="mt-1 text-sm pl-2 pr-1">
        <div
          className="mb-2 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Schriftgröße:</span>
          <button
            type="button"
            onClick={() =>
              input.adjustCurrentPureLabelFontSize(
                -input.pureLabelFontSizeStepPx
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !input.pureLabelAppearance ||
              input.pureLabelAppearance.fontSizePx <=
                input.pureLabelMinFontSizePx
            }
            aria-label="Schriftgröße verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <span className="tabular-nums min-w-[48px] text-center">
            {input.pureLabelAppearance?.fontSizePx ??
              input.pureLabelDefaultFontSizePx}
            px
          </span>
          <button
            type="button"
            onClick={() =>
              input.adjustCurrentPureLabelFontSize(
                input.pureLabelFontSizeStepPx
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !input.pureLabelAppearance ||
              input.pureLabelAppearance.fontSizePx >=
                input.pureLabelMaxFontSizePx
            }
            aria-label="Schriftgröße vergrößern"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        <div
          className="mb-1 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Hintergrund:</span>
          <input
            type="color"
            aria-label="Hintergrundfarbe"
            value={normalizeColorToHex(
              input.pureLabelAppearance?.backgroundColor,
              DEFAULT_LABEL_BACKGROUND_HEX
            )}
            onChange={(event) =>
              input.handlePureLabelBackgroundColorChange(event.target.value)
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
          <span className="text-gray-500">Text:</span>
          <input
            type="color"
            aria-label="Textfarbe"
            value={normalizeColorToHex(
              input.pureLabelAppearance?.textColor,
              DEFAULT_LABEL_TEXT_HEX
            )}
            onChange={(event) =>
              input.handlePureLabelTextColorChange(event.target.value)
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
        </div>
      </div>
    </div>
  );
};

export const getLabelAnnotationInfoBoxSlots = (
  input: LabelAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? LABEL_TITLE
      : `${LABEL_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: LABEL_TITLE,
    titleToken: "1",
    measurement: input.measurement,
    displayPoint: null,
    isReference: input.isReference,
    actions: input.actions,
    autoFocusTrigger: input.autoFocusTitleTrigger,
    onTitleCommit: (title) => {
      if (!input.measurement) return;
      if (!title.trim()) return;
      input.actions.confirmPointLabelInputById(input.measurement.id);
    },
  }),
  content: renderPureLabelContent(input),
  collapsible: false,
  instructionText: null,
});
