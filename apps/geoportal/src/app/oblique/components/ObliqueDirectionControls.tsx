import React from "react";
import { Tooltip, Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

type Props = {
  rotateCamera: (clockwise: boolean) => void;
  rotateToDirection: (d: CardinalDirectionEnum) => void;
  activeDirection?: CardinalDirectionEnum;
  activeButtonClass?: string;
  headingDegrees: string | number;
  offsetDegrees: number;
  isLoading: boolean;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

export const ObliqueDirectionControls: React.FC<Props> = ({
  rotateCamera,
  rotateToDirection,
  activeDirection,
  activeButtonClass = "",
  headingDegrees,
  offsetDegrees,
  isLoading,
  siblingCallbacks,
}) => {
  return (
    <div className="relative grid grid-cols-5 grid-rows-5 gap-1 p-2 rounded-lg shadow bg-white/40">
      <div
        className={
          `absolute inset-0 z-10 rounded-lg flex flex-col items-center justify-center bg-white/80 transition-opacity duration-500 ` +
          (isLoading
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none")
        }
      >
        <Spin tip="Schrägluftbild-Daten werden geladen..." />
      </div>
      {/* Row 1: outer North (center) */}
      <div />
      <div />
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[CardinalDirectionEnum.North]}
          width="40px"
          height="40px"
          className={
            !siblingCallbacks?.[CardinalDirectionEnum.North]
              ? "opacity-50 cursor-not-allowed"
              : undefined
          }
        >
          ↑
        </ControlButtonStyler>
      ) : (
        <div />
      )}
      <div />
      <div />

      {/* Row 2: rotate CCW, North, rotate CW */}
      <div />
      <ControlButtonStyler
        onClick={() => rotateCamera(false)}
        width="40px"
        height="40px"
      >
        <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.North)}
        width="40px"
        height="40px"
        className={`font-extrabold ${
          activeDirection === CardinalDirectionEnum.North
            ? activeButtonClass
            : ""
        }`}
      >
        N
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={() => rotateCamera(true)}
        width="40px"
        height="40px"
      >
        <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
      </ControlButtonStyler>
      <div />

      {/* Row 3: outer West, West, heading, East, outer East */}
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[CardinalDirectionEnum.West]}
          width="40px"
          height="40px"
          className={
            !siblingCallbacks?.[CardinalDirectionEnum.West]
              ? "opacity-50 cursor-not-allowed"
              : undefined
          }
        >
          ←
        </ControlButtonStyler>
      ) : (
        <div />
      )}
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.West)}
        width="40px"
        height="40px"
        className={`font-extrabold ${
          activeDirection === CardinalDirectionEnum.West
            ? activeButtonClass
            : ""
        }`}
      >
        W
      </ControlButtonStyler>
      <Tooltip
        title={`Luftbildblickrichtung "Nord" hat ${offsetDegrees} Grad Abweichung von Nord`}
        placement="top"
      >
        <div className="w-10 h-10 flex items-center justify-center">
          <span className="font-semibold text-sm text-gray-700 select-none">
            {headingDegrees}°
          </span>
        </div>
      </Tooltip>
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.East)}
        width="40px"
        height="40px"
        className={`font-extrabold ${
          activeDirection === CardinalDirectionEnum.East
            ? activeButtonClass
            : ""
        }`}
      >
        O
      </ControlButtonStyler>
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[CardinalDirectionEnum.East]}
          width="40px"
          height="40px"
          className={
            !siblingCallbacks?.[CardinalDirectionEnum.East]
              ? "opacity-50 cursor-not-allowed"
              : undefined
          }
        >
          →
        </ControlButtonStyler>
      ) : (
        <div />
      )}

      {/* Row 4: South in center */}
      <div />
      <div />
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.South)}
        width="40px"
        height="40px"
        className={`font-extrabold ${
          activeDirection === CardinalDirectionEnum.South
            ? activeButtonClass
            : ""
        }`}
      >
        S
      </ControlButtonStyler>
      <div />
      <div />

      {/* Row 5: outer South (center) */}
      <div />
      <div />
      {siblingCallbacks ? (
        <ControlButtonStyler
          onClick={siblingCallbacks?.[CardinalDirectionEnum.South]}
          width="40px"
          height="40px"
          className={
            !siblingCallbacks?.[CardinalDirectionEnum.South]
              ? "opacity-50 cursor-not-allowed"
              : undefined
          }
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
