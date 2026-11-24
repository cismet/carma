/**
 * RUNTIME WORKAROUND FOR A MAPLIBRE TERRAIN CACHE. Nothing in
 * `node_modules/maplibre-gl` is changed; this only calls a private method of
 * the live terrain object.
 *
 * WHY
 * With terrain on, background, fill, line and raster layers are drawn into a
 * texture per terrain tile (`RenderToTexture`, maplibre-gl
 * `src/render/render_to_texture.ts`) and that texture is reused until
 * `TerrainTileManager.freeRtt` runs. The map frees them on a style "data"
 * event (`Map.setTerrain`, `_terrainDataCallback`), which a paint change fires
 * once, in the frame its transition starts (`Style.update`, `changed`). Every
 * later frame of the transition reuses that first texture, so a layer ends up
 * drawn at the value the transition started from.
 *
 * SYMPTOM (geoportal, 24.11.2026, base map under LoD2 in the maplibre 3D view)
 * The background's opacity slider at 0, then back up: labels came back (symbols
 * are not draped) but streets and areas stayed invisible until the map was
 * moved or the slider moved again.
 *
 * WHAT THIS DOES
 * After every frame in which a paint transition is still running, frees the
 * cached textures, so the next frame drapes the current value. Without terrain
 * or without a transition it does nothing.
 *
 * PRIVATE API IN USE (written against maplibre-gl 5.18.0)
 * - `map.terrain.tileManager.freeRtt`
 * - `map.style.hasTransitions`
 * Recheck after a MapLibre upgrade.
 */
import type maplibregl from "maplibre-gl";

type TerrainDrapeInternals = {
  terrain?: { tileManager?: { freeRtt?: () => void } } | null;
  style?: { hasTransitions?: () => boolean } | null;
};

export const installTerrainDrapeTransitionRefresh = (
  map: maplibregl.Map
): void => {
  map.on("render", () => {
    const { terrain, style } = map as unknown as TerrainDrapeInternals;
    if (terrain && style?.hasTransitions?.()) {
      terrain.tileManager?.freeRtt?.();
    }
  });
};
