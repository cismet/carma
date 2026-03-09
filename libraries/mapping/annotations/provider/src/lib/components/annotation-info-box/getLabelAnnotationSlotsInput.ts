import {
  ANNOTATION_TYPE_LABEL,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

import type {
  LabelAnnotationSlotsInput,
  AnnotationSlotActions,
} from "./annotationInfoBoxSlots.types";
import { resolvePointAnnotationDisplayPoint } from "./utils/pointAnnotationDisplay";

const PURE_LABEL_MIN_FONT_SIZE_PX = 10;
const PURE_LABEL_MAX_FONT_SIZE_PX = 48;
const PURE_LABEL_FONT_SIZE_STEP_PX = 1;
const PURE_LABEL_DEFAULT_FONT_SIZE_PX = 12;
const PURE_LABEL_DEFAULT_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.7)";
const PURE_LABEL_DEFAULT_TEXT_COLOR = "#000000";

const sanitizePureLabelFontSizePx = (value?: number): number => {
  if (!Number.isFinite(value)) return PURE_LABEL_DEFAULT_FONT_SIZE_PX;
  const normalized = Math.round(Number(value));
  return Math.min(
    PURE_LABEL_MAX_FONT_SIZE_PX,
    Math.max(PURE_LABEL_MIN_FONT_SIZE_PX, normalized)
  );
};

type GetLabelMeasurementSlotsInputParams = {
  measurement: PointAnnotationEntry | null;
  labelMeasurements: ReadonlyArray<PointAnnotationEntry>;
  labelInputPromptPointId: string | null;
  actions: AnnotationSlotActions;
};

export type LabelMeasurementSlotsInputResult = {
  slotsInput: LabelAnnotationSlotsInput;
  isLabelMeasurement: boolean;
  isLabelLivePreview: boolean;
};

export const getLabelAnnotationSlotsInput = ({
  measurement,
  labelMeasurements,
  labelInputPromptPointId,
  actions,
}: GetLabelMeasurementSlotsInputParams): LabelMeasurementSlotsInputResult => {
  const isLabelMeasurement = Boolean(measurement?.auxiliaryLabelAnchor);
  const fallbackLastLabel =
    labelMeasurements[labelMeasurements.length - 1] ?? null;
  const displayMeasurement = isLabelMeasurement
    ? measurement
    : fallbackLastLabel;

  const pureLabelAppearance = displayMeasurement
    ? {
        fontSizePx: sanitizePureLabelFontSizePx(
          displayMeasurement.labelAppearance?.fontSizePx
        ),
        backgroundColor:
          displayMeasurement.labelAppearance?.backgroundColor?.trim() ||
          PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
        textColor:
          displayMeasurement.labelAppearance?.textColor?.trim() ||
          PURE_LABEL_DEFAULT_TEXT_COLOR,
      }
    : null;

  const adjustCurrentPureLabelFontSize = (deltaPx: number) => {
    if (!displayMeasurement || !pureLabelAppearance) return;
    actions.updatePointLabelAppearanceById(displayMeasurement.id, {
      ...(displayMeasurement.labelAppearance ?? {}),
      fontSizePx: sanitizePureLabelFontSizePx(
        pureLabelAppearance.fontSizePx + deltaPx
      ),
    });
  };

  const handlePureLabelBackgroundColorChange = (colorHex: string) => {
    if (!displayMeasurement) return;
    actions.updatePointLabelAppearanceById(displayMeasurement.id, {
      ...(displayMeasurement.labelAppearance ?? {}),
      backgroundColor: colorHex,
    });
  };

  const handlePureLabelTextColorChange = (colorHex: string) => {
    if (!displayMeasurement) return;
    actions.updatePointLabelAppearanceById(displayMeasurement.id, {
      ...(displayMeasurement.labelAppearance ?? {}),
      textColor: colorHex,
    });
  };

  return {
    slotsInput: {
      kind: ANNOTATION_TYPE_LABEL,
      measurement: displayMeasurement,
      displayPoint: resolvePointAnnotationDisplayPoint(displayMeasurement),
      relativeElevation: null,
      isReference: false,
      isLivePreview: false,
      autoFocusTitleTrigger:
        displayMeasurement && displayMeasurement.id === labelInputPromptPointId
          ? displayMeasurement.id
          : undefined,
      pureLabelAppearance,
      pureLabelDefaultFontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
      pureLabelMinFontSizePx: PURE_LABEL_MIN_FONT_SIZE_PX,
      pureLabelMaxFontSizePx: PURE_LABEL_MAX_FONT_SIZE_PX,
      pureLabelFontSizeStepPx: PURE_LABEL_FONT_SIZE_STEP_PX,
      adjustCurrentPureLabelFontSize,
      handlePureLabelBackgroundColorChange,
      handlePureLabelTextColorChange,
      actions,
    },
    isLabelMeasurement,
    isLabelLivePreview: false,
  };
};
