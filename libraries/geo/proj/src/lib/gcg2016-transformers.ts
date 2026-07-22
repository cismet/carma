import proj4 from "proj4";

import type {
  Altitude,
  Coordinates,
  ETRS89UTMZone,
  Latitude,
  LngLatArray,
  Longitude,
} from "@carma-geo/data-structures";
import type { Meters, MetricVector3 } from "@carma-units";

import {
  gcg2016Model,
  getGcg2016Undulation,
  getGcg2016Undulations,
} from "./gcg2016";
import { getFromEcefToWGS84, getFromWGS84ToEcef } from "./proj4";

export const GCG2016_UTM_ZONES = [
  31, 32, 33,
] as const satisfies readonly ETRS89UTMZone[];

export type Gcg2016UtmZone = (typeof GCG2016_UTM_ZONES)[number];

interface LazyGcg2016Transformer {
  clearCache(): void;
  readonly cachedTileCount: number;
}

const GCG2016_UTM_HORIZONTAL_CRS = GCG2016_UTM_ZONES.map(
  (zone) => `EPSG:${25800 + zone}`
);

const UTM_DHHN2016_REFERENCE = {
  horizontalCrs: GCG2016_UTM_HORIZONTAL_CRS,
  verticalCrs: "EPSG:7837",
  compoundCrs: GCG2016_UTM_HORIZONTAL_CRS.map(
    (horizontalCrs) => `${horizontalCrs}+7837`
  ),
  heightType: "DHHN2016",
} as const;

const UTM_ELLIPSOIDAL_REFERENCE = {
  horizontalCrs: GCG2016_UTM_HORIZONTAL_CRS,
  verticalCrs: null,
  heightType: "ellipsoidal",
} as const;

const WGS84_DHHN2016_REFERENCE = {
  horizontalCrs: "EPSG:4326",
  verticalCrs: "EPSG:7837",
  compoundCrs: null,
  heightType: "DHHN2016",
  epochTransformation: null,
} as const;

const WGS84_ELLIPSOIDAL_REFERENCE = {
  horizontalCrs: "EPSG:4326",
  verticalCrs: null,
  heightType: "ellipsoidal",
  epochTransformation: null,
} as const;

const ECEF_REFERENCE = {
  crs: "EPSG:4978",
  heightType: "ellipsoidal",
  epochTransformation: null,
} as const;

export interface Gcg2016UtmVerticalTransformer extends LazyGcg2016Transformer {
  readonly sourceReference: typeof UTM_DHHN2016_REFERENCE;
  readonly targetReference: typeof UTM_ELLIPSOIDAL_REFERENCE;
  init(
    coordinates: Coordinates.ETRS89UTM | readonly Coordinates.ETRS89UTM[],
    tileRadius?: number
  ): Promise<void>;
  forward(
    coordinate: Coordinates.ETRS89UTM,
    height: Altitude.DHHN2016Meters
  ): Promise<Altitude.EllipsoidalWGS84Meters>;
  inverse(
    coordinate: Coordinates.ETRS89UTM,
    height: Altitude.EllipsoidalWGS84Meters
  ): Promise<Altitude.DHHN2016Meters>;
  forwardBatch(
    coordinates: readonly Coordinates.ETRS89UTM[],
    heights: readonly Altitude.DHHN2016Meters[]
  ): Promise<Altitude.EllipsoidalWGS84Meters[]>;
  inverseBatch(
    coordinates: readonly Coordinates.ETRS89UTM[],
    heights: readonly Altitude.EllipsoidalWGS84Meters[]
  ): Promise<Altitude.DHHN2016Meters[]>;
}

