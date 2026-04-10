import { faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
type AnnotationInfoBoxNavigationProps = {
  totalEntries: number;
  currentIndex: number;
  instructionText?: string | null;
  onFlyToAllMeasurements: () => void;
  onPreviousMeasurement: () => void;
  onNextMeasurement: () => void;
};

export const AnnotationInfoBoxNavigation = ({
  totalEntries,
  currentIndex,
  instructionText,
  onFlyToAllMeasurements,
  onPreviousMeasurement,
  onNextMeasurement,
}: AnnotationInfoBoxNavigationProps) => {
  if (totalEntries <= 0 && !instructionText) return null;

  const navigationButtonStyle = {
    fontSize: "10.5px",
    border: "none",
    background: "transparent",
    padding: 0,
  } as const;

  return (
    <>
      {instructionText ? (
        <div className="flex justify-center items-center w-full px-2 mt-1 pt-1 text-gray-500">
          <span>{instructionText}</span>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div className="flex justify-center items-center w-full px-2 mt-1 pt-1">
          <button
            type="button"
            className="text-[#0078a8] cursor-pointer"
            onClick={onFlyToAllMeasurements}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
            }}
          >
            {totalEntries} Messungen verfügbar
          </button>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div className="flex justify-between items-center w-full px-2 mt-0 mb-1">
          <button
            type="button"
            className="renderAsLink text-[#0078a8] cursor-pointer"
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
            className="renderAsLink text-[#0078a8] cursor-pointer"
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
