import { investigationDataUrl } from "./investigation-data";

export const NIV_POINT_TRACK_CORRIDOR_METERS = 25;

export type NivControlPoint = {
  id: number;
  laufende_nummer: string;
  punktnummer_nrw: string | null;
  lagebezeichnung: string;
  messungsjahr: number;
  festlegungsart: number;
  geometrie: number;
  lagegenauigkeit: number;
  bemerkung: string | null;
  historisch: boolean;
  hoehe_ueber_nhn2016: number;
  x: number;
  y: number;
  transformStatus: "transformed";
  ellipsoidalHeight: number;
  ecef: [number, number, number];
  sourceCoordinate: {
    easting: number;
    northing: number;
    normalHeightDhhN2016: number;
  };
};
type TrackPoint = readonly [number, number];

type NivEcefArtifact = {
  format: "carma-niv-ecef-v1";
  source: {
    sha256: string;
    recordCount: number;
  };
  spatialReference: {
    target: "EPSG:4978 (WGS 84 geocentric / ECEF)";
    operation: {
      pipeline: string;
      grid: { name: "de_bkg_gcg2016.tif"; sha256: string };
    };
  };
  validation: {
    transformedCount: number;
    rejectedCount: number;
  };
  points: Array<Partial<NivControlPoint> & Record<string, unknown>>;
};

const NIV_ECEF_URL =
  import.meta.env.VITE_NIV_ECEF_URL ??
  investigationDataUrl("/niv-control-points/niv-points-ecef.json");

const isTransformedNivControlPoint = (
  point: Partial<NivControlPoint> & Record<string, unknown>
): point is NivControlPoint =>
  point.transformStatus === "transformed" &&
  Number.isFinite(point.ellipsoidalHeight) &&
  Array.isArray(point.ecef) &&
  point.ecef.length === 3 &&
  point.ecef.every(Number.isFinite) &&
  Number.isFinite(point.sourceCoordinate?.easting) &&
  Number.isFinite(point.sourceCoordinate?.northing) &&
  Number.isFinite(point.sourceCoordinate?.normalHeightDhhN2016);

export const loadNivControlPoints = async () => {
  const response = await fetch(NIV_ECEF_URL);
  if (!response.ok) {
    throw new Error(
      `Offline transformierte Höhenfestpunkte konnten nicht geladen werden: ${response.status} ${response.statusText}`
    );
  }
  const artifact = (await response.json()) as Partial<NivEcefArtifact>;
  const sourceHash = artifact.source?.sha256;
  const gridHash = artifact.spatialReference?.operation.grid.sha256;
  const provenanceIsValid =
    artifact.format === "carma-niv-ecef-v1" &&
    artifact.spatialReference?.target ===
      "EPSG:4978 (WGS 84 geocentric / ECEF)" &&
    artifact.spatialReference.operation.grid.name === "de_bkg_gcg2016.tif" &&
    artifact.spatialReference.operation.pipeline.includes(
      "+proj=vgridshift +grids=de_bkg_gcg2016.tif"
    ) &&
    typeof sourceHash === "string" &&
    /^[a-f0-9]{64}$/.test(sourceHash) &&
    typeof gridHash === "string" &&
    /^[a-f0-9]{64}$/.test(gridHash) &&
    Array.isArray(artifact.points);
  if (!provenanceIsValid) {
    throw new Error("Höhenfestpunkte haben kein verifiziertes ECEF-Format");
  }
  const points = artifact.points.filter(isTransformedNivControlPoint);
  if (
    points.length === 0 ||
    points.length !== artifact.validation?.transformedCount ||
    artifact.points.length !== artifact.source?.recordCount ||
    artifact.points.length !==
      points.length + (artifact.validation?.rejectedCount ?? -1)
  ) {
    throw new Error(
      "Höhenfestpunkte bestehen die Vollständigkeitsprüfung nicht"
    );
  }
  return points;
};

const bucketKey = (east: number, north: number, size: number) =>
  `${Math.floor(east / size)}:${Math.floor(north / size)}`;

export const filterNivControlPointsNearTrack = (
  points: readonly NivControlPoint[],
  track: readonly TrackPoint[],
  maximumDistanceMeters = NIV_POINT_TRACK_CORRIDOR_METERS
) => {
  if (track.length === 0 || maximumDistanceMeters <= 0) return [];
  const buckets = new Map<string, TrackPoint[]>();
  for (const position of track) {
    const key = bucketKey(position[0], position[1], maximumDistanceMeters);
    const bucket = buckets.get(key) ?? [];
    bucket.push(position);
    buckets.set(key, bucket);
  }

  return points
    .filter(
      (point) =>
        !point.historisch &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.hoehe_ueber_nhn2016) &&
        point.hoehe_ueber_nhn2016 !== 0
    )
    .flatMap((point) => {
      const bucketEast = Math.floor(point.x / maximumDistanceMeters);
      const bucketNorth = Math.floor(point.y / maximumDistanceMeters);
      let minimumSquaredDistance = Number.POSITIVE_INFINITY;
      for (let eastOffset = -1; eastOffset <= 1; eastOffset += 1) {
        for (let northOffset = -1; northOffset <= 1; northOffset += 1) {
          const candidates = buckets.get(
            `${bucketEast + eastOffset}:${bucketNorth + northOffset}`
          );
          if (!candidates) continue;
          for (const candidate of candidates) {
            minimumSquaredDistance = Math.min(
              minimumSquaredDistance,
              (point.x - candidate[0]) ** 2 + (point.y - candidate[1]) ** 2
            );
          }
        }
      }
      return minimumSquaredDistance <= maximumDistanceMeters ** 2
        ? [{ point, distanceToTrackMeters: Math.sqrt(minimumSquaredDistance) }]
        : [];
    })
    .sort(
      (left, right) => left.distanceToTrackMeters - right.distanceToTrackMeters
    );
};
