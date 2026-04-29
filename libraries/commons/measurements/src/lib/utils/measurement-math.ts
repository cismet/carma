export const EARTH_RADIUS = 6378137;

export interface MeasurementLabel {
  position: [number, number];
  text: string;
}

export interface MeasurementLabelInput {
  shapeType: "line" | "polygon" | string;
  coordinates: [number, number][];
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

// Spherical distance in meters; matches Leaflet's L.LatLng.distanceTo.
export const haversineDistance = (
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number]
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
};

// Spherical ring area in m². Accepts open or closed [lat, lng] rings.
export const ringArea = (coords: [number, number][]): number => {
  let n = coords.length;
  if (n >= 2) {
    const first = coords[0];
    const last = coords[n - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      n -= 1;
    }
  }
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const lower = coords[(i - 1 + n) % n];
    const middle = coords[i];
    const upper = coords[(i + 1) % n];
    area +=
      (toRadians(upper[1]) - toRadians(lower[1])) *
      Math.sin(toRadians(middle[0]));
  }
  return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
};

// Label-style: under 100 keeps one decimal, otherwise rounds to integer; switches m/km at 1000.
export const formatLabelDistance = (d: number): string => {
  let value = d;
  let unit: string;
  if (value > 1000) {
    value = value / 1000;
    unit = "km";
  } else {
    unit = "m";
  }
  return value < 100
    ? `${value.toFixed(1)} ${unit}`
    : `${Math.round(value)} ${unit}`;
};

export const formatLabelArea = (a: number): string => {
  let value = a;
  let unit: string;
  if (value > 1000000) {
    value = value / 1000000;
    unit = "km²";
  } else {
    unit = "m²";
  }
  return value < 100
    ? `${value.toFixed(1)} ${unit}`
    : `${Math.round(value)} ${unit}`;
};

// Subtitle/info-style with two decimals; switches m/km at 1000 / 1 000 000.
export const formatPreciseDistance = (d: number): string => {
  if (d >= 1000) {
    return `${(d / 1000).toFixed(2)} km`;
  }
  return `${d.toFixed(2)} m`;
};

export const formatPreciseArea = (a: number): string => {
  if (a >= 1000000) {
    return `${(a / 1000000).toFixed(2)} km²`;
  }
  return `${a.toFixed(2)} m²`;
};

// Reproduces the labels Leaflet's measure plugin would emit for a shape:
// segment distances at midpoints, polyline total at the last vertex, polygon
// area at the centroid. Used as a fallback for shapes saved before labels were
// persisted on the shape itself.
export const computeMeasurementLabels = (
  shape: MeasurementLabelInput
): MeasurementLabel[] => {
  const coords = shape.coordinates;
  if (!coords || coords.length < 2) {
    return [];
  }

  const isPolygon = shape.shapeType === "polygon";
  const labels: MeasurementLabel[] = [];

  let ring = coords;
  if (isPolygon && coords.length >= 2) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      ring = coords.slice(0, -1);
    }
  }

  const segmentCount = isPolygon ? ring.length : ring.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dist = haversineDistance(a, b);
    const midLat = (a[0] + b[0]) / 2;
    const midLng = (a[1] + b[1]) / 2;
    labels.push({
      position: [midLng, midLat],
      text: formatLabelDistance(dist),
    });
  }

  if (isPolygon && ring.length >= 3) {
    let sumLat = 0;
    let sumLng = 0;
    for (const [lat, lng] of ring) {
      sumLat += lat;
      sumLng += lng;
    }
    labels.push({
      position: [sumLng / ring.length, sumLat / ring.length],
      text: formatLabelArea(ringArea(ring)),
    });
  } else if (!isPolygon) {
    let total = 0;
    for (let i = 1; i < ring.length; i++) {
      total += haversineDistance(ring[i - 1], ring[i]);
    }
    const last = ring[ring.length - 1];
    labels.push({
      position: [last[1], last[0]],
      text: formatLabelDistance(total),
    });
  }

  return labels;
};
