import { useEffect, useRef } from "react";
import { useLibreContext } from "../contexts/LibreContext";
import type {
  Carma3dConfig,
  ThreePerfData,
  MappedFeature,
  FactoryStats,
  GenericCustomLayer,
} from "@carma-mapping/engines/threejs";
import {
  buildGenericLayer,
  buildOverlayLayer,
  syncGenericLayerFromSource,
  buildLatheInstances,
  buildLoftMeshes,
  buildExtrusionMeshes,
  ensureProfiles,
} from "@carma-mapping/engines/threejs";
import type { BuildingFeature } from "@carma-mapping/engines/threejs";
import type { Scene } from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import { polygon as turfPolygon } from "@turf/helpers";
import turfUnion from "@turf/union";

// ─────────────────────────────────────────────────────────────
//  ThreeLayerManager: bridges carma3d configs to the threejs engine
// ─────────────────────────────────────────────────────────────

/** MapLibre paint properties that control opacity, keyed by layer type. */
const OPACITY_PROPS: Record<string, string[]> = {
  circle: ["circle-opacity", "circle-stroke-opacity"],
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  raster: ["raster-opacity"],
  heatmap: ["heatmap-opacity"],
};

export interface ThreeLayerManagerProps {
  config: Carma3dConfig;
  runtimeParams: Record<string, number>;
  perfRef?: React.MutableRefObject<ThreePerfData>;
}

// ─────────────────────────────────────────────────────────────
//  Registry: expose 3D layers on the map instance for click handling
// ─────────────────────────────────────────────────────────────

const LAYER_REGISTRY_KEY = "__carma3dLayers";

function register3dLayer(map: MaplibreMap, layer: GenericCustomLayer): void {
  const registry =
    ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
  if (!registry.includes(layer)) {
    registry.push(layer);
  }
  (map as any)[LAYER_REGISTRY_KEY] = registry;
  console.log("[3D-SELECT] registered layer:", layer.id, "total:", registry.length);
}

function unregister3dLayer(map: MaplibreMap, layer: GenericCustomLayer): void {
  const registry =
    ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
  const idx = registry.indexOf(layer);
  if (idx >= 0) {
    registry.splice(idx, 1);
    console.log("[3D-SELECT] unregistered layer:", layer.id, "remaining:", registry.length);
  }
  (map as any)[LAYER_REGISTRY_KEY] = registry;
}

/** Get all registered 3D layers from a map instance. */
export function get3dLayers(map: MaplibreMap): GenericCustomLayer[] {
  return ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
}

const EMPTY_PERF: ThreePerfData = {
  mode: "",
  treeCount: 0,
  triangles: 0,
  drawCalls: 0,
  syncMs: 0,
};

