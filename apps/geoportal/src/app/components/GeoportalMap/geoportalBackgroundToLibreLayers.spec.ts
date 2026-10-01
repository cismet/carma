import { describe, expect, it, vi } from "vitest";

import type { BackgroundLayer } from "@carma-mapping/layers";
import { MapStyleKeys } from "../../constants/MapStyleKeys";

vi.mock("@carma-appframeworks/portals", () => ({
  defaultLayerConf: { namedLayers: {} },
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  prepareTerrainDrapeStyle: (style: unknown) => style,
}));
vi.mock("@carma-commons/utils", () => ({ isHttpCacheForced: () => false }));

import { geoportalBackgroundToLibreLayers } from "./geoportalBackgroundToLibreLayers";

const background = {
  id: "karte",
  title: "Stadtplan",
  visible: true,
  opacity: 0.8,
  layers: "rvrGrundriss@100|amtlich@90|rvrSchriftNT@100",
} as BackgroundLayer;

describe("Geoportal shaded terrain background composition", () => {
  it("keeps the chosen background and only adjusts a vector style for the drape", () => {
    const layers = geoportalBackgroundToLibreLayers(
      background,
      {
        amtlich: {
          type: "tiles",
          url: "https://example.test/city-map/{z}/{x}/{y}.png",
        },
        rvrGrundriss: {
          type: "wmts",
          url: "https://example.test/opaque-ground-plan",
          layers: "ground-plan",
        },
        rvrSchriftNT: {
          type: "wmts-nt",
          url: "https://example.test/labels",
          layers: "labels",
          transparent: true,
        },
      },
      { shadowTerrainActive: true }
    );

    // The authored background survives: no substituted basemap, so switching
    // to Luftbild or adding 2D layers keeps working while shadows are on.
    expect(layers).toHaveLength(3);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(true);
    expect(
      layers.some(
        (layer) => "name" in layer && layer.name === "bg-basemap_relief"
      )
    ).toBe(false);
  });

  it("substitutes the vector base only when the override asks for it", () => {
    const named = {
      amtlich: {
        type: "tiles" as const,
        url: "https://example.test/city-map/{z}/{x}/{y}.png",
      },
      rvrGrundriss: {
        type: "wmts" as const,
        url: "https://example.test/opaque-ground-plan",
        layers: "ground-plan",
      },
      rvrSchriftNT: {
        type: "wmts-nt" as const,
        url: "https://example.test/labels",
        layers: "labels",
        transparent: true,
      },
      basemap_relief: {
        type: "vector" as const,
        style: "https://example.test/vector-basemap.json",
      },
    };
    const overridden = geoportalBackgroundToLibreLayers(background, named, {
      shadowTerrainActive: true,
      mapStyle3dActive: true,
      vectorBaseOverride: true,
    });
    expect(overridden).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        userStyleTransformKey: "terrain-albedo-v1",
      }),
    ]);
    // Without the override the authored raster bases stay.
    const authored = geoportalBackgroundToLibreLayers(background, named, {
      shadowTerrainActive: true,
    });
    expect(authored).toHaveLength(3);
    expect(
      authored.some(
        (layer) => "name" in layer && layer.name === "bg-basemap_relief"
      )
    ).toBe(false);

    const inactive = geoportalBackgroundToLibreLayers(background, named, {
      shadowTerrainActive: true,
      mapStyle3dActive: false,
      vectorBaseOverride: true,
    });
    expect(inactive).toEqual(authored);
  });

  it.each(["trueOrtho2024Alternative", "trueOrtho2021"])(
    "keeps %s on terrain when switching Karte → Luftbild → Karte",
    (imageryName) => {
      const named = {
        [imageryName]: {
          type: "tiles",
          url: "https://example.test/ortho/{z}/{x}/{y}.jpg",
        },
        basemap_relief: {
          type: "vector",
          style: "https://example.test/vector-basemap.json",
        },
      };
      const options = {
        shadowTerrainActive: true,
        mapStyle3dActive: true,
        vectorBaseOverride: true,
      };
      const aerial = {
        ...background,
        id: MapStyleKeys.AERIAL,
        layers: `${imageryName}@75`,
      };
      const before = geoportalBackgroundToLibreLayers(
        background,
        named,
        options
      );
      const imagery = geoportalBackgroundToLibreLayers(aerial, named, options);
      const after = geoportalBackgroundToLibreLayers(
        background,
        named,
        options
      );

      expect(before[0]).toMatchObject({ type: "vector" });
      expect(imagery).toHaveLength(1);
      expect(imagery[0]).toMatchObject({
        type: "tiles",
        name: imageryName,
        url: named[imageryName].url,
        carmaLayerId: MapStyleKeys.AERIAL,
      });
      expect(imagery[0].opacity).toBeCloseTo(0.6);
      expect(after).toEqual(before);
      expect(
        geoportalBackgroundToLibreLayers(aerial, named, {
          ...options,
          standaloneMeshOnly: true,
        })
      ).toEqual([]);
    }
  );

  it("adjusts a vector background in place while shaded terrain is active", () => {
    const vectorBackground = {
      ...background,
      layers: "basemap_relief@100",
    } as BackgroundLayer;
    const layers = geoportalBackgroundToLibreLayers(
      vectorBackground,
      {
        basemap_relief: {
          type: "vector",
          style: "https://example.test/vector-basemap.json",
        },
      },
      { shadowTerrainActive: true }
    );

    expect(layers).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        style: "https://example.test/vector-basemap.json",
        userStyleTransform: expect.any(Function),
        userStyleTransformKey: "terrain-albedo-v1",
      }),
    ]);
    // Without shaded terrain the same style is requested untouched, so
    // disabling the simulation restores the original appearance.
    const plain = geoportalBackgroundToLibreLayers(vectorBackground, {
      basemap_relief: {
        type: "vector",
        style: "https://example.test/vector-basemap.json",
      },
    });
    expect(plain[0]).not.toHaveProperty("userStyleTransform");
  });

  it("keeps the authored background unchanged without shaded terrain", () => {
    const layers = geoportalBackgroundToLibreLayers(background, {
      amtlich: {
        type: "tiles",
        url: "https://example.test/city-map/{z}/{x}/{y}.png",
      },
      rvrGrundriss: {
        type: "wmts",
        url: "https://example.test/opaque-ground-plan",
        layers: "ground-plan",
      },
      rvrSchriftNT: {
        type: "wmts-nt",
        url: "https://example.test/labels",
        layers: "labels",
        transparent: true,
      },
      basemap_relief: {
        type: "vector",
        style: "https://example.test/vector-basemap.json",
      },
    });

    expect(layers).toHaveLength(3);
    expect(
      layers.some(
        (layer) => "layers" in layer && layer.layers === "ground-plan"
      )
    ).toBe(true);
  });
  it("uses vector labels over a mesh aerial basis and restores the orthophoto when that basis is removed", () => {
    const aerial = {
      ...background,
      id: MapStyleKeys.AERIAL,
      layers: "trueOrtho2024Alternative@75",
    };
    const named = {
      trueOrtho2024Alternative: {
        type: "tiles",
        url: "https://example.test/ortho/{z}/{x}/{y}.jpg",
      },
      basemap_relief: {
        type: "vector",
        style: "https://example.test/vector-basemap.json",
      },
    };
    const options = { mapStyle3dActive: true, vectorBaseOverride: true };
    const ortho = geoportalBackgroundToLibreLayers(aerial, named, options);
    const meshLabels = geoportalBackgroundToLibreLayers(aerial, named, {
      ...options,
      meshBaseActive: true,
    });
    expect(meshLabels).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "bg-basemap_relief",
        carmaLayerId: MapStyleKeys.AERIAL,
        style: named.basemap_relief.style,
        opacity: 0.8,
        userStyleTransformKey: "terrain-albedo-v1",
      }),
    ]);
    expect(meshLabels.some((layer) => layer.type === "tiles")).toBe(false);
    expect(ortho).toEqual([
      expect.objectContaining({
        type: "tiles",
        name: "trueOrtho2024Alternative",
      }),
    ]);
    expect(ortho[0].opacity).toBeCloseTo(0.6);
    expect(
      geoportalBackgroundToLibreLayers(aerial, named, {
        ...options,
        meshBaseActive: false,
      })
    ).toEqual(ortho);
  });

  it.each([
    { mapStyle3dActive: false, vectorBaseOverride: true, meshBaseActive: true },
    { mapStyle3dActive: true, vectorBaseOverride: false, meshBaseActive: true },
    { mapStyle3dActive: true, vectorBaseOverride: true, meshBaseActive: false },
  ])(
    "keeps aerial raster pixels when the mesh-label override is incomplete: %j",
    (options) => {
      const aerial = {
        ...background,
        id: MapStyleKeys.AERIAL,
        layers: "ortho@100",
      };
      const named = {
        ortho: {
          type: "tiles",
          url: "https://example.test/ortho/{z}/{x}/{y}.jpg",
        },
        basemap_relief: {
          type: "vector",
          style: "https://example.test/vector-basemap.json",
        },
      };
      const layers = geoportalBackgroundToLibreLayers(aerial, named, options);
      expect(layers).toEqual([
        expect.objectContaining({
          type: "tiles",
          name: "ortho",
          carmaLayerId: MapStyleKeys.AERIAL,
        }),
      ]);
      expect(layers[0]).not.toHaveProperty("userStyleTransform");
    }
  );
});
