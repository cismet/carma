import {
  WUPP_MESH_2024,
  type TextureColorCorrection,
} from "@carma-commons/resources";

/**
 * Colour correction for the MapLibre 3D Tiles mesh, keyed by tileset URL.
 * A style that declares its own `carmaConf["3d"].colorCorrection` keeps it;
 * these entries cover tilesets whose served style declares none, such as the
 * tiles.cismet.de mesh2024 style on its MeshX delivery.
 */
export const TILESET_COLOR_CORRECTIONS: Readonly<
  Record<string, TextureColorCorrection>
> = Object.fromEntries(
  [WUPP_MESH_2024.url, ...WUPP_MESH_2024.alternateUrls].map((url) => [
    url,
    WUPP_MESH_2024.colorCorrection,
  ])
);
