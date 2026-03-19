import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";

// Register COG protocol once
maplibregl.addProtocol("cog", cogProtocol as any);
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getHashParams } from "@carma-commons/utils";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import PhotoLightBox from "react-cismap/topicmaps/PhotoLightbox";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import "../styles/map.css";
import {
  getVectorMapping,
  styleManipulation,
  vectorStylesToMapLibreStyle,
} from "../utils/styleBuilder";
import { slugifyUrl } from "../utils/styleComposer";
import { createFeature } from "../utils/featureUtils";
import { HidingForwardingManager } from "../lib/HidingForwardingManager";
import {
  applySelectionForwarding,
  getCarmaConf,
  getCarmaConfFromStyle,
  resolvePropertyTarget,
} from "../lib/SelectionManager";
import type { FeatureIdentifier } from "../lib/selectionTypes";
import { zoom256as512, zoom512as256 } from "../utils/zoomUtils";
import { LibreMapSelectionContent } from "./LibreMapSelectionContent";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import { useSelectionLibreMap } from "../hooks/useSelectionLibreMap";
import { useLibreContext } from "../contexts/LibreContext";
import { useMapSelection } from "../contexts/MapSelectionContext";
import { useDatasheet } from "../contexts/DatasheetContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";
import { useImperativeStyle } from "../hooks/useImperativeStyle";
import {
  WUPPERTAL_DEFAULT_STYLE,
  WUPPERTAL_CONFIG,
} from "../constants/wuppertalDefaultStyle";

// Import from portals temporarily until these are migrated
import { FeatureInfobox } from "@carma-appframeworks/portals";
import { SelectionItem, useSelection } from "@carma-appframeworks/portals";
import { defaultLayerConf } from "@carma-appframeworks/portals";
import { useMapHashRouting } from "@carma-appframeworks/portals";
import { displayRouteOnMap } from "@carma-mapping/routing";
import { ThreeLayerManager, get3dLayers } from "./ThreeLayerManager";

export interface GeoJsonData {
  sourceId: string;
  data: GeoJSON.FeatureCollection;
}

export interface VectorStyle {
  name: string;
  style: string;
  layer?: string;
  opacity?: number;
  infoboxMapping?: string[];
  /** Optional 3D layer config; when present, a Three.js layer is auto-created. */
  carma3d?: import("@carma-mapping/engines/threejs").Carma3dConfig;
}

/**
 * Additional raster paint properties for image manipulation (night mode, etc.).
 * These map directly to MapLibre raster paint properties.
 */
export interface RasterPaintOverrides {
  "raster-brightness-min"?: number; // 0–1, default 0
  "raster-brightness-max"?: number; // 0–1, default 1
  "raster-saturation"?: number; // -1–1, default 0 (-1 = grayscale)
  "raster-contrast"?: number; // -1–1, default 0
  "raster-hue-rotate"?: number; // degrees, default 0
}

export type LibreLayer =
  | ({ type: "vector" } & VectorStyle)
  | { type: "geojson"; name: string; data: string; infoboxMapping?: string[] }
  | {
      type: "wms" | "wmts";
      url: string;
      layers: string;
      styles?: string;
      version?: string;
      tileSize?: number;
      maxZoom?: number;
      format?: string;
      opacity?: number;
      transparent?: boolean;
      rasterPaint?: RasterPaintOverrides;
    }
  | {
      type: "cog";
      name: string;
      url: string;
      opacity?: number;
      rasterPaint?: RasterPaintOverrides;
    };

export interface LibreMapProps {
  backgroundLayers?: string | null;
  layers?: LibreLayer[];
  setLibreMap?: (map: maplibregl.Map) => void;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  filterFunction?: (
    map: maplibregl.Map,
    layers?: LibreLayer[],
    geoJsonData?: GeoJsonData[]
  ) => void;
  /** Override glyphs (font) URL. undefined = use from first vector layer style, string = use this URL */
  overrideGlyphs?: string;
  useRouting?: boolean;
  /** Keep the canvas readable for toDataURL() snapshot capture */
  preserveDrawingBuffer?: boolean;
  /** Disable all map interaction (pan, zoom, rotate, keyboard) */
  interactive?: boolean;
  /** Enable visual selection via setFeatureState even without infoboxMapping */
  selectionEnabled?: boolean;
  /** Layer composition strategy.
   * - 'merged' (default): builds a single StyleSpecification and calls setStyle()
   * - 'imperative': uses addSource/addLayer/addSprite for incremental updates */
  layerMode?: "merged" | "imperative";
  onFeatureSelect?: (
    feature: any,
    selectionInfo?: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    }
  ) => void;
  /** Pick which feature to select from all click hits.
   * Receives filtered hits (no selection/cluster layers).
   * Return the preferred feature, or undefined to clear selection.
   * If omitted, the first hit is selected (default behavior). */
  selectFromHits?: (
    hits: maplibregl.MapGeoJSONFeature[]
  ) => maplibregl.MapGeoJSONFeature | undefined;
  /** Enable debug logging for [LAYER_MODE] and [StyleComposer] messages */
  debugLog?: boolean;
  /** Log MapLibre-internal errors (tile loading, worker failures, etc.) to the console */
  logErrors?: boolean;
  /** Expose the map instance as window.__carmaMap for console debugging */
  exposeMapToWindow?: boolean;
  /** Override selected feature for the infobox when internal selection is null
   * (e.g. programmatic selection of a feature not present on the map) */
  overrideSelectedFeature?: Record<string, unknown> | null;
  /** Show gazetteer selection info when clicking on empty map area (default: true) */
  gazetteerInfoOnClick?: boolean;
  /** Raster paint overrides applied to all background raster layers (night mode, etc.) */
  backgroundRasterPaint?: RasterPaintOverrides;
  /** Runtime parameters for 3D layers (e.g. radiusMix, useLoft) */
  threeRuntimeParams?: Record<string, number | string>;
  /** Ref for 3D layer performance data */
  threePerfRef?: React.MutableRefObject<
    import("@carma-mapping/engines/threejs").ThreePerfData
  >;
}

/**
 * Query rendered features with a terrain workaround.
 * When terrain is active, MapLibre's queryRenderedFeatures fails for fill-extrusion
 * layers because internal matrices are terrain-biased. This helper temporarily
 * suppresses terrain state, re-projects the click point, queries, then restores.
 */
