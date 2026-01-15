import { CesiumMath } from "@carma/cesium";

export const formatGeographic = (
  longitude: number,
  latitude: number,
  height?: number
) => {
  return [
    `𝑁 ${longitude.toFixed(6)}°`,
    `𝑂 ${latitude.toFixed(6)}°`,
    height !== undefined ? `𝘩 ${height.toFixed(2)}m` : "",
  ];
};

export const formatCartesian = (x: number, y: number, z: number) => {
  return [
    `X ${x.toFixed(2)}m`,
    `Y ${y.toFixed(2)}m`,
    `Z ${z.toFixed(2)}m`
  ];
};

export const formatRelativeENU = (
  distance: number,
  bearing: number | null,
  up: number
) => {
  return [
    `𝘥 ${distance.toFixed(2)} m`,
    bearing !== null
      ? `⦨ ${CesiumMath.toDegrees(bearing).toFixed(1)}°`
      : "",
    `𝛥𝘩 ${up.toFixed(2)}m`,
  ];
};
