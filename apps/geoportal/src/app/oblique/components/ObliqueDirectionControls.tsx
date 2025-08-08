import React from "react";
import { Tooltip } from "antd";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faRotateRight,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
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
  const directionLabelStyle: React.CSSProperties = {
    fontWeight: 800,
    fontSize: "16px",
  };

  const headingDisplayStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#333",
    userSelect: "none",
  };

  return (
    <div
      className="camera-rotation-controls"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: "4px",
        padding: "8px",
        backgroundColor: "rgba(255, 255, 255, 0.4)",
        borderRadius: "8px",
        boxShadow: "0 0 8px rgba(0, 0, 0, 0.2)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          zIndex: 10,
          borderRadius: "8px",
          opacity: isLoading ? 1 : 0,
          transition: "opacity 0.5s ease",
          pointerEvents: isLoading ? "auto" : "none",
        }}
      >
        {isLoading && (
          <>
            <FontAwesomeIcon
              icon={faSpinner}
              spin
              style={{ fontSize: "24px", marginBottom: "10px" }}
            />
            <div style={{ textAlign: "center", fontSize: "12px" }}>
              Schrägluftbild-Daten werden geladen...
            </div>
          </>
        )}
      </div>

      {/* Top row */}
      <ControlButtonStyler
        onClick={() => rotateCamera(false)}
        width="40px"
        height="40px"
      >
        <FontAwesomeIcon icon={faRotateLeft} className="text-base" />
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.North)}
        width="40px"
        height="40px"
        className={
          activeDirection === CardinalDirectionEnum.North
            ? activeButtonClass
            : ""
        }
      >
        <span style={directionLabelStyle}>N</span>
      </ControlButtonStyler>
      <ControlButtonStyler
        onClick={() => rotateCamera(true)}
        width="40px"
        height="40px"
      >
        <FontAwesomeIcon icon={faRotateRight} className="text-base" />
      </ControlButtonStyler>

      {/* Middle row */}
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.West)}
        width="40px"
        height="40px"
        className={
          activeDirection === CardinalDirectionEnum.West
            ? activeButtonClass
            : ""
        }
      >
        <span style={directionLabelStyle}>W</span>
      </ControlButtonStyler>
      <Tooltip
        title={`Luftbildblickrichtung "Nord" hat ${offsetDegrees} Grad Abweichung von Nord`}
        placement="top"
        overlayInnerStyle={{
          userSelect: "none",
          pointerEvents: "none",
        }}
        overlayStyle={{
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            margin: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={headingDisplayStyle}>{headingDegrees}°</span>
        </div>
      </Tooltip>
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.East)}
        width="40px"
        height="40px"
        className={
          activeDirection === CardinalDirectionEnum.East
            ? activeButtonClass
            : ""
        }
      >
        <span style={directionLabelStyle}>O</span>
      </ControlButtonStyler>

      {/* Bottom row */}
      <div style={{ width: "40px", height: "40px", margin: "2px" }}>
        {/* Empty bottom-left cell */}
      </div>
      <ControlButtonStyler
        onClick={() => rotateToDirection(CardinalDirectionEnum.South)}
        width="40px"
        height="40px"
        className={
          activeDirection === CardinalDirectionEnum.South
            ? activeButtonClass
            : ""
        }
      >
        <span style={directionLabelStyle}>S</span>
      </ControlButtonStyler>
      <div style={{ width: "40px", height: "40px", margin: "2px" }}>
        {/* Empty bottom-right cell */}
      </div>
    </div>
  );
};

export default ObliqueDirectionControls;
