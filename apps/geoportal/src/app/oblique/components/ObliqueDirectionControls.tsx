import React from "react";
import { Tooltip, Spin, Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

type Props = {
  rotateCamera: (clockwise: boolean) => void;
  rotateToDirection: (d: CardinalDirectionEnum) => void;
  activeDirection?: CardinalDirectionEnum;
  activeButtonClass?: string;
  headingDegrees: string | number;
  offsetDegrees: number;
  isLoading: boolean;
};

export const ObliqueDirectionControls: React.FC<Props> = ({
  rotateCamera,
  rotateToDirection,
  activeDirection,
  activeButtonClass = "",
  headingDegrees,
  offsetDegrees,
  isLoading,
}) => {
  return (
    <div className="relative grid grid-cols-3 grid-rows-3 gap-1 p-2 rounded-lg shadow bg-white/40">
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

      {/* Top row */}
      <Button
        onClick={() => rotateCamera(false)}
        type="default"
        shape="circle"
        className="w-10 h-10 flex items-center justify-center"
        aria-label="Rotate left"
      >
        <FontAwesomeIcon icon={faRotateLeft} className="text-base" />
      </Button>
      <Button
        onClick={() => rotateToDirection(CardinalDirectionEnum.North)}
        type="default"
        className={`w-10 h-10 font-extrabold ${
          activeDirection === CardinalDirectionEnum.North
            ? activeButtonClass
            : ""
        }`}
        aria-label="North"
      >
        N
      </Button>
      <Button
        onClick={() => rotateCamera(true)}
        type="default"
        shape="circle"
        className="w-10 h-10 flex items-center justify-center"
        aria-label="Rotate right"
      >
        <FontAwesomeIcon icon={faRotateRight} className="text-base" />
      </Button>

      {/* Middle row */}
      <Button
        onClick={() => rotateToDirection(CardinalDirectionEnum.West)}
        type="default"
        className={`w-10 h-10 font-extrabold ${
          activeDirection === CardinalDirectionEnum.West
            ? activeButtonClass
            : ""
        }`}
        aria-label="West"
      >
        W
      </Button>
      <Tooltip
        title={`Luftbildblickrichtung "Nord" hat ${offsetDegrees} Grad Abweichung von Nord`}
        placement="top"
      >
        <div className="w-10 h-10 m-0.5 flex items-center justify-center">
          <span className="font-semibold text-sm text-gray-700 select-none">
            {headingDegrees}°
          </span>
        </div>
      </Tooltip>
      <Button
        onClick={() => rotateToDirection(CardinalDirectionEnum.East)}
        type="default"
        className={`w-10 h-10 font-extrabold ${
          activeDirection === CardinalDirectionEnum.East
            ? activeButtonClass
            : ""
        }`}
        aria-label="East"
      >
        O
      </Button>

      {/* Bottom row */}
      <div className="w-10 h-10 m-0.5" />
      <Button
        onClick={() => rotateToDirection(CardinalDirectionEnum.South)}
        type="default"
        className={`w-10 h-10 font-extrabold ${
          activeDirection === CardinalDirectionEnum.South
            ? activeButtonClass
            : ""
        }`}
        aria-label="South"
      >
        S
      </Button>
      <div className="w-10 h-10 m-0.5" />
    </div>
  );
};

export default ObliqueDirectionControls;
