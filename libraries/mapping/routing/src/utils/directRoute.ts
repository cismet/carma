/**
 * Travel time, distance and line between two points by one mode of travel,
 * from the same MOTIS service the route display uses.
 *
 * This is the summary alone, nothing drawn: it answers "how far is that by
 * car, really" (or by bike, or on foot), which is what a ranking of candidates
 * needs, and hands back the line it went along so a caller that wants to show
 * the route has it without asking again. Asking for the one mode as the only
 * direct mode keeps the other itineraries out of the answer, so the fastest
 * result is a result of that mode.
 */
import type { Mode } from "@motis-project/motis-client";

import { decodePolyline } from "./routeDisplay";
import { planRoute } from "../services/motisService";

/** the modes a route can be computed for as one line */
export type TravelMode = "car" | "bike" | "walk";

/** what the service calls each mode */
const MOTIS_MODE: Record<TravelMode, Mode> = {
  car: "CAR",
  bike: "BIKE",
  walk: "WALK",
};

/**
 * How long a direct trip may take before the service drops it, in seconds.
 * MOTIS's own default is 30 minutes, which a walk across town exceeds and
 * would then answer with nothing; two hours covers any trip within the city
 * by any of the three modes.
 */
export const DEFAULT_MAX_DIRECT_TIME = 7200;

/** the turn that starts a step, as the service names it */
export type RouteDirection =
  | "DEPART"
  | "CONTINUE"
  | "SLIGHTLY_LEFT"
  | "LEFT"
  | "HARD_LEFT"
  | "SLIGHTLY_RIGHT"
  | "RIGHT"
  | "HARD_RIGHT"
  | "UTURN_LEFT"
  | "UTURN_RIGHT"
  | "CIRCLE_CLOCKWISE"
  | "CIRCLE_COUNTERCLOCKWISE"
  | "STAIRS"
  | "ELEVATOR";

/** one instruction: the turn that starts it, the street it follows, how far */
export interface RouteStep {
  direction: RouteDirection;
  /** empty when the way carries no name */
  streetName: string;
  distanceInMeters: number;
  /** meters from the route's start to where this step begins; derived once */
  startsAtMeters: number;
}

export interface RouteSummary {
  /** travel time in seconds */
  durationInSeconds: number;
  /** travelled distance in meters */
  distanceInMeters: number;
  /** the travelled line as `[lng, lat]` in WGS84; empty when it carried none */
  coordinates: [number, number][];
  /** the instructions in travel order; empty when the answer carried none */
  steps: RouteStep[];
}

export interface FetchRouteParams {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  mode: TravelMode;
  time?: Date;
  /** seconds a direct trip may take; default `DEFAULT_MAX_DIRECT_TIME` */
  maxDirectTime?: number;
}

/** what this reads off a direct itinerary; the rest of it is not needed here */
type DirectItinerary = {
  duration?: number;
  legs?: Array<{
    distance?: number;
    legGeometry?: { points?: string; precision?: number };
    steps?: Array<{
      relativeDirection?: RouteDirection;
      distance?: number;
      streetName?: string;
      polyline?: { points?: string; precision?: number };
    }>;
  }>;
};

/** how far back and ahead of a junction the direction is read, in meters */
const TURN_ARM_METERS = 10;

/** `[lng, lat]` to `[lng, lat]`, in meters; close enough at a junction */
const metersBetween = (a: [number, number], b: [number, number]) => {
  const dLat = (b[1] - a[1]) * 111_320;
  const dLng =
    (b[0] - a[0]) * 111_320 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
};

/** degrees clockwise from north, from `a` towards `b` */
const bearingBetween = (a: [number, number], b: [number, number]) => {
  const toRad = Math.PI / 180;
  const dLng = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/**
 * The point about `TURN_ARM_METERS` along a line from one of its ends, so a
 * densely digitised curve right at the junction does not stand in for the
 * road's direction. The far end when the line is shorter than that.
 */
const pointAlong = (line: [number, number][], fromEnd: boolean) => {
  const points = fromEnd ? [...line].reverse() : line;
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    travelled += metersBetween(points[i - 1], points[i]);
    if (travelled >= TURN_ARM_METERS) {
      return points[i];
    }
  }
  return points[points.length - 1];
};

/**
 * The turn between two steps, read off their lines: the service names every
 * car step `CONTINUE` and leaves the turn to whoever draws the arrow (walking
 * and cycling steps come with their turn and skip this). The
 * heading in, over the last meters of the step before, against the heading
 * out, over the first meters of the step; the difference is the turn. A
 * roundabout cannot be told this way and stays a plain turn.
 */
const turnBetween = (
  incoming: [number, number][],
  outgoing: [number, number][]
): RouteDirection => {
  if (incoming.length < 2 || outgoing.length < 2) {
    return "CONTINUE";
  }
  const junction = outgoing[0];
  const headingIn = bearingBetween(pointAlong(incoming, true), junction);
  const headingOut = bearingBetween(junction, pointAlong(outgoing, false));
  // -180..180, positive is a right turn
  const delta = ((headingOut - headingIn + 540) % 360) - 180;
  const turn = Math.abs(delta);
  if (turn < 20) {
    return "CONTINUE";
  }
  if (turn > 165) {
    return delta > 0 ? "UTURN_RIGHT" : "UTURN_LEFT";
  }
  if (turn < 60) {
    return delta > 0 ? "SLIGHTLY_RIGHT" : "SLIGHTLY_LEFT";
  }
  if (turn < 135) {
    return delta > 0 ? "RIGHT" : "LEFT";
  }
  return delta > 0 ? "HARD_RIGHT" : "HARD_LEFT";
};

