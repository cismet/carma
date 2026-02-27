export const formatNumber = (n: number, precision: number = 2) => {
  return n.toFixed(precision).replace(".", ",");
};

const AREA_DISPLAY_HECTARE_THRESHOLD_SQM = 4999;
const DEFAULT_SIGNIFICANT_DIGITS = 3;

export const formatSignificant = (
  value: number,
  significantDigits = DEFAULT_SIGNIFICANT_DIGITS
) => {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute === 0) return "0";
  const digitsBeforeDecimal = Math.floor(Math.log10(absolute)) + 1;
  const fractionDigits = Math.max(0, significantDigits - digitsBeforeDecimal);
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

export const formatAreaAdaptive = (areaSquareMeters: number) => {
  if (!Number.isFinite(areaSquareMeters) || areaSquareMeters <= 0) {
    return "0 m²";
  }
  if (areaSquareMeters > AREA_DISPLAY_HECTARE_THRESHOLD_SQM) {
    return `${formatSignificant(areaSquareMeters / 10000)} ha`;
  }
  return `${formatSignificant(areaSquareMeters)} m²`;
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
