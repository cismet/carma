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
});
