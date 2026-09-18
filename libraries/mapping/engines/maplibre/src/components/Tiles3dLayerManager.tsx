import type { TextureColorCorrection } from "@carma-commons/resources";
import { useEffect, useRef, useMemo } from "react";

import { useLibreContext } from "../contexts/LibreContext";
import {
  WUPPERTAL_CONFIG,
  WUPPERTAL_TERRAIN_SOURCE_ID,
  createTerrainSources,
} from "../constants/wuppertalDefaultStyle";
import { add3dPresence, remove3dPresence } from "../utils/threeDPresence";
import {
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
} from "../lib/runtime/integrations/shared-three-scene-content-registry";
import { claimStandaloneTerrain } from "../lib/runtime/integrations/shared-three-terrain-registry";
import { fetchGroundElevationMeters } from "../lib/core/ground-elevation";
import { acquireSharedThreeScene } from "../lib/runtime/integrations/shared-three-scene-registry";
import { buildThreeTilesRuntime } from "../lib/runtime/integrations/three-tiles-runtime";
import {
  THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
  TILES_ERROR_TARGET_DEFAULT_PIXELS,
  TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS,
  TILES3D_STYLE_VERSION,
  TILESET_MIN_RESOLUTION_DEFAULT_PX,
} from "../lib/runtime/integrations/three-tiles-runtime-config";
import { DEFAULT_MESH_BASE_ERROR_PIXELS } from "../lib/runtime/integrations/three-tiles-load-policy";
import type {
  ThreeTilesRuntime,
  TilesetEntryHint,
} from "../lib/runtime/integrations/three-tiles-runtime-types";

/**
 * Far-plane floor for a standalone tileset whose ground could not be read from
 * the DEM: well below any ground in the state, see `keepFarPlane`.
 */
const STANDALONE_MIN_ELEVATION_FALLBACK_METERS = -500;

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
  /**
   * Contract version of this block, see `TILES3D_STYLE_VERSION`. Optional: a
   * style without one is version 1, the legacy shape that names only the
   * tileset and whether terrain is mandatory. Everything else below is
   * filled in by `resolveTiles3dConfig`.
   */
  version?: number;
  colorCorrection?: TextureColorCorrection;
  /** The tileset.json. */
  tilesetUrl: string;
  /** Idle refinement target in pixels; lower asks for more detail. */
  errorTarget?: number;
  /**
   * Error target of the first, coarse pass over a terrain-providing tileset
   * before loading the residual surface and refining to `errorTarget`.
   * Existing coverage remains until a complete replacement is ready.
   */
  baseErrorTarget?: number;
  /** Residual whole-extent resolution; absent or zero uses the entry hint. */
  tilesetMinResolutionPx?: number;
  /** Register the runtime for the diagnostics story (window.__carmaTiles3d). */
  diagnostics?: boolean;
  /**
   * Let the shadow simulation restyle this tileset like a building layer
   * while shadows are on: uniform colour, texture desaturation, colour
   * grading from the shadow controls. Off by default, so the appearance stays
   * what this block declares. Outlines always follow `outline`.
   */
  shadowBuildingStyle?: boolean;
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
  /**
   * How the map's own content meets the tileset. `labels` (default) drapes
   * the point labels over a terrain-providing tileset and needs MapLibre
   * terrain for the centre elevation. `none` shows the tileset on its own:
   * no drape, no MapLibre terrain, the tileset's ground anchors the map plane.
   */
  basemap?: "labels" | "none";
  /** Root and residency hints for a paged hierarchy, see `TilesetEntryHint`. */
  entry?: TilesetEntryHint;
  /** Worker-backed static hierarchy cache; false loads tileset JSON natively. */
  hierarchyCache?: boolean;
}

export interface Tiles3dLayerManagerProps {
  config: Tiles3dConfig;
  /** The opacity the layer bar asked of this layer, 0 to 1. */
  layerOpacity?: number;
}

export const resolveTiles3dErrorTarget = (
  config: Pick<Tiles3dConfig, "errorTarget" | "providesTerrain">
): number =>
  config.errorTarget ??
  (config.providesTerrain === true
    ? TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS
    : TILES_ERROR_TARGET_DEFAULT_PIXELS);

/** A style config with every default the layer manager applies made explicit. */
export type ResolvedTiles3dConfig = Tiles3dConfig & {
  version: number;
  errorTarget: number;
  basemap: NonNullable<Tiles3dConfig["basemap"]>;
  outline: boolean;
  diagnostics: boolean;
  shadowBuildingStyle: boolean;
};

/**
 * Complete a style's `3d` block with the manager's defaults, so a legacy
 * style (`renderMode`, `tilesetUrl`, `terrainMandatory`) loads the way a fully
 * declared one does. A terrain-providing tileset gets the mesh loading
 * strategy: the base error target of the first pass and a residual resolution
 * for the whole extent. An explicit `tilesetMinResolutionPx: 0` keeps the
 * opt-out that defers to the `entry` hint. Other tilesets refine straight to
 * the error target, as before.
 */
