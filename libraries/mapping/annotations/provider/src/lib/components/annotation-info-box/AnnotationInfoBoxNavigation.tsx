import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesLeft, faAnglesRight } from "@fortawesome/free-solid-svg-icons";

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

  return (
    <>
      {instructionText ? (
        <div className="flex justify-center items-center w-full px-2 mt-1 pt-1 text-gray-500">
          <span>{instructionText}</span>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div className="flex justify-center items-center w-full px-2 mt-1 pt-1">
          <span
            className="text-[#0078a8] cursor-pointer"
            onClick={onFlyToAllMeasurements}
          >
            {totalEntries} Messungen verfügbar
          </span>
        </div>
      ) : null}
      {totalEntries > 0 ? (
        <div className="flex justify-between items-center w-full px-2 mt-0 mb-1">
          <a
            className="renderAsLink text-[#0078a8] cursor-pointer"
            onClick={onPreviousMeasurement}
            data-test-id="switch-measurement-left"
            style={{ fontSize: "10.5px" }}
            aria-label="Vorherige Messung"
          >
            <FontAwesomeIcon icon={faAnglesLeft} />
          </a>
          <span className="mx-4">
            {currentIndex + 1} von {totalEntries}
          </span>
          <a
            className="renderAsLink text-[#0078a8] cursor-pointer"
            onClick={onNextMeasurement}
            data-test-id="switch-measurement-right"
            style={{ fontSize: "10.5px" }}
            aria-label="Nächste Messung"
          >
            <FontAwesomeIcon icon={faAnglesRight} />
          </a>
        </div>
      ) : null}
    </>
  );
};
