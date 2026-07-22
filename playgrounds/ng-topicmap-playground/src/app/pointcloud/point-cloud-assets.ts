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

export interface PointCloudAssetIdentity {
  id: string;
  label: string;
  artifactFileName: string;
  sourceTag: (typeof POINT_CLOUD_SOURCE_TAGS)[keyof typeof POINT_CLOUD_SOURCE_TAGS];
  acquiredOn: PointCloudAcquisitionDate | null;
  /** Proven populated scalar fields, using canonical browser lowercase. */
  fieldDimensions: readonly string[];
  /** All three RGB channels contain varying source data. */
  hasRgb: boolean;
  runtimeEnabled: boolean;
}

export const POINT_CLOUD_ASSET_IDENTITIES = {
  kwh: {
    id: "kwh",
    label: "Kaiser-Wilhelm-Hain · RGB",
    artifactFileName:
      "kaiser-wilhelm-hain-rgb-mesh2024-ao-v1-084aca0cfdcf.copc.laz",
    sourceTag: POINT_CLOUD_SOURCE_TAGS.FRAUNHOFER,
    acquiredOn: null,
    fieldDimensions: ["z", "classification", "synthetic", "overlap", "ao"],
    hasRgb: true,
    runtimeEnabled: true,
  },
  awg: {
    id: "awg",
    label: "AWG 2 Wuppertal · 3D-Segmentierung",
    artifactFileName:
      "awg-2-segmentierung-mesh2024-ao-v1-c7b7ccc83cb8.copc.laz",
    sourceTag: POINT_CLOUD_SOURCE_TAGS.FRAUNHOFER,
    acquiredOn: null,
    fieldDimensions: ["z", "classification", "ao"],
    hasRgb: false,
    runtimeEnabled: true,
  },
  oelbergMls: {
    id: "mls",
    label: "Wuppertal-Ölberg · MLS",
    artifactFileName:
      "wuppertal-oelberg-mls-2025-09-11-mesh2024-ao-v1-8a2e89b90856.copc.laz",
    sourceTag: POINT_CLOUD_SOURCE_TAGS.F4R,
    acquiredOn: {
      value: "2025-09-11",
      precision: POINT_CLOUD_DATE_PRECISIONS.DAY,
    },
    fieldDimensions: ["z", "intensity", "ao"],
    hasRgb: true,
    runtimeEnabled: true,
  },
  nordbahntrasseSegments: {
    id: "seg2512",
    label: "Nordbahntrasse 0–3000 m · Segmentierung",
    artifactFileName:
      "nordbahntrasse-2025-12-segments-mesh2024-ao-v1-48badd4f8e68.copc.laz",
    sourceTag: POINT_CLOUD_SOURCE_TAGS.FRAUNHOFER_IPM,
    acquiredOn: {
      value: "2025-12",
      precision: POINT_CLOUD_DATE_PRECISIONS.MONTH,
    },
    fieldDimensions: ["z", "intensity", "classification", "userdata", "ao"],
    hasRgb: false,
    runtimeEnabled: true,
  },
  oelbergGeoradar: {
    id: "georadar",
    label: "Wuppertal-Ölberg · Georadar",
    artifactFileName: "wuppertal-oelberg-georadar-2025-09-11.copc.laz",
    sourceTag: POINT_CLOUD_SOURCE_TAGS.F4R,
    acquiredOn: {
      value: "2025-09-11",
      precision: POINT_CLOUD_DATE_PRECISIONS.DAY,
    },
    fieldDimensions: [
      "z",
      "intensity",
      "pointsourceid",
      "traceid",
      "tracestation",
      "sliceindex",
      "sliceid",
      "depthlayer",
      "depthmm",
      "surfacepointindex",
    ],
    hasRgb: false,
    runtimeEnabled: false,
  },
} as const satisfies Record<string, PointCloudAssetIdentity>;

export const formatPointCloudAcquisitionDate = (
  acquiredOn: PointCloudAcquisitionDate | null
): string | null => {
  if (!acquiredOn) return null;
  const [year, month, day] = acquiredOn.value.split("-");
  return acquiredOn.precision === POINT_CLOUD_DATE_PRECISIONS.MONTH
    ? `${month}/${year}`
    : `${day}.${month}.${year}`;
};
