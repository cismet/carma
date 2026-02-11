import { BoundingSphere } from "@carma/cesium";
import type {
  CarmaConf3D,
  CarmaMapLibreFeatureProperties,
  FeatureInfo,
} from "@carma/types";
import { getBoundingSphereFromGeoJson } from "@carma-mapping/engines/cesium";
import type { Feature, FeatureCollection } from "geojson";

import type { AdhocFeature } from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getGeoJsonFromFeature,
} from "./adhoc-feature-utils";

export type SelectableGeoJsonFeature = {
  selectionId: string;
  geojson: Feature;
};

export const getCarmaConf3D = (
  feature: AdhocFeature
): CarmaConf3D | undefined => {
  const properties = feature.properties as
    | CarmaMapLibreFeatureProperties
    | undefined;
  if (properties?.carmaConf3D) {
    return properties.carmaConf3D;
  }

  const geojson = getGeoJsonFromFeature(feature);
  const geojsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geojsonProperties = geojsonFeature?.properties as
    | CarmaMapLibreFeatureProperties
    | undefined;
  return geojsonProperties?.carmaConf3D;
};

export const getWallHeights = (feature: AdhocFeature): number[] | undefined => {
  const metadata = feature.metadata;
  if (!metadata) return undefined;
  const wallHeights = metadata.wallHeights;
  if (Array.isArray(wallHeights)) {
    return wallHeights as number[];
  }
  return undefined;
};

export const normalizeCarmaConf3D = (feature: AdhocFeature): CarmaConf3D => {
  const carmaConf3D = getCarmaConf3D(feature);

  if (!carmaConf3D) {
    return { wall: { height: 20 }, groundPolygon: true };
  }

  return {
    ...carmaConf3D,
    wall:
      carmaConf3D.wall === undefined
        ? false
        : carmaConf3D.wall === true
        ? { height: 20 }
        : carmaConf3D.wall,
    groundPolygon:
      carmaConf3D.groundPolygon === undefined
        ? true
        : carmaConf3D.groundPolygon,
  };
};

export const isRehydratedFeature = (feature: AdhocFeature): boolean => {
  const metadata = feature.metadata as { rehydrated?: boolean } | undefined;
  return Boolean(metadata?.rehydrated);
};

export const getModelConfig = (feature: AdhocFeature) => {
  const carmaConf3D = getCarmaConf3D(feature);
  return carmaConf3D?.model;
};

export const shouldShowFootprintIn3d = (feature: AdhocFeature): boolean => {
  const modelConfig = getModelConfig(feature);
  return modelConfig?.showFootprintIn3d !== false;
};

export const getModelProperties = (
  feature: AdhocFeature
): FeatureInfo["properties"] => {
  const metadataTitle =
    typeof feature.metadata?.title === "string"
      ? feature.metadata?.title
      : undefined;
  const fallbackTitle = metadataTitle ?? feature.id;
  const geojson = getGeoJsonFromFeature(feature);
  const geojsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geojsonProperties = geojsonFeature?.properties as
    | FeatureInfo["properties"]
    | undefined;
  const baseProperties = feature.properties ??
    geojsonProperties ?? { title: fallbackTitle };
  const title =
    typeof baseProperties.title === "string"
      ? baseProperties.title
      : fallbackTitle;
  return {
    ...baseProperties,
    title,
  };
};

export const getGeojsonBoundingSphere = (
  feature: AdhocFeature
): BoundingSphere | null => {
  const geojson =
    (feature.metadata?.flyToGeoJson as
      | Feature
      | FeatureCollection
      | undefined) ?? getGeoJsonFromFeature(feature);
  if (!geojson) return null;
  return getBoundingSphereFromGeoJson(geojson);
};

export const getFeatureMetadataBoundingSphere = (
  feature: AdhocFeature
): BoundingSphere | null => {
  const candidate = feature.metadata?.flyToBoundingSphere;
  return candidate instanceof BoundingSphere ? candidate : null;
};

const getGeoJsonFeatureKey = (
  geojsonFeature: Feature,
  featureIndex: number
): string => {
  const id = geojsonFeature.id;
  if (typeof id === "string" || typeof id === "number") {
    return `id:${String(id)}`;
  }

  const propertiesId = (geojsonFeature.properties as { id?: unknown } | null)
    ?.id;
  if (typeof propertiesId === "string" || typeof propertiesId === "number") {
    return `id:${String(propertiesId)}`;
  }

  return `index:${featureIndex}`;
};

export const extractSelectableGeoJsonFeatures = (
  id: string,
  geojson: Feature | FeatureCollection
): SelectableGeoJsonFeature[] => {
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  const selectionIdCounts = new Map<string, number>();

  return features.flatMap((geojsonFeature, featureIndex) => {
    if (!geojsonFeature?.geometry) return [];
    const geoJsonFeatureKey = getGeoJsonFeatureKey(
      geojsonFeature,
      featureIndex
    );
    const baseSelectionId = `${id}::${geoJsonFeatureKey}`;
    const count = selectionIdCounts.get(baseSelectionId) ?? 0;
    selectionIdCounts.set(baseSelectionId, count + 1);

    const selectionId =
      count === 0 ? baseSelectionId : `${baseSelectionId}::dup:${count}`;

    return [
      {
        selectionId,
        geojson: geojsonFeature,
      },
    ];
  });
};

export const toSelectionIdSet = (
  id: string,
  geojson: Feature | FeatureCollection
): Set<string> =>
  new Set(
    extractSelectableGeoJsonFeatures(id, geojson).map(
      (geoJsonFeature) => geoJsonFeature.selectionId
    )
  );

export const areEqualStringSets = (
  left: Set<string>,
  right: Set<string>
): boolean => {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
};

const getGeoJsonForSelection = (
  feature: AdhocFeature
): Feature | FeatureCollection | null =>
  (feature.metadata?.flyToGeoJson as Feature | FeatureCollection | undefined) ??
  getGeoJsonFromFeature(feature);

const getSelectableGeoJsonFeature = (
  feature: AdhocFeature,
  selectionId: string | null
): Feature | null => {
  if (!selectionId) return null;
  const geojson = getGeoJsonForSelection(feature);
  if (!geojson) return null;
  const match = extractSelectableGeoJsonFeatures(feature.id, geojson).find(
    (geoJsonFeature) => geoJsonFeature.selectionId === selectionId
  );
  return match?.geojson ?? null;
};

export const buildAdhocFeatureInfoForSelection = (
  feature: AdhocFeature,
  selectionId: string | null
): FeatureInfo | null => {
  const selectedGeoJsonFeature = getSelectableGeoJsonFeature(
    feature,
    selectionId
  );
  if (!selectedGeoJsonFeature) {
    return buildAdhocFeatureInfo(feature);
  }
  return buildAdhocFeatureInfo(feature, {
    geojsonFeature: selectedGeoJsonFeature,
  });
};
