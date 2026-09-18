import { describe, expect, it } from "vitest";

import {
  styleProvidesTerrain,
  withTerrainProviderMetadata,
} from "./terrainProviderMetadata";

describe("terrain provider metadata", () => {
  it("recognizes a Mesh tag independent of case", () => {
    expect(
      styleProvidesTerrain({
        metadata: {
          carmaConf: { layerInfo: { tags: ["Basis", "mEsH"] } },
        },
      })
    ).toBe(true);
  });

  it("marks only tiles3d carriers of terrain-providing styles", () => {
    const carrier = {
      carmaConf: {
        "3d": {
          renderMode: "tiles3d",
          tilesetUrl: "https://tiles.example.test/tileset.json",
        },
      },
    };
    expect(withTerrainProviderMetadata(carrier, true)).toMatchObject({
      carmaConf: {
        "3d": {
          renderMode: "tiles3d",
          providesTerrain: true,
        },
      },
    });
    expect(withTerrainProviderMetadata(carrier, false)).not.toMatchObject({
      carmaConf: { "3d": { providesTerrain: true } },
    });
  });

  it("carries a style-level tileset declaration onto layers without their own", () => {
    const styleMetadata = {
      carmaConf: {
        "3d": {
          renderMode: "tiles3d",
          tilesetUrl: "https://tiles.example.test/tileset.json",
          basemap: "none",
          colorCorrection: {
            gamma: [1.25, 1.25, 1.23],
            blackPoint: [0, 0, 0],
            whitePoint: [0.9, 0.9, 0.92],
            saturation: 1,
          },
        },
      },
    };
    const carried = withTerrainProviderMetadata(
      { "z-index": 3 },
      true,
      styleMetadata
    );
    expect(carried).toMatchObject({
      "z-index": 3,
      carmaConf: {
        "3d": {
          renderMode: "tiles3d",
          basemap: "none",
          providesTerrain: true,
          colorCorrection: { saturation: 1 },
        },
      },
    });
    // A layer's own declaration wins over the style's.
    const own = withTerrainProviderMetadata(
      { carmaConf: { "3d": { renderMode: "tiles3d", tilesetUrl: "x" } } },
      false,
      styleMetadata
    );
    expect((own.carmaConf as { "3d": object })["3d"]).not.toHaveProperty(
      "basemap"
    );
  });

  it("adds no calibration of its own for any dataset", () => {
    const unknown = withTerrainProviderMetadata(
      {
        carmaConf: {
          "3d": {
            renderMode: "tiles3d",
            tilesetUrl: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
          },
        },
      },
      true
    );
    expect((unknown.carmaConf as { "3d": object })["3d"]).not.toHaveProperty(
      "colorCorrection"
    );
  });
});