export interface Gcg2016Wgs84VerticalTransformer
  extends LazyGcg2016Transformer {
  readonly sourceReference: typeof WGS84_DHHN2016_REFERENCE;
  readonly targetReference: typeof WGS84_ELLIPSOIDAL_REFERENCE;
  init(
    coordinates: LngLatArray.deg | readonly LngLatArray.deg[],
    tileRadius?: number
  ): Promise<void>;
  forward(
    coordinate: LngLatArray.deg,
    height: Altitude.DHHN2016Meters
  ): Promise<Altitude.EllipsoidalWGS84Meters>;
  inverse(
    coordinate: LngLatArray.deg,
    height: Altitude.EllipsoidalWGS84Meters
  ): Promise<Altitude.DHHN2016Meters>;
  forwardBatch(
    coordinates: readonly LngLatArray.deg[],
    heights: readonly Altitude.DHHN2016Meters[]
  ): Promise<Altitude.EllipsoidalWGS84Meters[]>;
  inverseBatch(
    coordinates: readonly LngLatArray.deg[],
    heights: readonly Altitude.EllipsoidalWGS84Meters[]
  ): Promise<Altitude.DHHN2016Meters[]>;
}

export interface Gcg2016EcefTransformer extends LazyGcg2016Transformer {
  readonly sourceReference: typeof UTM_DHHN2016_REFERENCE;
  readonly targetReference: typeof ECEF_REFERENCE;
  init(
    coordinates: Coordinates.ETRS89UTM | readonly Coordinates.ETRS89UTM[],
    tileRadius?: number
  ): Promise<void>;
  forward(
    coordinate: Coordinates.ETRS89UTM,
    height: Altitude.DHHN2016Meters
  ): Promise<MetricVector3>;
  inverse(
    coordinate: MetricVector3,
    zone: Gcg2016UtmZone
  ): Promise<{
    coordinate: Coordinates.ETRS89UTM;
    height: Altitude.DHHN2016Meters;
  }>;
  forwardBatch(
    coordinates: readonly Coordinates.ETRS89UTM[],
    heights: readonly Altitude.DHHN2016Meters[]
  ): Promise<MetricVector3[]>;
  inverseBatch(
    coordinates: readonly MetricVector3[],
    zones: readonly Gcg2016UtmZone[]
  ): Promise<
    {
      coordinate: Coordinates.ETRS89UTM;
      height: Altitude.DHHN2016Meters;
    }[]
  >;
}

type UtmConverter = {
  forward(coordinates: number[]): number[];
  inverse(coordinates: number[]): number[];
};

const utmConverterCache = new Map<Gcg2016UtmZone, UtmConverter>();

const assertGcg2016UtmZone: (
  zone: ETRS89UTMZone
) => asserts zone is Gcg2016UtmZone = (zone) => {
  if (!GCG2016_UTM_ZONES.includes(zone as Gcg2016UtmZone)) {
    throw new RangeError(
      `GCG2016 is not defined for ETRS89 / UTM zone ${zone}; expected zone 31, 32, or 33`
    );
  }
};

const getUtmConverter = (zone: ETRS89UTMZone) => {
  assertGcg2016UtmZone(zone);
  const cached = utmConverterCache.get(zone);
  if (cached) return cached;

  const converter = proj4(
    "EPSG:4326",
    `+proj=utm +zone=${zone} +ellps=GRS80 +units=m +no_defs`
  ) as UtmConverter;
  utmConverterCache.set(zone, converter);
  return converter;
};

const utmToGeographic = ({
  east,
  north,
  zone,
}: Coordinates.ETRS89UTM): LngLatArray.deg => {
  const [longitude, latitude] = getUtmConverter(zone).inverse([east, north]);
  return [longitude as Longitude.deg, latitude as Latitude.deg];
};

const geographicToUtm = (
  [longitude, latitude]: LngLatArray.deg,
  zone: Gcg2016UtmZone
): Coordinates.ETRS89UTM => {
  const [east, north] = getUtmConverter(zone).forward([longitude, latitude]);
  return {
    east: east as Coordinates.ETRS89UTMEastingMeters,
    north: north as Coordinates.ETRS89UTMNorthingMeters,
    zone,
  };
};

