import { pointQueryDebugDefaults } from "./point-query-debug-defaults";
import {
  formatPointQueryStatusRate,
  setStatusText,
  type PointQueryDebugStatusElements,
} from "./point-query-debug-status";

export type PointQueryRateChannel =
  | "mouse"
  | "render"
  | "sample"
  | "disc"
  | "skip";

export type PointQueryRatesHz = Record<PointQueryRateChannel, number>;

const RATE_CHANNELS = [
  "mouse",
  "render",
  "sample",
  "disc",
  "skip",
] as const satisfies readonly PointQueryRateChannel[];

const STATUS_ELEMENT_KEY_BY_CHANNEL = {
  mouse: "mousePositionRateElement",
  render: "renderRequestRateElement",
  sample: "sampleRateElement",
  disc: "discUpdateRateElement",
  skip: "skippedInputRateElement",
} as const satisfies Record<
  PointQueryRateChannel,
  keyof PointQueryDebugStatusElements
>;

const createChannelRecord = <T>(
  value: T
): Record<PointQueryRateChannel, T> => ({
  mouse: value,
  render: value,
  sample: value,
  disc: value,
  skip: value,
});

/**
 * Events per second for each channel, reported every `reportIntervalMs` into
 * the status elements. A channel without events keeps its last rate until it
 * has been idle for `idleResetMs`.
 */
export const createPointQueryRateMeter = (
  statusElements: PointQueryDebugStatusElements
) => {
  const counts = createChannelRecord(0);
  const lastEventTimeMs = createChannelRecord(0);
  let lastReportTimeMs = performance.now();
  let ratesHz: PointQueryRatesHz = createChannelRecord(0);

  const update = (force = false) => {
    const nowMs = performance.now();
    const elapsedMs = nowMs - lastReportTimeMs;
    if (
      !force &&
      elapsedMs < pointQueryDebugDefaults.performance.reportIntervalMs
    ) {
      return;
    }

    for (const channel of RATE_CHANNELS) {
      if (elapsedMs > 0) {
        const idle =
          lastEventTimeMs[channel] <= 0 ||
          nowMs - lastEventTimeMs[channel] >=
            pointQueryDebugDefaults.performance.idleResetMs;
        if (counts[channel] > 0) {
          ratesHz[channel] = (counts[channel] * 1000) / elapsedMs;
        } else if (idle) {
          ratesHz[channel] = 0;
        }
      }
      setStatusText(
        statusElements[STATUS_ELEMENT_KEY_BY_CHANNEL[channel]],
        formatPointQueryStatusRate(channel, ratesHz[channel])
      );
      counts[channel] = 0;
    }
    lastReportTimeMs = nowMs;
  };

  return {
    mark: (channel: PointQueryRateChannel, count = 1) => {
      counts[channel] += count;
      lastEventTimeMs[channel] = performance.now();
      update();
    },
    update,
    reset: () => {
      for (const channel of RATE_CHANNELS) {
        counts[channel] = 0;
        lastEventTimeMs[channel] = 0;
      }
      lastReportTimeMs = performance.now();
      ratesHz = createChannelRecord(0);
    },
    getRatesHz: (): PointQueryRatesHz => ({ ...ratesHz }),
  };
};
