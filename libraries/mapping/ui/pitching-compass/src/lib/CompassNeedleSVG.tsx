import { useEffect, useState } from "react";
import { Degrees, Radians } from "@carma/types";
import { degToRad, PI_OVER_TWO } from "@carma-commons/math";
// MapLibre pitch is in degrees (0-85 typically)
const MAX_PITCH_DEGREES = 85 as Degrees;
const PITCH_HORIZON_OFFSET = (Math.PI / 2 - 0.2) as Radians; // avoid showing completely flat from the side

const maxPitch = degToRad(MAX_PITCH_DEGREES);

export const CompassNeedleSVG = ({
  pitch = 0,
  heading = 0,
  northColor = "#333",
  neutralColor = "#ccc",
}: {
  pitch?: number;
  heading?: number;
  northColor?: string;
  neutralColor?: string;
} = {}) => {
  const [transform, setTransform] = useState("");

  useEffect(() => {
    if (pitch !== undefined && heading !== undefined) {
      const normalizedHeading = degToRad(-heading as Degrees);

      // Convert MapLibre pitch (degrees, 0-85) to radians and normalize for our visualization
      const pitchRadians = degToRad(pitch as Degrees);
      const normalizedPitch = Math.min(
        pitchRadians * (PI_OVER_TWO / maxPitch), // Scale to appropriate range
        PITCH_HORIZON_OFFSET
      );

      // scale the needle for lower pitches for improved visibility
      // linear scaling makes the tilting effect look less consistent
      const transform = `scale(${Math.pow(
        1 + normalizedPitch * 0.1,
        3
      )}) rotateX(${normalizedPitch}rad) rotateZ(${normalizedHeading}rad)`;
      setTransform(transform);
    }
  }, [pitch, heading]);

  // style adjusted from maplibre-gl-ctrl-compass
  // https://github.com/maplibre/maplibre-gl-js/blob/a99fe93fe8ac1505b1b450cd3c1d9b2b8394bd8c/src/css/svg/maplibregl-ctrl-compass.svg#L3

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="29"
      height="29"
      viewBox="0 0 29 29"
      fill={northColor}
      style={{
        width: "100%",
        height: "100%",
        transformOrigin: "center",
        transform,
        transformStyle: "preserve-3d",
      }}
    >
      <path d="m10.5 14 4-8 4 8z" />
      <path d="m10.5 16 4 8 4-8z" fill={neutralColor} />
    </svg>
  );
};

export default CompassNeedleSVG;