/** the itinerary's line, its legs decoded and laid end to end */
const coordinatesOf = (itinerary: DirectItinerary): [number, number][] =>
  (itinerary.legs ?? []).flatMap((leg) => {
    const points = leg?.legGeometry?.points;
    return points ? decodePolyline(points, leg.legGeometry?.precision ?? 6) : [];
  });

/** a step as read, before the offsets are known */
type RawStep = Omit<RouteStep, "startsAtMeters">;

/** a proper turn, as against going on straight or nearly so */
const isTurn = (direction: RouteDirection) =>
  direction !== "DEPART" &&
  direction !== "CONTINUE" &&
  direction !== "SLIGHTLY_LEFT" &&
  direction !== "SLIGHTLY_RIGHT";

/**
 * One step per turn or street change. The service cuts a step at every OSM
 * way boundary, so a straight kilometer of one street arrives as a dozen
 * `CONTINUE` steps of a few dozen meters each; read as instructions they say
 * "weiter auf X" over and over, and the distance to the next real change is
 * lost among them. A step onto the same street is the same stretch going on
 * unless the geometry says otherwise: a road bends, and following the bend
 * is not an instruction, but a street that turns a corner at a junction and
 * keeps its name on the far side is one. A bend shows up as a slight angle
 * at a way boundary, a corner as a proper turn, so a same-street step folds
 * when it goes straight or nearly so and stays when it turns. An unnamed way
 * folds only when it goes straight on; one that starts with a turn stays its
 * own step, because the turn is real and only the name is missing.
 */
const foldSteps = (steps: RawStep[]): RawStep[] => {
  const folded: RawStep[] = [];
  for (const step of steps) {
    const previous = folded[folded.length - 1];
    const sameStretch =
      previous !== undefined &&
      (step.streetName === ""
        ? step.direction === "CONTINUE"
        : step.streetName === previous.streetName && !isTurn(step.direction));
    if (sameStretch) {
      previous.distanceInMeters += step.distanceInMeters;
    } else {
      folded.push({ ...step });
    }
  }
  return folded;
};

/**
 * The itinerary's instructions, the legs' steps laid end to end like the line.
 * The turns are read off the raw steps' lines first (the boundaries the
 * service cuts at are where the geometry is compared), then the steps are
 * folded, then `startsAtMeters` is summed once, so a lookup along the route is
 * a scan and not a sum per fix. The step's own polyline is dropped: the
 * route's line is kept already, and the offset places the step on it.
 */
const stepsOf = (itinerary: DirectItinerary): RouteStep[] => {
  const raw: RawStep[] = [];
  // the line of the step before, for the turn into this one
  let incoming: [number, number][] = [];
  for (const leg of itinerary.legs ?? []) {
    for (const step of leg?.steps ?? []) {
      if (!step?.relativeDirection) {
        continue;
      }
      const points = step.polyline?.points;
      const outgoing = points
        ? decodePolyline(points, step.polyline?.precision ?? 6)
        : [];
      // a `CONTINUE` is the service not saying; anything else it did say
      const direction =
        step.relativeDirection === "CONTINUE"
          ? turnBetween(incoming, outgoing)
          : step.relativeDirection;
      raw.push({
        direction,
        streetName: step.streetName ?? "",
        distanceInMeters: step.distance ?? 0,
      });
      incoming = outgoing;
    }
  }

  let startsAtMeters = 0;
  return foldSteps(raw).map((step) => {
    const placed = { ...step, startsAtMeters };
    startsAtMeters += step.distanceInMeters;
    return placed;
  });
};

/**
 * The fastest route between two points by the given mode, or `null` when the
 * service answers with none (unreachable, off the routed network, longer than
 * `maxDirectTime`, or the request failed).
 */
export async function fetchRoute(
  params: FetchRouteParams
): Promise<RouteSummary | null> {
  const {
    from,
    to,
    mode,
    time = new Date(),
    maxDirectTime = DEFAULT_MAX_DIRECT_TIME,
  } = params;

  try {
    const result = await planRoute({
      from,
      to,
      time,
      directModes: [MOTIS_MODE[mode]],
      maxDirectTime,
    });
    const direct =
      (result.data as { direct?: DirectItinerary[] })?.direct ?? [];

    let best: RouteSummary | null = null;
    for (const itinerary of direct) {
      const durationInSeconds = itinerary?.duration;
      if (typeof durationInSeconds !== "number") {
        continue;
      }
      // an itinerary carries no distance of its own, so it is the sum of what
      // its legs cover
      const distanceInMeters = (itinerary.legs ?? []).reduce(
        (sum, leg) => sum + (leg?.distance ?? 0),
        0
      );
      if (!best || durationInSeconds < best.durationInSeconds) {
        best = {
          durationInSeconds,
          distanceInMeters,
          coordinates: coordinatesOf(itinerary),
          steps: stepsOf(itinerary),
        };
      }
    }
    return best;
  } catch (error) {
    console.error("[DIRECT ROUTE] routing failed", { mode, error });
    return null;
  }
}
