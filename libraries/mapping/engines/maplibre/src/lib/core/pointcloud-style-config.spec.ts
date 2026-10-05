import { describe, expect, it } from "vitest";

import {
  isPointCloudZoomInRange,
  readPointCloudLayerConfig,
} from "./pointcloud-style-config";

const TILESET_URL = "https://example.test/oelberg/tileset.json";

const carrierLayer = (
  block: Record<string, unknown>,
  layer: Record<string, unknown> = {}
) => ({
  id: "oelberg-pointcloud",
  type: "background",
  layout: { visibility: "none" },
  paint: { "background-opacity": 0 },
  ...layer,
  metadata: {
    carmaConf: { "3d": block },
    ...((layer.metadata as Record<string, unknown> | undefined) ?? {}),
  },
});

const pointcloudBlock = (
  payload: Record<string, unknown> = {},
  block: Record<string, unknown> = {}
) => ({
  renderMode: "pointcloud",
  pointcloud: {
    format: "carma-pointcloud-v1",
    delivery: "3d-tiles",
    url: TILESET_URL,
    source: {
      horizontalCrs: "EPSG:25832",
      verticalDatum: "DHHN2016",
      units: "meters",
    },
    transform: {
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
    bounds: {
      crs: "EPSG:25832",
      min: [369514.8495, 5679771.7339, 142.4846],
      max: [370480.4199, 5680785.5991, 231.319],
    },
    hasRgb: true,
    ...payload,
  },
  pointSize: 2,
  errorTarget: 8,
  ...block,
});

describe("readPointCloudLayerConfig", () => {
  it("parses the documented carrier layer", () => {
    expect(
      readPointCloudLayerConfig(carrierLayer(pointcloudBlock(), { minzoom: 18 }))
    ).toEqual({
      renderMode: "pointcloud",
      pointcloud: {
        format: "carma-pointcloud-v1",
        delivery: "3d-tiles",
        url: TILESET_URL,
        bounds: {
          crs: "EPSG:25832",
          min: [369514.8495, 5679771.7339, 142.4846],
          max: [370480.4199, 5680785.5991, 231.319],
        },
        hasRgb: true,
      },
      pointSize: 2,
      errorTarget: 8,
      minzoom: 18,
      layerOpacity: 1,
      visible: true,
    });
  });

  it("reads the zoom range from the carrier layer", () => {
    const config = readPointCloudLayerConfig(
      carrierLayer(pointcloudBlock(), { minzoom: 17, maxzoom: 22 })
    );
    expect(config?.minzoom).toBe(17);
    expect(config?.maxzoom).toBe(22);
  });

  it("leaves the zoom range open when the carrier layer has none", () => {
    const config = readPointCloudLayerConfig(carrierLayer(pointcloudBlock()));
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty("minzoom");
    expect(config).not.toHaveProperty("maxzoom");
  });

  it("carries the layer bar opacity the style merge wrote", () => {
    const config = readPointCloudLayerConfig(
      carrierLayer(pointcloudBlock(), { metadata: { "layer-opacity": 0.4 } })
    );
    expect(config?.layerOpacity).toBe(0.4);
  });

  it("keeps a cloud switched off through pointcloud-visibility, but not drawn", () => {
    const hidden = readPointCloudLayerConfig(
      carrierLayer(pointcloudBlock(), {
        metadata: { "pointcloud-visibility": "none" },
      })
    );
    expect(hidden).not.toBeNull();
    expect(hidden?.visible).toBe(false);
    // the carrier's own layout is hidden in both cases and does not count
    expect(readPointCloudLayerConfig(carrierLayer(pointcloudBlock()))?.visible).toBe(
      true
    );
  });

  it("drops invalid optional values instead of passing them on", () => {
    const config = readPointCloudLayerConfig(
      carrierLayer(
        pointcloudBlock(
          { bounds: { crs: "EPSG:25832", min: [1, 2], max: [3, 4, 5] } },
          { pointSize: -1, errorTarget: "8" }
        ),
        { minzoom: "18" }
      )
    );
    expect(config).not.toBeNull();
    expect(config?.pointcloud).not.toHaveProperty("bounds");
    expect(config).not.toHaveProperty("pointSize");
    expect(config).not.toHaveProperty("errorTarget");
    expect(config).not.toHaveProperty("minzoom");
  });

  it.each([
    ["no metadata", { id: "plain", type: "background" }],
    ["another render mode", carrierLayer({ renderMode: "tiles3d" })],
    ["no payload", carrierLayer({ renderMode: "pointcloud" })],
    ["an unknown format", carrierLayer(pointcloudBlock({ format: "las" }))],
    ["a COPC delivery", carrierLayer(pointcloudBlock({ delivery: "copc" }))],
    ["no delivery", carrierLayer(pointcloudBlock({ delivery: undefined }))],
    ["an empty url", carrierLayer(pointcloudBlock({ url: "" }))],
    ["a non-string url", carrierLayer(pointcloudBlock({ url: 42 }))],
  ])("ignores a layer with %s", (_label, layer) => {
    expect(readPointCloudLayerConfig(layer)).toBeNull();
  });

  it("ignores values that are not layers at all", () => {
    expect(readPointCloudLayerConfig(null)).toBeNull();
    expect(readPointCloudLayerConfig("layer")).toBeNull();
  });
});

describe("isPointCloudZoomInRange", () => {
  it("follows MapLibre: inclusive minzoom, exclusive maxzoom", () => {
    const range = { minzoom: 18, maxzoom: 22 };
    expect(isPointCloudZoomInRange(range, 17.99)).toBe(false);
    expect(isPointCloudZoomInRange(range, 18)).toBe(true);
    expect(isPointCloudZoomInRange(range, 21.99)).toBe(true);
    expect(isPointCloudZoomInRange(range, 22)).toBe(false);
  });

  it("treats a missing bound as open", () => {
    expect(isPointCloudZoomInRange({}, 3)).toBe(true);
    expect(isPointCloudZoomInRange({ minzoom: 18 }, 24)).toBe(true);
    expect(isPointCloudZoomInRange({ maxzoom: 18 }, 0)).toBe(true);
  });
});
