type GermanCardinalSector = {
  shortLabel: "N" | "NO" | "O" | "SO" | "S" | "SW" | "W" | "NW";
  fullLabel:
    | "Nord"
    | "Nordost"
    | "Ost"
    | "Südost"
    | "Süd"
    | "Südwest"
    | "West"
    | "Nordwest";
  centerDeg: number;
  halfWidthDeg: number;
  rangeStartDeg: number;
  rangeEndDeg: number;
  normalizedBearingDeg: number;
};

const GERMAN_CARDINAL_SECTORS: ReadonlyArray<{
  shortLabel: GermanCardinalSector["shortLabel"];
  fullLabel: GermanCardinalSector["fullLabel"];
  centerDeg: number;
  isPrimary: boolean;
}> = [
  { shortLabel: "N", fullLabel: "Nord", centerDeg: 0, isPrimary: true },
  { shortLabel: "NO", fullLabel: "Nordost", centerDeg: 45, isPrimary: false },
  { shortLabel: "O", fullLabel: "Ost", centerDeg: 90, isPrimary: true },
  { shortLabel: "SO", fullLabel: "Südost", centerDeg: 135, isPrimary: false },
  { shortLabel: "S", fullLabel: "Süd", centerDeg: 180, isPrimary: true },
  { shortLabel: "SW", fullLabel: "Südwest", centerDeg: 225, isPrimary: false },
  { shortLabel: "W", fullLabel: "West", centerDeg: 270, isPrimary: true },
  { shortLabel: "NW", fullLabel: "Nordwest", centerDeg: 315, isPrimary: false },
];

const normalizeBearingDeg = (bearingDeg: number): number =>
  ((bearingDeg % 360) + 360) % 360;

const normalizeMainCardinalRangeDeg = (value?: number): number => {
  if (!Number.isFinite(value)) return 60;
  return Math.max(45, Math.min(90, value ?? 60));
};

const toSignedDeltaDeg = (fromDeg: number, toDeg: number): number => {
  const delta = normalizeBearingDeg(toDeg - fromDeg);
  return delta > 180 ? delta - 360 : delta;
};

export const resolveGermanCardinalSector = (
  bearingDeg?: number,
  options?: {
    mainCardinalRangeDeg?: number;
    flipBy180Deg?: boolean;
  }
): GermanCardinalSector | null => {
  if (!Number.isFinite(bearingDeg)) return null;
  const baseBearing = normalizeBearingDeg(bearingDeg as number);
  const normalizedBearingDeg = options?.flipBy180Deg
    ? normalizeBearingDeg(baseBearing + 180)
    : baseBearing;
  const mainCardinalRangeDeg = normalizeMainCardinalRangeDeg(
    options?.mainCardinalRangeDeg
  );
  const interCardinalRangeDeg = 90 - mainCardinalRangeDeg;

  let selected: (typeof GERMAN_CARDINAL_SECTORS)[number] | null = null;
  let selectedHalfWidth = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sector of GERMAN_CARDINAL_SECTORS) {
    const halfWidthDeg = sector.isPrimary
      ? mainCardinalRangeDeg / 2
      : interCardinalRangeDeg / 2;
    if (halfWidthDeg <= 1e-9) continue;

    const distance = Math.abs(
      toSignedDeltaDeg(sector.centerDeg, normalizedBearingDeg)
    );
    if (distance <= halfWidthDeg + 1e-9 && distance < bestDistance) {
      selected = sector;
      selectedHalfWidth = halfWidthDeg;
      bestDistance = distance;
    }
  }

  // Safety fallback for boundary precision: choose nearest primary sector.
  if (!selected) {
    const primary = GERMAN_CARDINAL_SECTORS.filter(
      (sector) => sector.isPrimary
    );
    selected = primary.reduce((best, candidate) => {
      const bestDistance = Math.abs(
        toSignedDeltaDeg(best.centerDeg, normalizedBearingDeg)
      );
      const candidateDistance = Math.abs(
        toSignedDeltaDeg(candidate.centerDeg, normalizedBearingDeg)
      );
      return candidateDistance < bestDistance ? candidate : best;
    });
    selectedHalfWidth = mainCardinalRangeDeg / 2;
  }

  return {
    shortLabel: selected.shortLabel,
    fullLabel: selected.fullLabel,
    centerDeg: selected.centerDeg,
    halfWidthDeg: selectedHalfWidth,
    rangeStartDeg: normalizeBearingDeg(selected.centerDeg - selectedHalfWidth),
    rangeEndDeg: normalizeBearingDeg(selected.centerDeg + selectedHalfWidth),
    normalizedBearingDeg,
  };
};

export const formatBearingToGermanSectorLabel = (
  bearingDeg?: number,
  options?: {
    mainCardinalRangeDeg?: number;
    flipBy180Deg?: boolean;
    includeDegree?: boolean;
    useFullLabel?: boolean;
    fractionDigits?: number;
  }
): string | null => {
  const sector = resolveGermanCardinalSector(bearingDeg, options);
  if (!sector) return null;

  const label = options?.useFullLabel ? sector.fullLabel : sector.shortLabel;
  if (!options?.includeDegree) {
    return label;
  }

  const fractionDigits = Number.isFinite(options?.fractionDigits)
    ? Math.max(0, Math.min(6, Math.floor(options?.fractionDigits ?? 1)))
    : 1;
  const degreeText = formatDegrees(sector.normalizedBearingDeg, {
    locale: "de-DE",
    fractionDigits,
    unitSymbol: false,
  });

  return `${label} (${degreeText}°)`;
};

export const formatBearingToGermanCardinal = (
  bearingDeg?: number
): string | null =>
  formatBearingToGermanSectorLabel(bearingDeg, {
    includeDegree: false,
    useFullLabel: false,
    mainCardinalRangeDeg: 45,
  });
import { formatDegrees } from "@carma-units";
