export const POINT_CLOUD_SOURCE_TAGS = {
  FRAUNHOFER: "Fraunhofer",
  FRAUNHOFER_IPM: "Fraunhofer IPM",
  F4R: "F4R",
} as const;

export const POINT_CLOUD_PUBLIC_BASE_URL =
  "https://wupp-3d-data.cismet.de/mesh2024/pointclouds";

export const POINT_CLOUD_DATE_PRECISIONS = {
  DAY: "day",
  MONTH: "month",
} as const;

export type PointCloudDatePrecision =
  (typeof POINT_CLOUD_DATE_PRECISIONS)[keyof typeof POINT_CLOUD_DATE_PRECISIONS];

export interface PointCloudAcquisitionDate {
  value: string;
  precision: PointCloudDatePrecision;
}

export type PointCloudMatrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export interface PointCloudAssetIdentity {
  format: "carma-pointcloud-v1";
  id: string;
  label: string;
  artifactFileName: string;
  sourceTag: string;
  acquiredOn: PointCloudAcquisitionDate | null;
  fieldDimensions: readonly string[];
  hasRgb: boolean;
  runtimeEnabled: boolean;
  defaultDatum: "dhhn" | "ellipsoidal" | "surfaceRelative";
  source: {
    horizontalCrs: string;
    verticalDatum?: string;
    units: "meters";
  };
  transform: { matrix: PointCloudMatrix4 };
}

const datasetModules = import.meta.glob("./datasets/*.json", {
  eager: true,
  import: "default",
}) as Record<string, PointCloudAssetIdentity>;

const datasets = Object.values(datasetModules).filter(
  (dataset): dataset is PointCloudAssetIdentity =>
    dataset?.format === "carma-pointcloud-v1"
);

const DATASET_ORDER = ["kwh", "awg", "mls", "seg2512"];
datasets.sort(
  (left, right) =>
    DATASET_ORDER.indexOf(left.id) - DATASET_ORDER.indexOf(right.id)
);

if (datasets.length === 0) {
  throw new Error("Keine carma-pointcloud-v1 Datensätze gefunden.");
}

export const POINT_CLOUD_ASSET_IDENTITIES = Object.fromEntries(
  datasets.map((dataset) => [dataset.id, dataset])
) as Record<
  "kwh" | "awg" | "mls" | "seg2512" | "georadar",
  PointCloudAssetIdentity
>;

export const POINT_CLOUD_DATASETS = datasets;

export const formatPointCloudAcquisitionDate = (
  acquiredOn: PointCloudAcquisitionDate | null
): string | null => {
  if (!acquiredOn) return null;
  const [year, month, day] = acquiredOn.value.split("-");
  return acquiredOn.precision === POINT_CLOUD_DATE_PRECISIONS.MONTH
    ? `${month}/${year}`
    : `${day}.${month}.${year}`;
};
