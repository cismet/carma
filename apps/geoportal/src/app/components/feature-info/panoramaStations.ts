// Places a panorama layer offers to jump to (e.g. the Schwebebahn stations),
// from the file its style names in metadata.carmaConf.panorama.stations. The
// tiling pipeline bakes it (schwebebahn_panorama/_build-stations.js).

export type PanoramaStationPano = {
  id: number;
  geometry: { type: "Point"; coordinates: number[] };
  properties: Record<string, unknown>;
};

// Per place the panos at it as complete features of the pano source (one per
// trip), so a jump needs no loaded tile.
export type PanoramaStations = {
  // least map zoom whose tiles carry the panos' neighbours, so the hops from
  // a jumped-to pano find their targets
  zoom?: number;
  // property telling the trips apart, e.g. "richtung"
  trip?: string;
  // property rising along a trip, e.g. "fid" (the camera's stream index)
  order?: string;
  // a pano within this (m) of a place's pano is at that place
  radius?: number;
  stations: { name: string; panos: PanoramaStationPano[] }[];
};

// Where a pano is on the line of places, all as indices into `stations`.
export type PanoramaStationLocation = {
  // the place the pano is at, or a fraction between two on the way
  position?: number;
  // the places before and after it in the travel direction of its trip
  previous?: number;
  next?: number;
  // the last place of the trip
  terminus?: number;
};

const DEFAULT_RADIUS_M = 30;
const METERS_PER_DEG_LAT = 111320;

// One fetch per file and session; the selection changes on every hop.
const cache = new Map<string, Promise<PanoramaStations | null>>();
export const fetchPanoramaStations = (url: string) => {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => (Array.isArray(json?.stations) ? json : null))
      .catch(() => null);
    cache.set(url, pending);
  }
  return pending;
};

// Equirectangular distance (m), plenty for a few hundred metres.
const distanceM = (a: number[], b: number[]) => {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (a[0] - b[0]) * Math.cos(lat) * METERS_PER_DEG_LAT;
  const dy = (a[1] - b[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
};

// The panos of the places on the current pano's trip, in travel order.
const tripEntries = (
  file: PanoramaStations,
  properties: Record<string, unknown>
) => {
  // without it the trips' panos mix and the order means nothing
  const tripKey = file.trip;
  if (!tripKey) {
    return [];
  }
  const orderKey = file.order ?? "fid";
  const trip = properties[tripKey];
  return file.stations
    .map((station, index) => ({
      index,
      pano: station.panos.find((p) => p.properties[tripKey] === trip),
    }))
    .filter(
      (entry): entry is { index: number; pano: PanoramaStationPano } =>
        !!entry.pano
    )
    .map(({ index, pano }) => ({
      index,
      pano,
      order: Number(pano.properties[orderKey]),
    }))
    .filter((entry) => Number.isFinite(entry.order))
    .sort((a, b) => a.order - b.order);
};

export const locatePanoramaOnStations = (
  file: PanoramaStations,
  properties: Record<string, unknown>,
  coordinates: number[] | undefined
): PanoramaStationLocation => {
  const order = Number(properties[file.order ?? "fid"]);
  const entries = tripEntries(file, properties);
  if (entries.length === 0 || !Number.isFinite(order)) {
    return {};
  }
  const terminus = entries[entries.length - 1].index;

  let at: (typeof entries)[number] | undefined;
  if (coordinates) {
    const radius = file.radius ?? DEFAULT_RADIUS_M;
    let best = Infinity;
    for (const entry of entries) {
      const d = distanceM(entry.pano.geometry.coordinates, coordinates);
      if (d <= radius && d < best) {
        best = d;
        at = entry;
      }
    }
  }
  const others = entries.filter((entry) => entry !== at);
  const before = others.filter((entry) => entry.order < order).at(-1);
  const after = others.find((entry) => entry.order > order);

  let position: number | undefined;
  if (at) {
    position = at.index;
  } else if (before && after) {
    const t = (order - before.order) / (after.order - before.order);
    position = before.index + (after.index - before.index) * t;
  }
  return {
    position,
    previous: before?.index,
    next: after?.index,
    terminus,
  };
};

// The pano to jump to at a place: the one on the current pano's trip, else
// any (a trip may have none there, e.g. without a trajectory at its start).
export const pickStationPano = (
  file: PanoramaStations,
  index: number,
  properties: Record<string, unknown>
): PanoramaStationPano | undefined => {
  const panos = file.stations[index]?.panos ?? [];
  const tripKey = file.trip;
  return (
    (tripKey
      ? panos.find((p) => p.properties[tripKey] === properties[tripKey])
      : undefined) ?? panos[0]
  );
};