const isSingleGeographicCoordinate = (
  coordinates: LngLatArray.deg | readonly LngLatArray.deg[]
): coordinates is LngLatArray.deg => typeof coordinates[0] === "number";

const initGeographicCoordinates = async (
  coordinates: LngLatArray.deg | readonly LngLatArray.deg[],
  tileRadius = 0
) => {
  const coordinateList = isSingleGeographicCoordinate(coordinates)
    ? [coordinates]
    : coordinates;
  await Promise.all(
    coordinateList.map(([longitude, latitude]) =>
      gcg2016Model.prefetch(longitude, latitude, tileRadius)
    )
  );
};

const initUtmCoordinates = (
  coordinates: Coordinates.ETRS89UTM | readonly Coordinates.ETRS89UTM[],
  tileRadius = 0
) => {
  const coordinateList = Array.isArray(coordinates)
    ? coordinates
    : [coordinates];
  return initGeographicCoordinates(
    coordinateList.map(utmToGeographic),
    tileRadius
  );
};

export const getGcg2016UndulationFromUtm = (
  coordinate: Coordinates.ETRS89UTM
) => {
  const [longitude, latitude] = utmToGeographic(coordinate);
  return getGcg2016Undulation(longitude, latitude);
};

export const dhhn2016ToEllipsoidalHeight = async (
  coordinate: Coordinates.ETRS89UTM,
  dhhn2016Height: Altitude.DHHN2016Meters
) =>
  (dhhn2016Height +
    (await getGcg2016UndulationFromUtm(
      coordinate
    ))) as Altitude.EllipsoidalWGS84Meters;

export const ellipsoidalToDhhn2016Height = async (
  coordinate: Coordinates.ETRS89UTM,
  ellipsoidalHeight: Altitude.EllipsoidalWGS84Meters
) =>
  (ellipsoidalHeight -
    (await getGcg2016UndulationFromUtm(coordinate))) as Altitude.DHHN2016Meters;

const assertMatchingLengths = (
  coordinates: readonly unknown[],
  heights: readonly unknown[]
) => {
  if (coordinates.length !== heights.length) {
    throw new RangeError(
      `Coordinate and height counts differ: ${coordinates.length} !== ${heights.length}`
    );
  }
};

const transformUtmHeights = async (
  coordinates: readonly Coordinates.ETRS89UTM[],
  heights: readonly Meters[],
  undulationFactor: 1 | -1
) => {
  assertMatchingLengths(coordinates, heights);
  const geographicCoordinates = coordinates.map(utmToGeographic);
  const undulations = await getGcg2016Undulations(geographicCoordinates);
  return heights.map(
    (height, index) =>
      (height + undulationFactor * undulations[index]) as Meters
  );
};

export const dhhn2016ToEllipsoidalHeights = async (
  coordinates: readonly Coordinates.ETRS89UTM[],
  heights: readonly Altitude.DHHN2016Meters[]
) =>
  (await transformUtmHeights(
    coordinates,
    heights,
    1
  )) as Altitude.EllipsoidalWGS84Meters[];

export const ellipsoidalToDhhn2016Heights = async (
  coordinates: readonly Coordinates.ETRS89UTM[],
  heights: readonly Altitude.EllipsoidalWGS84Meters[]
) =>
  (await transformUtmHeights(
    coordinates,
    heights,
    -1
  )) as Altitude.DHHN2016Meters[];

const transformWgs84Heights = async (
  coordinates: readonly LngLatArray.deg[],
  heights: readonly Meters[],
  undulationFactor: 1 | -1
) => {
  assertMatchingLengths(coordinates, heights);
  const undulations = await getGcg2016Undulations(coordinates);
  return heights.map(
    (height, index) =>
      (height + undulationFactor * undulations[index]) as Meters
  );
};

