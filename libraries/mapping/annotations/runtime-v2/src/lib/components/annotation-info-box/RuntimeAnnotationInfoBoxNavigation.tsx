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
          <span
            className={
              onFlyToAllMeasurements
                ? `${resolvedVisualOptions.linkTextClassName} cursor-pointer`
                : resolvedVisualOptions.linkTextClassName
            }
            onClick={onFlyToAllMeasurements}
          >
            {availabilityLabel ??
              `${totalEntries} ${
                totalEntries === 1 ? "Messung" : "Messungen"
              } verfügbar`}
          </span>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div
          className={resolvedVisualOptions.navigationSummaryContainerClassName}
        >
          <a
            className={`renderAsLink cursor-pointer ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onPreviousMeasurement}
            data-test-id="switch-measurement-left"
            style={{
              fontSize: `${resolvedVisualOptions.navigationLinkFontSizePx}px`,
            }}
            aria-label="Vorherige Messung"
          >
            <FontAwesomeIcon icon={faAnglesLeft} />
          </a>
          <span className="mx-4">
            {currentIndex + 1} von {totalEntries}
          </span>
          <a
            className={`renderAsLink cursor-pointer ${resolvedVisualOptions.linkTextClassName}`}
            onClick={onNextMeasurement}
            data-test-id="switch-measurement-right"
            style={{
              fontSize: `${resolvedVisualOptions.navigationLinkFontSizePx}px`,
            }}
            aria-label="Nächste Messung"
          >
            <FontAwesomeIcon icon={faAnglesRight} />
          </a>
        </div>
      ) : null}
    </>
  );
};
