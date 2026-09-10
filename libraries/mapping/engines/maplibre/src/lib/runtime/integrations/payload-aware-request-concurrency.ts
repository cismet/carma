import { clamp } from "@carma-commons/math";

const DEFAULT_TARGET_IN_FLIGHT_BYTES = 64 * 1024 ** 2;
const DEFAULT_INITIAL_PAYLOAD_BYTES = 1024 ** 2;
const DEFAULT_MINIMUM_CONCURRENCY = 8;
export const DEFAULT_MAXIMUM_REQUEST_CONCURRENCY = 256;
const PAYLOAD_AVERAGE_WEIGHT = 0.2;
const FAILURE_BACKOFF_FACTOR = 0.5;
const SUCCESS_RECOVERY_WEIGHT = 0.1;
const MINIMUM_PRESSURE_FACTOR = 0.125;
const REQUEST_BACKOFF_BASE_DELAY_MS = 1_000;
const REQUEST_BACKOFF_MAX_DELAY_MS = 16_000;

export type PayloadAwareRequestConcurrency = Readonly<{
  getConcurrency: (maximum?: number) => number;
  observePayload: (byteLength: number) => void;
  observeFailure: (error?: unknown) => number;
  observeSuccess: () => void;
  getCooldownRemainingMs: () => number;
}>;

const getHttpStatus = (error: unknown): number | null => {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status)) return status;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/(?:status|error code)\s*:?[\s"]*(\d{3})/i);
  return match ? Number(match[1]) : null;
};

const PERMANENT_HTTP_STATUSES = new Set([403, 404, 410]);

/** The resource is missing or forbidden; retrying cannot change that. */
export const isPermanentTileRequestFailure = (error: unknown): boolean => {
  const status = getHttpStatus(error);
  return status !== null && PERMANENT_HTTP_STATUSES.has(status);
};

export const isTransientTileRequestFailure = (error: unknown): boolean => {
  const status = getHttpStatus(error);
  if (status !== null) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    /timeout|timed out|networkerror|failed to fetch|network request failed/i.test(
      error.message
    )
  );
};

export const createPayloadAwareRequestConcurrency = (
  targetInFlightBytes = DEFAULT_TARGET_IN_FLIGHT_BYTES,
  initialPayloadBytes = DEFAULT_INITIAL_PAYLOAD_BYTES
): PayloadAwareRequestConcurrency => {
  const targetBytes = Math.max(1, targetInFlightBytes);
  let averagePayloadBytes = Math.max(1, initialPayloadBytes);
  let pressureFactor = 1;
  let cooldownUntil = 0;
  let backoffAttempt = 0;

  const observeSuccess = () => {
    pressureFactor += (1 - pressureFactor) * SUCCESS_RECOVERY_WEIGHT;
    if (Date.now() >= cooldownUntil && backoffAttempt > 0) {
      backoffAttempt -= 1;
    }
  };

  return {
    getConcurrency(maximum = DEFAULT_MAXIMUM_REQUEST_CONCURRENCY) {
      if (!Number.isFinite(maximum) || maximum <= 0) return 0;
      if (Date.now() < cooldownUntil) return 0;
      const upperBound = Math.max(1, Math.floor(maximum));
      const lowerBound = Math.min(DEFAULT_MINIMUM_CONCURRENCY, upperBound);
      return Math.round(
        clamp(
          (targetBytes / averagePayloadBytes) * pressureFactor,
          lowerBound,
          upperBound
        )
      );
    },
    observePayload(byteLength) {
      if (!Number.isFinite(byteLength) || byteLength <= 0) return;
      averagePayloadBytes +=
        (byteLength - averagePayloadBytes) * PAYLOAD_AVERAGE_WEIGHT;
      observeSuccess();
    },
    observeFailure(error) {
      pressureFactor = Math.max(
        MINIMUM_PRESSURE_FACTOR,
        pressureFactor * FAILURE_BACKOFF_FACTOR
      );
      const now = Date.now();
      if (isTransientTileRequestFailure(error) && now >= cooldownUntil) {
        backoffAttempt += 1;
        const delay = Math.min(
          REQUEST_BACKOFF_MAX_DELAY_MS,
          REQUEST_BACKOFF_BASE_DELAY_MS * 2 ** Math.max(0, backoffAttempt - 1)
        );
        cooldownUntil = now + delay;
      }
      return Math.max(0, cooldownUntil - now);
    },
    observeSuccess,
    getCooldownRemainingMs: () => Math.max(0, cooldownUntil - Date.now()),
  };
};
