import * as motis from "@motis-project/motis-client";

const MOTIS_BASE_URL = "https://beta.motis.routen.nrw/";

motis.client.setConfig({
  baseUrl: MOTIS_BASE_URL,
});

export const motisClient = motis.client;

export interface MotisPlace {
  lat: number;
  lng: number;
  name?: string;
}

export interface MotisRouteParams {
  from: MotisPlace | string;
  to: MotisPlace | string;
  time?: Date;
  arriveBy?: boolean;
  transitModes?: motis.Mode[];
  directModes?: motis.Mode[];
}

export function formatPlace(place: MotisPlace | string): string {
  if (typeof place === "string") return place;
  return `${place.lat},${place.lng}`;
}

export function positionToMotisPlace(
  position: GeolocationPosition | null,
  name = "Mein Standort"
): MotisPlace | null {
  if (!position) return null;
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    name,
  };
}

export async function planRoute(params: MotisRouteParams) {
  return motis.plan({
    query: {
      fromPlace: formatPlace(params.from),
      toPlace: formatPlace(params.to),
      time: params.time?.toISOString(),
      transitModes: params.transitModes || ("" as unknown as motis.Mode[]),
      directModes:
        params.directModes || ("WALK,CAR,BIKE" as unknown as motis.Mode[]),
      withFares: true,
      joinInterlinedLegs: false,
      maxMatchingDistance: 250,
      detailedTransfers: true,
    },
  });
}

const WUPPERTAL_BOUNDS = {
  minLat: 51.165,
  maxLat: 51.32,
  minLng: 7.0,
  maxLng: 7.32,
};

export async function geocodeAddress(text: string) {
  return motis.geocode({
    query: {
      text,
      // Bias results towards Wuppertal area
      place: `${(WUPPERTAL_BOUNDS.minLat + WUPPERTAL_BOUNDS.maxLat) / 2},${
        (WUPPERTAL_BOUNDS.minLng + WUPPERTAL_BOUNDS.maxLng) / 2
      }`,
    },
  });
}

export async function reverseGeocode(lat: number, lng: number) {
  return motis.reverseGeocode({
    query: { place: `${lat},${lng}` },
  });
}

export async function getStopsInArea(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
) {
  return motis.stops({
    query: {
      min: `${minLat},${minLng}`,
      max: `${maxLat},${maxLng}`,
    },
  });
}
