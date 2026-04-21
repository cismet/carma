import { forwardRef, type CSSProperties } from "react";
import { CesiumMath } from "@carma-cesium";
import {
  CARMA_VIEW_HORIZON_PITCH_RAD,
  CESIUM_HORIZON_PITCH_RAD,
  CESIUM_LOCAL_NORTH_HEADING_RAD,
  fromCesiumPitchRadToCarmaViewPitchRad,
} from "@carma-commons/camera/model";
import type { Radians } from "@carma-units";

const PITCH_HORIZON_OFFSET = (CARMA_VIEW_HORIZON_PITCH_RAD - 0.2) as Radians; // avoid showing completely flat from the side

export const computeCompassNeedleTransform = (
  pitch: Radians,
  heading: Radians
): string => {
  const normalizedHeading = -heading;
  const normalizedPitch = CesiumMath.clamp(
    fromCesiumPitchRadToCarmaViewPitchRad(pitch),
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

type CompassNeedleSVGProps = {
  pitch?: Radians;
  heading?: Radians;
  northColor?: string;
  neutralColor?: string;
};

export const CompassNeedleSVG = forwardRef<
  SVGSVGElement,
  CompassNeedleSVGProps
>(function CompassNeedleSVG(
  {
    pitch = CESIUM_HORIZON_PITCH_RAD,
    heading = CESIUM_LOCAL_NORTH_HEADING_RAD,
    northColor = "#333",
    neutralColor = "#ccc",
  }: CompassNeedleSVGProps,
  ref
) {
  // style adjusted from maplibre-gl-ctrl-compass
  // https://github.com/maplibre/maplibre-gl-js/blob/a99fe93fe8ac1505b1b450cd3c1d9b2b8394bd8c/src/css/svg/maplibregl-ctrl-compass.svg#L3

  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    transformOrigin: "center",
    transform: computeCompassNeedleTransform(pitch, heading),
    transformStyle: "preserve-3d",
  };

  return (
    <svg
      ref={ref}
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
});

export default CompassNeedleSVG;
