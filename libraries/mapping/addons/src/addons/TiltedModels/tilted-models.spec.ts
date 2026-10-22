import { describe, expect, it } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  findTiltedModels,
  isTilted,
  readLayerOpacity,
  readModelConfig,
} from "./tilted-models";

const MODEL = {
  url: "https://example.org/bridge.glb",
  position: { lon: 7.12, lat: 51.25, height: 245.4 },
  heading: 95.45,
};

const fakeMap = (
  layers: Array<{ id: string; source?: string }>,
  sources: Record<string, { type: string; data?: unknown }>
) =>
  ({
    getLayersOrder: () => layers.map((layer) => layer.id),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    getSource: (id: string) => {
      const source = sources[id];
      return source
        ? { type: source.type, serialize: () => ({ data: source.data }) }
        : undefined;
    },
  } as unknown as MaplibreMap);

describe("readModelConfig", () => {
  it("reads the model Cesium reads", () => {
    expect(readModelConfig({ carmaConf3D: { model: MODEL } })).toEqual(MODEL);
  });

  it("defaults a missing height to the ground", () => {
    expect(
      readModelConfig({
        carmaConf3D: { model: { url: MODEL.url, position: { lon: 7, lat: 51 } } },
      })?.position.height
    ).toBe(0);
  });

  it("rejects a model it cannot place", () => {
    expect(readModelConfig(undefined)).toBeNull();
    expect(readModelConfig({ carmaConf3D: {} })).toBeNull();
    expect(
      readModelConfig({ carmaConf3D: { model: { ...MODEL, url: " " } } })
    ).toBeNull();
    expect(
      readModelConfig({
        carmaConf3D: { model: { url: MODEL.url, position: { lon: 7 } } },
      })
    ).toBeNull();
  });
});

describe("findTiltedModels", () => {
  it("finds models in geojson sources with the source's layers as footprint", () => {
    const map = fakeMap(
      [
        { id: "background" },
        { id: "bridge-fill", source: "bridge::adhoc" },
        { id: "roads", source: "basemap" },
        { id: "bridge-outline", source: "bridge::adhoc" },
      ],
      {
        basemap: { type: "vector" },
        "bridge::adhoc": {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", id: 1, properties: { carmaConf3D: { model: MODEL } } },
              { type: "Feature", id: 2, properties: {} },
            ],
          },
        },
      }
    );

    expect(findTiltedModels(map)).toEqual([
      {
        key: "bridge::adhoc#1",
        sourceId: "bridge::adhoc",
        featureId: 1,
        model: MODEL,
        footprintLayerIds: ["bridge-fill", "bridge-outline"],
      },
    ]);
  });

  it("reads a single feature and skips features without an id or url data", () => {
    const map = fakeMap(
      [
        { id: "a", source: "single" },
        { id: "b", source: "anonymous" },
        { id: "c", source: "remote" },
      ],
      {
        single: {
          type: "geojson",
          data: { type: "Feature", id: "x", properties: { carmaConf3D: { model: MODEL } } },
        },
        anonymous: {
          type: "geojson",
          data: { type: "Feature", properties: { carmaConf3D: { model: MODEL } } },
        },
        remote: { type: "geojson", data: "https://example.org/data.json" },
      }
    );

    expect(findTiltedModels(map).map((model) => model.key)).toEqual([
      "single#x",
    ]);
  });

  it("finds nothing while there is no style", () => {
    const map = {
      getLayersOrder: () => {
        throw new Error("no style");
      },
    } as unknown as MaplibreMap;
    expect(findTiltedModels(map)).toEqual([]);
  });
});

describe("isTilted", () => {
  it("switches above the threshold only", () => {
    expect(isTilted(0)).toBe(false);
    expect(isTilted(1)).toBe(false);
    expect(isTilted(1.5)).toBe(true);
    expect(isTilted(30, 45)).toBe(false);
    expect(isTilted(50, 45)).toBe(true);
  });
});

describe("readLayerOpacity", () => {
  it("follows the slider through the baked paint", () => {
    // authored 0.3, added at full opacity, slider moved to 50 %
    expect(readLayerOpacity(0.15, { painted: 0.3, opacity: 1 })).toBeCloseTo(
      0.5
    );
    // added at 50 %, slider moved back up
    expect(readLayerOpacity(0.3, { painted: 0.15, opacity: 0.5 })).toBeCloseTo(
      1
    );
  });

  it("cannot tell from an expression or a dead reference", () => {
    expect(readLayerOpacity(["get", "o"], { painted: 0.3, opacity: 1 })).toBe(
      null
    );
    expect(readLayerOpacity(0.3, null)).toBeNull();
    expect(readLayerOpacity(0.3, { painted: 0, opacity: 0 })).toBeNull();
  });
});
