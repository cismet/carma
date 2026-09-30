import type { Map as MaplibreMap } from "maplibre-gl";

import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  type RasterDemTerrainResource,
} from "@carma-commons/resources";
import {
  hasStandaloneTerrain,
  isTerrainShadingStyleLayer,
  MAPLIBRE_EVENT,
  subscribeSharedThreeTerrain,
  TERRAIN_MAP_STYLE,
} from "@carma-mapping/engines/maplibre";

import {
  SHADOW_TERRAIN_QUALITY,
  type ShadowTerrainQuality,
} from "../contracts/shadow-simulation";
import {
  applyMapLibreTerrainQuality,
  type InternalMapLibreTerrain,
} from "./maplibre-terrain-quality";

const SHADOW_MAP_STYLE_BASE_LAYER_ID = "carma-shadow-map-style-base";

/**
 * What the MapLibre pass below Three contributes to the projected drape:
 * `opaque` paints the complete basemap onto bare terrain, `labels` keeps only
 * the symbol layers so a textured mesh takes draped street names and nothing
 * else.
 */
export const SHADOW_MAP_STYLE_DRAPE_MODE = {
  OPAQUE: "opaque",
  LABELS: "labels",
} as const;

export type ShadowMapStyleDrapeMode =
  (typeof SHADOW_MAP_STYLE_DRAPE_MODE)[keyof typeof SHADOW_MAP_STYLE_DRAPE_MODE];

export type ShadowMapLibreTerrainRelease = (() => void) & {
  /** Re-evaluate the drape mode after the shared scene's runtimes changed. */
  refresh: () => void;
};

/**
 * Keep MapLibre's highest native DEM active while its styled framebuffer is
 * captured for projection onto the shared Three scene. Style replacement can
 * temporarily drop terrain, so re-apply it once the source becomes available.
 */
