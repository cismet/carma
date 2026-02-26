export const formatCoordinateWithHemisphere = (
  value: number,
  isLatitude: boolean
): string => {
  const absoluteFormatted = Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
  const suffix = isLatitude ? (value >= 0 ? "N" : "S") : value >= 0 ? "O" : "W";
  return `${absoluteFormatted}° ${suffix}`;
};

const GERMAN_CARDINAL_DIRECTIONS_16 = [
  "N",
  "NNO",
  "NO",
  "ONO",
  "O",
  "OSO",
  "SO",
  "SSO",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

export const formatBearingToGermanCardinal = (
  bearingDeg?: number
): string | null => {
  if (!Number.isFinite(bearingDeg)) return null;
  const normalized = (((bearingDeg as number) % 360) + 360) % 360;
  const sectorIndex = Math.round(normalized / 22.5) % 16;
  return GERMAN_CARDINAL_DIRECTIONS_16[sectorIndex] ?? null;
};
