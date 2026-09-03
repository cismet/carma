import type { Map as MaplibreMap } from "maplibre-gl";
import { ExternalTexture, type Texture } from "three";

/**
 * MapLibre's terrain depth framebuffer as a Three texture.
 *
 * With terrain enabled the painter redraws the terrain mesh into an RGBA8
 * target at the start of every frame (`Painter.maybeDrawDepthAndCoords`), one
 * texel per CSS pixel, holding NDC depth packed by the `pack()` of
 * `terrain_depth.fragment.glsl`. That surface is exactly what the map shows
 * as ground, so a pass in the shared scene can put shadows on it without a
 * receiver mesh of its own, and without ever disagreeing with the map.
 *
 * The texture lives in a private field of MapLibre's `Terrain`. This is the
 * only place that reads it, guarded so a rename yields "no host ground"
 * rather than a crash. Checked against maplibre-gl 5.18.
 */
type TerrainWithDepthTexture = {
  _fboDepthTexture?: { texture: WebGLTexture | null } | null;
};

export const resolveHostTerrainDepthTexture = (
  map: MaplibreMap
): WebGLTexture | null => {
  const terrain = (
    map as unknown as { terrain?: TerrainWithDepthTexture | null }
  ).terrain;
  return terrain?._fboDepthTexture?.texture ?? null;
};

export type HostTerrainDepthBinding = {
  /** This frame's depth texture, or null while the host renders no terrain. */
  sync: (map: MaplibreMap) => Texture | null;
  dispose: () => void;
};

export const buildHostTerrainDepthBinding = (): HostTerrainDepthBinding => {
  const texture = new ExternalTexture(null);
  texture.name = "maplibre-terrain-depth";
  return {
    sync(map) {
      // MapLibre recreates the target on resize; rebinding per frame is free.
      const source = resolveHostTerrainDepthTexture(map);
      texture.sourceTexture = source;
      return source ? texture : null;
    },
    dispose() {
      // Never let Three delete a texture MapLibre owns.
      texture.sourceTexture = null;
      texture.dispose();
    },
  };
};
