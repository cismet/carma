import type { Feature, FeatureCollection } from "geojson";

import type { CarmaConf3DPointCloud } from "@carma-appframeworks/portals";

import {
  POINT_CLOUD_DATASETS,
  POINT_CLOUD_PUBLIC_BASE_URL,
  type PointCloudAssetIdentity,
} from "./point-cloud-assets";

/**
 * Presents the built-in carma-pointcloud-v1 datasets in the same GeoJSON
 * FeatureCollection format the playground uses for ad-hoc point-cloud imports
 * (features carrying `properties.carmaConf3D.pointcloud`). Consumers such as
 * the registration story can therefore treat curated presets and user imports
 * identically.
 */
export const pointCloudPresetFeature = (
  dataset: PointCloudAssetIdentity
): Feature => ({
  type: "Feature",
  id: dataset.id,
  geometry: null,
  properties: {
    title: dataset.label,
    carmaConf3D: {
      pointcloud: {
        format: dataset.format,
        url: `${POINT_CLOUD_PUBLIC_BASE_URL}/${dataset.artifactFileName}`,
        source: dataset.source,
        transform: dataset.transform,
        fields: dataset.fieldDimensions,
        hasRgb: dataset.hasRgb,
      } satisfies CarmaConf3DPointCloud,
    },
    sourceTag: dataset.sourceTag,
    defaultDatum: dataset.defaultDatum,
  },
});

export const POINT_CLOUD_PRESET_FEATURE_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: POINT_CLOUD_DATASETS.map(pointCloudPresetFeature),
};
