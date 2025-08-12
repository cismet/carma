import React from "react";
import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import {
  CardinalDirectionEnum,
  CardinalLetters,
} from "../utils/orientationUtils";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

type Props = {
  rotateCamera: (clockwise: boolean) => void;
  rotateToDirection: (d: CardinalDirectionEnum) => void;
  activeDirection?: CardinalDirectionEnum;
  activeButtonClass?: string;
  isLoading: boolean;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

export const ObliqueDirectionControls: React.FC<Props> = ({
  rotateCamera,
  rotateToDirection,
  activeDirection,
  activeButtonClass = "",
  isLoading,
  siblingCallbacks,
}) => {
  // Heading-relative slot mapping: the active direction is always on top.
  const order: CardinalDirectionEnum[] = [
    CardinalDirectionEnum.North,
    CardinalDirectionEnum.East,
    CardinalDirectionEnum.South,
    CardinalDirectionEnum.West,
  ];
  const topDir = activeDirection ?? CardinalDirectionEnum.North;
  const topIdx = order.indexOf(topDir);
  const rightDir = order[(topIdx + 1) % 4];
  const bottomDir = order[(topIdx + 2) % 4];
  const leftDir = order[(topIdx + 3) % 4];
  // Fixed NOSW labels using shared mapping (German locale)
  const letterFor = (d: CardinalDirectionEnum) =>
    CardinalLetters.DE.get(d) ?? "";

  // Prevent redundant rotations: if direction already active, do nothing
  // Important: return a closure; do NOT call rotateToDirection during render.
  const getRotateHandler = (dir: CardinalDirectionEnum) =>
    activeDirection === dir ? undefined : () => rotateToDirection(dir);
  return (
    <div className="relative grid grid-cols-5 grid-rows-5 gap-1 p-2">
      {isLoading && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity duration-500`}
        >
          <Spin tip="Schrägluftbild-Daten werden geladen..." />
        </div>
      )}
      <div />
      <div />
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[bottomDir]}
          width="40px"
          height="40px"
          className={`${
            !siblingCallbacks?.[bottomDir]
              ? "opacity-50 cursor-not-allowed "
              : ""
          }pointer-events-auto select-none`}
        >
          ↑
        </ControlButtonStyler>
      ) : (
        <div />
      )}
      <div />
      <div />

      {/* Row 2: rotate CCW, Up, rotate CW */}
      <div />
      <ControlButtonStyler
        onClick={() => rotateCamera(false)}
        width="40px"
        height="40px"
        className="pointer-events-auto select-none"
      >
        <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={getRotateHandler(topDir)}
        width="40px"
        height="40px"
        className={`font-extrabold pointer-events-auto select-none ${
          activeDirection === topDir ? activeButtonClass : ""
        }`}
      >
        {letterFor(topDir)}
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={() => rotateCamera(true)}
        width="40px"
        height="40px"
        className="pointer-events-auto select-none"
      >
        <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
      </ControlButtonStyler>
      <div />

      {/* Row 3: move left, rotate left, empty, rotate right, move right */}
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[rightDir]}
          width="40px"
          height="40px"
          className={`${
            !siblingCallbacks?.[rightDir]
              ? "opacity-50 cursor-not-allowed "
              : ""
          }pointer-events-auto select-none`}
        >
          ←
        </ControlButtonStyler>
      ) : (
        <div />
      )}
      <ControlButtonStyler
        onClick={getRotateHandler(leftDir)}
        width="40px"
        height="40px"
        className={`font-extrabold pointer-events-auto select-none ${
          activeDirection === leftDir ? activeButtonClass : ""
        }`}
      >
        {letterFor(leftDir)}
      </ControlButtonStyler>
      <div />
      <ControlButtonStyler
        onClick={getRotateHandler(rightDir)}
        width="40px"
        height="40px"
        className={`font-extrabold pointer-events-auto select-none ${
          activeDirection === rightDir ? activeButtonClass : ""
        }`}
      >
        {letterFor(rightDir)}
      </ControlButtonStyler>
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[leftDir]}
          width="40px"
          height="40px"
          className={`${
            !siblingCallbacks?.[leftDir] ? "opacity-50 cursor-not-allowed " : ""
          }pointer-events-auto select-none`}
        >
          →
        </ControlButtonStyler>
      ) : (
        <div />
      )}

      {/* Row 4: rotate 180 */}
      <div />
      <div />
      <ControlButtonStyler
        onClick={getRotateHandler(bottomDir)}
        width="40px"
        height="40px"
        className={`font-extrabold pointer-events-auto select-none ${
          activeDirection === bottomDir ? activeButtonClass : ""
        }`}
      >
        {letterFor(bottomDir)}
      </ControlButtonStyler>
      <div />
      <div />

      {/* Row 5: move down */}
      <div />
      <div />
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[topDir]}
          width="40px"
          height="40px"
          className={`${
            !siblingCallbacks?.[topDir] ? "opacity-50 cursor-not-allowed " : ""
          }pointer-events-auto select-none`}
        >
          ↓
        </ControlButtonStyler>
      ) : (
        <div />
      )}
      <div />
      <div />
    </div>
  );
};

export default ObliqueDirectionControls;