export const resolveTiles3dConfig = (
  config: Tiles3dConfig
): ResolvedTiles3dConfig => {
  const providesTerrain = config.providesTerrain === true;
  return {
    ...config,
    version: config.version ?? TILES3D_STYLE_VERSION,
    errorTarget: resolveTiles3dErrorTarget(config),
    baseErrorTarget:
      config.baseErrorTarget ??
      (providesTerrain ? DEFAULT_MESH_BASE_ERROR_PIXELS : undefined),
    tilesetMinResolutionPx:
      config.tilesetMinResolutionPx ??
      (providesTerrain ? TILESET_MIN_RESOLUTION_DEFAULT_PX : undefined),
    basemap: config.basemap ?? "labels",
    outline: config.outline ?? true,
    diagnostics: config.diagnostics ?? false,
    shadowBuildingStyle: config.shadowBuildingStyle ?? false,
  };
};

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
  const resolved = useMemo(() => resolveTiles3dConfig(config), [config]);
  const configRef = useRef(resolved);
  configRef.current = resolved;

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
    console.debug("[tiles3d-debug] manager mount", {
      tilesetUrl: config.tilesetUrl,
      providesTerrain: config.providesTerrain,
    });
    const center = map.getCenter();
    const origin: [number, number] = [center.lng, center.lat];
    const runtimeId = `three-tiles-${config.tilesetUrl.replace(
      /[^a-zA-Z0-9_-]+/g,
      "-"
    )}`;
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    let teardown: (() => void) | null = null;
    const standalone = initialConfig.basemap === "none";
    const build = (groundReferenceMeters: number | null) => {
      if (disposed) return;
      const runtime = buildThreeTilesRuntime(
        runtimeId,
        config.tilesetUrl,
        origin,
        {
          requestConcurrency: THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
          cameraLocalMount: true,
          cacheBudgetBytes: initialConfig.cacheBudgetBytes,
          cacheOverflowBytes: initialConfig.cacheOverflowBytes,
          outline: initialConfig.outline,
          outlineColor: initialConfig.outlineColor,
          outlineOpacity: initialConfig.outlineOpacity,
          providesTerrain: config.providesTerrain,
          mapStyleDrape: initialConfig.basemap,
          // The DEM answer anchors the ground before the first traversal; the
          // probe on arriving tiles is the fallback when no DEM is reachable.
          groundReferenceMeters: groundReferenceMeters ?? undefined,
          selfGroundReference: standalone && groundReferenceMeters === null,
          baseErrorTargetPixels: initialConfig.baseErrorTarget,
          diagnostics: initialConfig.diagnostics,
          entry: initialConfig.entry,
          hierarchyCache: initialConfig.hierarchyCache,
          colorCorrection: initialConfig.colorCorrection,
          shadowBuildingStyle: initialConfig.shadowBuildingStyle,
          onContentChanged: (changedBounds, changedRoots) =>
            notifySharedThreeSceneContentChanged(map, {
              bounds: changedBounds,
              roots: changedRoots,
            }),
          onRequestStateChange: () =>
            notifySharedThreeSceneRequestStateChanged(map),
        }
      );
      runtime.loading.setErrorTarget(
        initialConfig.errorTarget,
        initialConfig.baseErrorTarget
      );
      runtime.loading.setTilesetMinResolution(
        initialConfig.tilesetMinResolutionPx !== undefined &&
          initialConfig.tilesetMinResolutionPx > 0
          ? initialConfig.tilesetMinResolutionPx
          : null
      );
      runtime.appearance.setOpacity(
        (initialConfig.opacity ?? 1) * (layerOpacityRef.current ?? 1)
      );
      runtime.appearance.setOutlineVisible(initialConfig.outline);
      runtimeRef.current = runtime;
      lease.layer.addRuntime(runtime.scene);
      // What lets the camera restriction know the map has become three
      // dimensional. A tileset stays out of the raycast registry, which
      // holds layers that answer `raycast`, and this one does not.
      add3dPresence(map, runtimeId);
      const unregisterRuntime = registerSharedThreeSceneRuntime(
        map,
        runtime.scene
      );
      const releaseStandaloneTerrain = standalone
        ? claimStandaloneTerrain(map, runtimeId)
        : null;
      // Without MapLibre terrain the far plane sits one percent of the camera
      // distance below elevation zero, and this tileset's ground is anchored
      // at the DEM height of the layer origin: valleys below that plane were
      // clipped, a blank that climbed uphill with every zoom step. Terrain
      // normally feeds the minimum elevation; here the anchor height does.
      const minElevation = standalone
        ? groundReferenceMeters !== null
          ? -groundReferenceMeters
          : STANDALONE_MIN_ELEVATION_FALLBACK_METERS
        : null;
      const keepFarPlane = () => {
        if (minElevation === null || !mapIsUsable(map)) return;
        if (map.transform.minElevationForCurrentTile !== minElevation)
          map.transform.setMinElevationForCurrentTile(minElevation);
      };
      if (minElevation !== null) {
        keepFarPlane();
        map.on("move", keepFarPlane);
        map.on("render", keepFarPlane);
        // The matrices recompute on the next camera change; nudge one.
        const center = map.getCenter();
        map.jumpTo({ center: [center.lng + 1e-9, center.lat] });
        map.jumpTo({ center: [center.lng, center.lat] });
      }
      teardown = () => {
        runtimeRef.current = null;
        if (minElevation !== null) {
          map.off("move", keepFarPlane);
          map.off("render", keepFarPlane);
          if (
            mapIsUsable(map) &&
            map.transform.minElevationForCurrentTile === minElevation
          )
            map.transform.setMinElevationForCurrentTile(0);
        }
        releaseStandaloneTerrain?.();
        remove3dPresence(map, runtimeId);
        unregisterRuntime();
        if (lease.layer.hasRuntime(runtime.scene.id)) {
          lease.layer.removeRuntime(runtime.scene.id);
        }
      };
    };
    if (standalone) {
      // One DEM tile at the origin instead of MapLibre terrain for the whole
      // viewport. The host's background style declares the terrain source
      // (LibreMap builds it from the engine's own declaration). On a reload
      // the manager mounts between the frame that instantiates the source and
      // the frame that copies its TileJSON onto it, so the live instance
      // exists without `tiles` yet; the declaration is then the answer, and
      // `tiles`, `maxzoom` and `encoding` come from one consistent object.
      type TerrainSourceLike = {
        tiles?: string[];
        maxzoom?: number;
        encoding?: string;
      };
      const liveSource = map.getSource(WUPPERTAL_TERRAIN_SOURCE_ID) as
        | TerrainSourceLike
        | undefined;
      const terrainSource: TerrainSourceLike | undefined = liveSource?.tiles
        ?.length
        ? liveSource
        : (createTerrainSources(WUPPERTAL_CONFIG)[
            WUPPERTAL_TERRAIN_SOURCE_ID
          ] as TerrainSourceLike | undefined);
      const template = terrainSource?.tiles?.[0];
      if (template && terrainSource?.encoding !== "mapbox") {
        void fetchGroundElevationMeters(origin[0], origin[1], {
          tileUrlTemplate: template,
          maxzoom: terrainSource.maxzoom,
        }).then(build);
      } else build(null);
    } else build(null);
    return () => {
      disposed = true;
      teardown?.();
      lease.release();
    };
  }, [map, config.tilesetUrl, config.providesTerrain, resolved.basemap]);

  // Terrain is only ever switched on here, never off again: the way back
  // belongs to the terrain control, and so does the setting it persists.
  // Terrain-providing meshes still need MapLibre terrain so the host style's
  // raster and vector content remains draped at the correct elevation.
  //
  // It is answered once per mount. The style can still be loading when the
  // config arrives, which is why this listens on `styledata` at all, but
  // `LibreMap` already carries terrain across a `setStyle`, so a later style
  // change is never a reason to switch it on a second time. Without that guard
  // the next change to the layer list would undo a deliberate switch-off.
  useEffect(() => {
    if (!map) return;
    if (resolved.basemap === "none") {
      // A standalone tileset anchors its own ground; MapLibre terrain would
      // only stream DEM tiles nothing draws on.
      if (mapIsUsable(map) && map.getTerrain()) map.setTerrain(null);
      return;
    }
    if (!config.terrainMandatory && !config.providesTerrain) return;
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
  }, [map, resolved.basemap, config.terrainMandatory, config.providesTerrain]);

  useEffect(() => {
    runtimeRef.current?.loading.setErrorTarget(
      resolved.errorTarget,
      resolved.baseErrorTarget
    );
  }, [resolved.errorTarget, resolved.baseErrorTarget]);

  useEffect(() => {
    runtimeRef.current?.loading.setTilesetMinResolution(
      resolved.tilesetMinResolutionPx !== undefined &&
        resolved.tilesetMinResolutionPx > 0
        ? resolved.tilesetMinResolutionPx
        : null
    );
  }, [resolved.tilesetMinResolutionPx]);

  useEffect(() => {
    runtimeRef.current?.loading.setCacheBudget(config.cacheBudgetBytes, {
      overflowBytes: config.cacheOverflowBytes,
    });
  }, [config.cacheBudgetBytes, config.cacheOverflowBytes]);

  useEffect(() => {
    runtimeRef.current?.appearance.setOutlineVisible(config.outline ?? true);
  }, [config.outline]);

  useEffect(() => {
    runtimeRef.current?.appearance.setOutlineStyle({
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
    runtime.appearance.setOpacity((config.opacity ?? 1) * (layerOpacity ?? 1));
  }, [config.opacity, layerOpacity]);

  return null;
}

export default Tiles3dLayerManager;