function queryFeaturesWithTerrainFix(
  map: maplibregl.Map,
  clickPoint: maplibregl.Point
): maplibregl.MapGeoJSONFeature[] {
  const mapTerrain = (map as any).terrain;
  if (!mapTerrain) {
    return map.queryRenderedFeatures(clickPoint);
  }

  const transform = (map as any).transform;
  type TerrainRef = { terrain: unknown };

  // Step 1: Get terrain-aware lnglat BEFORE suppression
  const clickLngLat = map.unproject(clickPoint);

  // Step 2: Suppress terrain state
  const savedElevation: number = transform._helper._elevation;
  const savedScreenPointToMerc = transform.screenPointToMercatorCoordinate;
  const savedTileManagers: TerrainRef[] = [];

  try {
    transform._helper._elevation = 0;
    transform._calcMatrices();

    (map as any).terrain = null;

    const style = (map as any).style;
    if (style?.tileManagers) {
      for (const id in style.tileManagers) {
        const tm = style.tileManagers[id];
        if (tm.terrain) {
          savedTileManagers.push(tm);
          tm.terrain = null;
        }
      }
    }

    transform.screenPointToMercatorCoordinate = function (
      p: unknown,
      _terrain?: unknown
    ) {
      return this.screenPointToMercatorCoordinateAtZ(p);
    };

    // Step 3: Re-project and query
    const projected = map.project(clickLngLat);
    const queryPoint = new maplibregl.Point(projected.x, projected.y);
    return map.queryRenderedFeatures(queryPoint);
  } finally {
    // Restore all terrain state
    transform.screenPointToMercatorCoordinate = savedScreenPointToMerc;
    (map as any).terrain = mapTerrain;
    for (const tm of savedTileManagers) {
      tm.terrain = mapTerrain;
    }
    transform._helper._elevation = savedElevation;
    transform._calcMatrices();
  }
}

