import { clamp } from "@carma-commons/math";

const DEFAULT_TARGET_IN_FLIGHT_BYTES = 64 * 1024 ** 2;
const DEFAULT_INITIAL_PAYLOAD_BYTES = 1024 ** 2;
const DEFAULT_MINIMUM_CONCURRENCY = 8;
export const DEFAULT_MAXIMUM_REQUEST_CONCURRENCY = 256;
const PAYLOAD_AVERAGE_WEIGHT = 0.2;
const FAILURE_BACKOFF_FACTOR = 0.5;
const SUCCESS_RECOVERY_WEIGHT = 0.1;
const MINIMUM_PRESSURE_FACTOR = 0.125;

export type PayloadAwareRequestConcurrency = Readonly<{
  getConcurrency: (maximum?: number) => number;
  observePayload: (byteLength: number) => void;
  observeFailure: () => void;
  observeSuccess: () => void;
}>;

export const createPayloadAwareRequestConcurrency = (
  targetInFlightBytes = DEFAULT_TARGET_IN_FLIGHT_BYTES,
  initialPayloadBytes = DEFAULT_INITIAL_PAYLOAD_BYTES
): PayloadAwareRequestConcurrency => {
  const targetBytes = Math.max(1, targetInFlightBytes);
  let averagePayloadBytes = Math.max(1, initialPayloadBytes);
  let pressureFactor = 1;

  const observeSuccess = () => {
    pressureFactor += (1 - pressureFactor) * SUCCESS_RECOVERY_WEIGHT;
  };

  return {
    getConcurrency(maximum = DEFAULT_MAXIMUM_REQUEST_CONCURRENCY) {
      if (!Number.isFinite(maximum) || maximum <= 0) return 0;
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
    observeFailure() {
      pressureFactor = Math.max(
        MINIMUM_PRESSURE_FACTOR,
        pressureFactor * FAILURE_BACKOFF_FACTOR
      );
    },
    observeSuccess,
  };
};

export const getResourcePayloadByteLength = (
  url: string | undefined
): number | null => {
  if (!url || typeof performance === "undefined") return null;
  const entries = performance.getEntriesByName(url, "resource");
  const entry = entries.at(-1);
  if (!entry || !("encodedBodySize" in entry)) return null;
  const resource = entry as PerformanceResourceTiming;
  const byteLength = resource.encodedBodySize || resource.transferSize;
  return Number.isFinite(byteLength) && byteLength > 0 ? byteLength : null;
};
