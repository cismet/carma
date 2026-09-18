import type * as THREE from "three";

export const NIGHT_TRAFFIC_KIND = {
  CAR: "car",
  SCHWEBEBAHN: "schwebebahn",
  TRAIN: "train",
} as const;

export type NightTrafficKind =
  (typeof NIGHT_TRAFFIC_KIND)[keyof typeof NIGHT_TRAFFIC_KIND];

export type NightTrafficRoute = Readonly<{
  id: string;
  kind: NightTrafficKind;
  points: readonly THREE.Vector3[];
  speedMetersPerSecond: number;
  signal?: Readonly<{
    distanceMeters: number;
    phaseOffsetSeconds: number;
  }>;
}>;

export const NIGHT_TRAFFIC_SIGNAL_PHASE = {
  RED: "red",
  RED_YELLOW: "red-yellow",
  GREEN: "green",
  YELLOW: "yellow",
  ALL_RED: "all-red",
} as const;

export type NightTrafficSignalPhase =
  (typeof NIGHT_TRAFFIC_SIGNAL_PHASE)[keyof typeof NIGHT_TRAFFIC_SIGNAL_PHASE];

const SIGNAL_CYCLE_SECONDS = 30;

export const getNightTrafficSignalPhase = (
  elapsedSeconds: number,
  phaseOffsetSeconds = 0
): NightTrafficSignalPhase => {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(phaseOffsetSeconds))
    return NIGHT_TRAFFIC_SIGNAL_PHASE.ALL_RED;
  const time =
    (((elapsedSeconds + phaseOffsetSeconds) % SIGNAL_CYCLE_SECONDS) +
      SIGNAL_CYCLE_SECONDS) %
    SIGNAL_CYCLE_SECONDS;
  if (time < 12) return NIGHT_TRAFFIC_SIGNAL_PHASE.RED;
  if (time < 14) return NIGHT_TRAFFIC_SIGNAL_PHASE.RED_YELLOW;
  if (time < 26) return NIGHT_TRAFFIC_SIGNAL_PHASE.GREEN;
  if (time < 29) return NIGHT_TRAFFIC_SIGNAL_PHASE.YELLOW;
  return NIGHT_TRAFFIC_SIGNAL_PHASE.ALL_RED;
};

export const isNightTrafficSignalGo = (
  elapsedSeconds: number,
  phaseOffsetSeconds = 0
): boolean =>
  getNightTrafficSignalPhase(elapsedSeconds, phaseOffsetSeconds) ===
  NIGHT_TRAFFIC_SIGNAL_PHASE.GREEN;

export const advanceNightTrafficDistance = ({
  distanceMeters,
  speedMetersPerSecond,
  deltaSeconds,
  elapsedSeconds,
  routeLengthMeters,
  signal,
  stopOffsetMeters = 3,
}: Readonly<{
  distanceMeters: number;
  speedMetersPerSecond: number;
  deltaSeconds: number;
  elapsedSeconds: number;
  routeLengthMeters: number;
  signal?: Readonly<{
    distanceMeters: number;
    phaseOffsetSeconds: number;
  }>;
  stopOffsetMeters?: number;
}>): number => {
  if (
    ![
      distanceMeters,
      speedMetersPerSecond,
      deltaSeconds,
      elapsedSeconds,
      routeLengthMeters,
      stopOffsetMeters,
    ].every(Number.isFinite) ||
    speedMetersPerSecond < 0 ||
    deltaSeconds <= 0 ||
    routeLengthMeters <= 0 ||
    stopOffsetMeters < 0
  )
    return distanceMeters;

  const start =
    ((distanceMeters % routeLengthMeters) + routeLengthMeters) %
    routeLengthMeters;
  const unrestricted = speedMetersPerSecond * deltaSeconds;
  if (!signal || unrestricted === 0)
    return (start + unrestricted) % routeLengthMeters;
  if (
    !Number.isFinite(signal.distanceMeters) ||
    !Number.isFinite(signal.phaseOffsetSeconds)
  )
    return start;

  const stop =
    (((signal.distanceMeters - stopOffsetMeters) % routeLengthMeters) +
      routeLengthMeters) %
    routeLengthMeters;
  const forwardToStop = (stop - start + routeLengthMeters) % routeLengthMeters;
  const phaseAtArrival = getNightTrafficSignalPhase(
    elapsedSeconds + forwardToStop / Math.max(speedMetersPerSecond, 1e-9),
    signal.phaseOffsetSeconds
  );
  if (
    forwardToStop <= unrestricted &&
    phaseAtArrival !== NIGHT_TRAFFIC_SIGNAL_PHASE.GREEN
  )
    return stop;
  return (start + unrestricted) % routeLengthMeters;
};
