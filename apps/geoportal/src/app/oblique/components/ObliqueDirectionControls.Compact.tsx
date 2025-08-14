import React, { useMemo } from "react";
import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { CardinalDirectionEnum } from "../utils/orientationUtils";

const buttonSize = "40px";

export type CompactProps = {
  rotateCamera: (clockwise: boolean) => void;
  rotateToDirection: (d: CardinalDirectionEnum) => void; // kept for API parity
  activeDirection?: CardinalDirectionEnum;
  isLoading: boolean;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

export const ObliqueDirectionControlsCompact: React.FC<CompactProps> = ({
  rotateCamera,
  // rotateToDirection, // not used in compact variant (no cardinal letter buttons)
  activeDirection,
  isLoading,
  siblingCallbacks,
}) => {
  // Heading-relative slot mapping: the active direction is always on top.
  const { topDir, rightDir, bottomDir, leftDir } = useMemo(() => {
    const order: CardinalDirectionEnum[] = [
      CardinalDirectionEnum.North,
      CardinalDirectionEnum.East,
      CardinalDirectionEnum.South,
      CardinalDirectionEnum.West,
    ];
    const top = activeDirection ?? CardinalDirectionEnum.North;
    const topIdx = order.indexOf(top);
    return {
      topDir: top,
      rightDir: order[(topIdx + 1) % 4],
      bottomDir: order[(topIdx + 2) % 4],
      leftDir: order[(topIdx + 3) % 4],
    };
  }, [activeDirection]);

  const baseBtnCls = "pointer-events-auto select-none";
  const disabledCls = "opacity-50 cursor-not-allowed";

  const ArrowButton: React.FC<{
    dir: CardinalDirectionEnum;
    label: string;
    posCls: string;
  }> = ({ dir, label, posCls }) => (
    <ControlButtonStyler
      onClick={siblingCallbacks?.[dir]}
      width={buttonSize}
      height={buttonSize}
      className={`${
        !siblingCallbacks?.[dir] ? disabledCls : ""
      } ${baseBtnCls} ${posCls}`}
    >
      {label}
    </ControlButtonStyler>
  );

  const RotateButton: React.FC<{ clockwise: boolean; posCls: string }> = ({
    clockwise,
    posCls,
  }) => (
    <ControlButtonStyler
      onClick={() => rotateCamera(clockwise)}
      width={buttonSize}
      height={buttonSize}
      className={`${baseBtnCls} ${posCls}`}
    >
      <FontAwesomeIcon
        icon={clockwise ? faRotateRight : faRotateLeft}
        className="text-xs"
      />
    </ControlButtonStyler>
  );

  return (
    <div className="relative grid grid-cols-3 grid-rows-2 gap-1 p-0">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Spin size="small" />
        </div>
      )}
      {/* Row 1: [↺][↑][↻] */}
      <RotateButton clockwise={false} posCls="col-start-1 row-start-1" />
      <ArrowButton dir={bottomDir} label="↑" posCls="col-start-2 row-start-1" />
      <RotateButton clockwise={true} posCls="col-start-3 row-start-1" />

      {/* Row 2: [←][↓][→] */}
      <ArrowButton dir={rightDir} label="←" posCls="col-start-1 row-start-2" />
      <ArrowButton dir={topDir} label="↓" posCls="col-start-2 row-start-2" />
      <ArrowButton dir={leftDir} label="→" posCls="col-start-3 row-start-2" />
    </div>
  );
};

export default ObliqueDirectionControlsCompact;
