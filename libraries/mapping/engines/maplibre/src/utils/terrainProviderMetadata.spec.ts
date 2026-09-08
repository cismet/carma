import { WUPP_MESH_2024 } from "@carma-commons/resources";
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

describe("dataset color correction metadata", () => {
  it.each([WUPP_MESH_2024.url, ...WUPP_MESH_2024.alternateUrls])(
    "attaches the 2024 calibration only to its registered delivery %s",
    (tilesetUrl) => {
      const metadata = {
        carmaConf: { "3d": { renderMode: "tiles3d", tilesetUrl } },
      };
      expect(withTerrainProviderMetadata(metadata, true)).toMatchObject({
        carmaConf: {
          "3d": { colorCorrection: WUPP_MESH_2024.colorCorrection },
        },
      });
      expect(metadata.carmaConf["3d"]).not.toHaveProperty("colorCorrection");
    }
  );
  it("preserves a catalog calibration and leaves unknown datasets unchanged", () => {
    const metadata = {
      carmaConf: {
        "3d": {
          renderMode: "tiles3d",
          tilesetUrl: WUPP_MESH_2024.url,
          colorCorrection: {
            gamma: [1, 1, 1],
            blackPoint: [0, 0, 0],
            whitePoint: [1, 1, 1],
            saturation: 0.8,
          },
        },
      },
    };
    expect(withTerrainProviderMetadata(metadata, true)).toMatchObject(metadata);
    const unknown = withTerrainProviderMetadata(
      {
        carmaConf: {
          "3d": {
            renderMode: "tiles3d",
            tilesetUrl: "https://other.example/mesh2024/tileset.json",
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
