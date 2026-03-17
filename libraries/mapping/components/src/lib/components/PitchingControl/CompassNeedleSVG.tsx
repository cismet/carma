import { PI_OVER_TWO } from "@carma/math";
import { degToRadNumeric } from "@carma/units/helpers";

// MapLibre pitch is in degrees (0-85 typically)
const MAX_PITCH_RAD = degToRadNumeric(85)!;
const PITCH_HORIZON_OFFSET = PI_OVER_TWO - 0.2; // avoid showing completely flat from the side

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
  const normalizedHeading = -degToRadNumeric(heading)!;
  const pitchRadians = degToRadNumeric(pitch)!;
  const normalizedPitch = Math.min(
    pitchRadians * (PI_OVER_TWO / MAX_PITCH_RAD),
    PITCH_HORIZON_OFFSET
  );
  const transform = `scale(${Math.pow(
    1 + normalizedPitch * 0.1,
    3
  )}) rotateX(${normalizedPitch}rad) rotateZ(${normalizedHeading}rad)`;

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
