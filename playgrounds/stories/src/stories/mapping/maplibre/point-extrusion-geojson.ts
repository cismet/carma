const METERS_PER_DEGREE_LATITUDE = 111_320;
const DEFAULT_POLYGON_SEGMENTS = 32;

export type PointExtrusionRenderPath =
  | "maplibre-native-fill-extrusion"
  | "maplibre-custom-layer";

export type PointExtrusionProperties = {
  id: string;
  name: string;
  renderPath: PointExtrusionRenderPath;
  centerLongitude: number;
  centerLatitude: number;
  offsetEastMeters?: number;
  offsetNorthMeters?: number;
  radiusMeters: number;
  topRadiusMeters?: number;
  radiusTransitionFraction?: number;
  referenceAnnotationIds?: readonly string[];
  "fill-extrusion-base": number;
  "fill-extrusion-height": number;
  "fill-extrusion-color": string;
  "fill-extrusion-opacity": number;
  "fill-extrusion-vertical-gradient": boolean;
};

type PointExtrusionSourceProperties = Omit<
  PointExtrusionProperties,
  "centerLongitude" | "centerLatitude"
> &
  Partial<Pick<PointExtrusionProperties, "centerLongitude" | "centerLatitude">>;

export type PointExtrusionFeature = GeoJSON.Feature<
  GeoJSON.Point,
  PointExtrusionProperties
>;

export type PointExtrusionFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PointExtrusionProperties
>;

export type PointExtrusionPolygonFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  PointExtrusionProperties
>;

export type PointExtrusionDefaults = {
  longitude: number;
  latitude: number;
  diameterMeters: number;
  extrusionHeightMeters: number;
  fixedFloorAltitudeMeters: number;
};

type CreatePointExtrusionGeoJsonOptions = {
  diameterMeters?: number;
  extrusionHeightMeters?: number;
};

const finiteNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const offsetLngLat = ({
  longitude,
  latitude,
  eastMeters,
  northMeters,
}: {
  longitude: number;
  latitude: number;
  eastMeters: number;
  northMeters: number;
}): [number, number] => {
  const offsetLatitude = latitude + northMeters / METERS_PER_DEGREE_LATITUDE;
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((offsetLatitude / 180) * Math.PI);
  const offsetLongitude = longitude + eastMeters / metersPerDegreeLongitude;

  return [offsetLongitude, offsetLatitude];
};

const normalizeFeature = (
  feature: GeoJSON.Feature<GeoJSON.Point, PointExtrusionSourceProperties>
): PointExtrusionFeature => {
  const anchorLongitude = finiteNumber(
    feature.geometry.coordinates[0],
    feature.properties.centerLongitude ?? 0
  );
  const anchorLatitude = finiteNumber(
    feature.geometry.coordinates[1],
    feature.properties.centerLatitude ?? 0
  );
  const eastMeters = finiteNumber(feature.properties.offsetEastMeters, 0);
  const northMeters = finiteNumber(feature.properties.offsetNorthMeters, 0);
  const [centerLongitude, centerLatitude] =
    eastMeters !== 0 || northMeters !== 0
      ? offsetLngLat({
          longitude: anchorLongitude,
          latitude: anchorLatitude,
          eastMeters,
          northMeters,
        })
      : [anchorLongitude, anchorLatitude];

  return {
    ...feature,
    properties: {
      ...feature.properties,
      centerLongitude,
      centerLatitude,
    },
  };
};

export const parsePointExtrusionGeoJson = (
  rawGeoJson: string
): PointExtrusionFeatureCollection => {
  const data = JSON.parse(rawGeoJson) as GeoJSON.FeatureCollection<
    GeoJSON.Point,
    PointExtrusionSourceProperties
  >;

  return {
    ...data,
    features: data.features.map(normalizeFeature),
  };
};

export const findPointExtrusion = (
  data: PointExtrusionFeatureCollection,
  renderPath: PointExtrusionRenderPath
) =>
  data.features.find((feature) => feature.properties.renderPath === renderPath);

export const getPointExtrusionDefaults = (
  data: PointExtrusionFeatureCollection
): PointExtrusionDefaults => {
  const nativeFeature = findPointExtrusion(
    data,
    "maplibre-native-fill-extrusion"
  );
  const customFeature = findPointExtrusion(data, "maplibre-custom-layer");
  const fallbackFeature = nativeFeature ?? customFeature ?? data.features[0];
  const featureCount = data.features.length || 1;
  const center = data.features.reduce(
    (accumulator, feature) => ({
      longitude: accumulator.longitude + feature.properties.centerLongitude,
      latitude: accumulator.latitude + feature.properties.centerLatitude,
    }),
    { longitude: 0, latitude: 0 }
  );
  const baseMeters =
    customFeature?.properties["fill-extrusion-base"] ??
    fallbackFeature?.properties["fill-extrusion-base"] ??
    0;
  const topMeters =
    customFeature?.properties["fill-extrusion-height"] ??
    fallbackFeature?.properties["fill-extrusion-height"] ??
    baseMeters + 198;

  return {
    longitude: center.longitude / featureCount,
    latitude: center.latitude / featureCount,
    diameterMeters: (fallbackFeature?.properties.radiusMeters ?? 2.5) * 2,
    extrusionHeightMeters: Math.max(0.1, topMeters - baseMeters),
    fixedFloorAltitudeMeters: baseMeters || 200,
  };
};