const utmVerticalTransformer: Gcg2016UtmVerticalTransformer = {
  sourceReference: UTM_DHHN2016_REFERENCE,
  targetReference: UTM_ELLIPSOIDAL_REFERENCE,
  init: initUtmCoordinates,
  forward: dhhn2016ToEllipsoidalHeight,
  inverse: ellipsoidalToDhhn2016Height,
  forwardBatch: dhhn2016ToEllipsoidalHeights,
  inverseBatch: ellipsoidalToDhhn2016Heights,
  clearCache() {
    gcg2016Model.clearCache();
  },
  get cachedTileCount() {
    return gcg2016Model.cachedTileCount;
  },
};

const wgs84VerticalTransformer: Gcg2016Wgs84VerticalTransformer = {
  sourceReference: WGS84_DHHN2016_REFERENCE,
  targetReference: WGS84_ELLIPSOIDAL_REFERENCE,
  init: initGeographicCoordinates,
  async forward(coordinate, height) {
    return (
      await transformWgs84Heights([coordinate], [height], 1)
    )[0] as Altitude.EllipsoidalWGS84Meters;
  },
  async inverse(coordinate, height) {
    return (
      await transformWgs84Heights([coordinate], [height], -1)
    )[0] as Altitude.DHHN2016Meters;
  },
  async forwardBatch(coordinates, heights) {
    return (await transformWgs84Heights(
      coordinates,
      heights,
      1
    )) as Altitude.EllipsoidalWGS84Meters[];
  },
  async inverseBatch(coordinates, heights) {
    return (await transformWgs84Heights(
      coordinates,
      heights,
      -1
    )) as Altitude.DHHN2016Meters[];
  },
  clearCache() {
    gcg2016Model.clearCache();
  },
  get cachedTileCount() {
    return gcg2016Model.cachedTileCount;
  },
};

const ecefTransformer: Gcg2016EcefTransformer = {
  sourceReference: UTM_DHHN2016_REFERENCE,
  targetReference: ECEF_REFERENCE,
  init: initUtmCoordinates,
  async forward(coordinate, dhhn2016Height) {
    const [longitude, latitude] = utmToGeographic(coordinate);
    const ellipsoidalHeight =
      dhhn2016Height + (await getGcg2016Undulation(longitude, latitude));
    const [x, y, z] = getFromWGS84ToEcef([
      longitude,
      latitude,
      ellipsoidalHeight as Altitude.GenericMeters,
    ]);
    return { x: x as Meters, y: y as Meters, z: z as Meters };
  },
  async inverse({ x, y, z }, zone) {
    const [longitude, latitude, ellipsoidalHeight] = getFromEcefToWGS84([
      x,
      y,
      z,
    ]);
    const coordinate = geographicToUtm([longitude, latitude], zone);
    const height = (ellipsoidalHeight -
      (await getGcg2016Undulation(
        longitude,
        latitude
      ))) as Altitude.DHHN2016Meters;
    return { coordinate, height };
  },
  async forwardBatch(coordinates, heights) {
    assertMatchingLengths(coordinates, heights);
    return Promise.all(
      coordinates.map((coordinate, index) =>
        ecefTransformer.forward(coordinate, heights[index])
      )
    );
  },
  async inverseBatch(coordinates, zones) {
    assertMatchingLengths(coordinates, zones);
    return Promise.all(
      coordinates.map((coordinate, index) =>
        ecefTransformer.inverse(coordinate, zones[index])
      )
    );
  },
  clearCache() {
    gcg2016Model.clearCache();
  },
  get cachedTileCount() {
    return gcg2016Model.cachedTileCount;
  },
};

export const getGcg2016UtmVerticalTransformer = () => utmVerticalTransformer;
export const getGcg2016Wgs84VerticalTransformer = () =>
  wgs84VerticalTransformer;
export const getGcg2016EcefTransformer = () => ecefTransformer;
