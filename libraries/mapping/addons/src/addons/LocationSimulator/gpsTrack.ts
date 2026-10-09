/**
 * A recorded GPS track: every fix a real device gave, with what it said about
 * itself, so a walk or a drive can be replayed at the desk as often as
 * needed.
 *
 * Stored as GeoJSON, so any map tool can show it: a LineString through the
 * fixes, with the rest of each fix in `properties.fixes`, one entry per
 * coordinate, in the same order.
 */
export type RecordedFix = {
  lng: number;
  lat: number;
  /** ms since the first fix of the track */
  t: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
};

export type GpsTrack = {
  name: string;
  fixes: RecordedFix[];
};

type TrackFeature = {
  type: "Feature";
  properties: {
    name: string;
    recordedAt: string;
    fixes: Omit<RecordedFix, "lng" | "lat">[];
  };
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

/** a fix as the device gave it, timed from the track's first one */
export const recordedFix = (
  position: GeolocationPosition,
  startedAt: number
): RecordedFix => ({
  lng: position.coords.longitude,
  lat: position.coords.latitude,
  t: Math.max(0, position.timestamp - startedAt),
  accuracy: position.coords.accuracy,
  speed: position.coords.speed,
  heading: position.coords.heading,
});

export const trackToGeoJSON = (track: GpsTrack): TrackFeature => ({
  type: "Feature",
  properties: {
    name: track.name,
    recordedAt: new Date().toISOString(),
    fixes: track.fixes.map(({ t, accuracy, speed, heading }) => ({
      t,
      accuracy,
      speed,
      heading,
    })),
  },
  geometry: {
    type: "LineString",
    coordinates: track.fixes.map(({ lng, lat }) => [lng, lat]),
  },
});

/**
 * A track from what a file or a url held: the format written above, as a
 * Feature or a FeatureCollection with it as the first feature. A LineString
 * without fix data (drawn in some other tool) becomes a track at one fix a
 * second with a fixed accuracy, so it can be replayed all the same. Null for
 * anything else.
 */
export const parseTrack = (data: unknown, name: string): GpsTrack | null => {
  const value = data as {
    type?: string;
    features?: unknown[];
    properties?: { name?: string; fixes?: Partial<RecordedFix>[] };
    geometry?: { type?: string; coordinates?: [number, number][] };
  };
  const feature =
    value?.type === "FeatureCollection"
      ? (value.features?.[0] as typeof value | undefined)
      : value;
  const coordinates = feature?.geometry?.coordinates;
  if (
    feature?.geometry?.type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    return null;
  }
  const fixes = feature.properties?.fixes;
  return {
    name: feature.properties?.name ?? name,
    fixes: coordinates.map(([lng, lat], index) => {
      const fix = fixes?.[index];
      return {
        lng,
        lat,
        t: typeof fix?.t === "number" ? fix.t : index * 1000,
        accuracy: typeof fix?.accuracy === "number" ? fix.accuracy : 5,
        speed: typeof fix?.speed === "number" ? fix.speed : null,
        heading: typeof fix?.heading === "number" ? fix.heading : null,
      };
    }),
  };
};

/** the track as a GeoJSON file the browser saves */
export const downloadTrack = (track: GpsTrack) => {
  const blob = new Blob([JSON.stringify(trackToGeoJSON(track))], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${track.name}.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** "track-2026-10-09-1432": when it was recorded, which sorts */
export const trackName = (at = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `track-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(
    at.getDate()
  )}-${pad(at.getHours())}${pad(at.getMinutes())}`;
};
