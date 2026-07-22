import { describe, expect, it } from "vitest";

import {
  formatPointCloudAcquisitionDate,
  POINT_CLOUD_ASSET_IDENTITIES,
  POINT_CLOUD_DATE_PRECISIONS,
} from "./point-cloud-assets";

describe("point-cloud asset identities", () => {
  it("keeps artifact names unique", () => {
    const fileNames = Object.values(POINT_CLOUD_ASSET_IDENTITIES).map(
      ({ artifactFileName }) => artifactFileName
    );

    expect(new Set(fileNames).size).toBe(fileNames.length);
  });

  it("uses one lowercase field schema and exposes only audited RGB", () => {
    const assets = Object.values(POINT_CLOUD_ASSET_IDENTITIES);
    for (const asset of assets) {
      expect(
        asset.fieldDimensions.every((name) => name === name.toLowerCase())
      ).toBe(true);
    }
    expect(
      assets.filter(({ hasRgb }) => hasRgb).map(({ id }) => id)
    ).toEqual(["kwh", "mls"]);
  });

  it("publishes only the verified Mesh-2024 AO assets", () => {
    const enabled = Object.values(POINT_CLOUD_ASSET_IDENTITIES).filter(
      ({ runtimeEnabled }) => runtimeEnabled
    );

    expect(enabled.map(({ id }) => id)).toEqual([
      "kwh",
      "awg",
      "mls",
      "seg2512",
    ]);
    expect(
      enabled.every(({ fieldDimensions }) =>
        fieldDimensions.some((field) => field === "ao")
      )
    ).toBe(true);
    expect(enabled.map(({ artifactFileName }) => artifactFileName)).toEqual([
      "kaiser-wilhelm-hain-rgb-mesh2024-ao-v1-084aca0cfdcf.copc.laz",
      "awg-2-segmentierung-mesh2024-ao-v1-c7b7ccc83cb8.copc.laz",
      "wuppertal-oelberg-mls-2025-09-11-mesh2024-ao-v1-8a2e89b90856.copc.laz",
      "nordbahntrasse-2025-12-segments-mesh2024-ao-v1-48badd4f8e68.copc.laz",
    ]);
  });

  it("formats acquisition dates at their verified precision", () => {
    expect(formatPointCloudAcquisitionDate(null)).toBeNull();
    expect(
      formatPointCloudAcquisitionDate({
        value: "2025-12",
        precision: POINT_CLOUD_DATE_PRECISIONS.MONTH,
      })
    ).toBe("12/2025");
    expect(
      formatPointCloudAcquisitionDate({
        value: "2025-09-11",
        precision: POINT_CLOUD_DATE_PRECISIONS.DAY,
      })
    ).toBe("11.09.2025");
  });
});
