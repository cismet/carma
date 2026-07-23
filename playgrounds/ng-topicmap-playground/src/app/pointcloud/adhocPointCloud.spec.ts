import { describe, expect, it } from "vitest";

import { parseAdhocPointCloudJson } from "./adhocPointCloud";

describe("parseAdhocPointCloudJson", () => {
  it("normalizes a pointcloud GeoJSON feature", () => {
    const result = parseAdhocPointCloudJson({
      type: "Feature",
      id: "demo",
      geometry: null,
      properties: {
        carmaConf3D: {
          pointcloud: {
            format: "carma-pointcloud-v1",
            url: "https://example.test/demo.copc.laz",
            transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
          },
        },
      },
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe("pointcloud-import:demo");
    expect(
      (result.features[0].properties as unknown as { carmaConf3D: { pointcloud: { format: string } } })
        .carmaConf3D.pointcloud.format
    ).toBe("carma-pointcloud-v1");
  });

  it("rejects non-pointcloud GeoJSON", () => {
    expect(() => parseAdhocPointCloudJson({ type: "FeatureCollection", features: [] })).toThrow();
  });
});
