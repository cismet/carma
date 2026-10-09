import { destination, point } from "@turf/turf";

/**
 * How good the pretend receiver's signal is, as the tester picks it in the
 * ribbon: the four presets of the navigation plan.
 *
 * | Preset   | Scatter | Accuracy | Extras                                      |
 * | -------- | ------- | -------- | ------------------------------------------- |
 * | good     | 2 m     | 5 m      | (the simulator's own `jitterMeters`, `accuracyMeters`) |
 * | medium   | 8 m     | 15 m     | now and then a fix at 60 m accuracy          |
 * | bad      | 20 m    | 30 m     | jumps, and a sideways drift of 25 m for ~10 s |
 * | tunnel   | 2 m     | 5 m      | no fixes for 20 s, then on                   |
 *
 * This is what tests the navigation's weak-signal handling, the hold while
 * approaching the route and the reroute thresholds without walking outside.
 */
export type SimulatedSignal = "good" | "medium" | "bad" | "tunnel";

export type SignalPreset = {
  /** a fix lands anywhere within this of where the device is, in meters */
  scatterMeters: number;
  /** the accuracy the fix reports, in meters */
  accuracyMeters: number;
  /** the chance per fix of a jump: a fix much further off, honestly reported */
  jumpChance: number;
  jumpScatterMeters: number;
  jumpAccuracyMeters: number;
  /** the chance per fix of a drift starting: every fix sideways by `driftMeters` */
  driftChance: number;
  driftMeters: number;
  driftMs: number;
  /** no fixes at all for this long once the preset is picked; 0 for none */
  outageMs: number;
};

const NONE = {
  jumpChance: 0,
  jumpScatterMeters: 0,
  jumpAccuracyMeters: 0,
  driftChance: 0,
  driftMeters: 0,
  driftMs: 0,
  outageMs: 0,
};

export const DEFAULT_SIGNAL_PRESETS: Record<SimulatedSignal, SignalPreset> = {
  good: { ...NONE, scatterMeters: 2, accuracyMeters: 5 },
  medium: {
    ...NONE,
    scatterMeters: 8,
    accuracyMeters: 15,
    jumpChance: 0.1,
    jumpScatterMeters: 40,
    jumpAccuracyMeters: 60,
  },
  bad: {
    ...NONE,
    scatterMeters: 20,
    accuracyMeters: 30,
    jumpChance: 0.15,
    jumpScatterMeters: 60,
    jumpAccuracyMeters: 80,
    driftChance: 0.05,
    driftMeters: 25,
    driftMs: 10000,
  },
  tunnel: { ...NONE, scatterMeters: 2, accuracyMeters: 5, outageMs: 20000 },
};

/** the order and the words of the ribbon's selector */
export const SIGNAL_LABELS: { value: SimulatedSignal; label: string }[] = [
  { value: "good", label: "gut" },
  { value: "medium", label: "mittel" },
  { value: "bad", label: "schlecht" },
  { value: "tunnel", label: "Tunnel" },
];

const METERS = { units: "meters" } as const;
const METERS_PER_DEGREE_LAT = 111320;

const scatter = (
  [lng, lat]: [number, number],
  meters: number
): [number, number] => {
  if (meters <= 0) {
    return [lng, lat];
  }
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * meters;
  const north = Math.cos(angle) * distance;
  const east = Math.sin(angle) * distance;
  const lngScale = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  return [lng + east / lngScale, lat + north / METERS_PER_DEGREE_LAT];
};

/**
 * The receiver's side of a fix: given where the device really is and where
 * it is heading, what the fix says, or null when there is none. Keeps the
 * state a preset needs between fixes (a drift under way, an outage).
 */
export type Reception = {
  /** switch to a preset; picking one with an outage starts the outage now */
  setPreset: (preset: SignalPreset) => void;
  receive: (
    at: [number, number],
    heading: number | null
  ) => { at: [number, number]; accuracy: number } | null;
};

export const createReception = (initial: SignalPreset): Reception => {
  let preset = initial;
  let outageUntil = 0;
  let drift: { until: number; bearing: number } | null = null;

  return {
    setPreset: (next) => {
      preset = next;
      drift = null;
      outageUntil = next.outageMs > 0 ? Date.now() + next.outageMs : 0;
    },
    receive: (at, heading) => {
      const now = Date.now();
      if (now < outageUntil) {
        return null;
      }
      if (drift && now > drift.until) {
        drift = null;
      }
      if (!drift && Math.random() < preset.driftChance) {
        // sideways: a receiver pulled off by a house front on one side
        drift = {
          until: now + preset.driftMs,
          bearing: ((heading ?? 0) + 90) % 360,
        };
      }
      const base = drift
        ? (destination(point(at), preset.driftMeters, drift.bearing, METERS)
            .geometry.coordinates as [number, number])
        : at;
      if (Math.random() < preset.jumpChance) {
        return {
          at: scatter(base, preset.jumpScatterMeters),
          accuracy: preset.jumpAccuracyMeters,
        };
      }
      return {
        at: scatter(base, preset.scatterMeters),
        accuracy: preset.accuracyMeters,
      };
    },
  };
};