export const LibreMap = ({
  backgroundLayers,
  layers,
  setLibreMap,
  onProgressUpdate,
  filterFunction,
  overrideGlyphs,
  useRouting = false,
  interactive = true,
  preserveDrawingBuffer = false,
  selectionEnabled = true,
  layerMode = "merged",
  onFeatureSelect,
  selectFromHits,
  debugLog = false,
  logErrors = false,
  exposeMapToWindow = false,
  overrideSelectedFeature,
  gazetteerInfoOnClick = true,
  backgroundRasterPaint,
  threeRuntimeParams,
  threePerfRef,
}: LibreMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const hidingManagerRef = useRef<HidingForwardingManager | null>(null);
  const selectedFeaturesRef = useRef<
    Set<{
      source: string;
      sourceLayer?: string;
      id?: string | number;
      selectionLayerId?: string;
      forwardedTo?: FeatureIdentifier[]; // Track forwarded selections for cleanup
    }>
  >(new Set());
  const mappingRef = useRef({});
  const onFeatureSelectRef = useRef(onFeatureSelect);
  onFeatureSelectRef.current = onFeatureSelect;
  const selectFromHitsRef = useRef(selectFromHits);
  selectFromHitsRef.current = selectFromHits;
  const useRoutingRef = useRef(useRouting);
  useRoutingRef.current = useRouting;
  const gazetteerInfoOnClickRef = useRef(gazetteerInfoOnClick);
  gazetteerInfoOnClickRef.current = gazetteerInfoOnClick;
  const isIdleRef = useRef(false);
  const vectorSourcesReadyRef = useRef(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [detectedCarma3dConfigs, setDetectedCarma3dConfigs] = useState<
    import("@carma-mapping/engines/threejs").Carma3dConfig[]
  >([]);
  const geoJsonMetadataRef = useRef<
    Array<{ sourceId: string; uniqueColors: string[] }>
  >([]);
  const isInitialGeoJsonLoad = useRef(true);

  const { clusteringEnabled } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const {
    setMapStyle,
    geoJsonMetadata,
    setGeoJsonMetadata,
    setMap: setContextMap,
  } = useLibreContext();

  const { selection } = useSelection();
  const selectionRef = useRef(selection);

  // Keep selectionRef in sync with selection
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // MapSelectionContext: provides programmatic selection API.
  // When no MapSelectionProvider exists, the default no-op context is returned
  // and LibreMap falls back to its local state behavior.
  const mapSelectionCtx = useMapSelection();
  const mapSelectionCtxRef = useRef(mapSelectionCtx);
  mapSelectionCtxRef.current = mapSelectionCtx;
  const lastHandledVersionRef = useRef(0);

  // DatasheetContext: when a DatasheetProvider is mounted, isEnabled is true
  // and openDatasheet is a real function. Otherwise createFeature gets undefined.
  const { isEnabled: datasheetEnabled, openDatasheet } = useDatasheet();
  const openDatasheetRef = useRef(datasheetEnabled ? openDatasheet : undefined);
  openDatasheetRef.current = datasheetEnabled ? openDatasheet : undefined;

  // Helper: clear all visual selection state on the map
  const clearVisualSelection = useCallback((mapInstance: maplibregl.Map) => {
    selectedFeaturesRef.current.forEach((feature) => {
      try {
        if (
          feature.selectionLayerId &&
          mapInstance.getLayer(feature.selectionLayerId)
        ) {
          mapInstance.setFilter(feature.selectionLayerId, [
            "==",
            "__selected__",
            "true",
          ]);
        } else if (feature.id != null) {
          mapInstance.setFeatureState(
            {
              source: feature.source,
              sourceLayer: feature.sourceLayer,
              id: feature.id,
            },
            { selected: false }
          );
        }

        // Also clear forwarded selections
        if (feature.forwardedTo) {
          for (const forwarded of feature.forwardedTo) {
            try {
              mapInstance.setFeatureState(
                {
                  source: forwarded.source,
                  sourceLayer: forwarded.sourceLayer,
                  id: forwarded.id,
                },
                { selected: false }
              );
            } catch {
              // Forwarded feature may not exist
            }
          }
        }
      } catch (error) {
        console.error("Error clearing feature selection:", error);
      }
    });
    selectedFeaturesRef.current.clear();
  }, []);

  // Helper: apply visual selection highlighting for a feature
  const applyVisualSelection = useCallback(
    (
      mapInstance: maplibregl.Map,
      featureId: { source: string; sourceLayer?: string; id?: string | number }
    ) => {
      try {
        if (featureId.id != null) {
          mapInstance.setFeatureState(
            {
              source: featureId.source,
              sourceLayer: featureId.sourceLayer,
              id: featureId.id,
            },
            { selected: true }
          );
        }
        selectedFeaturesRef.current.add({
          source: featureId.source,
          sourceLayer: featureId.sourceLayer,
          id: featureId.id,
        });
      } catch (error) {
        console.error("Error applying feature selection:", error);
      }
    },
    []
  );

  useClusterMarkers({
    map: map.current,
    geoJsonMetadata: clusteringEnabled ? geoJsonMetadata : [],
  });

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 15;

  // Helper function to build WMS tile URL from layer config
  const buildWMSTileUrl = (layerConfig: any): string => {
    const {
      url,
      layers,
      version = "1.1.1",
      format = "image/png",
    } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMS&REQUEST=GetMap&VERSION=${version}&LAYERS=${layers}&FORMAT=${format}&styles=default&TRANSPARENT=true&WIDTH=256&HEIGHT=256&crs=EPSG:3857&&srs=EPSG:3857&BBOX={bbox-epsg-3857}`;
  };

  // Helper function to build WMTS tile URL from layer config
  const buildWMTSTileUrl = (layerConfig: any): string => {
    const { url, layers } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layers}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  };

  // Parse backgroundLayers string and build style.
  // Returns { style, vectorBackgroundLayers } where vectorBackgroundLayers
  // are vector-type backgrounds that need to be prepended to libreLayers.
  const buildBackgroundStyle = (): {
    style: StyleSpecification | null;
    vectorBackgroundLayers: LibreLayer[];
  } => {
    if (backgroundLayers === undefined) {
      // Prop not provided: use default background for backwards compat
      return { style: WUPPERTAL_DEFAULT_STYLE, vectorBackgroundLayers: [] };
    }
    if (backgroundLayers === null || backgroundLayers === "") {
      // Explicitly null or empty: no background layer
      return {
        style: { version: 8 as const, sources: {}, layers: [] },
        vectorBackgroundLayers: [],
      };
    }

    const layerSpecs = backgroundLayers.split("|");
    const sources: Record<string, any> = {};
    const vectorBgLayers: LibreLayer[] = [];

    // Add terrain source from config (slugified URL as ID)
    if (WUPPERTAL_CONFIG.terrain) {
      const terrainId = slugifyUrl(WUPPERTAL_CONFIG.terrain.url);
      sources[terrainId] = {
        type: "raster-dem",
        tiles: [WUPPERTAL_CONFIG.terrain.url],
        tileSize: WUPPERTAL_CONFIG.terrain.tileSize ?? 512,
        maxzoom: WUPPERTAL_CONFIG.terrain.maxzoom ?? 15,
      };
    }
    const styleLayers: any[] = [];

    layerSpecs.forEach((spec, index) => {
      const [layerName, opacityStr] = spec.split("@");
      const layerConfig = defaultLayerConf.namedLayers[layerName];

      if (!layerConfig) {
        console.warn(`Layer "${layerName}" not found in defaultLayerConf`);
        return;
      }

      const opacity = opacityStr ? parseInt(opacityStr, 10) / 100 : 1.0;

      // Vector backgrounds get handled as libreLayers (prepended before data layers)
      if (layerConfig.type === "vector") {
        vectorBgLayers.push({
          type: "vector",
          name: `bg-${layerName}`,
          style: layerConfig.style,
          opacity,
        });
        return;
      }
      const sourceId = `source-${layerName}-${index}`;
      const layerId = `layer-${layerName}-${index}`;

      // Build source based on layer type
      if (layerConfig.type === "tiles") {
        sources[sourceId] = {
          type: "raster",
          tiles: [layerConfig.url],
          tileSize: 256,
        };
      } else if (
        layerConfig.type === "wmts" ||
        layerConfig.type === "wmts-nt"
      ) {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMTSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else if (layerConfig.type === "wms" || layerConfig.type === "wms-nt") {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else {
        console.warn(
          `Layer type "${layerConfig.type}" not supported for MapLibre`
        );
        return;
      }

      // Add layer
      styleLayers.push({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": opacity },
      });
    });

    // If only vector backgrounds and no raster layers, use an empty style
    // so the vector background becomes the sole base layer
    if (styleLayers.length === 0 && vectorBgLayers.length > 0) {
      return {
        style: { version: 8 as const, sources, layers: [] },
        vectorBackgroundLayers: vectorBgLayers,
      };
    }

    // If no valid layers were parsed at all, return default style
    if (styleLayers.length === 0) {
      return { style: WUPPERTAL_DEFAULT_STYLE, vectorBackgroundLayers: [] };
    }

    return {
      style: { version: 8, sources, layers: styleLayers },
      vectorBackgroundLayers: vectorBgLayers,
    };
  };

  const { style: backgroundStyle, vectorBackgroundLayers } = useMemo(
    () => buildBackgroundStyle(),
    [backgroundLayers]
  );

  // Imperatively apply/clear raster paint overrides on background layers
  // so that toggling night mode doesn't rebuild the entire style (which
  // would reset vector layer visibility, selection state, etc.).
  // Also updates the context mapStyle so the preview map stays in sync.
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const defaults: Required<RasterPaintOverrides> = {
      "raster-brightness-min": 0,
      "raster-brightness-max": 1,
      "raster-saturation": 0,
      "raster-contrast": 0,
      "raster-hue-rotate": 0,
    };
    const paint = backgroundRasterPaint ?? defaults;

    for (const layer of map.current.getStyle().layers ?? []) {
      if (layer.type !== "raster") continue;
      for (const [key, value] of Object.entries(paint)) {
        map.current.setPaintProperty(layer.id, key, value);
      }
    }

    // Push the updated style into context so PreviewLibreMap picks it up
    setMapStyle(map.current.getStyle());
  }, [backgroundRasterPaint, setMapStyle]);

  // Stable callbacks for useImperativeStyle
  const handleImperativeMappingUpdate = useCallback(
    (mapping: Record<string, string[] | string>) => {
      mappingRef.current = mapping;
    },
    []
  );
  const handleImperativeGeoJsonMeta = useCallback(
    (meta: Array<{ sourceId: string; uniqueColors: string[] }>) => {
      geoJsonMetadataRef.current = meta;
      setGeoJsonMetadata(meta);
    },
    [setGeoJsonMetadata]
  );
  const handleImperativeStyleReady = useCallback(
    (style: StyleSpecification) => {
      setMapStyle(style);
    },
    [setMapStyle]
  );
  const handleImperativeHidingRefresh = useCallback(() => {
    hidingManagerRef.current?.refresh();
    hidingManagerRef.current?.start();
  }, []);

  useImperativeStyle({
    enabled: layerMode === "imperative",
    map: map.current,
    layers,
    backgroundStyle,
    vectorBackgroundLayers,
    clusteringEnabled,
    markerSymbolSize,
    overrideGlyphs,
    filterFunction,
    onMappingUpdate: handleImperativeMappingUpdate,
    onGeoJsonMetadataUpdate: handleImperativeGeoJsonMeta,
    onStyleReady: handleImperativeStyleReady,
    onHidingManagerRefresh: handleImperativeHidingRefresh,
    debugLog,
  });

  useEffect(() => {
    // Only initialize if we have a container and no map yet
    if (mapContainer.current && !map.current) {
      const hashParams = getHashParams();

      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : defaultLng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : defaultLat;

      const zoom =
        hashParams["zoom"] !== undefined
          ? zoom256as512(parseFloat(hashParams["zoom"])) // -1: hash stores 256px tile zoom, MapLibre uses 512px
          : defaultZoom;

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: zoom,
        maxZoom: 21.9999,
        maxPitch: 65,
        attributionControl: false,
        interactive,
        canvasContextAttributes: preserveDrawingBuffer
          ? { preserveDrawingBuffer: true }
          : undefined,
      });
      map.current = mapInstance;
      setLibreMap?.(mapInstance);
      setContextMap(mapInstance);
      if (exposeMapToWindow) {
        (window as unknown as Record<string, unknown>).__carmaMap = mapInstance;
      }

      // Surface MapLibre-internal errors (tile loading, worker failures, etc.)
      // so they are never silently swallowed.
      if (logErrors) {
        mapInstance.on("error", (e) => {
          console.error(
            "[MAPLIBRE]",
            (e as unknown as { sourceId?: string }).sourceId ?? "",
            (e as unknown as { error?: Error }).error ?? e
          );
        });
      }

      mapInstance.on("click", async (e) => {
        // ── 3D raycast: check 3D layers before 2D ─────────────
        const threeLayers = get3dLayers(mapInstance);
        if (threeLayers.length > 0) {
          console.log(
            "[3D-SELECT] click at",
            e.lngLat,
            "3D layers:",
            threeLayers.length
          );

          // Raycast ALL layers and pick the closest hit by distance
          let bestHitLayer: (typeof threeLayers)[0] | null = null;
          let bestResult: ReturnType<(typeof threeLayers)[0]["raycast"]> = null;
          let bestDist = Infinity;

          for (const threeLayer of threeLayers) {
            const result = threeLayer.raycast(e.point.x, e.point.y);
            // [3D-SELECT] per-layer raycast log suppressed
            if (result && result.resolvedSourceIndex != null) {
              const dist = result.hitDistance ?? Infinity;
              if (dist < bestDist) {
                bestDist = dist;
                bestHitLayer = threeLayer;
                bestResult = result;
              }
            }
          }

          if (bestHitLayer && bestResult && bestResult.resolvedSourceIndex != null) {
              // Before accepting the 3D hit, check if there's a 2D symbol
              // feature at the click point. Symbol layers (POI icons/text)
              // render visually above 3D layers, so they should win clicks.
              const hits2d = mapInstance.queryRenderedFeatures(e.point);
              // queryRenderedFeatures returns hits in visual order (top first).
              // If the topmost hit has a layerMapping, it's a selectable feature
              // rendered above the 3D layer, so let the 2D path handle the click.
              // If the topmost 2D hit is from a LIBRE_LAYERS sub-style (has
              // layer-id metadata) but NOT from a source that has a 3D layer,
              // it renders above the 3D objects, so let 2D selection win.
              // Find the highest z-index among 3D layer sources (from style metadata).
              // Any 2D hit with a higher z-index renders above the 3D layers.
              let maxThreeZIndex = -1;
              const threeSources = new Set(threeLayers.map((l) => l._config.sourceId));
              for (const sl of (mapInstance.getStyle()?.layers ?? [])) {
                const src = (sl as { source?: string }).source;
                if (src && threeSources.has(src)) {
                  const z = ((sl as any).metadata?.["z-index"] as number) ?? -1;
                  if (z > maxThreeZIndex) maxThreeZIndex = z;
                }
              }
              const hitAbove3d = hits2d.some((f) => {
                const z = (f.layer.metadata as Record<string, unknown>)?.["z-index"] as number | undefined;
                return z != null && z > maxThreeZIndex;
              });
              if (hitAbove3d) {
                // Let the 2D selection path handle this click
                threeLayers.forEach((l) => l.unhighlight());
              }

              if (!hitAbove3d) {
              const threeLayer = bestHitLayer;
              const result = bestResult;
              // [3D-SELECT] closest hit log suppressed

              // 3D hit detected: takes priority over 2D
              clearVisualSelection(mapInstance);
              setSelectedFeature(null);
              mapSelectionCtxRef.current.clearSelection();

              // Unhighlight all 3D layers, then highlight the hit one
              threeLayers.forEach((l) => l.unhighlight());
              threeLayer.highlight(result.resolvedSourceIndex);

              if (result.sourceFeature) {
                const sf = result.sourceFeature;
                const featureId = {
                  source: sf.source,
                  sourceLayer: sf.sourceLayer,
                  id: sf.id,
                };
                // [3D-SELECT] forwarding + properties logs suppressed

                if (sf.id != null) {
                  applyVisualSelection(mapInstance, featureId);
                }

                // Build synthetic MapGeoJSONFeature for createFeature
                const carmaConf3d = getCarmaConfFromStyle(
                  mapInstance,
                  sf.sourceLayer
                );
                const syntheticFeature = {
                  type: "Feature" as const,
                  geometry: sf.geometry ?? {
                    type: "Point" as const,
                    coordinates: [0, 0],
                  },
                  properties: { ...sf.properties },
                  id: sf.id,
                  source: sf.source,
                  sourceLayer: sf.sourceLayer,
                  layer: {
                    id: threeLayer.id,
                    metadata: carmaConf3d ? { carmaConf: carmaConf3d } : {},
                  },
                  state: {},
                } as maplibregl.MapGeoJSONFeature;

                // Find layerMapping using the same keys as the 2D handler
                const layerId3d = (carmaConf3d as Record<string, unknown>)?.[
                  "layer-id"
                ] as string | undefined;

                // Fallback: scan style layers with matching source for a layer-id
                let fallbackLayerId: string | undefined;
                if (!layerId3d) {
                  const style = mapInstance.getStyle();
                  if (style?.layers) {
                    for (const sl of style.layers) {
                      if ("source" in sl && sl.source === sf.source) {
                        const slMeta = sl.metadata as
                          | Record<string, unknown>
                          | undefined;
                        const lid = slMeta?.["layer-id"] as string | undefined;
                        if (lid && mappingRef.current[lid]) {
                          fallbackLayerId = lid;
                          break;
                        }
                      }
                    }
                  }
                }

                // [3D-SELECT] mapping lookup log suppressed
                const layerMapping3d =
                  mappingRef.current[layerId3d ?? ""] ||
                  mappingRef.current[fallbackLayerId ?? ""] ||
                  mappingRef.current[sf.source] ||
                  mappingRef.current[sf.sourceLayer ?? ""];

                if (layerMapping3d) {
                  const feature = await createFeature(
                    syntheticFeature,
                    layerMapping3d,
                    mapInstance,
                    useRouting,
                    openDatasheetRef.current
                  );
                  if (feature) {
                    setSelectedFeature(feature);
                    mapSelectionCtxRef.current.setSelectedFeature(feature);
                    mapSelectionCtxRef.current.selectFeature(
                      featureId,
                      syntheticFeature
                    );
                    lastHandledVersionRef.current =
                      mapSelectionCtxRef.current.selectionVersion + 1;
                    onFeatureSelect?.(feature, featureId);
                  }
                } else {
                  console.log(
                    "[3D-SELECT] no layerMapping found, infobox skipped"
                  );
                }
              } else {
                console.log(
                  "[3D-SELECT] 3D hit but source feature not resolved"
                );
              }
              return; // skip 2D selection
              } // end if (!hitAbove3d)
          }
        }
        // ── end 3D raycast ────────────────────────────────────

        // No 3D hit: clear any 3D highlights
        const threeLayers2d = get3dLayers(mapInstance);
        threeLayers2d.forEach((l) => l.unhighlight());

        // Query with terrain fix (suppresses terrain state so fill-extrusion features
        // are returned correctly, then restores)
        const hasTerrain = !!(mapInstance as any).terrain;
        const hits = queryFeaturesWithTerrainFix(mapInstance, e.point);
        const queryPoint = hasTerrain
          ? new maplibregl.Point(e.point.x, e.point.y)
          : e.point;

        const filteredHits = hits.filter((hit) => {
          return (
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster")
          );
        });

        console.log(
          "[TERRAIN CLICK]",
          JSON.stringify({
            screenPoint: { x: e.point.x, y: e.point.y },
            queryPoint: { x: queryPoint.x, y: queryPoint.y },
            hasTerrain,
            camera: {
              zoom: mapInstance.getZoom(),
              pitch: mapInstance.getPitch(),
              bearing: mapInstance.getBearing(),
              center: mapInstance.getCenter(),
            },
            rawHits: hits.length,
            rawHitLayers: hits.map((h) => h.layer.id),
            filteredHits: filteredHits.length,
            filteredHitLayers: filteredHits.map((h) => ({
              layer: h.layer.id,
              type: h.layer.type,
              source: h.source,
              id: h.id,
            })),
          })
        );

        // Clear previous visual selection
        clearVisualSelection(mapInstance);
        setSelectedFeature(null);
        mapSelectionCtxRef.current.clearSelection();

        if (filteredHits.length > 0) {
          const selectedVectorFeature = selectFromHitsRef.current
            ? selectFromHitsRef.current(filteredHits) ?? filteredHits[0]
            : filteredHits[0];
          const featureId = {
            source: selectedVectorFeature.source,
            sourceLayer: selectedVectorFeature.sourceLayer,
            id: selectedVectorFeature.id,
          };

          // Try to get layer ID from metadata (for vector layers)
          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];

          // Try to get mapping by layer ID first, then by source (for geojson layers)
          let layerMapping =
            mappingRef.current[layerId] ||
            mappingRef.current[selectedVectorFeature.source];

          // Resolve property target if configured in carmaConf
          const carmaConf = getCarmaConf(selectedVectorFeature);
          console.debug(
            "[LibreMap] Click on layer:",
            selectedVectorFeature.layer?.id
          );
          console.debug("[LibreMap] carmaConf:", carmaConf);
          console.debug(
            "[LibreMap] feature.id:",
            selectedVectorFeature.id,
            "type:",
            typeof selectedVectorFeature.id
          );

          if (carmaConf?.propertyTarget && selectedVectorFeature.id != null) {
            console.debug(
              "[LibreMap] Resolving propertyTarget:",
              carmaConf.propertyTarget
            );
            const targetProps = resolvePropertyTarget(
              mapInstance,
              selectedVectorFeature.id,
              carmaConf.propertyTarget
            );
            console.debug("[LibreMap] targetProps result:", targetProps);
            if (targetProps) {
              selectedVectorFeature.properties = {
                ...selectedVectorFeature.properties,
                targetProperties: targetProps,
              };

              // If no mapping found for this layer, try to use mapping from target layer
              if (!layerMapping) {
                const [targetSource, targetSourceLayer] =
                  carmaConf.propertyTarget.split(".");
                console.debug("[LibreMap] Looking for mapping in:", {
                  targetSource,
                  targetSourceLayer,
                  mappingKeys: Object.keys(mappingRef.current),
                });
                // Try various mapping lookups for the target
                layerMapping =
                  mappingRef.current[targetSourceLayer] || // e.g., "landparcel"
                  mappingRef.current[targetSource] || // e.g., "alkis"
                  mappingRef.current[carmaConf.propertyTarget]; // e.g., "alkis.landparcel"
              }
            }
          } else if (!carmaConf) {
            console.debug("[LibreMap] No carmaConf found in layer metadata");
          } else if (!carmaConf.propertyTarget) {
            console.debug("[LibreMap] No propertyTarget in carmaConf");
          }

          let feature = null;
          if (layerMapping) {
            feature = await createFeature(
              selectedVectorFeature,
              layerMapping,
              mapInstance,
              useRouting,
              openDatasheetRef.current
            );
          }

          // Apply visual selection if we have a mapping OR if selectionEnabled is true
          if (layerMapping || selectionEnabled) {
            applyVisualSelection(mapInstance, featureId);

            // Apply selection forwarding to related layers (if configured in carmaConf)
            const forwardedTo = applySelectionForwarding(
              mapInstance,
              featureId as FeatureIdentifier,
              true,
              selectedVectorFeature
            );
            // Track forwarded features for cleanup
            if (forwardedTo.length > 0) {
              selectedFeaturesRef.current.forEach((f) => {
                if (f.source === featureId.source && f.id === featureId.id) {
                  f.forwardedTo = forwardedTo;
                }
              });
            }
          }

          if (feature) {
            setSelectedFeature(feature);
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            mapSelectionCtxRef.current.selectFeature(
              featureId,
              selectedVectorFeature
            );
            lastHandledVersionRef.current =
              mapSelectionCtxRef.current.selectionVersion + 1;
            onFeatureSelect?.(feature, featureId);
          } else if (selectionEnabled) {
            // No feature/mapping but selection enabled: still update context
            mapSelectionCtxRef.current.selectFeature(
              featureId,
              selectedVectorFeature
            );
            lastHandledVersionRef.current =
              mapSelectionCtxRef.current.selectionVersion + 1;
            onFeatureSelect?.(null, featureId);
          }
        } else {
          if (gazetteerInfoOnClickRef.current && selectionRef.current) {
            const pos = proj4(proj4crs3857def, proj4crs4326def, [
              selectionRef.current.x,
              selectionRef.current.y,
            ]);
            setSelectedFeature({
              properties: {
                header: "Informationen",
                title: selectionRef.current.string,
                genericLinks: [
                  {
                    iconname: "car",
                    action: async () => {
                      if (!mapInstance) return;
                      const startLat = 51.2725699;
                      const startLng = 7.199918;
                      await displayRouteOnMap({
                        mapInstance,
                        from: { lat: startLat, lng: startLng },
                        to: { lat: pos[1], lng: pos[0] },
                      });
                    },
                  },
                ],
              },
            });
          }
        }
      });

      const checkVectorSourcesReady = () => {
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const vectorSources = Object.entries(style.sources).filter(
          ([_, source]: [string, any]) => source.type === "vector"
        );

        if (vectorSources.length === 0) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const allLoaded = vectorSources.every(([sourceId]) =>
          mapInstance.isSourceLoaded(sourceId)
        );

        vectorSourcesReadyRef.current = allLoaded;
      };

      mapInstance.on("sourcedata", (e) => {
        if (e.isSourceLoaded && e.source.type === "vector") {
          checkVectorSourcesReady();
        }
      });

      mapInstance.on("idle", () => {
        isIdleRef.current = true;
      });

      // Initialize HidingForwardingManager for collision-based visibility sync
      hidingManagerRef.current = new HidingForwardingManager(mapInstance);

      mapInstance.on("move", () => {
        if (layers?.find((layer) => layer.type === "vector")) {
          vectorSourcesReadyRef.current = false;
        } else {
          vectorSourcesReadyRef.current = true;
        }
        isIdleRef.current = false;
      });
    }

    return () => {
      hidingManagerRef.current?.destroy();
      hidingManagerRef.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
        setContextMap(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    // Skip merged-mode style updates when imperative mode is active
    if (layerMode === "imperative") {
      if (debugLog)
        console.log(
          "[LAYER_MODE] merged-mode effect SKIPPED (imperative active)"
        );
      return;
    }
    if (debugLog) console.log("[LAYER_MODE] merged-mode effect RUNNING");

    let aborted = false;

    const updateMapStyle = async () => {
      try {
        // Prepend vector background layers before data layers
        const effectiveLayers =
          vectorBackgroundLayers.length > 0
            ? [...vectorBackgroundLayers, ...(layers || [])]
            : layers;

        if (effectiveLayers) {
          // Show initial progress only on first load or when layers change
          const geoJsonLayers = effectiveLayers.filter(
            (layer) => layer.type === "geojson"
          );

          // Check if geojson layers have changed by comparing with previous metadata
          const hasGeoJsonLayersChanged =
            geoJsonLayers.length !== geoJsonMetadataRef.current.length;

          if (hasGeoJsonLayersChanged) {
            isInitialGeoJsonLoad.current = true;
          }

          if (
            geoJsonLayers.length > 0 &&
            onProgressUpdate &&
            isInitialGeoJsonLoad.current
          ) {
            onProgressUpdate({ current: 0, total: geoJsonLayers.length });
          }

          // Update with vector styles and background layers
          const { style: baseStyle, geoJsonMetadata } =
            await vectorStylesToMapLibreStyle({
              layers: effectiveLayers,
              backgroundStyle,
              clusteringEnabled,
              overrideGlyphs,
            });

          // Bail out if effect was cleaned up during async work (StrictMode double-fire)
          if (aborted) return;

          // Apply marker symbol size scaling
          const style = styleManipulation(markerSymbolSize, baseStyle);

          // Store geojson metadata for pie chart rendering (local ref and context)
          geoJsonMetadataRef.current = geoJsonMetadata;
          setGeoJsonMetadata(geoJsonMetadata);

          // Save terrain state before setting style
          const currentTerrain = map.current?.getTerrain();

          map.current?.setStyle(style);
          if (debugLog)
            console.log("[LAYER_MODE] merged: derived style", style);

          // Update context with the full map style
          setMapStyle(style);

          // Detect carma3d configs from style metadata and explicit layer props
          {
            const configs: import("@carma-mapping/engines/threejs").Carma3dConfig[] =
              [];
            const sourceToIdx = new Map<string, number>();

            for (const layer of style.layers ?? []) {
              const meta = (layer as any).metadata?.carmaConf?.["3d"];
              if (!meta) continue;
              const sourceId = meta.sourceId ?? (layer as any).source;
              const sourceLayer =
                meta.sourceLayer ?? (layer as any)["source-layer"];
              if (!sourceId) continue;

              if (!sourceToIdx.has(sourceId)) {
                sourceToIdx.set(sourceId, configs.length);
                configs.push({
                  ...meta,
                  sourceId,
                  sourceLayer,
                  skipIn2DLayerIds: [],
                });
              }

              // Collect layer IDs that should be hidden in 2D
              if (meta.skipIn2D) {
                const idx = sourceToIdx.get(sourceId)!;
                configs[idx].skipIn2DLayerIds!.push((layer as any).id);
              }
            }

            for (const l of effectiveLayers ?? []) {
              const propConfig = (l as any).carma3d;
              if (
                propConfig?.sourceId &&
                !sourceToIdx.has(propConfig.sourceId)
              ) {
                sourceToIdx.set(propConfig.sourceId, configs.length);
                configs.push(propConfig);
              }
            }

            setDetectedCarma3dConfigs(configs);
          }

          // Refresh hiding forwarding manager with new style (after style is fully loaded)
          // Use 'idle' event to ensure style is completely processed, not 'styledata' which fires early
          const startHidingManager = () => {
            hidingManagerRef.current?.refresh();
            hidingManagerRef.current?.start();
          };
          map.current?.once("idle", startHidingManager);

          // Add COG layers after style is loaded (requires addSource/addLayer, not setStyle).
          // Use beforeId to insert at correct z-position based on effectiveLayers order.
          const cogEntries = effectiveLayers
            .map((l, i) => ({ layer: l, index: i }))
            .filter((e) => e.layer.type === "cog");
          if (cogEntries.length > 0 && map.current) {
            const addCogLayers = () => {
              if (!map.current) return;
              const styleLayers = map.current.getStyle().layers || [];
              cogEntries.forEach(({ layer, index: cogIndex }) => {
                if (layer.type !== "cog" || !map.current) return;
                const sourceId = `cog-source-${layer.name}`;
                if (map.current.getSource(sourceId)) {
                  map.current.removeLayer(`cog-layer-${layer.name}`);
                  map.current.removeSource(sourceId);
                }
                // Find first style layer with z-index > cogIndex to insert before
                let beforeId: string | undefined;
                for (const sl of styleLayers) {
                  const meta = (sl as any).metadata;
                  if (
                    meta &&
                    typeof meta["z-index"] === "number" &&
                    meta["z-index"] >= cogIndex
                  ) {
                    beforeId = sl.id;
                    break;
                  }
                }
                map.current.addSource(sourceId, {
                  type: "raster",
                  url: `cog://${layer.url}`,
                  tileSize: 256,
                });
                map.current.addLayer(
                  {
                    id: `cog-layer-${layer.name}`,
                    source: sourceId,
                    type: "raster",
                    paint: {
                      "raster-opacity": layer.opacity ?? 1,
                      ...layer.rasterPaint,
                    },
                  },
                  beforeId
                );
              });
            };
            if (map.current.isStyleLoaded()) {
              addCogLayers();
            } else {
              map.current.once("styledata", addCogLayers);
            }
          }

          // Restore terrain after style is loaded if it was previously set
          if (currentTerrain && map.current) {
            const restoreTerrain = () => {
              const terrainSrcId = WUPPERTAL_CONFIG.terrain
                ? slugifyUrl(WUPPERTAL_CONFIG.terrain.url)
                : "";
              if (terrainSrcId && map.current?.getSource(terrainSrcId)) {
                map.current.setTerrain(currentTerrain);
              }
            };

            if (map.current.isStyleLoaded()) {
              restoreTerrain();
            } else {
              map.current.once("styledata", restoreTerrain);
            }
          }

          // Get mapping for vector layers (only from user-provided layers, not backgrounds)
          const vectorLayers = (layers || []).filter(
            (layer) => layer.type === "vector"
          );
          let mapping = {};
          if (vectorLayers.length > 0) {
            mapping = await getVectorMapping(vectorLayers);
          }

          // Bail out if effect was cleaned up during async mapping fetch
          if (aborted) return;

          // Add mapping for geojson layers
          geoJsonLayers.forEach((layer, index) => {
            if (layer.infoboxMapping && layer.infoboxMapping.length > 0) {
              const sourceId = `geojson-source-${index}`;
              mapping[layer.name] = layer.infoboxMapping;
              // Also map by source ID for easier lookup
              mapping[sourceId] = layer.infoboxMapping;
            }
          });

          mappingRef.current = mapping;

          // Apply filter function after style is loaded
          if (filterFunction && map.current) {
            const applyFilter = () => {
              if (map.current) {
                filterFunction(map.current, layers);
              }
            };

            if (map.current.isStyleLoaded()) {
              applyFilter();
            } else {
              map.current.once("styledata", applyFilter);
            }
          }

          // Track progress for geojson layers
          if (geoJsonMetadata.length > 0 && onProgressUpdate) {
            const loadedSources = new Set<string>();

            const handleStyleLoad = () => {
              const handleData = (e: any) => {
                const isRelevantSource = geoJsonMetadata.some(
                  ({ sourceId }) => e.sourceId === sourceId
                );
                if (!isRelevantSource || !e.isSourceLoaded) return;

                if (!loadedSources.has(e.sourceId)) {
                  loadedSources.add(e.sourceId);
                  if (isInitialGeoJsonLoad.current) {
                    onProgressUpdate({
                      current: loadedSources.size,
                      total: geoJsonMetadata.length,
                    });

                    if (loadedSources.size === geoJsonMetadata.length) {
                      isInitialGeoJsonLoad.current = false;
                    }
                  }
                }
              };

              map.current!.on("data", handleData);
            };

            if (map.current!.isStyleLoaded()) {
              handleStyleLoad();
            } else {
              map.current!.once("styledata", handleStyleLoad);
            }
          } else if (onProgressUpdate) {
            onProgressUpdate({ current: 1, total: 1 });
          }
        } else {
          // Only update background layers
          if (aborted) return;
          map.current?.setStyle(backgroundStyle);
          setMapStyle(backgroundStyle);
          geoJsonMetadataRef.current = [];
        }
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();

    return () => {
      aborted = true;
    };
  }, [
    backgroundStyle,
    vectorBackgroundLayers,
    layers,
    clusteringEnabled,
    markerSymbolSize,
    filterFunction,
    layerMode,
  ]);

  const getLeafletMap = useCallback(() => {
    const m = map.current;
    if (!m) return null;
    return {
      setView: (center: { lat: number; lng: number }, zoom?: number) => {
        if (typeof zoom === "number") m.setZoom(zoom256as512(zoom));
        m.setCenter([center.lng, center.lat]);
      },
      panTo: (center: { lat: number; lng: number }) =>
        m.panTo([center.lng, center.lat]),
      setZoom: (zoom: number) => m.setZoom(zoom256as512(zoom)),
      getCenter: () => m.getCenter(),
      once: (type: string, fn: (...args: unknown[]) => void) =>
        m.once(type, fn),
    };
  }, []);

  const getLeafletZoom = useCallback(() => {
    const m = map.current;
    return m ? zoom512as256(m.getZoom()) : 12;
  }, []);

  const hashRoutingLabels = useMemo(
    () => ({
      clearCesium: "LGM:2D:clearCesium",
      writeLeafletLike: "LGM:2D:writeLocation",
      topicMapLocation: "LGM:2D:location",
    }),
    []
  );

  const { handleTopicMapLocationChange } = useMapHashRouting({
    getLeafletMap,
    getLeafletZoom,
    labels: hashRoutingLabels,
  });

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    const handleMoveEnd = () => {
      const center = mapInstance.getCenter();
      const zoom = zoom512as256(mapInstance.getZoom());
      handleTopicMapLocationChange({ lat: center.lat, lng: center.lng, zoom });
    };
    mapInstance.on("moveend", handleMoveEnd);
    return () => {
      mapInstance && mapInstance.off("moveend", handleMoveEnd);
    };
  }, [handleTopicMapLocationChange]);

  // Watch for external selection changes from MapSelectionContext
  // (e.g., a list component calling selectFeature())
  const {
    selectionVersion,
    selectedFeatureId: ctxSelectedFeatureId,
    rawFeature: ctxRawFeature,
  } = mapSelectionCtx;

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    // Skip if we already handled this version (it was our own update)
    if (selectionVersion <= lastHandledVersionRef.current) {
      return;
    }
    lastHandledVersionRef.current = selectionVersion;

    // If selection was cleared externally
    if (!ctxSelectedFeatureId) {
      clearVisualSelection(mapInstance);
      setSelectedFeature(null);
      return;
    }

    // Apply visual selection for the externally selected feature
    clearVisualSelection(mapInstance);
    setSelectedFeature(null);
    applyVisualSelection(mapInstance, ctxSelectedFeatureId);

    // If a raw feature was provided, run createFeature to get the processed result
    if (ctxRawFeature) {
      const layerId = ctxRawFeature.layer?.metadata?.["layer-id"];
      // Try layer-id metadata first, then full source, then source prefix
      // (namespaced sources use "prefix::originalSource" but mapping keys use just "prefix")
      const source = ctxSelectedFeatureId.source;
      const sourcePrefix = source?.includes("::")
        ? source.split("::")[0]
        : undefined;
      const layerMapping =
        mappingRef.current[layerId] ||
        mappingRef.current[source] ||
        (sourcePrefix ? mappingRef.current[sourcePrefix] : undefined);

      if (layerMapping) {
        void createFeature(
          ctxRawFeature,
          layerMapping,
          mapInstance,
          useRoutingRef.current,
          openDatasheetRef.current
        ).then((feature) => {
          if (feature) {
            setSelectedFeature(feature);
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            onFeatureSelectRef.current?.(feature, ctxSelectedFeatureId);
          }
        });
      }
    }
  }, [
    selectionVersion,
    ctxSelectedFeatureId,
    ctxRawFeature,
    clearVisualSelection,
    applyVisualSelection,
  ]);

  // Wait for vector sources to be ready, with timeout
  const waitForVectorSources = (
    maxAttempts = 50,
    interval = 20
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        if (vectorSourcesReadyRef.current) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(check, interval);
        } else {
          console.warn("Vector sources did not load in time");
          resolve(false);
        }
      };
      check();
    });
  };

  const onComplete = async (selection: SelectionItem) => {
    if (!isAreaType(selection.type as ENDPOINT)) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);

      const ready = await waitForVectorSources();
      if (ready && map.current) {
        const mapInstance = map.current;
        // Query rendered features at the gazetteer position (no synthetic click needed)
        const point = mapInstance.project([selectedPos[0], selectedPos[1]]);
        const hits = mapInstance.queryRenderedFeatures(point);
        const filteredHits = hits.filter(
          (hit) =>
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster")
        );

        // Clear previous visual selection
        clearVisualSelection(mapInstance);
        setSelectedFeature(null);
        mapSelectionCtxRef.current.clearSelection();

        if (filteredHits.length > 0) {
          const selectedVectorFeature = selectFromHitsRef.current
            ? selectFromHitsRef.current(filteredHits) ?? filteredHits[0]
            : filteredHits[0];
          const featureId = {
            source: selectedVectorFeature.source,
            sourceLayer: selectedVectorFeature.sourceLayer,
            id: selectedVectorFeature.id,
          };

          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
          const layerMapping =
            mappingRef.current[layerId] ||
            mappingRef.current[selectedVectorFeature.source];

          let feature = null;
          if (layerMapping) {
            feature = await createFeature(
              selectedVectorFeature,
              layerMapping,
              mapInstance,
              useRouting,
              openDatasheetRef.current
            );
          }

          if (feature) {
            if (layerMapping) {
              applyVisualSelection(mapInstance, featureId);
            }
            setSelectedFeature(feature);

            mapSelectionCtxRef.current.selectFeature(
              featureId,
              selectedVectorFeature
            );
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            lastHandledVersionRef.current =
              mapSelectionCtxRef.current.selectionVersion + 1;

            onFeatureSelect?.(feature, featureId);
          }
        }
      }
    }
  };

  useSelectionLibreMap({
    map: map.current,
    onComplete,
  });

  return (
    <>
      {interactive && (
        <>
          <FeatureInfobox
            selectedFeature={
              selectedFeature
                ? {
                    ...selectedFeature,
                    properties: {
                      info: {
                        ...selectedFeature.properties,
                      },
                    },
                  }
                : overrideSelectedFeature
                ? {
                    ...overrideSelectedFeature,
                    properties: {
                      info: {
                        ...(overrideSelectedFeature.properties as Record<
                          string,
                          unknown
                        >),
                      },
                    },
                  }
                : null
            }
            libreMap={map.current}
            versionData={{
              version: "0.1.0",
            }}
          />
          <PhotoLightBox />
          <LibreMapSelectionContent map={map.current} />
        </>
      )}

      <div className="map-wrap">
        <div ref={mapContainer} className="map" />
      </div>

      {/* Auto-detect carma3d configs from style metadata + explicit layer props */}
      {threeRuntimeParams &&
        detectedCarma3dConfigs.map((config) => (
          <ThreeLayerManager
            key={config.sourceId}
            config={config}
            runtimeParams={threeRuntimeParams}
            perfRef={threePerfRef}
          />
        ))}
    </>
  );
};

export default LibreMap;
