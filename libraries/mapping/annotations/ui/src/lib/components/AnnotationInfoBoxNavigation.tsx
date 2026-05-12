import type { ReactNode } from "react";
import { faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

export type AnnotationInfoBoxNavigationProps = {
  totalEntries: number;
  currentIndex: number;
  instructionText?: string | null;
  availabilityLabel?: ReactNode;
  labels?: Partial<AnnotationInfoBoxNavigationLabels>;
  onFlyToAllMeasurements?: () => void;
  onPreviousMeasurement: () => void;
  onNextMeasurement: () => void;
  visualOptions?: AnnotationInfoBoxVisualOptions;
};

export type AnnotationInfoBoxNavigationLabels = Readonly<{
  measurementSingular: string;
  measurementPlural: string;
  availableSuffix: string;
  previousAriaLabel: string;
  nextAriaLabel: string;
  counterSeparator: string;
}>;

export const DEFAULT_ANNOTATION_INFO_BOX_NAVIGATION_LABELS =
  Object.freeze<AnnotationInfoBoxNavigationLabels>({
    measurementSingular: "Messung",
    measurementPlural: "Messungen",
    availableSuffix: "verfügbar",
    previousAriaLabel: "Vorherige Messung",
    nextAriaLabel: "Nächste Messung",
    counterSeparator: "von",
  });

const formatAvailabilityLabel = (
  totalEntries: number,
  labels: AnnotationInfoBoxNavigationLabels
) =>
  `${totalEntries} ${
    totalEntries === 1 ? labels.measurementSingular : labels.measurementPlural
  } ${labels.availableSuffix}`.trim();

export const AnnotationInfoBoxNavigation = ({
  totalEntries,
  currentIndex,
  instructionText,
  availabilityLabel,
  labels,
  onFlyToAllMeasurements,
  onPreviousMeasurement,
  onNextMeasurement,
  visualOptions,
}: AnnotationInfoBoxNavigationProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const resolvedLabels = {
    ...DEFAULT_ANNOTATION_INFO_BOX_NAVIGATION_LABELS,
    ...labels,
  };

  if (totalEntries <= 0 && !instructionText) return null;

  const navigationButtonStyle = {
    fontSize: resolvedVisualOptions.navigationLinkFontSize,
    border: "none",
    background: "transparent",
    padding: 0,
    userSelect: "none",
  } as const;
  const previousControlLabel = resolvedVisualOptions.navigationControlLabels
    ?.previous ?? <FontAwesomeIcon icon={faAnglesLeft} />;
  const nextControlLabel = resolvedVisualOptions.navigationControlLabels
    ?.next ?? <FontAwesomeIcon icon={faAnglesRight} />;

  return (
    <>
      {instructionText ? (
        <div
          className={`${resolvedVisualOptions.navigationInstructionContainerClassName} ${resolvedVisualOptions.mutedTextClassName}`}
        >
          <span>{instructionText}</span>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div
          className={
            resolvedVisualOptions.navigationAvailabilityContainerClassName
          }
        >
          {onFlyToAllMeasurements ? (
            <button
              type="button"
              className={`${resolvedVisualOptions.linkTextClassName} cursor-pointer`}
              onClick={onFlyToAllMeasurements}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
              }}
            >
              {availabilityLabel ??
                formatAvailabilityLabel(totalEntries, resolvedLabels)}
            </button>
          ) : (
            <span className={resolvedVisualOptions.linkTextClassName}>
              {availabilityLabel ??
                formatAvailabilityLabel(totalEntries, resolvedLabels)}
            </span>
          )}
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div
          className={resolvedVisualOptions.navigationSummaryContainerClassName}
        >
          <button
            type="button"
            className={`renderAsLink cursor-pointer select-none ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onPreviousMeasurement}
            data-test-id="switch-measurement-left"
            style={navigationButtonStyle}
            aria-label={resolvedLabels.previousAriaLabel}
          >
            {previousControlLabel}
          </button>
          <span className="mx-4">
            {currentIndex + 1} {resolvedLabels.counterSeparator} {totalEntries}
          </span>
          <button
            type="button"
            className={`renderAsLink cursor-pointer select-none ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onNextMeasurement}
            data-test-id="switch-measurement-right"
            style={navigationButtonStyle}
            aria-label={resolvedLabels.nextAriaLabel}
          >
            {nextControlLabel}
          </button>
        </div>
      ) : null}
    </>
  );
};
