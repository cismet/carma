import {
  ContentType,
  type TilesetConfig,
  type TextureColorCorrection,
  TilesetType,
} from "../base/tilesets";

export const WUPP_MESH_2020: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  key: "wupp-mesh-2020",
  type: TilesetType.MESH,
};

export const WUPP_MESH_2024: TilesetConfig & {
  colorCorrection: TextureColorCorrection;
  alternateUrls: readonly string[];
} = {
  url: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
  key: "wupp-mesh-2024",
  /** MeshX delivery used by the Geoportal's 2024 mesh style. */
  alternateUrls: ["https://wupp-3d-datax.cismet.de/mesh2024/tileset.json"],
  /** Cesium UNLIT_ENHANCED_2024 calibration; tone correction, not de-lighting. */
  colorCorrection: {
    gamma: [1.25, 1.25, 1.23],
    blackPoint: [0, 0, 0],
    whitePoint: [0.9, 0.9, 0.92],
    saturation: 1,
  },
  type: TilesetType.MESH,
};

/**
 * Published root snapshot for reproducible coordinate-reference diagnostics.
 * Both mesh2024 endpoints returned these values. The transform is column-major;
 * the oriented bounding box is center plus three half-axis vectors, not an AABB.
 * WGS84/ECEF is an interpretation for diagnostics, not certified datum provenance.
 */
export const WUPP_MESH_2024_ROOT_REFERENCE = {
  source: WUPP_MESH_2024.url,
  alternateSources: WUPP_MESH_2024.alternateUrls,
  retrievedOn: "2026-09-14",
  evidence: "output/playwright/mesh-crs-source-metadata.log",
  assetVersion: "1.0",
  datumStatus: "horizontal and vertical datum not certified by root metadata",
  transform: [
    -0.124701, 0.992194, 0, 0, -0.773701, -0.09724, 0.626044, 0, 0.621158,
    0.078068, 0.779787, 0, 3970046.914097, 498961.576644, 4950543.333325, 1,
  ],
  box: [
    21.049049422586904, 74.31243227567029, -3.2565184752456844, 10646.484375, 0,
    0, 0, 0, 531.45654296875, 0, 8620.49609375, 0,
  ],
} as const;

export const WUPP_LOD2_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/lod2/tileset.json",
  key: "wupp-lod2",
  type: TilesetType.LOD2,
  contentTypes: [ContentType.BUILDINGS, ContentType.BRIDGES],
  disableSelection: true,
};

export const WUPP_BAUMKATASTER_TILESET: TilesetConfig = {
  url: "https://wupp-3d-data.cismet.de/trees/tileset.json",
  key: "wupp-baumkaster",
  type: TilesetType.LOD4,
  contentTypes: [ContentType.TREES],
};
