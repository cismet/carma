import React, { useMemo } from "react";
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
  isLoading: boolean;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

export const ObliqueDirectionControls: React.FC<Props> = ({
  rotateCamera,
  rotateToDirection,
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
  const dirBtnCls = `font-extrabold ${baseBtnCls}`;
  const disabledCls = "opacity-50 cursor-not-allowed";
  const activeBtnCls = "!bg-blue-100 !border-blue-400";
  const letterFor = (d: CardinalDirectionEnum) =>
    CardinalLetters.DE.get(d) ?? "";

  // Prevent redundant rotations: if direction already active, do nothing
  const getRotateHandler = (dir: CardinalDirectionEnum) =>
    activeDirection === dir ? undefined : () => rotateToDirection(dir);

  const ArrowButton: React.FC<{
    dir: CardinalDirectionEnum;
    label: string;
    posCls: string;
  }> = ({ dir, label, posCls }) => (
    <ControlButtonStyler
      onClick={siblingCallbacks?.[dir]}
      width="40px"
      height="40px"
      className={`${
        !siblingCallbacks?.[dir] ? disabledCls : ""
      } ${baseBtnCls} ${posCls}`}
    >
      {label}
    </ControlButtonStyler>
  );

  const CardinalButton: React.FC<{
    dir: CardinalDirectionEnum;
    posCls: string;
  }> = ({ dir, posCls }) => (
    <ControlButtonStyler
      onClick={getRotateHandler(dir)}
      width="40px"
      height="40px"
      className={`${dirBtnCls} ${
        activeDirection === dir ? activeBtnCls : ""
      } ${posCls}`}
    >
      {letterFor(dir)}
    </ControlButtonStyler>
  );

  const RotateButton: React.FC<{ clockwise: boolean; posCls: string }> = ({
    clockwise,
    posCls,
  }) => (
    <ControlButtonStyler
      onClick={() => rotateCamera(clockwise)}
      width="40px"
      height="40px"
      className={`${baseBtnCls} ${posCls}`}
    >
      <FontAwesomeIcon
        icon={clockwise ? faRotateRight : faRotateLeft}
        className="text-xs"
      />
    </ControlButtonStyler>
  );

  // Keybindings handled in useObliqueDirectionKeybindings from ObliqueControls
  return (
    <div className="relative grid grid-cols-5 grid-rows-5 gap-1 p-2">
      {isLoading && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity duration-500`}
        >
          <Spin tip="Schrägluftbild-Daten werden geladen..." />
        </div>
      )}
      {siblingCallbacks && (
        <>
          <ArrowButton
            dir={bottomDir}
            label="↑"
            posCls="col-start-3 row-start-1"
          />
          <ArrowButton
            dir={rightDir}
            label="←"
            posCls="col-start-1 row-start-3"
          />
          <ArrowButton
            dir={leftDir}
            label="→"
            posCls="col-start-5 row-start-3"
          />
          <ArrowButton
            dir={topDir}
            label="↓"
            posCls="col-start-3 row-start-5"
          />
        </>
      )}
      <RotateButton clockwise={false} posCls="col-start-2 row-start-2" />
      <RotateButton clockwise={true} posCls="col-start-4 row-start-2" />
      <CardinalButton dir={topDir} posCls="col-start-3 row-start-2" />
      <CardinalButton dir={leftDir} posCls="col-start-2 row-start-3" />
      <CardinalButton dir={rightDir} posCls="col-start-4 row-start-3" />
      <CardinalButton dir={bottomDir} posCls="col-start-3 row-start-4" />
    </div>
  );
};

export default ObliqueDirectionControls;
