import {
  gcg2016Model,
  getGcg2016Undulation,
  getGcg2016Undulations,
} from "./gcg2016";
import {
  getFromEcefToWGS84,
  getFromUTM32ToWGS84,
  getFromWGS84ToEcef,
  getFromWGS84ToUTM32,
} from "./proj4";

export interface Utm32HeightInput {
  easting: number;
  northing: number;
  height: number;
}

export type Utm32HorizontalCoordinate = readonly [
  easting: number,
  northing: number
];
export type Utm32HeightCoordinate = readonly [
  easting: number,
  northing: number,
  height: number
];
export type Wgs84HorizontalCoordinate = readonly [
  longitudeDegrees: number,
  latitudeDegrees: number
];
export type Wgs84HeightCoordinate = readonly [
  longitudeDegrees: number,
  latitudeDegrees: number,
  height: number
];
export type EcefCoordinate = readonly [x: number, y: number, z: number];

interface LazyGcg2016Transformer {
  clearCache(): void;
  readonly cachedTileCount: number;
}

export interface Gcg2016Utm32VerticalTransformer
  extends LazyGcg2016Transformer {
  readonly sourceReference: typeof UTM32_DHHN2016_REFERENCE;
  readonly targetReference: typeof UTM32_ELLIPSOIDAL_REFERENCE;
  init(
    coordinates:
      | Utm32HorizontalCoordinate
      | readonly Utm32HorizontalCoordinate[],
    tileRadius?: number
  ): Promise<void>;
  forward(coordinate: Utm32HeightCoordinate): Promise<Utm32HeightCoordinate>;
  inverse(coordinate: Utm32HeightCoordinate): Promise<Utm32HeightCoordinate>;
  forwardBatch(
    coordinates: readonly Utm32HeightCoordinate[]
  ): Promise<Utm32HeightCoordinate[]>;
  inverseBatch(
    coordinates: readonly Utm32HeightCoordinate[]
  ): Promise<Utm32HeightCoordinate[]>;
}

export interface Gcg2016Wgs84VerticalTransformer
  extends LazyGcg2016Transformer {
  readonly sourceReference: typeof WGS84_DHHN2016_REFERENCE;
  readonly targetReference: typeof WGS84_ELLIPSOIDAL_REFERENCE;
  init(
    coordinates:
      | Wgs84HorizontalCoordinate
      | readonly Wgs84HorizontalCoordinate[],
    tileRadius?: number
  ): Promise<void>;
  forward(coordinate: Wgs84HeightCoordinate): Promise<Wgs84HeightCoordinate>;
  inverse(coordinate: Wgs84HeightCoordinate): Promise<Wgs84HeightCoordinate>;
  forwardBatch(
    coordinates: readonly Wgs84HeightCoordinate[]
  ): Promise<Wgs84HeightCoordinate[]>;
  inverseBatch(
    coordinates: readonly Wgs84HeightCoordinate[]
  ): Promise<Wgs84HeightCoordinate[]>;
}

export interface Gcg2016EcefTransformer extends LazyGcg2016Transformer {
  readonly sourceReference: typeof UTM32_DHHN2016_REFERENCE;
  readonly targetReference: typeof ECEF_REFERENCE;
  init(
    coordinates:
      | Utm32HorizontalCoordinate
      | readonly Utm32HorizontalCoordinate[],
    tileRadius?: number
  ): Promise<void>;
  forward(coordinate: Utm32HeightCoordinate): Promise<EcefCoordinate>;
  inverse(coordinate: EcefCoordinate): Promise<Utm32HeightCoordinate>;
  forwardBatch(
    coordinates: readonly Utm32HeightCoordinate[]
  ): Promise<EcefCoordinate[]>;
  inverseBatch(
    coordinates: readonly EcefCoordinate[]
  ): Promise<Utm32HeightCoordinate[]>;
}