export function ThreeLayerManager({
  config,
  runtimeParams,
  perfRef,
}: ThreeLayerManagerProps) {
  const { map } = useLibreContext();
  const layerRef = useRef<GenericCustomLayer | null>(null);
  const overlayIdRef = useRef<string | null>(null);
  const profilesEnsuredRef = useRef(false);
  const addingRef = useRef(false);

  const useLoft = (runtimeParams.useLoft ?? 0) > 0;
  const radiusMix = runtimeParams.radiusMix ?? 0;
  const viewportPadding = runtimeParams.viewportPadding;

  // Merge runtime viewportPadding override into config
  const effectiveConfig = viewportPadding != null
    ? { ...config, viewportPadding }
    : config;

  // Effect 1: Layer lifecycle (tear down on mode change or unmount)
  useEffect(() => {
    if (!map) return;
    return () => {
      if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
        map.removeLayer(overlayIdRef.current);
      }
      overlayIdRef.current = null;
      if (layerRef.current) {
        layerRef.current.unhighlight();
        unregister3dLayer(map, layerRef.current);
        const layerId = layerRef.current.id;
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        map.triggerRepaint();
      }
      layerRef.current = null;
      addingRef.current = false;
    };
  }, [map, useLoft]);

  // Effect 2: Hide 2D layers with skipIn2D (set opacity to near-zero, restore on cleanup)
  useEffect(() => {
    if (!map || !config.skipIn2DLayerIds?.length) return;

    const saved = new Map<string, Array<[string, unknown]>>();

    for (const layerId of config.skipIn2DLayerIds) {
      const layer = map.getLayer(layerId);
      if (!layer) continue;
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;

      const originals: Array<[string, unknown]> = [];
      for (const prop of props) {
        originals.push([prop, map.getPaintProperty(layerId, prop)]);
        map.setPaintProperty(layerId, prop, 0.00001);
      }
      saved.set(layerId, originals);
    }

    return () => {
      for (const [layerId, originals] of saved) {
        if (!map.getLayer(layerId)) continue;
        for (const [prop, value] of originals) {
          map.setPaintProperty(layerId, prop, (value as number) ?? 1);
        }
      }
    };
  }, [map, config.skipIn2DLayerIds]);

  // Effect 3: Data sync (re-runs on radius change without tearing down)
  useEffect(() => {
    if (!map) return;

    const isExtrusion = config.renderMode === "extrusion";

    const rebuildFn = useLoft
      ? (
          features: MappedFeature[],
          scene: Scene,
          originMerc: MercatorCoordinate,
          mScale: number,
          cfg: Carma3dConfig
        ): FactoryStats =>
          buildLoftMeshes(features, scene, originMerc, mScale, cfg, 14)
      : buildLatheInstances;

    const addLayerIfReady = async () => {
      if (layerRef.current || addingRef.current) return;
      if (!map.getSource(config.sourceId)) return;
      addingRef.current = true;

      // Compile any inline JS profiles before the first synchronous rebuild (trees only)
      if (!isExtrusion && !profilesEnsuredRef.current) {
        await ensureProfiles(effectiveConfig);
        profilesEnsuredRef.current = true;
      }

      const layerId = isExtrusion
        ? `3d-extrusion-${config.sourceId}`
        : useLoft ? "3d-generic-loft" : "3d-generic";
      const customLayer = buildGenericLayer(effectiveConfig, rebuildFn, layerId);
      layerRef.current = customLayer;

      try {
        map.addLayer(customLayer);
        register3dLayer(map, customLayer);

        // Add overlay layer at the end (after symbols) for label occlusion
        const oId = layerId + "-overlay";
        const overlay = buildOverlayLayer(customLayer, oId);
        map.addLayer(overlay);
        overlayIdRef.current = oId;
      } catch (err) {
        console.warn("[3D-SELECT] addLayer failed:", err);
        layerRef.current = null;
      } finally {
        addingRef.current = false;
      }
    };

    /** Union tile-clipped polygon fragments using turf. */
    const unionRings = (rings: number[][][]): number[][] | null => {
      try {
        // Ensure each ring is closed (turf requires it)
        const features = rings.map((r) => {
          const first = r[0];
          const last = r[r.length - 1];
          const closed = (first[0] !== last[0] || first[1] !== last[1])
            ? [...r, first] : r;
          return turfPolygon([closed]);
        });

        // turf v7 union takes a FeatureCollection
        const fc = { type: "FeatureCollection" as const, features };
        const merged = turfUnion(fc);
        if (!merged || merged.geometry.type !== "Polygon") {
          console.warn("[3D-MERGE] turf union produced", merged?.geometry.type);
          return null;
        }

        // Extract outer ring, strip closing vertex for our factory
        const outerRing = merged.geometry.coordinates[0] as number[][];
        return outerRing.slice(0, -1);
      } catch (err) {
        console.warn("[3D-MERGE] turf union failed:", err);
        return null;
      }
    };

    /** Config-driven building sync: reads field names from config.fields. */
    const syncBuildings = () => {
      const layer = layerRef.current;
      if (!layer) return;
      if (!map.getSource(config.sourceId)) { console.log("[3D-BUILDINGS] skip: no source", config.sourceId); return; }

      // Initialize origin if not yet set (extrusion layers skip the tree rebuild() path)
      if (!layer._originMerc) {
        const center: [number, number] = config.mapCenter ?? [7.150764, 51.256222];
        const originMerc = MercatorCoordinate.fromLngLat(center, 0);
        layer._originMerc = originMerc;
        layer._mScale = originMerc.meterInMercatorCoordinateUnits();
      }

      const heightField = config.fields?.heightField ?? "building_height";
      const publicField = config.fields?.publicField ?? "oeffentl";

      const hasTerrain = map.getTerrain() != null;
      const raw = map.querySourceFeatures(config.sourceId, {
        sourceLayer: config.sourceLayer,
      });

      console.log("[3D-BUILDINGS] raw:", raw.length, "zoom:", map.getZoom().toFixed(1),
        "source:", config.sourceId, "sourceLayer:", config.sourceLayer);

      // Group tile fragments by feature ID
      interface BldgGroup {
        fragments: number[][][];
        height: number;
        isPublic: boolean;
      }
      const groups = new Map<string | number, BldgGroup>();

      for (const f of raw) {
        const height = (f.properties?.[heightField] as number) ?? 0;
        if (height <= 0) continue;

        const geom = f.geometry;
        const polyRings: number[][][] = [];
        if (geom?.type === "Polygon") {
          polyRings.push(geom.coordinates[0] as number[][]);
        } else if (geom?.type === "MultiPolygon") {
          for (const poly of geom.coordinates) {
            polyRings.push(poly[0] as number[][]);
          }
        } else {
          continue;
        }

        for (const ring of polyRings) {
          if (!ring || ring.length < 3) continue;
          const fid = f.id ?? `${f.properties?.gml_id ?? ""}`;
          const g = groups.get(fid);
          if (g) {
            g.fragments.push(ring);
          } else {
            groups.set(fid, { fragments: [ring], height, isPublic: f.properties?.[publicField] === "1" });
          }
        }
      }

      // Build features: union multi-fragment buildings, pass single-fragment ones through
      const buildings: BuildingFeature[] = [];
      let mergedOk = 0;
      let mergeFailed = 0;
      for (const [, g] of groups) {
        let ringsToExtrude: number[][][];

        if (g.fragments.length === 1) {
          ringsToExtrude = [g.fragments[0]];
        } else {
          const merged = unionRings(g.fragments);
          if (merged) {
            ringsToExtrude = [merged];
            mergedOk++;
          } else {
            // Fallback: render fragments separately (minor overlap seam)
            ringsToExtrude = g.fragments;
            mergeFailed++;
            console.warn("[3D-BUILDINGS] merge failed, fragments:",
              JSON.stringify(g.fragments));
          }
        }

        for (const ring of ringsToExtrude) {
          let cLng = 0;
          let cLat = 0;
          for (const pt of ring) { cLng += pt[0]; cLat += pt[1]; }
          cLng /= ring.length;
          cLat /= ring.length;
          const elevation = hasTerrain
            ? (map.queryTerrainElevation({ lng: cLng, lat: cLat }) ?? 0)
            : 0;
          buildings.push({ ring, height: g.height, elevation, isPublic: g.isPublic });
        }
      }

      // Skip rebuild if no buildings found and we're above building minzoom
      // (tiles still loading). Below minzoom 14, clear buildings explicitly.
      if (buildings.length === 0) {
        if (map.getZoom() >= 14) return;
      }

      buildExtrusionMeshes(buildings, layer.scene, layer._originMerc, layer._mScale);
      console.log("[3D-BUILDINGS]", buildings.length, "buildings,",
        mergedOk, "merged,", mergeFailed, "merge-failed (fallback to fragments)");
    };

    /** Sync trees: queries source features and rebuilds tree geometry. */
    const syncTrees = () => {
      if (!layerRef.current || !map.getSource(config.sourceId)) return;

      const result = syncGenericLayerFromSource(
        map,
        layerRef.current,
        radiusMix
      );
      if (result && perfRef) {
        perfRef.current = {
          ...result,
          mode: useLoft ? "umring" : "kreis",
        };
      }
    };

    const trySync = async () => {
      await addLayerIfReady();
      if (!layerRef.current || !map.getSource(config.sourceId)) return;

      if (isExtrusion) {
        syncBuildings();
      } else {
        syncTrees();
      }
    };

    map.on("moveend", trySync);

    // For extrusion layers, also sync after idle (all tiles loaded)
    const handleIdle = isExtrusion ? () => { syncBuildings(); } : undefined;
    if (handleIdle) map.on("idle", handleIdle);

    const handleSourceData = (e: {
      sourceId: string;
      isSourceLoaded: boolean;
    }) => {
      if (e.sourceId === config.sourceId && e.isSourceLoaded) {
        trySync();
      }
    };
    map.on("sourcedata", handleSourceData);

    // Force rebuild when terrain is toggled so elevation is applied/removed
    const handleTerrain = () => {
      trySync();
    };
    map.on("terrain", handleTerrain);

    // Re-add layer after background style change (style swap removes custom layers)
    const handleStyleData = () => {
      if (layerRef.current && !map.getLayer(layerRef.current.id)) {
        overlayIdRef.current = null;
        layerRef.current = null;
        addingRef.current = false;
        trySync();
      }
    };
    map.on("styledata", handleStyleData);

    // Sync immediately if the map is already idle
    if (map.isStyleLoaded()) {
      trySync();
    } else {
      map.once("idle", trySync);
    }

    return () => {
      map.off("moveend", trySync);
      if (handleIdle) map.off("idle", handleIdle);
      map.off("sourcedata", handleSourceData);
      map.off("terrain", handleTerrain);
      map.off("styledata", handleStyleData);
      if (perfRef) {
        perfRef.current = EMPTY_PERF;
      }
    };
  }, [map, useLoft, radiusMix, config, effectiveConfig, perfRef]);

  return null;
}
