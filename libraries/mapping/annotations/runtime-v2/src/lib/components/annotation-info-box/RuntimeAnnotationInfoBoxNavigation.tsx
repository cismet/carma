import type { ReactNode } from "react";
import { faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
} from "./annotationInfoBoxVisualDefaults";
type RuntimeAnnotationInfoBoxNavigationProps = {
  totalEntries: number;
  currentIndex: number;
  instructionText?: string | null;
  availabilityLabel?: ReactNode;
  onFlyToAllMeasurements?: () => void;
  onPreviousMeasurement: () => void;
  onNextMeasurement: () => void;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptions;
};

export const RuntimeAnnotationInfoBoxNavigation = ({
  totalEntries,
  currentIndex,
  instructionText,
  availabilityLabel,
  onFlyToAllMeasurements,
  onPreviousMeasurement,
  onNextMeasurement,
  visualOptions,
}: RuntimeAnnotationInfoBoxNavigationProps) => {
  const resolvedVisualOptions =
    resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions);

  if (totalEntries <= 0 && !instructionText) return null;

  const navigationButtonStyle = {
    fontSize: `${resolvedVisualOptions.navigationLinkFontSizePx}px`,
    border: "none",
    background: "transparent",
    padding: 0,
  } as const;

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
                `${totalEntries} ${
                  totalEntries === 1 ? "Messung" : "Messungen"
                } verfügbar`}
            </button>
          ) : (
            <span className={resolvedVisualOptions.linkTextClassName}>
              {availabilityLabel ??
                `${totalEntries} ${
                  totalEntries === 1 ? "Messung" : "Messungen"
                } verfügbar`}
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
            className={`renderAsLink cursor-pointer ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onPreviousMeasurement}
            data-test-id="switch-measurement-left"
            style={navigationButtonStyle}
            aria-label="Vorherige Messung"
          >
            <FontAwesomeIcon icon={faAnglesLeft} />
          </button>
          <span className="mx-4">
            {currentIndex + 1} von {totalEntries}
          </span>
          <button
            type="button"
            className={`renderAsLink cursor-pointer ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onNextMeasurement}
            data-test-id="switch-measurement-right"
            style={navigationButtonStyle}
            aria-label="Nächste Messung"
          >
            <FontAwesomeIcon icon={faAnglesRight} />
          </button>
        </div>
      ) : null}
    </>
  );
};
