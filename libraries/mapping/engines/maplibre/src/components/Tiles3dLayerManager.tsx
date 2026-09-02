import { useEffect, useRef } from "react";

import { useLibreContext } from "../contexts/LibreContext";
import { WUPPERTAL_TERRAIN_SOURCE_ID } from "../constants/wuppertalDefaultStyle";
import { add3dPresence, remove3dPresence } from "../utils/threeDPresence";
import {
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
} from "../lib/runtime/integrations/shared-three-scene-content-registry";
import { acquireSharedThreeScene } from "../lib/runtime/integrations/shared-three-scene-registry";
import { suppressMapLibreTerrainRendering } from "../lib/runtime/integrations/shared-three-terrain-registry";
import {
  buildThreeTilesRuntime,
  THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
  TILES_ERROR_TARGET_DEFAULT_PIXELS,
  type ThreeTilesRuntime,
} from "../lib/runtime/integrations/three-tiles-runtime";

// ─────────────────────────────────────────────────────────────
//  Tiles3dLayerManager: mounts a 3D Tiles tileset named by a style.
//
//  The counterpart to ThreeLayerManager for tilesets rather than vector
//  sources. A style that only carries a tileset URL has no source and no
//  layers of its own, so there is nothing to query, nothing to sync and
//  nothing to rebuild: the layer goes on when the config arrives and comes off
//  when it goes away.
// ─────────────────────────────────────────────────────────────

/** What a style has to say for a tileset to be drawn. */
export interface Tiles3dConfig {
  renderMode: "tiles3d";
  /** The tileset.json. */
  tilesetUrl: string;
  /** Pixels of allowed error; lower asks for more detail. */
  errorTarget?: number;
  /** 0 to 1. */
  opacity?: number;
  /**
   * Decoded bytes the tileset may hold before the renderer starts evicting.
   * Left out, the layer's own default applies.
   */
  cacheBudgetBytes?: number;
  /**
   * Decoded bytes the cache may run past that budget before downloading is
   * refused. A tileset whose close views need more than the budget, a city
   * mesh for instance, raises this rather than the budget: eviction still
   * works off the budget, and only the headroom decides whether such a view
   * can finish. JSON cannot write `Infinity`, so a number large enough never
   * to be reached is how unbounded is asked for.
   */
  cacheOverflowBytes?: number;
  /**
   * Draw the edges the tileset marks with `CESIUM_primitive_outline`. Defaults
   * to on, matching what Cesium does with the same tileset.
   */
  outline?: boolean;
  /** Colour of those edges, any CSS colour. */
  outlineColor?: string;
  /** 0 to 1 for the edges alone. */
  outlineOpacity?: number;
  /**
   * Switch the map's terrain on when this layer arrives.
   *
   * A tileset carries absolute heights. Without terrain the reorientation is
   * given a ground height of zero, so the whole set hangs as far above the map
   * as the ground lies above sea level: around 200 m in Wuppertal, out of
   * frame. A style that cannot be read without terrain says so here instead of
   * being drawn wrong.
   */
  terrainMandatory?: boolean;
  /** The tileset itself supplies terrain, so separate Three.js terrain is redundant. */
  providesTerrain?: boolean;
}

export interface Tiles3dLayerManagerProps {
  config: Tiles3dConfig;
  /** The opacity the layer bar asked of this layer, 0 to 1. */
  layerOpacity?: number;
}

export const resolveTiles3dErrorTarget = (
  config: Pick<Tiles3dConfig, "errorTarget">
): number => config.errorTarget ?? TILES_ERROR_TARGET_DEFAULT_PIXELS;

/** Whether the map can still be asked about its layers, see ThreeLayerManager. */
function mapIsUsable(map: unknown): boolean {
  const candidate = map as { _removed?: boolean; style?: unknown } | null;
  return !!candidate && !candidate._removed && !!candidate.style;
}

