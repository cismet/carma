import { smoothstep } from "@carma-commons/math";
import { degToRadNumeric, radToDegNumeric, TWO_PI } from "@carma-units";

/** Eye offset for a constant 20 m vertical clearance, including pitched views. */
export const meshOverlapEye = (
  pitchDegrees: number,
  bearingDegrees: number
) => {
  const pitch = degToRadNumeric(pitchDegrees);
  const bearing = degToRadNumeric(bearingDegrees);
  const horizontal = 20 * Math.tan(pitch);
  return {
    distance: 20 / Math.cos(pitch),
    east: -Math.sin(bearing) * horizontal,
    north: -Math.cos(bearing) * horizontal,
    up: 20,
  };
};

/** Deterministic stress fixture: separate orbits converge into a nested top-down view. */
export const meshOverlapFlight = (elapsedSeconds: number, period = 32) => {
  const phase = (((elapsedSeconds / period) % 1) + 1) % 1;
  const angle = phase * TWO_PI;
  // Hold full overlap for eight seconds, with smooth approach and departure.
  const overlap =
    smoothstep(0, 0.15, phase - 0.2) * (1 - smoothstep(0, 0.2, phase - 0.6));
  const spread = 1 - overlap;
  return {
    phase,
    overlap,
    mainOffset: [
      spread * (-180 + 70 * Math.cos(angle)),
      spread * 70 * Math.sin(angle),
    ] as const,
    secondaryOffset: [
      spread * (180 + 90 * Math.cos(-angle)),
      spread * 90 * Math.sin(-angle),
    ] as const,
    mainZoom: 18 - overlap * 0.5,
    // Two zoom levels during overlap: 4x wider, 16x ground area.
    secondaryZoom: 17 - overlap * 1.5,
    pitch: 40 * spread,
    bearing: radToDegNumeric(angle),
  };
};
