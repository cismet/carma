import React from "react";
import { InputNumber, Divider } from "antd";
import { Math as CesiumMath } from "cesium";

interface HeadingAndNorthOffsetProps {
  cameraCardinalDirection: "" | "N" | "S" | "E" | "W";
  cameraHeading: number;
  headingOffset: number;
  setHeadingOffset: (value: number) => void;
}

const HeadingAndNorthOffset: React.FC<HeadingAndNorthOffsetProps> = ({
  cameraCardinalDirection,
  cameraHeading,
  headingOffset,
  setHeadingOffset,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div>
        <span>
          Heading: {cameraCardinalDirection} {cameraHeading.toFixed(2)}°
        </span>
      </div>
      <Divider type="vertical" />
      North-Offset
      <InputNumber
        min={0}
        max={360}
        step={0.1}
        value={CesiumMath.toDegrees(headingOffset)}
        onChange={(value) =>
          setHeadingOffset(CesiumMath.toRadians(value % 360))
        }
        placeholder="True North Offset"
      />
    </div>
  );
};

export default HeadingAndNorthOffset;
