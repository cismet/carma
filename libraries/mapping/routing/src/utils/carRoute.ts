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

export interface CarRouteSummary {
  /** travel time in seconds */
  durationInSeconds: number;
  /** driven distance in meters */
  distanceInMeters: number;
  /** the driven line as `[lng, lat]` in WGS84; empty when it carried none */
  coordinates: [number, number][];
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
  }>;
};

/** the itinerary's line, its legs decoded and laid end to end */
const coordinatesOf = (itinerary: DirectItinerary): [number, number][] =>
  (itinerary.legs ?? []).flatMap((leg) => {
    const points = leg?.legGeometry?.points;
    return points ? decodePolyline(points, leg.legGeometry?.precision ?? 6) : [];
  });

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
        };
      }
    }
    return best;
  } catch (error) {
    console.error("[CAR ROUTE] routing failed", error);
    return null;
  }
}