const UTM32_DHHN2016_REFERENCE = {
  horizontalCrs: "EPSG:25832",
  verticalCrs: "EPSG:7837",
  compoundCrs: "EPSG:25832+7837",
  heightType: "DHHN2016",
} as const;

const UTM32_ELLIPSOIDAL_REFERENCE = {
  horizontalCrs: "EPSG:25832",
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

const isSingleCoordinate = (
  coordinates: readonly number[] | readonly (readonly number[])[]
): coordinates is readonly number[] => typeof coordinates[0] === "number";

const initGeographicCoordinates = async (
  coordinates: Wgs84HorizontalCoordinate | readonly Wgs84HorizontalCoordinate[],
  tileRadius = 0
) => {
  const coordinateList = isSingleCoordinate(coordinates)
    ? [coordinates as Wgs84HorizontalCoordinate]
    : coordinates;
  await Promise.all(
    coordinateList.map(([longitude, latitude]) =>
      gcg2016Model.prefetch(longitude, latitude, tileRadius)
    )
  );
};

const utm32ToGeographic = ([
  easting,
  northing,
]: Utm32HorizontalCoordinate): Wgs84HorizontalCoordinate => {
  const [longitude, latitude] = getFromUTM32ToWGS84([easting, northing]);
  return [longitude, latitude];
};

const geographicToUtm32 = ([
  longitude,
  latitude,
]: Wgs84HorizontalCoordinate): Utm32HorizontalCoordinate => {
  const [easting, northing] = getFromWGS84ToUTM32([
    longitude,
    latitude,
  ] as Parameters<typeof getFromWGS84ToUTM32>[0]);
  return [easting, northing];
};

const initUtm32Coordinates = (
  coordinates: Utm32HorizontalCoordinate | readonly Utm32HorizontalCoordinate[],
  tileRadius = 0
) => {
  const coordinateList = isSingleCoordinate(coordinates)
    ? [coordinates as Utm32HorizontalCoordinate]
    : coordinates;
  return initGeographicCoordinates(
    coordinateList.map(utm32ToGeographic),
    tileRadius
  );
};

export const getGcg2016UndulationFromUtm32 = (
  easting: number,
  northing: number
) => {
  const [longitude, latitude] = utm32ToGeographic([easting, northing]);
  return getGcg2016Undulation(longitude, latitude);
};

export const dhhn2016ToEllipsoidalHeight = async (
  easting: number,
  northing: number,
  dhhn2016Height: number
) => dhhn2016Height + (await getGcg2016UndulationFromUtm32(easting, northing));

export const ellipsoidalToDhhn2016Height = async (
  easting: number,
  northing: number,
  ellipsoidalHeight: number
) =>
  ellipsoidalHeight - (await getGcg2016UndulationFromUtm32(easting, northing));

const transformUtm32Heights = async (
  coordinates: readonly Utm32HeightInput[],
  undulationFactor: 1 | -1
) => {
  const geographicCoordinates = coordinates.map(({ easting, northing }) => {
    const [longitude, latitude] = utm32ToGeographic([easting, northing]);
    return { longitude, latitude };
  });
  const undulations = await getGcg2016Undulations(geographicCoordinates);
  return coordinates.map(
    ({ height }, index) => height + undulationFactor * undulations[index]
  );
};

export const dhhn2016ToEllipsoidalHeights = (
  coordinates: readonly Utm32HeightInput[]
) => transformUtm32Heights(coordinates, 1);

export const ellipsoidalToDhhn2016Heights = (
  coordinates: readonly Utm32HeightInput[]
) => transformUtm32Heights(coordinates, -1);

const transformWgs84Heights = async (
  coordinates: readonly Wgs84HeightCoordinate[],
  undulationFactor: 1 | -1
): Promise<Wgs84HeightCoordinate[]> => {
  const undulations = await getGcg2016Undulations(
    coordinates.map(([longitude, latitude]) => ({ longitude, latitude }))
  );
  return coordinates.map(([longitude, latitude, height], index) => [
    longitude,
    latitude,
    height + undulationFactor * undulations[index],
  ]);
};

const utm32VerticalTransformer: Gcg2016Utm32VerticalTransformer = {
  sourceReference: UTM32_DHHN2016_REFERENCE,
  targetReference: UTM32_ELLIPSOIDAL_REFERENCE,
  init: initUtm32Coordinates,
  async forward([easting, northing, height]) {
    return [
      easting,
      northing,
      await dhhn2016ToEllipsoidalHeight(easting, northing, height),
    ];
  },
  async inverse([easting, northing, height]) {
    return [
      easting,
      northing,
      await ellipsoidalToDhhn2016Height(easting, northing, height),
    ];
  },
  async forwardBatch(coordinates) {
    const heights = await dhhn2016ToEllipsoidalHeights(
      coordinates.map(([easting, northing, height]) => ({
        easting,
        northing,
        height,
      }))
    );
    return coordinates.map(([easting, northing], index) => [
      easting,
      northing,
      heights[index],
    ]);
  },
  async inverseBatch(coordinates) {
    const heights = await ellipsoidalToDhhn2016Heights(
      coordinates.map(([easting, northing, height]) => ({
        easting,
        northing,
        height,
      }))
    );
    return coordinates.map(([easting, northing], index) => [
      easting,
      northing,
      heights[index],
    ]);
  },
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
  async forward(coordinate) {
    return (await transformWgs84Heights([coordinate], 1))[0];
  },
  async inverse(coordinate) {
    return (await transformWgs84Heights([coordinate], -1))[0];
  },
  forwardBatch(coordinates) {
    return transformWgs84Heights(coordinates, 1);
  },
  inverseBatch(coordinates) {
    return transformWgs84Heights(coordinates, -1);
  },
  clearCache() {
    gcg2016Model.clearCache();
  },
  get cachedTileCount() {
    return gcg2016Model.cachedTileCount;
  },
};

const ecefTransformer: Gcg2016EcefTransformer = {
  sourceReference: UTM32_DHHN2016_REFERENCE,
  targetReference: ECEF_REFERENCE,
  init: initUtm32Coordinates,
  async forward([easting, northing, dhhn2016Height]) {
    const [longitude, latitude] = utm32ToGeographic([easting, northing]);
    const ellipsoidalHeight =
      dhhn2016Height + (await getGcg2016Undulation(longitude, latitude));
    const [x, y, z] = getFromWGS84ToEcef([
      longitude,
      latitude,
      ellipsoidalHeight,
    ] as Parameters<typeof getFromWGS84ToEcef>[0]);
    return [x, y, z];
  },
  async inverse([x, y, z]) {
    const [longitude, latitude, ellipsoidalHeight] = getFromEcefToWGS84([
      x,
      y,
      z,
    ]);
    const [easting, northing] = geographicToUtm32([longitude, latitude]);
    const dhhn2016Height =
      ellipsoidalHeight - (await getGcg2016Undulation(longitude, latitude));
    return [easting, northing, dhhn2016Height];
  },
  forwardBatch(coordinates) {
    return Promise.all(
      coordinates.map((coordinate) => ecefTransformer.forward(coordinate))
    );
  },
  inverseBatch(coordinates) {
    return Promise.all(
      coordinates.map((coordinate) => ecefTransformer.inverse(coordinate))
    );
  },
  clearCache() {
    gcg2016Model.clearCache();
  },
  get cachedTileCount() {
    return gcg2016Model.cachedTileCount;
  },
};

export const getGcg2016Utm32VerticalTransformer = () =>
  utm32VerticalTransformer;
export const getGcg2016Wgs84VerticalTransformer = () =>
  wgs84VerticalTransformer;
export const getGcg2016EcefTransformer = () => ecefTransformer;
