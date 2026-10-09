import { along, length, lineString } from "@turf/turf";

/**
 * Moves the user's arrow along the route rather than from fix to fix.
 *
 * A fix wanders a few meters off the road and comes once a second; drawn
 * where it is, the arrow hops beside the road while the camera glides along
 * it. Snapped and glided instead, the arrow goes from where it is on the line
 * to the next snapped place over the same time the camera takes, with the
 * same linear easing, so arrow and camera move as one.
 *
 * It can also coast: go on along the line at a given speed with no fix at
 * all, for the seconds the signal is gone (a tunnel, a deep street). Stopped
 * by the next glide, by `stop`, after `maxMs`, or at the end of the line.
 *
 * The arrow is drawn by the locate context; this only says where, through
 * `setDisplayPosition`. `release` hands it back to the fix.
 */
export type ArrowGlide = {
  /** glide to `alongMeters` on the line; a new line starts there instead */
  glideTo: (
    coordinates: [number, number][],
    alongMeters: number,
    durationMs: number
  ) => void;
  /** go on along the current line at `speed` m/s for up to `maxMs` */
  coast: (speed: number, maxMs: number) => void;
  /** where the arrow is now; null before the first glide */
  position: () => [number, number] | null;
  /** stop moving and hand the arrow back to the fix */
  release: () => void;
};

const METERS = { units: "meters" } as const;

type Line = {
  coordinates: [number, number][];
  feature: ReturnType<typeof lineString>;
  total: number;
};

export const createArrowGlide = (
  setDisplayPosition: (lngLat: [number, number] | null) => void
): ArrowGlide => {
  let line: Line | null = null;
  /** meters along the line where the arrow is now */
  let at = 0;
  let frame: number | null = null;

  const pointAt = (meters: number) =>
    line
      ? (along(line.feature, Math.min(Math.max(meters, 0), line.total), METERS)
          .geometry.coordinates as [number, number])
      : null;

  const show = () => {
    const point = pointAt(at);
    if (point) {
      setDisplayPosition(point);
    }
  };

  const cancel = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };

  const takeLine = (coordinates: [number, number][]) => {
    if (line?.coordinates === coordinates) {
      return false;
    }
    const feature = lineString(coordinates);
    line = { coordinates, feature, total: length(feature, METERS) };
    return true;
  };

  return {
    glideTo: (coordinates, alongMeters, durationMs) => {
      cancel();
      if (coordinates.length < 2) {
        return;
      }
      const fresh = takeLine(coordinates);
      const from = at;
      const to = alongMeters;
      // a new line, or a jump back (the simulator's slider): no glide, the
      // arrow is put there
      if (fresh || to < from || durationMs <= 0) {
        at = to;
        show();
        return;
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        at = from + (to - from) * t;
        show();
        frame = t < 1 ? requestAnimationFrame(step) : null;
      };
      frame = requestAnimationFrame(step);
    },
    coast: (speed, maxMs) => {
      cancel();
      if (!line || speed <= 0) {
        return;
      }
      const startedAt = performance.now();
      const from = at;
      const step = (now: number) => {
        const elapsed = Math.min(now - startedAt, maxMs);
        at = Math.min(from + (speed * elapsed) / 1000, line?.total ?? from);
        show();
        const done = elapsed >= maxMs || (line !== null && at >= line.total);
        frame = done ? null : requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    position: () => pointAt(at),
    release: () => {
      cancel();
      line = null;
      at = 0;
      setDisplayPosition(null);
    },
  };
};
