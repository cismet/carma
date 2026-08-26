import { useEffect, useMemo, useRef } from "react";

import { LngLat, MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import type { Scene } from "three";

import {
  buildGenericLayer,
  buildOverlayLayer,
  syncGenericLayerFromSource,
  buildLatheInstances,
  buildLoftMeshes,
  buildExtrusionMeshes,
  buildLod2Meshes,
  DEFAULT_BUILDING_OPACITY,
  featureBuildingColors,
  ensureProfiles,
  resolveOrigin,
} from "@carma-mapping/engines/threejs";
import type {
  BuildingColors,
  BuildingFeature,
  Carma3dConfig,
  ColorMapping,
  Lod2Building,
  Lod2RoofFace,
  ThreePerfData,
  MappedFeature,
  FactoryStats,
  GenericCustomLayer,
} from "@carma-mapping/engines/threejs";

import { useLibreContext } from "../contexts/LibreContext";
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

/** Whether the map can still be asked about its layers.
 *
 *  A panel that goes away destroys its map, and React tears a deleted subtree
 *  down from the top, so this component's cleanup runs after that. `remove()`
 *  drops the style on its way out, which leaves every `getLayer` call reading
 *  a property of nothing. There is also nothing left worth removing at that
 *  point: the map took its layers with it. */
function mapIsUsable(map: MaplibreMap | null | undefined): map is MaplibreMap {
  return !!map && !map._removed && !!map.style;
}

export interface ThreeLayerManagerProps {
  config: Carma3dConfig;
  runtimeParams: Record<string, number | string>;
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
  // console.log("[3D-SELECT] registered layer:", layer.id, "total:", registry.length);
}

function unregister3dLayer(map: MaplibreMap, layer: GenericCustomLayer): void {
  const registry =
    ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
  const idx = registry.indexOf(layer);
  if (idx >= 0) {
    registry.splice(idx, 1);
    // console.log("[3D-SELECT] unregistered layer:", layer.id, "remaining:", registry.length);
  }
  (map as any)[LAYER_REGISTRY_KEY] = registry;
}

/**
 * The colour a feature gets: a colour it carries wins, then a colour its
 * category is mapped to.
 *
 * A colour in the data is more specific than one derived from a class, so the
 * field is asked first and the mapping only fills in behind it. The mapping's
 * `default` also answers for a feature that has no such property at all, which
 * is what makes a half-filled table colour what it knows and leave the rest
 * uniform rather than blank.
 */
function resolveFeatureColor(
  properties: Record<string, unknown> | undefined,
  field: string | undefined,
  mapping: ColorMapping | undefined,
): string | null {
  if (field) {
    const carried = properties?.[field];
    if (typeof carried === "string" && carried !== "") {
      return carried;
    }
  }
  if (mapping?.field) {
    const key = properties?.[mapping.field];
    if (key != null) {
      const mapped = mapping.values?.[String(key)];
      if (mapped) {
        return mapped;
      }
    }
    return mapping.default ?? null;
  }
  return null;
}

/** Get all registered 3D layers from a map instance. */
export function get3dLayers(map: MaplibreMap): GenericCustomLayer[] {
  return ((map as any)[LAYER_REGISTRY_KEY] as GenericCustomLayer[] | undefined) ?? [];
}

/** Apply building color/opacity overrides to existing building meshes in-place. */
function applyBuildingAppearance(
  layer: GenericCustomLayer | null,
  color: string | undefined,
  opacity: number | undefined,
): void {
  if (!layer) return;
  for (const child of layer.scene.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.isBuilding) continue;

    // Update opacity
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (opacity != null) {
      mat.opacity = opacity;
      mat.transparent = opacity < 1;
    }

    // Update vertex colors
    const colorAttr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!colorAttr) continue;
    const colorArray = colorAttr.array as Float32Array;
    const origColors = mesh.userData.originalColors as Float32Array | undefined;

    if (color) {
      const base = new THREE.Color(color);
      for (let i = 0; i < colorArray.length; i += 3) {
        colorArray[i] = base.r;
        colorArray[i + 1] = base.g;
        colorArray[i + 2] = base.b;
      }
    } else if (origColors) {
      colorArray.set(origColors);
    }
    colorAttr.needsUpdate = true;
  }
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
  /** Saved 2D layer opacity values for restore when 3D layer is removed */
  const savedOpacityRef = useRef<Map<string, Array<[string, unknown]>>>(new Map());
  /** Current building appearance overrides (kept in ref so syncBuildings can access) */
  const buildingAppearanceRef = useRef<{ color?: string; opacity?: number }>({});
  /** Where building colours come from this render (same ref reason) */
  const buildingColorsRef = useRef<BuildingColors | undefined>(undefined);
  /** Last logged building count to suppress repeated log lines */
  const lastLoggedCountRef = useRef(-1);

  const useLoft = (Number(runtimeParams.useLoft) || 0) > 0;
  const radiusMix = Number(runtimeParams.radiusMix) || 0;
  const viewportPadding = typeof runtimeParams.viewportPadding === "number" ? runtimeParams.viewportPadding : undefined;

  // Merge runtime viewportPadding override into config
  const effectiveConfig = useMemo(
    () =>
      viewportPadding != null ? { ...config, viewportPadding } : config,
    [config, viewportPadding]
  );

  // Effect 1: Layer lifecycle (tear down on mode change or unmount)
  useEffect(() => {
    if (!map) return;
    return () => {
      if (mapIsUsable(map)) {
        if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
          map.removeLayer(overlayIdRef.current);
        }
        if (layerRef.current) {
          layerRef.current.unhighlight();
          unregister3dLayer(map, layerRef.current);
          const layerId = layerRef.current.id;
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          map.triggerRepaint();
        }
      }
      overlayIdRef.current = null;
      layerRef.current = null;
      addingRef.current = false;
    };
  }, [map, useLoft]);

  // Effect 2: Restore 2D layer opacity on unmount (opacity is managed by addLayer/removeLayer)
  useEffect(() => {
    if (!map) return;
    return () => {
      // Restore any saved 2D layer opacity on unmount. A map that has gone
      // has taken those layers with it, so there is nothing to put back.
      if (mapIsUsable(map)) {
        for (const [layerId, originals] of savedOpacityRef.current) {
          if (!map.getLayer(layerId)) continue;
          for (const [prop, value] of originals) {
            map.setPaintProperty(layerId, prop, (value as number) ?? 1);
          }
        }
      }
      savedOpacityRef.current.clear();
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) {
      return;
    }

    layerRef.current._config = config;
    map?.triggerRepaint();
  }, [config, map]);

  // Effect 3: Data sync (re-runs on radius change without tearing down)
  useEffect(() => {
    if (!map) return;

    const isLod2 = config.renderMode === "lod2";
    // Both building modes want the same surroundings: a footprint layer, ground
    // read from the terrain, and the same layer, selection and idle-sync
    // plumbing. What the roof is built from is decided inside syncBuildings.
    const isExtrusion = config.renderMode === "extrusion" || isLod2;

    const rebuildFn = useLoft
      ? (
          features: MappedFeature[],
          scene: THREE.Scene,
          originMerc: MercatorCoordinate,
          mScale: number,
          cfg: Carma3dConfig
        ): FactoryStats =>
          buildLoftMeshes(features, scene, originMerc, mScale, cfg, 14)
      : buildLatheInstances;

    /** Check if the 2D source layers for this config are visible (layout visibility).
     *  Returns true if no skipIn2DLayerIds are configured or at least one is visible. */
    const isSourceVisible = (): boolean => {
      const ids = config.skipIn2DLayerIds;
      if (!ids || ids.length === 0) return true;
      return ids.some((id) => {
        const vis = map.getLayoutProperty(id, "visibility");
        return vis !== "none";
      });
    };

    /** Tear down the 3D custom layer and overlay (without unmounting the component). */
    const removeLayer = () => {
      if (mapIsUsable(map)) {
        if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
          map.removeLayer(overlayIdRef.current);
        }
        if (layerRef.current) {
          layerRef.current.unhighlight();
          unregister3dLayer(map, layerRef.current);
          if (map.getLayer(layerRef.current.id)) {
            map.removeLayer(layerRef.current.id);
          }
          map.triggerRepaint();
        }

        // Restore 2D layer opacity
        for (const [lid, originals] of savedOpacityRef.current) {
          if (!map.getLayer(lid)) continue;
          for (const [prop, value] of originals) {
            map.setPaintProperty(lid, prop, (value as number) ?? 1);
          }
        }
      }
      overlayIdRef.current = null;
      layerRef.current = null;
      addingRef.current = false;
      savedOpacityRef.current.clear();
    };

    // The 3D custom layers should render above fill/line layers but below
    // the last sub-style in the stack (POI). Find the first layer from the
    // very last source in the style (by position) and insert before it.
    const findInsertBefore = (): string | undefined => {
      const layers = map.getStyle()?.layers ?? [];

      // Walk backwards to find the source used by the very last real layer
      let lastSource: string | undefined;
      for (let i = layers.length - 1; i >= 0; i--) {
        const src = (layers[i] as { source?: string }).source;
        if (src) {
          lastSource = src;
          break;
        }
      }
      if (!lastSource) return undefined;

      // If the last source is our own, nothing to insert before
      const srcId = config.sourceId;
      if (lastSource === srcId || lastSource.endsWith(`::${srcId}`)) return undefined;

      // Find the first layer from that last source
      for (const sl of layers) {
        if ((sl as { source?: string }).source === lastSource) {
          return sl.id;
        }
      }
      return undefined;
    };

    /** Move the 3D + overlay layers to the correct z-position if a later
     *  sub-style (e.g. POI) was added after the 3D layer. */
    let zOrderTarget: string | undefined;
    const ensureZOrder = () => {
      const layer = layerRef.current;
      if (!layer || !map.getLayer(layer.id)) return;
      const beforeId = findInsertBefore();
      if (!beforeId) return;
      // Already moved to this target; skip to avoid styledata loop
      if (zOrderTarget === beforeId) return;
      zOrderTarget = beforeId;

      // Defer to next frame to avoid mutating the style during a styledata callback,
      // which can crash MapLibre's internal diff/painter state.
      requestAnimationFrame(() => {
        try {
          if (!map.getLayer(layer.id)) return;
          console.log("[3D-ZORDER] moving", layer.id, "before", beforeId);
          map.moveLayer(layer.id, beforeId);
          if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
            map.moveLayer(overlayIdRef.current, beforeId);
          }
        } catch (err) {
          console.warn("[3D-ZORDER] moveLayer failed:", err);
          zOrderTarget = undefined; // allow retry
        }
      });
    };

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
        ? `3d-${isLod2 ? "lod2" : "extrusion"}-${config.sourceId}`
        : useLoft ? "3d-generic-loft" : "3d-generic";
      const customLayer = buildGenericLayer(effectiveConfig, rebuildFn, layerId);
      layerRef.current = customLayer;

      try {
        const initialBeforeId = findInsertBefore();
        console.log("[3D-ZORDER] addLayer", layerId, "beforeId:", initialBeforeId,
          "source:", config.sourceId);
        map.addLayer(customLayer, initialBeforeId);
        register3dLayer(map, customLayer);

        const oId = layerId + "-overlay";
        const overlay = buildOverlayLayer(customLayer, oId);
        map.addLayer(overlay, initialBeforeId ?? customLayer.id);
        overlayIdRef.current = oId;

        // Hide 2D layers (skipIn2D) now that 3D layer is active
        if (config.skipIn2DLayerIds?.length) {
          for (const lid of config.skipIn2DLayerIds) {
            const layer2d = map.getLayer(lid);
            if (!layer2d) continue;
            const props = OPACITY_PROPS[layer2d.type];
            if (!props) continue;
            const originals: Array<[string, unknown]> = [];
            for (const prop of props) {
              originals.push([prop, map.getPaintProperty(lid, prop)]);
              map.setPaintProperty(lid, prop, 0.00001);
            }
            savedOpacityRef.current.set(lid, originals);
          }
        }
      } catch (err) {
        console.warn("[3D-SELECT] addLayer failed:", err);
        layerRef.current = null;
      } finally {
        addingRef.current = false;
      }
    };

    /** Config-driven building sync: reads field names from config.fields. */
    const syncBuildings = () => {
      const layer = layerRef.current;
      if (!layer) return;
      if (!map.getSource(config.sourceId)) return;

      // Initialize origin if not yet set (extrusion layers skip the tree rebuild() path)
      if (!layer._originMerc) {
        const originMerc = MercatorCoordinate.fromLngLat(resolveOrigin(config), 0);
        layer._originMerc = originMerc;
        layer._mScale = originMerc.meterInMercatorCoordinateUnits();
      }

      const heightField = config.fields?.heightField;
      const publicField = config.fields?.publicField;
      const roofColorField = config.fields?.roofColorField;
      const wallColorField = config.fields?.wallColorField;
      const roofColorMap = config.roofColorMap;
      const wallColorMap = config.wallColorMap;
      // Where the roof surfaces live and what they call the plane they lie in.
      // Defaults are the names the LoD2 tileset uses.
      const roofSourceLayer = config.roofSourceLayer ?? "roof";
      const parentField = config.fields?.roofParentField ?? "parent_fid";
      const groundField = config.fields?.groundField ?? "z_ground";
      const gradEField = config.fields?.planeGradEField ?? "grad_e";
      const gradNField = config.fields?.planeGradNField ?? "grad_n";
      const zRefField = config.fields?.planeZRefField ?? "z_ref";
      // In lod2 mode the height decides nothing about the shape, which comes
      // from the roof surfaces. It is still read where it is configured,
      // because the raycast grid needs a rough height per building.
      if (!isLod2 && !heightField) { console.warn("[3D-BUILDINGS] no heightField configured"); return; }

      const hasTerrain = map.getTerrain() != null;

      // How the ground under a building is read.
      //
      // `map.queryTerrainElevation` decides which zoom to read the DEM at by
      // running `coveringTiles` over the whole viewport, and it does that on
      // every call before reading its one pixel. Asked once per building that
      // is about 0.3 ms of tile arithmetic against a few microseconds of
      // lookup, so a rebuild of several thousand buildings spends around a
      // second of the main thread in there and the map stands still while the
      // geometry is put together. Every tile that arrives asks for another one.
      //
      // The zoom it arrives at belongs to the camera, not to the point, so it
      // is the same for every building in one rebuild. Worked out once and
      // handed to the per-point entry point, the same lookup costs about a
      // hundred and fiftieth of that and returns the same elevation.
      const terrain = map.terrain;
      const terrainZoom = Math.floor(map.getZoom());
      const elevationAt = (lng: number, lat: number): number => {
        if (!hasTerrain) {
          return 0;
        }
        if (terrain) {
          return terrain.getElevationForLngLatZoom(
            new LngLat(lng, lat),
            terrainZoom
          );
        }
        return map.queryTerrainElevation({ lng, lat }) ?? 0;
      };

      const raw = map.querySourceFeatures(config.sourceId, {
        sourceLayer: config.sourceLayer,
      });

      // Logging moved to end-of-sync summary (only on change)

      // The roof surfaces, gathered per footprint.
      //
      // Deduplicated by feature id first. The tileset is cut without clipping,
      // so a surface that straddles a tile boundary comes back once per tile it
      // touches; left in, every one of its edges would be counted twice and the
      // outline hashing in the factory would take the outside for the inside
      // and leave the walls off.
      const facesByParent = new Map<string, Lod2RoofFace[]>();
      if (isLod2) {
        const seenRoofIds = new Set<string | number>();
        const rawRoofs = map.querySourceFeatures(config.sourceId, {
          sourceLayer: roofSourceLayer,
        });
        for (const rf of rawRoofs) {
          if (rf.id != null) {
            if (seenRoofIds.has(rf.id)) continue;
            seenRoofIds.add(rf.id);
          }
          const parent = rf.properties?.[parentField];
          if (parent == null) continue;
          const gradE = Number(rf.properties?.[gradEField]);
          const gradN = Number(rf.properties?.[gradNField]);
          const zRef = Number(rf.properties?.[zRefField]);
          if (!Number.isFinite(gradE) || !Number.isFinite(gradN) || !Number.isFinite(zRef)) {
            continue;
          }

          const geom = rf.geometry;
          const rings: number[][][] = [];
          if (geom?.type === "Polygon") {
            rings.push(geom.coordinates[0] as number[][]);
          } else if (geom?.type === "MultiPolygon") {
            for (const poly of geom.coordinates) {
              rings.push(poly[0] as number[][]);
            }
          } else {
            continue;
          }

          const key = String(parent);
          let list = facesByParent.get(key);
          if (!list) {
            list = [];
            facesByParent.set(key, list);
          }
          // Only the outer ring: a hole in a roof surface is a light well or a
          // courtyard, and the surfaces around it already bound it.
          for (const ring of rings) {
            if (!ring || ring.length < 4) continue;
            list.push({ ring, gradE, gradN, zRef });
          }
        }
      }

      // Group tile fragments by feature ID, keeping raw feature refs for _sourceFeatures
      interface BldgGroup {
        fragments: number[][][];
        height: number;
        /** the footprint's ground height above sea level; lod2 mode only */
        zGround: number;
        isPublic: boolean;
        /** hex strings straight off the feature; the factory parses them */
        roofColor: string | null;
        wallColor: string | null;
        /** First raw feature for this group (used for _sourceFeatures snapshot) */
        rawFeature: (typeof raw)[0];
      }
      const groups = new Map<string | number, BldgGroup>();

      for (const f of raw) {
        const height = heightField
          ? ((f.properties?.[heightField] as number) ?? 0)
          : 0;
        // In lod2 mode the height is only used for the raycast grid, so a
        // building without one is still worth drawing.
        if (!isLod2 && height <= 0) continue;

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
            groups.set(fid, {
              fragments: [ring],
              height,
              zGround: Number(f.properties?.[groundField]) || 0,
              isPublic: f.properties?.[publicField] === "1",
              roofColor: resolveFeatureColor(
                f.properties,
                roofColorField,
                roofColorMap,
              ),
              wallColor: resolveFeatureColor(
                f.properties,
                wallColorField,
                wallColorMap,
              ),
              rawFeature: f,
            });
          }
        }
      }

      // Build _sourceFeatures snapshot (parallel array, one entry per building group)
      // and assign sourceIndex to each building feature
      const sourceFeatures: Array<{
        id: string | number | undefined;
        properties: Record<string, unknown>;
        source: string;
        sourceLayer: string;
        geometry: GeoJSON.Geometry | null;
      }> = [];
      const groupEntries = Array.from(groups.entries());
      for (const [, g] of groupEntries) {
        const rf = g.rawFeature;
        sourceFeatures.push({
          id: rf.id,
          properties: { ...(rf.properties ?? {}) },
          source: (rf as any).source ?? config.sourceId,
          sourceLayer: (rf as any).sourceLayer ?? config.sourceLayer,
          geometry: rf.geometry ?? null,
        });
      }

      // Build features: union multi-fragment buildings, pass single-fragment ones through
      const buildings: BuildingFeature[] = [];
      const lod2Buildings: Lod2Building[] = [];
      // MappedFeature entries for the spatial grid
      const mappedFeatures: MappedFeature[] = [];
      for (let gi = 0; gi < groupEntries.length; gi++) {
        const [, g] = groupEntries[gi];
        const sourceIndex = gi;
        const ringsToExtrude = g.fragments;

        if (isLod2) {
          // One entry per building, not per fragment: the roof surfaces are the
          // geometry, and they are already gathered for the whole footprint.
          const faces =
            facesByParent.get(String(g.rawFeature.properties?.fid ?? groupEntries[gi][0])) ??
            facesByParent.get(String(groupEntries[gi][0]));
          if (faces && faces.length > 0) {
            const ring = ringsToExtrude[0];
            let cLng = 0;
            let cLat = 0;
            for (const pt of ring) { cLng += pt[0]; cLat += pt[1]; }
            cLng /= ring.length;
            cLat /= ring.length;
            const elevation = elevationAt(cLng, cLat);

            lod2Buildings.push({
              faces,
              zGround: g.zGround,
              elevation,
              isPublic: g.isPublic,
              roofColor: g.roofColor,
              wallColor: g.wallColor,
              sourceIndex,
            });

            let maxR = 0;
            for (const pt of ring) {
              const dLng = (pt[0] - cLng) * 111320 * Math.cos(cLat * Math.PI / 180);
              const dLat = (pt[1] - cLat) * 110540;
              const r = Math.sqrt(dLng * dLng + dLat * dLat);
              if (r > maxR) maxR = r;
            }
            mappedFeatures.push({
              type: "building",
              lng: cLng,
              lat: cLat,
              elevation,
              heightVar: 0,
              diameterVar: 0,
              rotation: 0,
              color: null,
              ring: null,
              heightMax: Math.max(g.height, 3),
              radiusMax: Math.max(maxR, 5),
              _sourceIndex: sourceIndex,
            });
          }
          continue;
        }

        for (const ring of ringsToExtrude) {
          let cLng = 0;
          let cLat = 0;
          for (const pt of ring) { cLng += pt[0]; cLat += pt[1]; }
          cLng /= ring.length;
          cLat /= ring.length;
          const elevation = elevationAt(cLng, cLat);
          buildings.push({
            ring,
            height: g.height,
            elevation,
            isPublic: g.isPublic,
            roofColor: g.roofColor,
            wallColor: g.wallColor,
            sourceIndex,
          });

          // Approximate footprint radius: max distance from centroid to any vertex
          let maxR = 0;
          for (const pt of ring) {
            const dLng = (pt[0] - cLng) * 111320 * Math.cos(cLat * Math.PI / 180);
            const dLat = (pt[1] - cLat) * 110540;
            const r = Math.sqrt(dLng * dLng + dLat * dLat);
            if (r > maxR) maxR = r;
          }

          mappedFeatures.push({
            type: "building",
            lng: cLng,
            lat: cLat,
            elevation,
            heightVar: 0,
            diameterVar: 0,
            rotation: 0,
            color: null,
            ring: null,
            heightMax: g.height,
            radiusMax: Math.max(maxR, 5), // at least 5m for spatial grid
            _sourceIndex: sourceIndex,
          });
        }
      }

      // Skip rebuild if no buildings found and we're above building minzoom
      // (tiles still loading). Below minzoom 14, clear buildings explicitly.
      const builtCount = isLod2 ? lod2Buildings.length : buildings.length;
      if (builtCount === 0) {
        if (map.getZoom() >= 14) return;
      }

      // Store selection data on the layer
      layer._sourceFeatures = sourceFeatures;
      layer._features = mappedFeatures;

      // colours the features carry when the layer names the fields for them,
      // and the public/default pair when it does not; `buildingColor` below
      // overrides either
      if (isLod2) {
        buildLod2Meshes(
          lod2Buildings,
          layer.scene,
          layer._originMerc,
          layer._mScale,
          buildingColorsRef.current,
        );
      } else {
        buildExtrusionMeshes(
          buildings,
          layer.scene,
          layer._originMerc,
          layer._mScale,
          buildingColorsRef.current,
          config.wallAngleThreshold,
        );
      }

      // Re-apply building appearance overrides after geometry rebuild
      const { color, opacity } = buildingAppearanceRef.current;
      if (color || opacity != null) {
        applyBuildingAppearance(layer, color, opacity);
      }

      // Build the spatial grid for raycast pre-filtering (reuse rebuild() logic)
      // We call rebuild() which rebuilds the grid from _features, but for extrusion
      // the geometry was already built above, so we just need the grid part.
      // However, rebuild() also calls the rebuildFn which is a no-op for extrusion.
      // Instead, build the grid inline to avoid double geometry creation.
      const originMerc = layer._originMerc;
      const mScale = layer._mScale;
      const grid = new Map<string, Array<{ sourceIndex: number; x: number; z: number; yBase: number; height: number; radius: number }>>();
      for (const f of mappedFeatures) {
        const mrc = MercatorCoordinate.fromLngLat([f.lng, f.lat], f.elevation);
        const x = (mrc.x - originMerc.x) / mScale;
        const z = (mrc.y - originMerc.y) / mScale;
        const yBase = (mrc.z - originMerc.z) / mScale;
        const GRID_CELL_SIZE = 20;
        const cellX = Math.floor(x / GRID_CELL_SIZE);
        const cellZ = Math.floor(z / GRID_CELL_SIZE);
        const key = `${cellX},${cellZ}`;
        const entry = { sourceIndex: f._sourceIndex, x, z, yBase, height: f.heightMax, radius: f.radiusMax };
        const bucket = grid.get(key);
        if (bucket) bucket.push(entry);
        else grid.set(key, [entry]);
      }
      layer._spatialGrid = grid;

      // The rebuild above replaced the meshes the highlight was painted into,
      // and the source indices it was addressed by. Without restoring it, a
      // tile arriving after a click drops the selection colour on its own.
      const highlightedId = layer._highlightedFeatureId;
      if (highlightedId != null) {
        // stale: its vertex ranges point into the geometry that is now gone
        layer._highlightState = null;
        const restoredIndex = sourceFeatures.findIndex(
          (f) => f.id === highlightedId
        );
        if (restoredIndex >= 0) {
          layer.highlight(restoredIndex);
        } else {
          layer._highlightedFeatureId = null;
        }
      }

      if (builtCount !== lastLoggedCountRef.current) {
        lastLoggedCountRef.current = builtCount;
        console.log("[3D-BUILDINGS]", builtCount, "buildings,",
          sourceFeatures.length, "sourceFeatures,",
          grid.size, "grid cells");
      }

      // Ask for the frame this rebuild is meant to be seen in.
      //
      // What a custom layer holds is not part of MapLibre's own state, so
      // replacing the geometry in the scene tells it nothing: it draws when it
      // has a reason to, and new buildings are not one. Most rebuilds get away
      // with it because what triggered them was a movement, which is drawing
      // anyway. Switching terrain on is not: the camera stands still, the
      // rebuild finishes, and the canvas keeps showing the frame from before it
      // until the user nudges the map.
      map.triggerRepaint();
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
      // If the source's 2D layers are hidden, tear down the 3D layer
      if (!isSourceVisible()) {
        if (layerRef.current) {
          // console.log("[3D-LAYER] hiding 3D layer (source layers not visible):", config.sourceId);
          removeLayer();
        }
        return;
      }

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
    const handleIdle = isExtrusion ? () => { trySync(); } : undefined;
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
    // Also re-checks visibility so toggling a layer back on re-creates the 3D layer
    const handleStyleData = () => {
      if (layerRef.current && !map.getLayer(layerRef.current.id)) {
        unregister3dLayer(map, layerRef.current);
        overlayIdRef.current = null;
        layerRef.current = null;
        addingRef.current = false;
        zOrderTarget = undefined;
      }
      // A later sub-style (e.g. POI) may have loaded after the 3D layer was
      // added, pushing it behind. Re-position if needed.
      ensureZOrder();
      trySync();
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

  // Effect 4: Update building appearance (color + opacity) in-place, no rebuild needed
  const buildingColor = typeof runtimeParams.buildingColor === "string" ? runtimeParams.buildingColor : undefined;
  // How opaque the buildings end up: what the layer is worth on its own, times
  // what the host has asked of the layer as a whole.
  //
  // The multiplication is the same one the 2D side does, where the layer bar's
  // slider scales each paint property against the value the style gave it. So a
  // layer drawn at 0.65 sits at 0.325 when the slider is halfway, and a slider
  // at the top leaves the style's own number alone. Without this the slider
  // moves nothing at all on a three.js layer, since it has no paint properties
  // for the usual path to scale.
  const baseBuildingOpacity =
    typeof runtimeParams.buildingOpacity === "number"
      ? runtimeParams.buildingOpacity
      : config.buildingOpacity ?? DEFAULT_BUILDING_OPACITY;
  const buildingOpacity =
    baseBuildingOpacity * (config.layerOpacity ?? 1);

  // Where the buildings take their colours from.
  //
  // Naming any of the four says the features decide, whether they carry a
  // colour outright or a category that is mapped to one. None of them: a
  // building keeps the colour it gets from being public or not, which is what
  // it has always had.
  //
  // `buildingColor` overrides either, since it repaints every vertex uniformly
  // after the rebuild.
  const buildingColors: BuildingColors | undefined =
    config.fields?.roofColorField ||
    config.fields?.wallColorField ||
    config.roofColorMap ||
    config.wallColorMap
      ? featureBuildingColors
      : undefined;

  // Keep refs in sync so syncBuildings can re-apply after geometry rebuild
  buildingAppearanceRef.current = { color: buildingColor, opacity: buildingOpacity };
  buildingColorsRef.current = buildingColors;

  useEffect(() => {
    if (!map || (config.renderMode !== "extrusion" && config.renderMode !== "lod2")) return;
    applyBuildingAppearance(layerRef.current, buildingColor, buildingOpacity);
    map.triggerRepaint();
  }, [map, config.renderMode, buildingColor, buildingOpacity]);

  return null;
}
