import {
  TILE_DIAGNOSTIC_STEPS,
  type SharedThreeSceneTileVolume,
} from "@carma-mapping/engines/maplibre";

export const buildVolumeTileLegend = (
  volumes: readonly SharedThreeSceneTileVolume[]
) => {
  const perStep = new Map<
    string,
    { sum: number; count: number; min: number; max: number }
  >();
  const totals: number[] = [];
  const sizes: number[] = [];
  for (const volume of volumes) {
    const steps = volume.steps ?? [];
    const total = steps.reduce((sum, step) => sum + step.ms, 0);
    if (total > 0) totals.push(total);
    if (volume.bytes) sizes.push(volume.bytes);
    for (const step of steps) {
      const entry = perStep.get(step.label) ?? {
        sum: 0,
        count: 0,
        min: Infinity,
        max: 0,
      };
      entry.sum += step.ms;
      entry.count += 1;
      entry.min = Math.min(entry.min, step.ms);
      entry.max = Math.max(entry.max, step.ms);
      perStep.set(step.label, entry);
    }
  }
  totals.sort((a, b) => a - b);
  let unit = 10 * 1024;
  const largest = sizes.length ? Math.max(...sizes) : 0;
  while (largest / unit > 100) unit *= 10;
  return {
    medianMs: totals.length ? totals[totals.length >> 1] : 0,
    steps: TILE_DIAGNOSTIC_STEPS.flatMap((step) => {
      const entry = perStep.get(step.label);
      return entry
        ? [
            {
              label: step.label,
              color: step.color,
              avg: entry.sum / entry.count,
              min: entry.min,
              max: entry.max,
            },
          ]
        : [];
    }),
    bytes: sizes.length
      ? { unit, min: Math.min(...sizes), max: largest }
      : null,
  };
};

export type VolumeTileLegend = ReturnType<typeof buildVolumeTileLegend>;