export const createPointExtrusionGeoJson = (
  sourceData: PointExtrusionFeatureCollection,
  { diameterMeters, extrusionHeightMeters }: CreatePointExtrusionGeoJsonOptions
): PointExtrusionFeatureCollection => {
  const defaults = getPointExtrusionDefaults(sourceData);
  const data = cloneJson(sourceData);
  const resolvedRadiusMeters =
    finiteNumber(diameterMeters, defaults.diameterMeters) / 2;
  const resolvedExtrusionHeightMeters = finiteNumber(
    extrusionHeightMeters,
    defaults.extrusionHeightMeters
  );

  return {
    ...data,
    features: data.features.map((feature) => {
      const baseMeters = feature.properties["fill-extrusion-base"];
      const existingRadiusMeters = Math.max(
        0.1,
        feature.properties.radiusMeters
      );
      const topRadiusScale = feature.properties.topRadiusMeters
        ? Math.max(0.1, feature.properties.topRadiusMeters) /
          existingRadiusMeters
        : undefined;
      const topRadiusMeters =
        topRadiusScale === undefined
          ? undefined
          : resolvedRadiusMeters * topRadiusScale;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          radiusMeters: resolvedRadiusMeters,
          ...(topRadiusMeters === undefined ? {} : { topRadiusMeters }),
          "fill-extrusion-height": baseMeters + resolvedExtrusionHeightMeters,
        },
      };
    }),
  };
};

const createCirclePolygonCoordinates = ({
  longitude,
  latitude,
  radiusMeters,
  segments = DEFAULT_POLYGON_SEGMENTS,
}: {
  longitude: number;
  latitude: number;
  radiusMeters: number;
  segments?: number;
}): [number, number][] => {
  const coordinates = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return offsetLngLat({
      longitude,
      latitude,
      eastMeters: Math.cos(angle) * radiusMeters,
      northMeters: Math.sin(angle) * radiusMeters,
    });
  });

  return [...coordinates, coordinates[0]];
};

const toPolygonFeature = (
  feature: PointExtrusionFeature
): GeoJSON.Feature<GeoJSON.Polygon, PointExtrusionProperties> => ({
  ...feature,
  geometry: {
    type: "Polygon",
    coordinates: [
      createCirclePolygonCoordinates({
        longitude: feature.properties.centerLongitude,
        latitude: feature.properties.centerLatitude,
        radiusMeters: Math.max(0.1, feature.properties.radiusMeters),
      }),
    ],
  },
});

export const filterPointExtrusionsAsPolygons = (
  data: PointExtrusionFeatureCollection,
  renderPath: PointExtrusionRenderPath
): PointExtrusionPolygonFeatureCollection => ({
  type: "FeatureCollection",
  features: data.features
    .filter((feature) => feature.properties.renderPath === renderPath)
    .map(toPolygonFeature),
});

export const getPointExtrusionBaseMeters = (feature: PointExtrusionFeature) =>
  feature.properties["fill-extrusion-base"];

export const getPointExtrusionTopMeters = (feature: PointExtrusionFeature) =>
  feature.properties["fill-extrusion-height"];

export const getPointExtrusionRadiusMeters = (feature: PointExtrusionFeature) =>
  feature.properties.radiusMeters;

export const getPointExtrusionDiameterMeters = (
  feature: PointExtrusionFeature
) => feature.properties.radiusMeters * 2;

export const getPointExtrusionTopRadiusMeters = (
  feature: PointExtrusionFeature
) => feature.properties.topRadiusMeters ?? feature.properties.radiusMeters;

export const getPointExtrusionRadiusTransitionFraction = (
  feature: PointExtrusionFeature
) =>
  Math.min(
    1,
    Math.max(0, finiteNumber(feature.properties.radiusTransitionFraction, 1))
  );

export const getPointExtrusionColor = (feature: PointExtrusionFeature) =>
  feature.properties["fill-extrusion-color"];

export const getPointExtrusionOpacity = (feature: PointExtrusionFeature) =>
  feature.properties["fill-extrusion-opacity"];
