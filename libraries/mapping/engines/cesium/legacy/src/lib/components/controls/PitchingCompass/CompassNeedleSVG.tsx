import { type CSSProperties } from "react";
import { CesiumMath } from "@carma/cesium";

import type { Radians } from "@carma/units/types";

const PITCH_HORIZON_OFFSET = CesiumMath.PI_OVER_TWO - 0.2; // avoid showing completely flat from the side

const computeTransform = (pitch: Radians, heading: Radians): string => {
  const normalizedHeading = -heading;
  const normalizedPitch = CesiumMath.clamp(
    pitch + CesiumMath.PI_OVER_TWO, // rotate pitch range into screen plane
    0, // NADIR end of range
    PITCH_HORIZON_OFFSET // Horizon end of range
  );
  // scale the needle for lower pitches for improved visibility
  // linear scaling makes the tilting effect look less consistent
  const transform = `scale(${Math.pow(
    1 + normalizedPitch * 0.1,
    3
  )}) rotateX(${normalizedPitch}rad) rotateZ(${normalizedHeading}rad)`;
  return transform;
};

export const CompassNeedleSVG = ({
  pitch = 0 as Radians,
  heading = 0 as Radians,
  northColor = "#333",
  neutralColor = "#ccc",
}: {
  pitch?: Radians;
  heading?: Radians;
  northColor?: string;
  neutralColor?: string;
} = {}) => {
  // style adjusted from maplibre-gl-ctrl-compass
  // https://github.com/maplibre/maplibre-gl-js/blob/a99fe93fe8ac1505b1b450cd3c1d9b2b8394bd8c/src/css/svg/maplibregl-ctrl-compass.svg#L3

  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    transformOrigin: "center",
    transform: computeTransform(pitch, heading),
    transformStyle: "preserve-3d",
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="29"
      height="29"
      viewBox="0 0 29 29"
      fill={northColor}
      style={style}
    >
      <path d="m10.5 14 4-8 4 8z" />
      <path d="m10.5 16 4 8 4-8z" fill={neutralColor} />
    </svg>
  );
};

export default CompassNeedleSVG;
