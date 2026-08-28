import { useEffect, useMemo, useRef } from "react";

import { LngLat, MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import * as THREE from "three";

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
import {
  notifyGenericThreeLayerContentChanged,
  registerGenericThreeLayer,
  unregisterGenericThreeLayer,
} from "../lib/runtime/integrations/generic-three-layer-registry";
import { getMapLibreLayerOpacityProperties } from "../lib/runtime/integrations/map-style-layer-suppression";
import {
  getSharedThreeTerrainElevation,
  subscribeSharedThreeTerrain,
} from "../lib/runtime/integrations/shared-three-terrain-registry";
import {
  getFootprintRadiusMeters,
  getRingBounds,
  mergeGeographicBounds,
  retainBuildingGroupsInView,
  type CachedBuildingGroup,
} from "./building-group-cache";

/** Whether layer cleanup can still access the map style. */
function mapIsUsable(map: MaplibreMap | null | undefined): map is MaplibreMap {
  return !!map && !map._removed && !!map.style;
}

export interface ThreeLayerManagerProps {
  config: Carma3dConfig;
  runtimeParams: Record<string, number | string>;
  perfRef?: React.MutableRefObject<ThreePerfData>;
}

/** Resolve a direct feature color before its category mapping and default. */
function resolveFeatureColor(
  properties: Record<string, unknown> | undefined,
  field: string | undefined,
  mapping: ColorMapping | undefined
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

/** Apply building color/opacity overrides to existing building meshes in-place. */
function applyBuildingAppearance(
  layer: GenericCustomLayer | null,
  color: string | undefined,
  opacity: number | undefined
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
    const colorAttr = mesh.geometry.getAttribute("color") as
      | THREE.BufferAttribute
      | undefined;
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
  const savedOpacityRef = useRef<Map<string, Array<[string, unknown]>>>(
    new Map()
  );
  const buildingAppearanceRef = useRef<{ color?: string; opacity?: number }>(
    {}
  );
  const buildingColorsRef = useRef<BuildingColors | undefined>(undefined);

  const useLoft = (Number(runtimeParams.useLoft) || 0) > 0;
  const radiusMix = Number(runtimeParams.radiusMix) || 0;
  const viewportPadding =
    typeof runtimeParams.viewportPadding === "number"
      ? runtimeParams.viewportPadding
      : undefined;

  const effectiveConfig = useMemo(
    () => (viewportPadding != null ? { ...config, viewportPadding } : config),
    [config, viewportPadding]
  );

  useEffect(() => {
    if (!map) return;
    return () => {
      if (mapIsUsable(map)) {
        if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
          map.removeLayer(overlayIdRef.current);
        }
        if (layerRef.current) {
          layerRef.current.unhighlight();
          unregisterGenericThreeLayer(map, layerRef.current);
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

  useEffect(() => {
    if (!map) return;
    return () => {
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

  useEffect(() => {
    if (!map) return;

    const isLod2 = config.renderMode === "lod2";
    const isExtrusion = config.renderMode === "extrusion" || isLod2;
    const buildingElevationCache = new Map<string, number>();
    const buildingGroupCache = new Map<string | number, CachedBuildingGroup>();
    let buildingGroupCacheZoom: number | null = null;

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
          unregisterGenericThreeLayer(map, layerRef.current);
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
      buildingGroupCache.clear();
      buildingGroupCacheZoom = null;
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
      if (lastSource === srcId || lastSource.endsWith(`::${srcId}`))
        return undefined;

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
          map.moveLayer(layer.id, beforeId);
          if (overlayIdRef.current && map.getLayer(overlayIdRef.current)) {
            map.moveLayer(overlayIdRef.current, beforeId);
          }
        } catch (err) {
          console.error("[3D-ZORDER] moveLayer failed:", err);
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
        : useLoft
        ? "3d-generic-loft"
        : "3d-generic";
      const customLayer = buildGenericLayer(
        effectiveConfig,
        rebuildFn,
        layerId
      );
      layerRef.current = customLayer;

      try {
        const initialBeforeId = findInsertBefore();
        map.addLayer(customLayer, initialBeforeId);
        registerGenericThreeLayer(map, customLayer);

        const oId = layerId + "-overlay";
        const overlay = buildOverlayLayer(customLayer, oId);
        map.addLayer(overlay, initialBeforeId ?? customLayer.id);
        overlayIdRef.current = oId;

        // Hide 2D layers (skipIn2D) now that 3D layer is active
        if (config.skipIn2DLayerIds?.length) {
          for (const lid of config.skipIn2DLayerIds) {
            const layer2d = map.getLayer(lid);
            if (!layer2d) continue;
            const props = getMapLibreLayerOpacityProperties(layer2d.type);
            if (props.length === 0) continue;
            const originals: Array<[string, unknown]> = [];
            for (const prop of props) {
              originals.push([prop, map.getPaintProperty(lid, prop)]);
              map.setPaintProperty(lid, prop, 0.00001);
            }
            savedOpacityRef.current.set(lid, originals);
          }
        }
      } catch (err) {
        console.error("[3D-SELECT] addLayer failed:", err);
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
        const originMerc = MercatorCoordinate.fromLngLat(
          resolveOrigin(config),
          0
        );
        layer._originMerc = originMerc;
        layer._mScale = originMerc.meterInMercatorCoordinateUnits();
      }

      const heightField = config.fields?.heightField;
      const publicField = config.fields?.publicField;
      const roofColorField = config.fields?.roofColorField;
      const wallColorField = config.fields?.wallColorField;
      const roofColorMap = config.roofColorMap;
      const wallColorMap = config.wallColorMap;
      const roofSourceLayer = config.roofSourceLayer ?? "roof";
      const parentField = config.fields?.roofParentField ?? "parent_fid";
      const groundField = config.fields?.groundField ?? "z_ground";
      const gradEField = config.fields?.planeGradEField ?? "grad_e";
      const gradNField = config.fields?.planeGradNField ?? "grad_n";
      const zRefField = config.fields?.planeZRefField ?? "z_ref";
      // LoD2 geometry comes from roof surfaces; height only sizes its ray grid.
      if (!isLod2 && !heightField) {
        console.error("[3D-BUILDINGS] no heightField configured");
        return;
      }

      const hasTerrain = map.getTerrain() != null;

      // Resolve the terrain zoom once; MapLibre otherwise recomputes viewport
      // coverage for every building elevation lookup.
      const terrain = map.terrain;
      const terrainZoom = Math.floor(map.getZoom());
      const elevationAt = (lng: number, lat: number): number => {
        const cacheKey = `${lng.toFixed(7)}/${lat.toFixed(7)}`;
        let elevation: number | undefined;
        if (hasTerrain && terrain) {
          elevation = terrain.getElevationForLngLatZoom(
            new LngLat(lng, lat),
            terrainZoom
          );
        } else if (hasTerrain) {
          elevation = map.queryTerrainElevation({ lng, lat }) ?? undefined;
        } else {
          elevation = getSharedThreeTerrainElevation(map, lng, lat);
        }
        if (Number.isFinite(elevation)) {
          buildingElevationCache.set(cacheKey, elevation!);
          return elevation!;
        }
        return buildingElevationCache.get(cacheKey) ?? 0;
      };

      const raw = map.querySourceFeatures(config.sourceId, {
        sourceLayer: config.sourceLayer,
      });

      // Tile-boundary duplicates would cancel roof outline edges.
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
          if (
            !Number.isFinite(gradE) ||
            !Number.isFinite(gradN) ||
            !Number.isFinite(zRef)
          ) {
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

      // Source tiles may disappear while their building still crosses the
      // viewport. Group the current fragments, then merge them into the
      // zoom-local retention cache below.
      const queriedGroups = new Map<string | number, CachedBuildingGroup>();

      for (const f of raw) {
        const height = heightField
          ? (f.properties?.[heightField] as number) ?? 0
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
          const fragment = ring.map(([longitude, latitude]) => [
            longitude,
            latitude,
          ]);
          const fid =
            f.id ?? `${f.properties?.gml_id ?? JSON.stringify(fragment)}`;
          const fragmentBounds = getRingBounds(fragment);
          const mapFeature = f as MapGeoJSONFeature & {
            sourceLayer?: string;
          };
          const g = queriedGroups.get(fid);
          if (g) {
            g.fragments.push(fragment);
            g.bounds = mergeGeographicBounds(g.bounds, fragmentBounds);
          } else {
            queriedGroups.set(fid, {
              fragments: [fragment],
              height,
              zGround: Number(f.properties?.[groundField]) || 0,
              roofFaces:
                facesByParent.get(String(f.properties?.fid ?? fid)) ??
                facesByParent.get(String(fid)),
              isPublic: f.properties?.[publicField] === "1",
              roofColor: resolveFeatureColor(
                f.properties,
                roofColorField,
                roofColorMap
              ),
              wallColor: resolveFeatureColor(
                f.properties,
                wallColorField,
                wallColorMap
              ),
              sourceFeature: {
                id: f.id,
                properties: { ...(f.properties ?? {}) },
                source: mapFeature.source ?? config.sourceId,
                sourceLayer: mapFeature.sourceLayer ?? config.sourceLayer,
              },
              bounds: fragmentBounds,
            });
          }
        }
      }

      const currentZoom = Math.floor(map.getZoom());
      if (buildingGroupCacheZoom !== currentZoom) {
        buildingGroupCache.clear();
        buildingGroupCacheZoom = currentZoom;
      }
      const viewport = map.getBounds();
      retainBuildingGroupsInView(buildingGroupCache, queriedGroups, {
        west: viewport.getWest(),
        south: viewport.getSouth(),
        east: viewport.getEast(),
        north: viewport.getNorth(),
      });

      // Build _sourceFeatures snapshot (parallel array, one entry per building group)
      // and assign sourceIndex to each building feature
      const sourceFeatures: Array<{
        id: string | number | undefined;
        properties: Record<string, unknown>;
        source: string;
        sourceLayer: string;
        geometry: GeoJSON.Geometry | null;
      }> = [];
      const groupEntries = Array.from(buildingGroupCache.entries());
      for (const [, g] of groupEntries) {
        const sourceFeature = g.sourceFeature;
        sourceFeatures.push({
          id: sourceFeature.id,
          properties: { ...sourceFeature.properties },
          source: sourceFeature.source,
          sourceLayer: sourceFeature.sourceLayer,
          geometry:
            g.fragments.length === 1
              ? { type: "Polygon", coordinates: [g.fragments[0]] }
              : {
                  type: "MultiPolygon",
                  coordinates: g.fragments.map((ring) => [[...ring]]),
                },
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
          const faces = g.roofFaces;
          if (faces && faces.length > 0) {
            const ring = ringsToExtrude[0];
            let cLng = 0;
            let cLat = 0;
            for (const pt of ring) {
              cLng += pt[0];
              cLat += pt[1];
            }
            cLng /= ring.length;
            cLat /= ring.length;
            const elevation = elevationAt(cLng, cLat);

            // Terrain mode preserves the survey's absolute LoD2 heights.
            const groundReference = hasTerrain ? g.zGround : elevation;

            lod2Buildings.push({
              faces,
              zGround: g.zGround,
              elevation: groundReference,
              isPublic: g.isPublic,
              roofColor: g.roofColor,
              wallColor: g.wallColor,
              sourceIndex,
            });

            const maxR = getFootprintRadiusMeters(ring, cLng, cLat);
            mappedFeatures.push({
              type: "building",
              lng: cLng,
              lat: cLat,
              // Same base the geometry is drawn on. The grid is what the
              // raycast pre-filter walks, and a proxy sitting on the DEM
              // while the building stands on the survey's ground can drop
              // it out of the cells the ray is traced through.
              elevation: groundReference,
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
          for (const pt of ring) {
            cLng += pt[0];
            cLat += pt[1];
          }
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

          const maxR = getFootprintRadiusMeters(ring, cLng, cLat);

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
          buildingColorsRef.current
        );
      } else {
        buildExtrusionMeshes(
          buildings,
          layer.scene,
          layer._originMerc,
          layer._mScale,
          buildingColorsRef.current,
          config.wallAngleThreshold
        );
      }

      // Re-apply building appearance overrides after geometry rebuild
      const { color, opacity } = buildingAppearanceRef.current;
      if (color || opacity != null) {
        applyBuildingAppearance(layer, color, opacity);
      }
      notifyGenericThreeLayerContentChanged(map);

      // Build the spatial grid for raycast pre-filtering (reuse rebuild() logic)
      // We call rebuild() which rebuilds the grid from _features, but for extrusion
      // the geometry was already built above, so we just need the grid part.
      // However, rebuild() also calls the rebuildFn which is a no-op for extrusion.
      // Instead, build the grid inline to avoid double geometry creation.
      const originMerc = layer._originMerc;
      const mScale = layer._mScale;
      const grid = new Map<
        string,
        Array<{
          sourceIndex: number;
          x: number;
          z: number;
          yBase: number;
          height: number;
          radius: number;
        }>
      >();
      for (const f of mappedFeatures) {
        const mrc = MercatorCoordinate.fromLngLat([f.lng, f.lat], f.elevation);
        const x = (mrc.x - originMerc.x) / mScale;
        const z = (mrc.y - originMerc.y) / mScale;
        const yBase = (mrc.z - originMerc.z) / mScale;
        const GRID_CELL_SIZE = 20;
        const cellX = Math.floor(x / GRID_CELL_SIZE);
        const cellZ = Math.floor(z / GRID_CELL_SIZE);
        const key = `${cellX},${cellZ}`;
        const entry = {
          sourceIndex: f._sourceIndex,
          x,
          z,
          yBase,
          height: f.heightMax,
          radius: f.radiusMax,
        };
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

      // Custom-layer geometry changes do not invalidate MapLibre by themselves.
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
      if (result) notifyGenericThreeLayerContentChanged(map);
      if (result && perfRef) {
        perfRef.current = {
          ...result,
          mode: useLoft ? "umring" : "kreis",
        };
      }
    };

    let extrusionSyncPending = isExtrusion;
    let syncInFlight = false;
    let rerunRequested = false;
    let sourceSyncTimer: ReturnType<typeof setTimeout> | null = null;

    const trySync = async () => {
      if (syncInFlight) {
        rerunRequested = true;
        return;
      }
      syncInFlight = true;
      rerunRequested = false;
      try {
        // If the source's 2D layers are hidden, tear down the 3D layer
        if (!isSourceVisible()) {
          if (layerRef.current) {
            removeLayer();
          }
          return;
        }

        await addLayerIfReady();
        if (!layerRef.current || !map.getSource(config.sourceId)) return;

        if (isExtrusion) {
          if (!extrusionSyncPending) return;
          extrusionSyncPending = false;
          syncBuildings();
        } else {
          syncTrees();
        }
      } finally {
        syncInFlight = false;
        if (rerunRequested) void trySync();
      }
    };

    const requestSync = () => {
      if (isExtrusion) extrusionSyncPending = true;
      void trySync();
    };

    const scheduleSourceSync = () => {
      if (!isExtrusion) {
        void trySync();
        return;
      }
      extrusionSyncPending = true;
      if (sourceSyncTimer) clearTimeout(sourceSyncTimer);
      sourceSyncTimer = setTimeout(() => {
        sourceSyncTimer = null;
        void trySync();
      }, 500);
    };

    map.on("moveend", requestSync);

    // Idle also follows unrelated style/light changes. Use it only to flush
    // source work that was explicitly marked dirty.
    const handleIdle = isExtrusion
      ? () => {
          if (extrusionSyncPending && !sourceSyncTimer) void trySync();
        }
      : undefined;
    if (handleIdle) map.on("idle", handleIdle);

    const handleSourceData = (e: {
      sourceId: string;
      isSourceLoaded: boolean;
    }) => {
      if (e.sourceId !== config.sourceId) return;
      // A vector source emits this once per arriving tile. Rebuilding here
      // repeatedly triangulates progressively larger partial snapshots. Mark
      // the batch dirty and consume it once the tile burst has settled.
      scheduleSourceSync();
    };
    map.on("sourcedata", handleSourceData);

    // Force rebuild when terrain is toggled so elevation is applied/removed
    const handleTerrain = requestSync;
    map.on("terrain", handleTerrain);
    const unsubscribeSharedTerrain = subscribeSharedThreeTerrain(
      map,
      requestSync
    );

    // Re-add layer after background style change (style swap removes custom layers)
    // Also re-checks visibility so toggling a layer back on re-creates the 3D layer
    const handleStyleData = () => {
      let layerWasRemoved = false;
      if (layerRef.current && !map.getLayer(layerRef.current.id)) {
        unregisterGenericThreeLayer(map, layerRef.current);
        overlayIdRef.current = null;
        layerRef.current = null;
        addingRef.current = false;
        zOrderTarget = undefined;
        layerWasRemoved = true;
      }
      // A later sub-style (e.g. POI) may have loaded after the 3D layer was
      // added, pushing it behind. Re-position if needed.
      ensureZOrder();
      // Paint and light changes emit styledata too. Source data and terrain
      // have dedicated handlers, so rebuilding the complete extrusion here
      // only turns a static sun adjustment into needless retriangulation.
      if (!isSourceVisible()) {
        if (layerRef.current) removeLayer();
      } else if (layerWasRemoved || !layerRef.current) {
        requestSync();
      }
    };
    map.on("styledata", handleStyleData);

    // Sync immediately if the map is already idle
    if (map.isStyleLoaded()) {
      requestSync();
    } else {
      map.once("idle", requestSync);
    }

    return () => {
      if (sourceSyncTimer) clearTimeout(sourceSyncTimer);
      map.off("moveend", requestSync);
      if (handleIdle) map.off("idle", handleIdle);
      map.off("sourcedata", handleSourceData);
      map.off("terrain", handleTerrain);
      unsubscribeSharedTerrain();
      map.off("styledata", handleStyleData);
      if (perfRef) {
        perfRef.current = EMPTY_PERF;
      }
    };
  }, [map, useLoft, radiusMix, config, effectiveConfig, perfRef]);

  const buildingColor =
    typeof runtimeParams.buildingColor === "string"
      ? runtimeParams.buildingColor
      : undefined;
  // Match 2D layer-bar opacity semantics for the custom Three.js layer.
  const baseBuildingOpacity =
    typeof runtimeParams.buildingOpacity === "number"
      ? runtimeParams.buildingOpacity
      : config.buildingOpacity ?? DEFAULT_BUILDING_OPACITY;
  const buildingOpacity = baseBuildingOpacity * (config.layerOpacity ?? 1);

  const buildingColors: BuildingColors | undefined =
    config.fields?.roofColorField ||
    config.fields?.wallColorField ||
    config.roofColorMap ||
    config.wallColorMap
      ? featureBuildingColors
      : undefined;

  buildingAppearanceRef.current = {
    color: buildingColor,
    opacity: buildingOpacity,
  };
  buildingColorsRef.current = buildingColors;

  useEffect(() => {
    if (
      !map ||
      (config.renderMode !== "extrusion" && config.renderMode !== "lod2")
    )
      return;
    applyBuildingAppearance(layerRef.current, buildingColor, buildingOpacity);
    notifyGenericThreeLayerContentChanged(map);
    map.triggerRepaint();
  }, [map, config.renderMode, buildingColor, buildingOpacity]);

  return null;
}
