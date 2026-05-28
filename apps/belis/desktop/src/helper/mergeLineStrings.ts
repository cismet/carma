// Auto-connect two LineStrings at their closest endpoints.
//
// Both inputs are assumed to be in EPSG:25832 (Euclidean meters), so picking
// the smallest endpoint distance gives a sensible join for the "Leitung
// verlängern" flow. The chosen-pair endpoints are then aligned by reversing
// one or both segments so that the join sits at A_end == B_start, and the two
// coordinate arrays are concatenated; if the join points coincide within
// JOIN_EPSILON_M we drop one to avoid a duplicate vertex.

type Coord = [number, number];

// Accept any LineString-shaped input (the GeoJSON.LineString type uses the
// broader `number[]` for coordinates, while our project-local
// `MeasurementGeometry` narrows to `[number, number]`). Both flow through
// here, so widen the parameter and narrow inside.
interface CrsLineString {
  type: "LineString";
  crs?: unknown;
  coordinates: number[][];
}

// 1 mm — tighter than any practical surveying precision, looser than typical
// float noise. Two endpoints within this distance are treated as the same
// point for the dedup step.
const JOIN_EPSILON_M = 1e-3;

const sqDistance = (a: number[], b: number[]): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

const toCoord = (p: number[]): Coord => [p[0], p[1]];

export const mergeLineStringsClosestEndpoints = (
  a: CrsLineString,
  b: CrsLineString
): { type: "LineString"; crs?: unknown; coordinates: Coord[] } => {
  const aCoords = a.coordinates;
  const bCoords = b.coordinates;
  const aStart = aCoords[0];
  const aEnd = aCoords[aCoords.length - 1];
  const bStart = bCoords[0];
  const bEnd = bCoords[bCoords.length - 1];

  // Four candidate joins, encoded as [reverseA, reverseB, distSq].
  const candidates: Array<[boolean, boolean, number]> = [
    [false, false, sqDistance(aEnd, bStart)], // A → B
    [false, true, sqDistance(aEnd, bEnd)], //   A → reverse(B)
    [true, false, sqDistance(aStart, bStart)], // reverse(A) → B
    [true, true, sqDistance(aStart, bEnd)], //   reverse(A) → reverse(B)
  ];

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i][2] < best[2]) best = candidates[i];
  }
  const [reverseA, reverseB, bestSq] = best;

  const left = (reverseA ? [...aCoords].reverse() : aCoords).map(toCoord);
  const right = (reverseB ? [...bCoords].reverse() : bCoords).map(toCoord);

  // Drop the duplicate join vertex when the two endpoints coincide.
  const dedup = bestSq <= JOIN_EPSILON_M * JOIN_EPSILON_M;
  const merged: Coord[] = dedup
    ? [...left, ...right.slice(1)]
    : [...left, ...right];

  return {
    type: "LineString",
    crs: a.crs ?? b.crs,
    coordinates: merged,
  };
};