export const acquireShadowMapLibreTerrain = (
  map: MaplibreMap,
  terrainSource: RasterDemTerrainResource = NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  isMapStyleContentVisible: () => boolean = () => true,
  getDrapeMode: () => ShadowMapStyleDrapeMode = () =>
    SHADOW_MAP_STYLE_DRAPE_MODE.OPAQUE,
  terrainQuality: ShadowTerrainQuality = SHADOW_TERRAIN_QUALITY.MAX
): ShadowMapLibreTerrainRelease => {
  const sourceId = terrainSource.id;
  type InternalTerrain = InternalMapLibreTerrain & {
    getMeshFrameDelta?: (zoom: number) => number;
  };
  type DrapeLayer = {
    id: string;
    type: string;
    source?: unknown;
    "source-layer"?: unknown;
  };
  const terrainMap = map as MaplibreMap & {
    getTerrain?: MaplibreMap["getTerrain"];
    getSource?: MaplibreMap["getSource"];
    setTerrain?: MaplibreMap["setTerrain"];
    terrain?: InternalTerrain | null;
  };
  if (
    typeof terrainMap.getTerrain !== "function" ||
    typeof terrainMap.getSource !== "function" ||
    typeof terrainMap.setTerrain !== "function"
  ) {
    return Object.assign(() => undefined, { refresh: () => undefined });
  }
  const previousTerrain = terrainMap.getTerrain();
  const savedDrapeOpacities = new Map<
    string,
    { signature: string; property: string; value: unknown }
  >();
  const savedTerrainShadingVisibilities = new Map<
    string,
    { signature: string; value: unknown }
  >();
  let disposed = false;
  let applying = false;
  let createdBaseLayer = false;
  let patchedTerrain: InternalTerrain | null = null;
  let inheritedFrameDelta = false;
  let originalFrameDelta: InternalTerrain["getMeshFrameDelta"];
  let qualityPatchedTerrain: InternalTerrain | null = null;
  let restoreTerrainQuality: () => void = () => undefined;
  let lastApplyErrorMessage: string | null = null;

  const restoreTerrainFrame = () => {
    if (!patchedTerrain) return;
    if (inheritedFrameDelta) {
      delete patchedTerrain.getMeshFrameDelta;
    } else {
      patchedTerrain.getMeshFrameDelta = originalFrameDelta;
    }
    patchedTerrain = null;
    originalFrameDelta = undefined;
    inheritedFrameDelta = false;
  };

  const suppressTerrainFrame = () => {
    const terrain = terrainMap.terrain;
    if (!terrain || terrain === patchedTerrain) return;
    restoreTerrainFrame();
    if (typeof terrain.getMeshFrameDelta !== "function") return;
    inheritedFrameDelta = !Object.prototype.hasOwnProperty.call(
      terrain,
      "getMeshFrameDelta"
    );
    originalFrameDelta = terrain.getMeshFrameDelta;
    terrain.getMeshFrameDelta = () => 0;
    patchedTerrain = terrain;
  };

  const applyTerrainQuality = () => {
    const currentTerrain = terrainMap.terrain;
    if (!currentTerrain || currentTerrain === qualityPatchedTerrain) return;
    restoreTerrainQuality();
    qualityPatchedTerrain = currentTerrain;
    restoreTerrainQuality = applyMapLibreTerrainQuality(
      currentTerrain,
      terrainSource.tileSize,
      terrainQuality,
      () => {
        // Native MapLibre 5.x defaults. Materialize its adaptive LOD callback
        // through the public API before adding our private quality offset.
        // Only this terrain source changes; existing custom hooks are kept.
        map.setSourceTileLodParams?.(9.314, 3, terrainSource.id);
      }
    );
    map.triggerRepaint?.();
  };

  const getLayerSignature = (layer: DrapeLayer) =>
    `${layer.type}:${String(layer.source)}:${String(layer["source-layer"])}`;

  const ensureOpaqueDrape = () => {
    const style = map.getStyle();
    const layers = (style.layers ?? []) as DrapeLayer[];
    for (const layer of layers) {
      if (!isTerrainShadingStyleLayer(layer)) continue;
      const signature = getLayerSignature(layer);
      let saved = savedTerrainShadingVisibilities.get(layer.id);
      const currentVisibility = map.getLayoutProperty(layer.id, "visibility");
      if (!saved || saved.signature !== signature) {
        saved = { signature, value: currentVisibility };
        savedTerrainShadingVisibilities.set(layer.id, saved);
      } else if (currentVisibility !== "none") {
        // Adopt a style-composer replacement as the newest teardown value.
        saved.value = currentVisibility;
      }
      if (currentVisibility !== "none") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    if (!isMapStyleContentVisible()) return;
    if (!map.getLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID)) {
      map.addLayer(
        {
          id: SHADOW_MAP_STYLE_BASE_LAYER_ID,
          type: "background",
          paint: {
            "background-color": TERRAIN_MAP_STYLE.baseColor,
            "background-opacity": TERRAIN_MAP_STYLE.opacity,
          },
        },
        layers[0]?.id
      );
      createdBaseLayer = true;
    }

    for (const layer of layers) {
      if (
        layer.id === SHADOW_MAP_STYLE_BASE_LAYER_ID ||
        layer.type === "custom"
      ) {
        continue;
      }
      const property = TERRAIN_MAP_STYLE.opaqueDrapeProperties.get(layer.type);
      if (!property) continue;
      const signature = getLayerSignature(layer);
      let saved = savedDrapeOpacities.get(layer.id);
      const currentOpacity = map.getPaintProperty(layer.id, property);
      if (!saved || saved.signature !== signature) {
        saved = {
          signature,
          property,
          value: currentOpacity,
        };
        savedDrapeOpacities.set(layer.id, saved);
      } else if (currentOpacity !== 1) {
        // StyleComposer and opacity controls may replace the authored value
        // while shadows are active. Preserve the newest value for teardown.
        saved.value = currentOpacity;
      }
      if (currentOpacity !== 1) {
        map.setPaintProperty(layer.id, property, 1);
      }
    }
  };

  const restoreSavedVisibilities = (
    saved: Map<string, { signature: string; value: unknown }>
  ) => {
    for (const [layerId, entry] of saved) {
      try {
        const layer = map
          .getStyle()
          .layers?.find(({ id }) => id === layerId) as DrapeLayer | undefined;
        if (
          layer &&
          getLayerSignature(layer) === entry.signature &&
          map.getLayoutProperty(layerId, "visibility") === "none"
        ) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            entry.value === undefined ? null : entry.value
          );
        }
      } catch {
        // A style replacement may already have removed the layer.
      }
    }
    saved.clear();
  };

  const restoreOpaqueDrape = () => {
    for (const [layerId, saved] of savedDrapeOpacities) {
      try {
        const layer = map
          .getStyle()
          .layers?.find(({ id }) => id === layerId) as DrapeLayer | undefined;
        if (
          layer &&
          getLayerSignature(layer) === saved.signature &&
          map.getPaintProperty(layerId, saved.property) === 1
        ) {
          map.setPaintProperty(
            layerId,
            saved.property,
            saved.value === undefined ? null : saved.value
          );
        }
      } catch {
        // A style replacement may already have removed the layer.
      }
    }
    savedDrapeOpacities.clear();
    if (createdBaseLayer) {
      createdBaseLayer = false;
      try {
        if (map.getLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID)) {
          map.removeLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID);
        }
      } catch {
        // The style may already be gone during map teardown.
      }
    }
  };

  const apply = () => {
    if (disposed || applying) return;
    applying = true;
    try {
      // A standalone mesh already places its ground on the map plane. Enabling
      // DEM terrain would raise the camera target above that same ground.
      // Decision: ../../../../engines/maplibre/TILES_COVERAGE.md#standalone-mesh-shadow-camera-ownership.
      if (hasStandaloneTerrain(map)) {
        restoreTerrainFrame();
        restoreTerrainQuality();
        restoreTerrainQuality = () => undefined;
        qualityPatchedTerrain = null;
        restoreOpaqueDrape();
        restoreSavedVisibilities(savedTerrainShadingVisibilities);
        if (terrainMap.getTerrain()) terrainMap.setTerrain(null);
        lastApplyErrorMessage = null;
        return;
      }
      if (!terrainMap.getSource(sourceId) && map.isStyleLoaded()) {
        map.addSource(sourceId, {
          type: "raster-dem",
          tiles: [terrainSource.url],
          tileSize: terrainSource.tileSize,
          minzoom: terrainSource.minzoom,
          maxzoom: terrainSource.maxzoom,
          encoding: terrainSource.encoding,
          bounds: [...terrainSource.bounds],
        });
      }
      if (getDrapeMode() === SHADOW_MAP_STYLE_DRAPE_MODE.LABELS) {
        // The shared scene registry owns the label drape (it also runs
        // without the shadow simulation); only hand the opaque pass back.
        restoreOpaqueDrape();
        restoreSavedVisibilities(savedTerrainShadingVisibilities);
      } else {
        ensureOpaqueDrape();
      }
      // Keep the DEM active for MapLibre label elevation even when Three owns
      // the visible surface. The shared scene clears its captured ground color.
      if (terrainMap.getSource(sourceId)) {
        const current = terrainMap.getTerrain();
        if (current?.source !== sourceId || (current.exaggeration ?? 1) !== 1) {
          terrainMap.setTerrain({ source: sourceId, exaggeration: 1 });
        }
        applyTerrainQuality();
        suppressTerrainFrame();
      }
      lastApplyErrorMessage = null;
    } catch (error) {
      // Style replacement briefly exposes an incomplete style. Its next
      // styledata event retries both the opaque drape and terrain setup.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastApplyErrorMessage) {
        lastApplyErrorMessage = message;
        console.error(
          "[shadow-simulation] MapLibre terrain setup failed",
          error
        );
      }
    } finally {
      applying = false;
    }
  };
  const handleTerrainChange = () => {
    if (!applying) apply();
  };

  map.on(MAPLIBRE_EVENT.STYLE_DATA, apply);
  map.on(MAPLIBRE_EVENT.TERRAIN, handleTerrainChange);
  let standaloneTerrain = hasStandaloneTerrain(map);
  const unsubscribeTerrainOwnership = subscribeSharedThreeTerrain(map, () => {
    const nextStandaloneTerrain = hasStandaloneTerrain(map);
    // This registry also publishes ordinary raster frontier changes.
    if (nextStandaloneTerrain === standaloneTerrain) return;
    standaloneTerrain = nextStandaloneTerrain;
    apply();
  });
  apply();

  const release = () => {
    if (disposed) return;
    disposed = true;
    unsubscribeTerrainOwnership();
    map.off(MAPLIBRE_EVENT.STYLE_DATA, apply);
    map.off(MAPLIBRE_EVENT.TERRAIN, handleTerrainChange);
    restoreTerrainFrame();
    restoreTerrainQuality();
    qualityPatchedTerrain = null;
    restoreOpaqueDrape();
    restoreSavedVisibilities(savedTerrainShadingVisibilities);
    try {
      if (
        !hasStandaloneTerrain(map) &&
        previousTerrain &&
        terrainMap.getSource(previousTerrain.source) !== undefined
      ) {
        terrainMap.setTerrain(previousTerrain);
      } else if (terrainMap.getTerrain()) {
        terrainMap.setTerrain(null);
      }
    } catch {
      // The style may already be gone during map teardown.
    }
  };
  return Object.assign(release, {
    refresh: () => {
      if (!disposed && !applying) apply();
    },
  });
};
