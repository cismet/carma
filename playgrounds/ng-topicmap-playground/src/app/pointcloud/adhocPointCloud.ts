import type { Feature, FeatureCollection } from "geojson";

import type {
  AdhocFeature,
  AdhocFeatureCollection,
  AdhocFeatureCollectionSeed,
  CarmaConf3DPointCloud,
} from "@carma-appframeworks/portals";

type PointCloudProperties = {
  carmaConf3D?: { pointcloud?: CarmaConf3DPointCloud };
  title?: string;
  label?: string;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const ADHOC_POINTCLOUD_ID_PREFIX = "pointcloud-import:";

const readPointCloud = (value: unknown): CarmaConf3DPointCloud | null => {
  if (!isRecord(value) || value.format !== "carma-pointcloud-v1") return null;
  if (typeof value.url !== "string" || !value.url) return null;
  return value as unknown as CarmaConf3DPointCloud;
};

const normalizeFeature = (value: Feature): AdhocFeature => {
  const properties = (value.properties ?? {}) as PointCloudProperties;
  const pointcloud = readPointCloud(properties.carmaConf3D?.pointcloud);
  if (!pointcloud) {
    throw new Error("Das GeoJSON-Feature enthält keinen carma-pointcloud-v1 Asset.");
  }
  return {
    id: (() => {
      const id = String(value.id ?? crypto.randomUUID());
      return id.startsWith(ADHOC_POINTCLOUD_ID_PREFIX)
        ? id
        : `${ADHOC_POINTCLOUD_ID_PREFIX}${id}`;
    })(),
    layerId: "pointcloud",
    kind: "maplibre-style",
    data: {
      version: 8,
      sources: {},
      layers: [],
    },
    properties: {
      ...properties,
      carmaConf3D: { pointcloud },
    },
    metadata: {
      title:
        properties.title ??
        properties.label ??
        pointcloud.url.split("/").pop() ??
        "Pointcloud",
      assetType: "pointcloud",
    },
  };
};

export const parseAdhocPointCloudJson = (
  value: unknown
): { collection: AdhocFeatureCollectionSeed; features: AdhocFeature[] } => {
  if (!isRecord(value)) throw new Error("Ungültiges Pointcloud-JSON.");
  const rawFeatures =
    value.type === "FeatureCollection"
      ? (value.features as unknown)
      : value.type === "Feature"
      ? [value]
      : null;
  if (!Array.isArray(rawFeatures)) {
    throw new Error("Erwartet wird ein GeoJSON Feature oder eine FeatureCollection.");
  }
  const features = rawFeatures.map(normalizeFeature);
  if (!features.length) throw new Error("Die FeatureCollection ist leer.");
  return {
    collection: {
      id: "pointcloud-imports",
      title: "Importierte Punktwolken",
      metadata: { assetType: "pointcloud" },
    },
    features,
  };
};

export const pointCloudFeatureToConfig = (
  feature: AdhocFeature
): CarmaConf3DPointCloud => {
  const pointcloud = (feature.properties as PointCloudProperties | undefined)
    ?.carmaConf3D?.pointcloud;
  if (!pointcloud) throw new Error(`Feature ${feature.id} ist keine Punktwolke.`);
  return pointcloud;
};

export const isAdhocPointCloudFeature = (feature: AdhocFeature): boolean => {
  try {
    pointCloudFeatureToConfig(feature);
    return true;
  } catch {
    return false;
  }
};
