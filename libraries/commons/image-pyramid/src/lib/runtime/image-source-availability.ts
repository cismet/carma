import { AvifHttpError } from "./avif-source-errors";

export const isAvifSourceMissing = (error: unknown): error is AvifHttpError =>
  error instanceof AvifHttpError &&
  (error.status === 404 || error.status === 410);

const missingSources = new Map<
  string,
  { until: number; error: AvifHttpError }
>();
const MISSING_TTL_MS = 5 * 60 * 1000;

export const getMissingImageSource = (
  key: string
): AvifHttpError | undefined => {
  const entry = missingSources.get(key);
  if (entry && entry.until > Date.now()) return entry.error;
  missingSources.delete(key);
  return undefined;
};

/** Short-lived negative entries describe a resource URL, never the entire photo. */
export const rememberMissingImageSource = (
  key: string,
  error: AvifHttpError
) => {
  const now = Date.now();
  for (const [cachedKey, entry] of missingSources)
    if (entry.until <= now) missingSources.delete(cachedKey);
  missingSources.delete(key);
  missingSources.set(key, { until: now + MISSING_TTL_MS, error });
  if (missingSources.size > 1024)
    missingSources.delete(missingSources.keys().next().value!);
};
