import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  Transforms,
} from "cesium";

export const toCartographic = ({
  longitude,
  latitude,
  height,
}: {
  longitude: number;
  latitude: number;
  height: number;
}) => {
  return new Cartographic(
    CesiumMath.toRadians(longitude),
    CesiumMath.toRadians(latitude),
    height
  );
};

export const offsetFromHeadingPitchRange = (
  position: Cartesian3,
  { heading, pitch, range }: HeadingPitchRange
) => {
  const transform = Transforms.eastNorthUpToFixedFrame(position);

  const direction = new Cartesian3(
    Math.cos(pitch) * Math.cos(heading),
    Math.cos(pitch) * Math.sin(heading),
    Math.sin(pitch)
  );

  const offset = Cartesian3.multiplyByScalar(
    direction,
    range,
    new Cartesian3()
  );

  const viewOffset = Matrix4.multiplyByPointAsVector(
    transform,
    offset,
    new Cartesian3()
  );

  return viewOffset;
};
