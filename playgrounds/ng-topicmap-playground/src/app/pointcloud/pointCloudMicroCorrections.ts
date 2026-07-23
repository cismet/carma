export const POINT_CLOUD_MICRO_CORRECTIONS_SCHEMA =
  "carma.pointcloud-microcorrections" as const;
export const POINT_CLOUD_MICRO_CORRECTIONS_VERSION = 1 as const;

export interface PointCloudMicroCorrection {
  offsetEast: number;
  offsetNorth: number;
  offsetUp: number;
}

export interface PointCloudMicroCorrectionAssetMetadata {
  label?: string;
  source?: string;
  artifact?: string;
  sourceTag?: string;
  acquiredOn?: string | null;
}

export interface PointCloudMicroCorrectionEntry
  extends PointCloudMicroCorrectionAssetMetadata {
  translationEnuMeters: {
    east: number;
    north: number;
    up: number;
  };
}

export interface PointCloudMicroCorrectionsDocument {
  schema: typeof POINT_CLOUD_MICRO_CORRECTIONS_SCHEMA;
  version: typeof POINT_CLOUD_MICRO_CORRECTIONS_VERSION;
  coordinateFrame: "ENU";
  units: "m";
  exportedAt?: string;
  clouds: Record<string, PointCloudMicroCorrectionEntry>;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const buildPointCloudMicroCorrectionsDocument = (
  corrections: Readonly<Record<string, PointCloudMicroCorrection>>,
  assets: Readonly<Record<string, PointCloudMicroCorrectionAssetMetadata>> = {},
  exportedAt?: string
): PointCloudMicroCorrectionsDocument => ({
  schema: POINT_CLOUD_MICRO_CORRECTIONS_SCHEMA,
  version: POINT_CLOUD_MICRO_CORRECTIONS_VERSION,
  coordinateFrame: "ENU",
  units: "m",
  ...(exportedAt ? { exportedAt } : {}),
  clouds: Object.fromEntries(
    Object.entries(corrections).map(([id, correction]) => [
      id,
      {
        ...assets[id],
        translationEnuMeters: {
          east: correction.offsetEast,
          north: correction.offsetNorth,
          up: correction.offsetUp,
        },
      },
    ])
  ),
});

/**
 * Parses only the versioned correction values. Asset labels and URLs are
 * intentionally ignored when restoring a pose.
 */
export const parsePointCloudMicroCorrections = (
  raw: string | null,
  allowedCloudIds: ReadonlySet<string>
): Record<string, PointCloudMicroCorrection> => {
  if (!raw) return {};

  try {
    const document = JSON.parse(
      raw
    ) as Partial<PointCloudMicroCorrectionsDocument>;
    if (
      document.schema !== POINT_CLOUD_MICRO_CORRECTIONS_SCHEMA ||
      document.version !== POINT_CLOUD_MICRO_CORRECTIONS_VERSION ||
      !document.clouds ||
      typeof document.clouds !== "object"
    ) {
      return {};
    }

    const corrections: Record<string, PointCloudMicroCorrection> = {};
    for (const [id, entry] of Object.entries(document.clouds)) {
      if (!allowedCloudIds.has(id) || !entry || typeof entry !== "object") {
        continue;
      }
      const translation = (entry as PointCloudMicroCorrectionEntry)
        .translationEnuMeters;
      if (
        !translation ||
        !isFiniteNumber(translation.east) ||
        !isFiniteNumber(translation.north) ||
        !isFiniteNumber(translation.up)
      ) {
        continue;
      }
      corrections[id] = {
        offsetEast: translation.east,
        offsetNorth: translation.north,
        offsetUp: translation.up,
      };
    }
    return corrections;
  } catch {
    return {};
  }
};
