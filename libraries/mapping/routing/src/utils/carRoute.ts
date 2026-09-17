/**
 * Car travel time, distance and line between two points, from the same MOTIS
 * service the route display uses.
 *
 * This is the summary alone, nothing drawn: it answers "how far is that by car,
 * really", which is what a ranking of candidates needs, and hands back the line
 * it drove so a caller that wants to show the route has it without asking
 * again. Asking for `CAR` as the only direct mode keeps walking and cycling
 * itineraries out of the answer, so the fastest result is a car result.
 */
import { decodePolyline } from "./routeDisplay";
import { planRoute } from "../services/motisService";

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

export interface CarRouteSummary {
  /** travel time in seconds */
  durationInSeconds: number;
  /** driven distance in meters */
  distanceInMeters: number;
  /** the driven line as `[lng, lat]` in WGS84; empty when it carried none */
  coordinates: [number, number][];
  /** the instructions in driving order; empty when the answer carried none */
  steps: RouteStep[];
}

export interface FetchCarRouteParams {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  time?: Date;
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
 * car step `CONTINUE` and leaves the turn to whoever draws the arrow. The
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

/**
 * The itinerary's instructions, the legs' steps laid end to end like the line.
 * `startsAtMeters` is summed here, once, so a lookup along the route is a scan
 * and not a sum per fix. The step's own polyline is dropped: the route's line
 * is kept already, and the offset places the step on it.
 */
const stepsOf = (itinerary: DirectItinerary): RouteStep[] => {
  const steps: RouteStep[] = [];
  let startsAtMeters = 0;
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
      const distanceInMeters = step.distance ?? 0;
      steps.push({
        direction,
        streetName: step.streetName ?? "",
        distanceInMeters,
        startsAtMeters,
      });
      startsAtMeters += distanceInMeters;
      incoming = outgoing;
    }
  }
  return steps;
};

/**
 * The fastest car route between two points, or `null` when the service answers
 * with none (unreachable, off the routed network, or the request failed).
 */
export async function fetchCarRoute(
  params: FetchCarRouteParams
): Promise<CarRouteSummary | null> {
  const { from, to, time = new Date() } = params;

  try {
    const result = await planRoute({
      from,
      to,
      time,
      directModes: ["CAR"],
    });
    const direct =
      (result.data as { direct?: DirectItinerary[] })?.direct ?? [];

    let best: CarRouteSummary | null = null;
    for (const itinerary of direct) {
      const durationInSeconds = itinerary?.duration;
      if (typeof durationInSeconds !== "number") {
        continue;
      }
      // an itinerary carries no distance of its own, so it is the sum of what
      // its legs drove
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
    console.error("[CAR ROUTE] routing failed", error);
    return null;
  }
}
