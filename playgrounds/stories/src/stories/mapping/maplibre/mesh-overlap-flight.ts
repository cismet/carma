/** Eye offset for a constant 20 m vertical clearance, including pitched views. */
export const meshOverlapEye = (
  pitchDegrees: number,
  bearingDegrees: number
) => {
  const pitch = (pitchDegrees * Math.PI) / 180;
  const bearing = (bearingDegrees * Math.PI) / 180;
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
  const angle = phase * Math.PI * 2;
  // Hold full overlap for eight seconds, with smooth approach and departure.
  const ramp = Math.min(1, Math.max(0, (phase - 0.2) / 0.15));
  const departure = Math.min(1, Math.max(0, (phase - 0.6) / 0.2));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const overlap = smooth(ramp) * (1 - smooth(departure));
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
    bearing: (angle * 180) / Math.PI,
  };
};
