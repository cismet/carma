type Calibration = {
  version: string;
  hardwareConcurrency: number;
  optimum: number;
  savedAt: number;
};
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const readWorkerCalibration = (
  raw: string | null,
  version: string,
  hardwareConcurrency: number,
  now: number
): number | undefined => {
  try {
    const value = JSON.parse(raw ?? "null") as Calibration | null;
    if (
      value?.version === version &&
      value.hardwareConcurrency === hardwareConcurrency &&
      Number.isInteger(value.optimum) &&
      value.optimum >= 1 &&
      value.optimum <= 8 &&
      Number.isFinite(value.savedAt) &&
      now >= value.savedAt &&
      now - value.savedAt < MAX_AGE_MS
    )
      return value.optimum;
  } catch {
    /* Storage corruption must not block work. */
  }
  return undefined;
};

export const encodeWorkerCalibration = (
  optimum: number,
  version: string,
  hardwareConcurrency: number,
  now: number
): string =>
  JSON.stringify({
    version,
    hardwareConcurrency,
    optimum,
    savedAt: now,
  } satisfies Calibration);
