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

/**
 * 3D Tiles deliveries of datasets that also exist as COPC. These are extra
 * entries in the very same ad-hoc FeatureCollection — the alternate is picked
 * exactly like any other preset, and only `delivery` tells consumers to load
 * a tileset instead of a COPC file.
 */
const TILESET_ALTERNATES: ReadonlyArray<{
  sourceId: string;
  id: string;
  labelSuffix: string;
  url: string;
  /** Source-CRS extent, so consumers can anchor the tileset in a local scene
   *  frame without opening the COPC delivery first. */
  bounds: NonNullable<CarmaConf3DPointCloud["bounds"]>;
}> = [
  {
    sourceId: "mls",
    id: "mls3dtiles",
    labelSuffix: "3D Tiles",
    url: `${POINT_CLOUD_PUBLIC_BASE_URL}/wuppertal-oelberg-mls-2025-09-11-3dtiles-v1/tileset.json`,
    bounds: {
      crs: "EPSG:25832",
      min: [369514.8495, 5679771.7339, 142.4846],
      max: [370480.4199, 5680785.5991, 231.319],
    },
  },
];

const tilesetAlternateFeature = (
  dataset: PointCloudAssetIdentity,
  alternate: (typeof TILESET_ALTERNATES)[number]
): Feature => {
  const base = pointCloudPresetFeature(dataset);
  const properties = base.properties as Record<string, unknown> & {
    carmaConf3D: { pointcloud: CarmaConf3DPointCloud };
  };
  return {
    ...base,
    id: alternate.id,
    properties: {
      ...properties,
      title: `${dataset.label} · ${alternate.labelSuffix}`,
      carmaConf3D: {
        pointcloud: {
          ...properties.carmaConf3D.pointcloud,
          delivery: "3d-tiles",
          url: alternate.url,
          bounds: alternate.bounds,
        },
      },
    },
  };
};

export const POINT_CLOUD_PRESET_FEATURE_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    ...POINT_CLOUD_DATASETS.map(pointCloudPresetFeature),
    ...TILESET_ALTERNATES.flatMap((alternate) => {
      const dataset = POINT_CLOUD_DATASETS.find(
        (entry) => entry.id === alternate.sourceId
      );
      return dataset ? [tilesetAlternateFeature(dataset, alternate)] : [];
    }),
  ],
};
