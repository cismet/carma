import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

import {
  getCarmaConf3D,
  getCarmaConf3DClippingPolygonRing,
  type AdhocFeature,
  type CarmaConf3D,
  type CarmaMapLibreFeatureProperties,
  type CarmaMapLibreStyleData,
} from "@carma-appframeworks/portals";

export type AdhocModelPositionField = "lon" | "lat" | "height" | "heading";
export type AdhocModelPosition = Record<AdhocModelPositionField, number>;
export type AdhocModelPositionInputs = Record<AdhocModelPositionField, string>;
type CarmaConf3DUpdater = (carmaConf3D: CarmaConf3D) => CarmaConf3D;

export const EMPTY_ADHOC_MODEL_POSITION_INPUTS: AdhocModelPositionInputs = {
  lon: "",
  lat: "",
  height: "",
  heading: "",
};

const isGeoJsonSource = (
  source: unknown
): source is GeoJSONSourceSpecification =>
  typeof source === "object" &&
  source !== null &&
  (source as { type?: unknown }).type === "geojson";

const isGeoJsonFeatureData = (
  data: GeoJSONSourceSpecification["data"]
): data is Feature | FeatureCollection =>
  typeof data === "object" &&
  data !== null &&
  ((data as { type?: unknown }).type === "Feature" ||
    (data as { type?: unknown }).type === "FeatureCollection");

export const getAdhocFeatureModelPosition = (
  feature: AdhocFeature | null | undefined
): AdhocModelPosition | null => {
  if (!feature) {
    return null;
  }

  const model = getCarmaConf3D(feature)?.model;
  if (!model) {
    return null;
  }

  return {
    lon: model.position.lon,
    lat: model.position.lat,
    height: model.position.height ?? 0,
    heading: model.heading ?? 0,
  };
};

export const getAdhocFeatureClippingEnabled = (
  feature: AdhocFeature | null | undefined
): boolean | null => {
  if (!feature) {
    return null;
  }

  const clippingPolygon = getCarmaConf3D(feature)?.clippingPolygon;
  return getCarmaConf3DClippingPolygonRing(clippingPolygon)
    ? clippingPolygon?.enabled !== false
    : null;
};

export const parseFiniteNumber = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatAdhocModelPositionInputs = (
  position: AdhocModelPosition | null
): AdhocModelPositionInputs =>
  position
    ? {
        lon: position.lon.toString(),
        lat: position.lat.toString(),
        height: position.height.toString(),
        heading: position.heading.toFixed(2),
      }
    : EMPTY_ADHOC_MODEL_POSITION_INPUTS;

const updateCarmaConf3DInProperties = (
  properties: CarmaMapLibreFeatureProperties,
  updater: CarmaConf3DUpdater
): CarmaMapLibreFeatureProperties => {
  if (!properties.carmaConf3D) {
    return properties;
  }

  const nextCarmaConf3D = updater(properties.carmaConf3D);
  if (nextCarmaConf3D === properties.carmaConf3D) {
    return properties;
  }

  return {
    ...properties,
    carmaConf3D: nextCarmaConf3D,
  };
};

const updateGeoJsonFeatureCarmaConf3D = (
  feature: Feature,
  updater: CarmaConf3DUpdater
): Feature => {
  const properties =
    (feature.properties as CarmaMapLibreFeatureProperties | undefined) ?? {};
  const nextProperties = updateCarmaConf3DInProperties(properties, updater);
  return nextProperties === properties
    ? feature
    : {
        ...feature,
        properties: nextProperties,
      };
};

const updateMapLibreStyleFeatureCarmaConf3D = (
  feature: AdhocFeature,
  updater: CarmaConf3DUpdater
): AdhocFeature => {
  if (feature.kind !== "maplibre-style") {
    return feature;
  }

  const properties =
    (feature.properties as CarmaMapLibreFeatureProperties | undefined) ?? {};
  const nextProperties = updateCarmaConf3DInProperties(properties, updater);
  let didChange = nextProperties !== properties;

  const styleData = feature.data as CarmaMapLibreStyleData;
  const nextSources = Object.fromEntries(
    Object.entries(styleData.sources ?? {}).map(([sourceKey, source]) => {
      if (!isGeoJsonSource(source) || !source.data) {
        return [sourceKey, source];
      }

      if (!isGeoJsonFeatureData(source.data)) {
        return [sourceKey, source];
      }

      const geojson = source.data;
      if (geojson.type === "FeatureCollection") {
        const firstFeature = geojson.features[0];
        if (!firstFeature) {
          return [sourceKey, source];
        }
        const nextFirstFeature = updateGeoJsonFeatureCarmaConf3D(
          firstFeature,
          updater
        );
        if (nextFirstFeature === firstFeature) {
          return [sourceKey, source];
        }
        didChange = true;
        return [
          sourceKey,
          {
            ...source,
            data: {
              ...geojson,
              features: [nextFirstFeature, ...geojson.features.slice(1)],
            },
          },
        ];
      }

      const nextGeojson = updateGeoJsonFeatureCarmaConf3D(geojson, updater);
      if (nextGeojson === geojson) {
        return [sourceKey, source];
      }
      didChange = true;
      return [
        sourceKey,
        {
          ...source,
          data: nextGeojson,
        },
      ];
    })
  );

  if (!didChange) {
    return feature;
  }

  return {
    ...feature,
    properties: nextProperties as AdhocFeature["properties"],
    data: {
      ...styleData,
      sources: nextSources as CarmaMapLibreStyleData["sources"],
    },
  };
};

export const updateMapLibreStyleFeatureModelPosition = (
  feature: AdhocFeature,
  position: AdhocModelPosition
): AdhocFeature =>
  updateMapLibreStyleFeatureCarmaConf3D(feature, (carmaConf3D) => {
    const model = carmaConf3D.model;
    if (!model) {
      return carmaConf3D;
    }

    return {
      ...carmaConf3D,
      model: {
        ...model,
        position: {
          lon: position.lon,
          lat: position.lat,
          height: position.height,
        },
        heading: position.heading,
      },
    };
  });

export const toggleFeatureClipping = (
  feature: AdhocFeature,
  enabled: boolean
): AdhocFeature =>
  updateMapLibreStyleFeatureCarmaConf3D(feature, (carmaConf3D) => {
    const clippingPolygon = carmaConf3D.clippingPolygon;
    if (!clippingPolygon) {
      return carmaConf3D;
    }

    return {
      ...carmaConf3D,
      clippingPolygon: {
        ...clippingPolygon,
        enabled,
      },
    };
  });
