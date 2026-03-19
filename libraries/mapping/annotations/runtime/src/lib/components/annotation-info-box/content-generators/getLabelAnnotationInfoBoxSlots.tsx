import type { ReactNode } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
} from "../annotationInfoBoxSlots.types";
import {
  INFO_BOX_BODY_TEXT_CLASSNAME,
  getInfoBoxLabelDefaultName,
  INFO_BOX_MUTED_BODY_TEXT_CLASSNAME,
  LABEL_TITLE,
  renderEditableAnnotationSubtitle,
  stopInputEventPropagation,
} from "./shared";
import { resolvePointAnnotationDisplayPoint } from "../utils/pointAnnotationDisplay";

const LABEL_MODE_INSTRUCTION =
  "Klick auf das Modell, um eine Beschriftung zu platzieren.";
const PURE_LABEL_MIN_FONT_SIZE_PX = 10;
const PURE_LABEL_MAX_FONT_SIZE_PX = 48;
const PURE_LABEL_FONT_SIZE_STEP_PX = 1;
const PURE_LABEL_DEFAULT_FONT_SIZE_PX = 12;
const PURE_LABEL_DEFAULT_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.7)";
const PURE_LABEL_DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_LABEL_BACKGROUND_HEX = "#c8c8c8";
const DEFAULT_LABEL_TEXT_HEX = "#000000";

const sanitizePureLabelFontSizePx = (value?: number): number => {
  if (!Number.isFinite(value)) return PURE_LABEL_DEFAULT_FONT_SIZE_PX;
  const normalized = Math.round(Number(value));
  return Math.min(
    PURE_LABEL_MAX_FONT_SIZE_PX,
    Math.max(PURE_LABEL_MIN_FONT_SIZE_PX, normalized)
  );
};

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
  input: AnnotationInfoBoxEntryPayload
): ReactNode => {
  if (!input.pointAnnotation) {
    return (
      <div className={`mb-0 ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
        <div className={`mt-1 pl-2 pr-1 ${INFO_BOX_MUTED_BODY_TEXT_CLASSNAME}`}>
          {LABEL_MODE_INSTRUCTION}
        </div>
      </div>
    );
  }

  const pureLabelAppearance = {
    fontSizePx: sanitizePureLabelFontSizePx(
      input.pointAnnotation.labelAppearance?.fontSizePx
    ),
    backgroundColor:
      input.pointAnnotation.labelAppearance?.backgroundColor?.trim() ||
      PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
    textColor:
      input.pointAnnotation.labelAppearance?.textColor?.trim() ||
      PURE_LABEL_DEFAULT_TEXT_COLOR,
  };

  return (
    <div className={`mb-0 ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
      <div className="mt-1 pl-2 pr-1">
        <div
          className="mb-2 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Schriftgröße:</span>
          <button
            type="button"
            onClick={() =>
              input.actions.updatePointLabelAppearanceById(
                input.pointAnnotation.id,
                {
                  ...(input.pointAnnotation.labelAppearance ?? {}),
                  fontSizePx: sanitizePureLabelFontSizePx(
                    pureLabelAppearance.fontSizePx -
                      PURE_LABEL_FONT_SIZE_STEP_PX
                  ),
                }
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              pureLabelAppearance.fontSizePx <= PURE_LABEL_MIN_FONT_SIZE_PX
            }
            aria-label="Schriftgröße verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <span className="tabular-nums min-w-[48px] text-center">
            {pureLabelAppearance.fontSizePx}px
          </span>
          <button
            type="button"
            onClick={() =>
              input.actions.updatePointLabelAppearanceById(
                input.pointAnnotation.id,
                {
                  ...(input.pointAnnotation.labelAppearance ?? {}),
                  fontSizePx: sanitizePureLabelFontSizePx(
                    pureLabelAppearance.fontSizePx +
                      PURE_LABEL_FONT_SIZE_STEP_PX
                  ),
                }
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              pureLabelAppearance.fontSizePx >= PURE_LABEL_MAX_FONT_SIZE_PX
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
              pureLabelAppearance.backgroundColor,
              DEFAULT_LABEL_BACKGROUND_HEX
            )}
            onChange={(event) =>
              input.actions.updatePointLabelAppearanceById(
                input.pointAnnotation.id,
                {
                  ...(input.pointAnnotation.labelAppearance ?? {}),
                  backgroundColor: event.target.value,
                }
              )
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
          <span className="text-gray-500">Text:</span>
          <input
            type="color"
            aria-label="Textfarbe"
            value={normalizeColorToHex(
              pureLabelAppearance.textColor,
              DEFAULT_LABEL_TEXT_HEX
            )}
            onChange={(event) =>
              input.actions.updatePointLabelAppearanceById(
                input.pointAnnotation.id,
                {
                  ...(input.pointAnnotation.labelAppearance ?? {}),
                  textColor: event.target.value,
                }
              )
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
        </div>
      </div>
    </div>
  );
};

export const getLabelAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationSlots => {
  const measurement = input.kind === "label" ? input.pointAnnotation : null;
  const order = measurement
    ? Math.max(
        0,
        input.labelMeasurements.findIndex(
          (entry) => entry.id === measurement.id
        )
      ) + 1
    : input.labelMeasurements.length + 1;

  return {
    headingTitle: LABEL_TITLE,
    subtitle: renderEditableAnnotationSubtitle({
      defaultDisplayName: getInfoBoxLabelDefaultName(order),
      measurement,
      displayPoint: resolvePointAnnotationDisplayPoint(measurement),
      isReference: false,
      actions: input.actions,
      autoFocusTrigger:
        measurement &&
        measurement.id === input.pendingLabelPlacementAnnotationId
          ? measurement.id
          : undefined,
      onTitleCommit: (title) => {
        if (!measurement) return;
        if (!title.trim()) return;
        if (measurement.id === input.pendingLabelPlacementAnnotationId) {
          input.actions.confirmLabelPlacementById(measurement.id);
        }
      },
    }),
    content: renderPureLabelContent(input),
    collapsible: false,
    instructionText: null,
  };
};
