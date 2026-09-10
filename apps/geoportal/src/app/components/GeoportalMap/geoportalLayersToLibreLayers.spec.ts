import { describe, expect, it } from "vitest";

import type { Layer } from "@carma-mapping/layers";

import {
  geoportalLayersToLibreLayers,
  layerProvidesTerrainMesh,
  parseThreeTilesLayer,
} from "./geoportalLayersToLibreLayers";

const buildLayer = (threeTiles: unknown): Layer =>
  ({
    id: "custom:mesh-2024",
    title: "Wuppertal Mesh 2024",
    visible: true,
    opacity: 0.75,
    layerType: "vector",
    conf: { threeTiles },
    props: { style: { version: 8, sources: {}, layers: [] } },
  } as unknown as Layer);

describe("Geoportal 3D Tiles layer conversion", () => {
  it("maps a declared clay shader into the shared Three.js layer contract", () => {
    const layer = buildLayer({
      url: "https://example.test/tileset.json",
      origin: [7.15, 51.256],
      shader: {
        kind: "clay",
        color: "#d8d1c4",
        roughness: 0.92,
        metalness: 0,
      },
      errorTarget: 8,
      requestConcurrency: 2,
    });

    expect(geoportalLayersToLibreLayers([layer])).toEqual([
      {
        type: "three-tiles",
        name: "Wuppertal Mesh 2024",
        carmaLayerId: "custom:mesh-2024",
        url: "https://example.test/tileset.json",
        origin: [7.15, 51.256],
        shader: {
          kind: "clay",
          color: "#d8d1c4",
          roughness: 0.92,
          metalness: 0,
        },
        errorTarget: 8,
        requestConcurrency: 2,
        opacity: 0.75,
      },
    ]);
  });

  it("rejects unknown shader contracts", () => {
    expect(
      parseThreeTilesLayer(
        buildLayer({
          url: "https://example.test/tileset.json",
          shader: { kind: "custom-glsl", color: "#fff" },
        })
      )
    ).toBeNull();
  });

  it("recognizes the remote photogrammetry mesh before its style is fetched", () => {
    const layer = {
      id: "mesh-2024",
      title: "3D-MeshX 2024",
      visible: true,
      layerType: "vector",
      props: {
        style: "https://tiles.cismet.de/lod2/mesh2024.style.json",
      },
    } as Layer;

    expect(layerProvidesTerrainMesh(layer)).toBe(true);
    expect(layerProvidesTerrainMesh({ ...layer, visible: false })).toBe(false);
  });

  it("recognizes inline mesh metadata and direct terrain mesh declarations", () => {
    const taggedLayer = {
      id: "inline-mesh",
      visible: true,
      props: {
        style: {
          version: 8,
          metadata: {
            carmaConf: { layerInfo: { tags: ["Basis", "Mesh"] } },
          },
          sources: {},
          layers: [],
        },
      },
    } as unknown as Layer;
    const directLayer = {
      id: "direct-mesh",
      visible: true,
      conf: { threeTiles: { providesTerrain: true } },
    } as unknown as Layer;

    expect(layerProvidesTerrainMesh(taggedLayer)).toBe(true);
    expect(layerProvidesTerrainMesh(directLayer)).toBe(true);
  });
});