export function Tiles3dLayerManager({
  config,
  layerOpacity,
}: Tiles3dLayerManagerProps) {
  const { map } = useLibreContext();
  const runtimeRef = useRef<ThreeTilesRuntime | null>(null);
  // Whether the terrain demand has been answered for this mount, see below.
  const terrainSettledRef = useRef(false);
  // Read while building a layer, which happens outside the effects that follow
  // the sliders and the style, so the first frame after a rebuild is already
  // at the right settings instead of flashing opaque or coarse.
  const layerOpacityRef = useRef<number | undefined>(layerOpacity);
  layerOpacityRef.current = layerOpacity;
  const configRef = useRef(config);
  configRef.current = config;

  // Native style-declared tilesets use the shared Three.js scene as well. This
  // is what lets the shadow add-on's directional light and shadow map reach
  // them; without the add-on, the shared scene keeps its regular ambient-only
  // rendering and no shadow light exists.
  //
  // The runtime is rebuilt only for another map, tileset or terrain role;
  // everything else reaches it through its setters below, so a slider does not
  // drop the tile cache.
  useEffect(() => {
    if (!map || !config.tilesetUrl || !mapIsUsable(map)) return;

    const initialConfig = configRef.current;
    const restoreMapLibreTerrain = config.providesTerrain
      ? suppressMapLibreTerrainRendering(map)
      : null;
    const center = map.getCenter();
    const origin: [number, number] = [center.lng, center.lat];
    const runtimeId = `three-tiles-${config.tilesetUrl.replace(
      /[^a-zA-Z0-9_-]+/g,
      "-"
    )}`;
    const lease = acquireSharedThreeScene(map);
    const runtime = buildThreeTilesRuntime(
      runtimeId,
      config.tilesetUrl,
      origin,
      {
        requestConcurrency: THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
        cacheBudgetBytes: initialConfig.cacheBudgetBytes,
        cacheOverflowBytes: initialConfig.cacheOverflowBytes,
        outline: initialConfig.outline,
        outlineColor: initialConfig.outlineColor,
        outlineOpacity: initialConfig.outlineOpacity,
        providesTerrain: config.providesTerrain,
        shadowBuildingStyle: true,
        onContentChanged: () => notifySharedThreeSceneContentChanged(map),
        onRequestStateChange: () =>
          notifySharedThreeSceneRequestStateChanged(map),
      }
    );
    runtime.setErrorTarget(resolveTiles3dErrorTarget(initialConfig));
    runtime.setOpacity(
      (initialConfig.opacity ?? 1) * (layerOpacityRef.current ?? 1)
    );
    runtime.setOutlineVisible(initialConfig.outline ?? true);
    runtimeRef.current = runtime;
    lease.layer.addRuntime(runtime);
    // What lets the camera restriction know the map has become three
    // dimensional. A tileset stays out of the raycast registry, which
    // holds layers that answer `raycast`, and this one does not.
    add3dPresence(map, runtimeId);
    const unregisterRuntime = registerSharedThreeSceneRuntime(map, runtime);

    return () => {
      runtimeRef.current = null;
      remove3dPresence(map, runtimeId);
      unregisterRuntime();
      if (lease.layer.hasRuntime(runtime.id)) {
        lease.layer.removeRuntime(runtime.id);
      }
      lease.release();
      restoreMapLibreTerrain?.();
    };
  }, [map, config.tilesetUrl, config.providesTerrain]);

  // Terrain is only ever switched on here, never off again: the way back
  // belongs to the terrain control, and so does the setting it persists.
  //
  // It is answered once per mount. The style can still be loading when the
  // config arrives, which is why this listens on `styledata` at all, but
  // `LibreMap` already carries terrain across a `setStyle`, so a later style
  // change is never a reason to switch it on a second time. Without that guard
  // the next change to the layer list would undo a deliberate switch-off.
  useEffect(() => {
    if (!map || !config.terrainMandatory || config.providesTerrain) return;

    terrainSettledRef.current = false;

    const demandTerrain = () => {
      if (terrainSettledRef.current || !mapIsUsable(map)) return;
      if (map.getTerrain()) {
        terrainSettledRef.current = true;
        return;
      }
      // Still loading: the next styledata gets another go.
      if (!map.getSource(WUPPERTAL_TERRAIN_SOURCE_ID)) return;
      map.setTerrain({ source: WUPPERTAL_TERRAIN_SOURCE_ID, exaggeration: 1 });
      terrainSettledRef.current = true;
    };

    demandTerrain();
    map.on("styledata", demandTerrain);

    return () => {
      map.off("styledata", demandTerrain);
    };
  }, [map, config.terrainMandatory, config.providesTerrain]);

  useEffect(() => {
    runtimeRef.current?.setErrorTarget(
      resolveTiles3dErrorTarget({ errorTarget: config.errorTarget })
    );
  }, [config.errorTarget]);

  useEffect(() => {
    runtimeRef.current?.setCacheBudget(config.cacheBudgetBytes, {
      overflowBytes: config.cacheOverflowBytes,
    });
  }, [config.cacheBudgetBytes, config.cacheOverflowBytes]);

  useEffect(() => {
    runtimeRef.current?.setOutlineVisible(config.outline ?? true);
  }, [config.outline]);

  useEffect(() => {
    runtimeRef.current?.setOutlineStyle({
      color: config.outlineColor ?? 0x000000,
      opacity: config.outlineOpacity ?? 1,
    });
  }, [config.outlineColor, config.outlineOpacity]);

  // The layer bar's slider reaches a 2D layer as paint properties, which a
  // custom layer has none of, so it is multiplied in here the way the three.js
  // building layers do it.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setOpacity((config.opacity ?? 1) * (layerOpacity ?? 1));
  }, [config.opacity, layerOpacity]);

  return null;
}

export default Tiles3dLayerManager;
