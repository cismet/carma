export const formatNumber = (n: number, precision: number = 2) => {
  return n.toFixed(precision).replace(".", ",");
};

export const formatGeographic = (
  longitude: number,
  latitude: number,
  height?: number
) => {
  return [
    `𝑁 ${formatNumber(longitude, 6)}°`,
    `𝑂 ${formatNumber(latitude, 6)}°`,
    height !== undefined ? `𝘩 ${formatNumber(height)} m` : "",
  ];
};

export const formatCartesian = (x: number, y: number, z: number) => {
  return [
    `X ${formatNumber(x)} m`,
    `Y ${formatNumber(y)} m`,
    `Z ${formatNumber(z)} m`,
  ];
};
