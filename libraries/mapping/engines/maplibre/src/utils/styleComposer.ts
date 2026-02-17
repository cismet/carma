/**
 * StyleComposer: imperative layer management for MapLibre GL.
 *
 * Instead of merging all layer styles into a single StyleSpecification and calling
 * map.setStyle(), this class uses the imperative API (addSource, addLayer, addSprite)
 * to add/remove sub-styles incrementally. This avoids full style rebuilds and lets
 * MapLibre handle sprite namespacing natively via addSprite().
 */

import type {
  Map as MaplibreMap,
  LayerSpecification,
  SourceSpecification,
  GeoJSONSourceSpecification,
} from "maplibre-gl";
import slugify from "slugify";
import {
  getPaintProperty,
  prefixPatternExpression,
  extractGeoJson,
  transformedPois,
} from "./styleBuilder";
import type { LibreLayer } from "../components/LibreMap";

/**
 * Slugify a URL into a compact ID: strips protocol and .json extension,
 * then removes all non-alphanumeric chars and lowercases.
 */
export function slugifyUrl(url: string): string {
  const cleaned = url.replace(/^https?:\/\//i, "").replace(/\.json$/i, "");
  return slugify(cleaned, { remove: /[^a-zA-Z0-9]/g, lower: true });
}

/** Tracks everything added for a single sub-style so it can be cleanly removed. */
interface ManagedSubStyle {
  sourceIds: string[];
  layerIds: string[];
  spriteId: string | null;
  firstId: string;
  lastId: string;
}

/** Metadata returned for GeoJSON sub-styles (needed for pie-chart cluster rendering). */
export interface GeoJsonSubStyleMeta {
  sourceId: string;
  uniqueColors: string[];
}

export interface AddVectorSubStyleOptions {
  /** Opacity multiplier applied to all non-selection layers (0..1) */
  opacity?: number;
  /** Marker symbol size from TopicMapStylingContext (default 35) */
  markerSymbolSize?: number;
  /** Z-index for layer ordering metadata */
  zIndex: number;
  /** Layer ID inserted before this layer's sentinel (for z-ordering between sub-styles) */
  beforeId?: string;
}

export interface AddGeoJsonSubStyleOptions {
  zIndex: number;
  clusteringEnabled?: boolean;
  beforeId?: string;
}

export interface AddRasterSubStyleOptions {
  zIndex: number;
  beforeId?: string;
}

/**
 * Apply marker symbol size scaling to a single layer definition (in-place mutation).
 *
 * Extracted from styleManipulation() which operates on an entire StyleSpecification;
 * here we apply the same logic per-layer.
 */
function applySymbolScaling(
  layer: LayerSpecification,
  markerSymbolSize: number
): void {
  if (layer.type !== "symbol") return;
  const scale = (markerSymbolSize / 35) * 1.35;
  const layout = (
    layer as LayerSpecification & { layout?: Record<string, unknown> }
  ).layout;
  if (!layout) return;

  if (layout["icon-size"] !== undefined) {
    const iconSize = layout["icon-size"];
    if (typeof iconSize === "number") {
      layout["icon-size"] = iconSize * scale;
    } else if (Array.isArray(iconSize) && iconSize[0] === "interpolate") {
      const copy = [...iconSize] as unknown[];
      for (let i = 3; i < copy.length; i += 2) {
        if (typeof copy[i + 1] === "number") {
          (copy as number[])[i + 1] = (copy[i + 1] as number) * scale;
        }
      }
      layout["icon-size"] = copy;
    }
  }
  if (layout["text-size"] !== undefined) {
    const textSize = layout["text-size"];
    if (typeof textSize === "number") {
      layout["text-size"] = textSize * scale;
    }
  }
}

/**
 * Bidirectional layer ID mapping attached to the MapLibre map instance.
 * Maps merged-mode-equivalent IDs (e.g. "Leuchten-leitungen-base") to
 * namespaced IDs (e.g. "tilescismetdebelisstyle::leitungen-base") and back.
 * Used by useVisibleMapFeatures to resolve regex patterns transparently.
 */
export interface CarmaLayerIdMap {
  /** merged-mode-equivalent ID -> namespaced map layer ID */
  mergedToNamespaced: Map<string, string>;
  /** namespaced map layer ID -> merged-mode-equivalent ID */
  namespacedToMerged: Map<string, string>;
}

const LAYER_ID_MAP_KEY = "__carmaLayerIdMap";

/** Read the layer ID mapping from a map instance (if set by StyleComposer). */
export function getCarmaLayerIdMap(
  map: MaplibreMap
): CarmaLayerIdMap | undefined {
  return (map as unknown as Record<string, unknown>)[LAYER_ID_MAP_KEY] as
    | CarmaLayerIdMap
    | undefined;
}

export class StyleComposer {
  private map: MaplibreMap;
  private managed: Map<string, ManagedSubStyle> = new Map();
  /** merged-mode-equivalent ID -> namespaced layer ID */
  private mergedToNamespaced: Map<string, string> = new Map();
  /** namespaced layer ID -> merged-mode-equivalent ID */
  private namespacedToMerged: Map<string, string> = new Map();
  private debugLog: boolean;

  constructor(map: MaplibreMap, debugLog = false) {
    this.map = map;
    this.debugLog = debugLog;
  }

  /** Sync the bidirectional map to the map instance so other hooks can read it. */
  private syncToMapInstance(): void {
    const mapping: CarmaLayerIdMap = {
      mergedToNamespaced: this.mergedToNamespaced,
      namespacedToMerged: this.namespacedToMerged,
    };
    (this.map as unknown as Record<string, unknown>)[LAYER_ID_MAP_KEY] =
      mapping;
  }

  /** Resolve a merged-mode-equivalent ID to its namespaced map layer ID. */
  resolveNamespaced(mergedId: string): string | undefined {
    return this.mergedToNamespaced.get(mergedId);
  }

  /** Resolve a namespaced map layer ID back to its merged-mode-equivalent ID. */
  resolveMerged(namespacedId: string): string | undefined {
    return this.namespacedToMerged.get(namespacedId);
  }

  // -------------------------------------------------------------------------
  // Vector sub-style
  // -------------------------------------------------------------------------

  async addVectorSubStyle(
    vectorLayer: Extract<LibreLayer, { type: "vector" }>,
    opts: AddVectorSubStyleOptions
  ): Promise<void> {
    // Compute layerId from the style URL (slugified)
    const layerId = slugifyUrl(vectorLayer.style!);

    // Compute the merged-mode-equivalent prefix (same logic as styleBuilder)
    let mergedPrefix = vectorLayer.name;
    if (vectorLayer.layer) {
      const atIdx = vectorLayer.layer.indexOf("@");
      if (atIdx > 0) mergedPrefix = vectorLayer.layer.substring(0, atIdx);
    }

    // Idempotency: skip if already managed
    if (this.managed.has(layerId)) return;

    const response = await fetch(vectorLayer.style!);
    const styleJson = await response.json();
    let spriteId = layerId;
    if (styleJson.sprite) {
      spriteId = slugify(styleJson.sprite, {
        remove: /[^a-zA-Z0-9]/g,
        lower: true,
      });
    }

    const firstId = `---${layerId}:first---`;
    const lastId = `---${layerId}:last---`;
    const sourceIds: string[] = [];
    const layerIds: string[] = [];

    // 1. Insert boundary layers (first/last pair, layers go between them)
    this.map.addLayer(
      {
        id: lastId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      opts.beforeId
    );
    this.map.addLayer(
      {
        id: firstId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      lastId
    );

    // 2. Add sprite (MapLibre handles namespace prefixing natively)
    if (styleJson.sprite) {
      try {
        this.map.addSprite(spriteId, styleJson.sprite);
      } catch (err) {
        // Sprite may already exist from a previous add
        console.debug(`[StyleComposer] addSprite(${spriteId}) skipped:`, err);
      }
    }

    // 3. Add sources (namespaced to prevent collisions)
    const remoteSources = styleJson.sources as
      | Record<string, SourceSpecification>
      | undefined;
    if (remoteSources) {
      for (const [srcId, srcDef] of Object.entries(remoteSources)) {
        const namespacedSrc = `${layerId}::${srcId}`;
        if (!this.map.getSource(namespacedSrc)) {
          this.map.addSource(namespacedSrc, srcDef);
        }
        sourceIds.push(namespacedSrc);
      }
    }

    // 4. Add layers
    const remoteLayers = (styleJson.layers || []) as LayerSpecification[];
    const opacity = opts.opacity ?? 1;
    const markerSymbolSize = opts.markerSymbolSize ?? 35;

    for (const styleLayer of remoteLayers) {
      // Skip background-type layers (the remote style's own background)
      if (styleLayer.type === "background") continue;

      // Deep clone to avoid mutating the fetched JSON
      const layer = JSON.parse(
        JSON.stringify(styleLayer)
      ) as LayerSpecification & {
        source?: string;
        "source-layer"?: string;
        metadata?: Record<string, unknown>;
        paint?: Record<string, unknown>;
        layout?: Record<string, unknown>;
      };

      // Namespace IDs (prefix::layerName for layers, layerId::source for sources)
      layer.id = `${layerId}::${styleLayer.id}`;
      // Store merged-mode-equivalent key so regex patterns work in both modes
      const mergedKey = `${mergedPrefix}-${styleLayer.id}`;
      this.mergedToNamespaced.set(mergedKey, layer.id);
      this.namespacedToMerged.set(layer.id, mergedKey);
      if (layer.source) {
        layer.source = `${layerId}::${layer.source}`;
      }

      // Set metadata for HidingForwardingManager and z-ordering
      layer.metadata = {
        ...(layer.metadata || {}),
        "z-index": opts.zIndex,
        "layer-id": layerId,
      };

      // Apply opacity (skip selection layers)
      if (!styleLayer.id.toLowerCase().includes("selection")) {
        const paint = (layer.paint || {}) as Record<string, unknown>;
        // Symbol layers need both text-opacity and icon-opacity
        const props =
          styleLayer.type === "symbol"
            ? ["text-opacity", "icon-opacity"]
            : ([getPaintProperty(styleLayer)].filter(Boolean) as string[]);
        for (const prop of props) {
          const baseOpacity = paint[prop] ?? 1;
          paint[prop] =
            typeof baseOpacity === "number"
              ? baseOpacity * opacity
              : opacity < 1
              ? opacity
              : baseOpacity;
        }
        layer.paint = paint;
      }

      // Prefix fill-pattern with sprite namespace
      if (layer.paint?.["fill-pattern"] !== undefined) {
        layer.paint["fill-pattern"] = prefixPatternExpression(
          spriteId,
          layer.paint["fill-pattern"]
        );
      }

      // Prefix icon-image with sprite namespace
      if (layer.layout?.["icon-image"] !== undefined) {
        layer.layout["icon-image"] = [
          "concat",
          `${spriteId}:`,
          layer.layout["icon-image"],
        ];
      }

      // Apply marker symbol size scaling
      applySymbolScaling(layer as LayerSpecification, markerSymbolSize);

      // Insert before last boundary so layers stack between first and last
      this.map.addLayer(layer as LayerSpecification, lastId);
      layerIds.push(layer.id);
    }

    this.managed.set(layerId, {
      sourceIds,
      layerIds,
      spriteId,
      firstId,
      lastId,
    });
    this.syncToMapInstance();
    if (this.debugLog)
      console.log(
        "[StyleComposer] layer ID mapping:",
        Object.fromEntries(this.mergedToNamespaced)
      );
  }

  // -------------------------------------------------------------------------
  // GeoJSON sub-style
  // -------------------------------------------------------------------------

  async addGeoJsonSubStyle(
    id: string,
    dataUrl: string,
    opts: AddGeoJsonSubStyleOptions
  ): Promise<GeoJsonSubStyleMeta> {
    // Idempotency: skip if already managed
    if (this.managed.has(id))
      return { sourceId: `${id}::geojson`, uniqueColors: [] };

    const raw = await extractGeoJson(dataUrl);
    const data = transformedPois(raw);

    const firstId = `---${id}:first---`;
    const lastId = `---${id}:last---`;
    const sourceId = `${id}::geojson`;
    const sourceIds = [sourceId];
    const layerIds: string[] = [];

    // Boundary layers
    this.map.addLayer(
      {
        id: lastId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      opts.beforeId
    );
    this.map.addLayer(
      {
        id: firstId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      lastId
    );

    // Unique colors for clustering pie charts
    const uniqueColors: string[] = Array.from(
      new Set(
        (data.features as GeoJSON.Feature[])
          .map((f) => (f.properties as Record<string, unknown>)?.schrift)
          .filter((c): c is string => typeof c === "string")
      )
    );

    // Source with optional clustering
    const sourceDef: GeoJSONSourceSpecification = { type: "geojson", data };
    if (opts.clusteringEnabled) {
      sourceDef.cluster = true;
      sourceDef.clusterMaxZoom = 16;
      sourceDef.clusterRadius = 40;
      sourceDef.clusterProperties = Object.fromEntries(
        uniqueColors.map((color) => [
          color,
          ["+", ["case", ["==", ["get", "schrift"], color], 1, 0]],
        ])
      );
    }
    this.map.addSource(sourceId, sourceDef as SourceSpecification);

    // Cluster circles (only if clustering)
    if (opts.clusteringEnabled) {
      const clusterId = `${id}-clusters`;
      this.map.addLayer(
        {
          id: clusterId,
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 20 },
        } as LayerSpecification,
        lastId
      );
      layerIds.push(clusterId);
    }

    // Selection symbols
    const selId = `${id}-images-selection`;
    this.map.addLayer(
      {
        id: selId,
        type: "symbol",
        source: sourceId,
        minzoom: 9,
        maxzoom: 24,
        layout: {
          visibility: "visible",
          "symbol-z-order": "source",
          "symbol-sort-key": ["get", "geographicidentifier"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.32, 24, 1],
          "icon-padding": 0,
          "icon-image": "Icon_Full#4892F0",
        },
        paint: {
          "icon-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
        },
      } as LayerSpecification,
      lastId
    );
    layerIds.push(selId);

    // POI images
    const imgId = `${id}-poi-images`;
    this.map.addLayer(
      {
        id: imgId,
        type: "symbol",
        source: sourceId,
        minzoom: 0,
        maxzoom: 24,
        filter: ["!", ["has", "point_count"]],
        layout: {
          visibility: "visible",
          "symbol-z-order": "source",
          "symbol-sort-key": ["get", "geographicidentifier"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.32, 24, 0.8],
          "icon-padding": 0,
          "icon-image": ["concat", ["get", "signatur"], ["get", "schrift"]],
        },
        paint: { "icon-color": ["get", "schrift"] },
      } as LayerSpecification,
      lastId
    );
    layerIds.push(imgId);

    // POI labels
    const lblId = `${id}-poi-labels`;
    this.map.addLayer(
      {
        id: lblId,
        type: "symbol",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        minzoom: 16,
        maxzoom: 24,
        layout: {
          "text-field": ["get", "geographicidentifier"],
          "text-font": ["Open Sans Semibold"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-size": 12,
          "text-offset": [
            "interpolate",
            ["linear"],
            ["zoom"],
            17,
            ["literal", [0, 1.3]],
            24,
            ["literal", [0, 2]],
          ],
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-rotation-alignment": "viewport",
        },
        paint: {
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 5,
          "text-color": ["get", "schrift"],
          "text-opacity": 1,
        },
      } as LayerSpecification,
      lastId
    );
    layerIds.push(lblId);

    this.managed.set(id, {
      sourceIds,
      layerIds,
      spriteId: null,
      firstId,
      lastId,
    });
    return { sourceId, uniqueColors };
  }

  // -------------------------------------------------------------------------
  // WMS / WMTS raster sub-style
  // -------------------------------------------------------------------------

  addRasterSubStyle(
    id: string,
    layer: Extract<LibreLayer, { type: "wms" | "wmts" }>,
    opts: AddRasterSubStyleOptions
  ): void {
    // Idempotency: skip if already managed
    if (this.managed.has(id)) return;

    const firstId = `---${id}:first---`;
    const lastId = `---${id}:last---`;
    const sanitized = layer.layers.replace(/[^a-zA-Z0-9]/g, "-");
    const sourceId = `${id}::${sanitized}`;

    this.map.addLayer(
      {
        id: lastId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      opts.beforeId
    );
    this.map.addLayer(
      {
        id: firstId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      lastId
    );

    const version = layer.version || "1.1.1";
    const crsParam = version >= "1.3.0" ? "crs" : "srs";
    const isWmts = layer.type === "wmts";

    const tileUrl = `${layer.url}${
      layer.url.endsWith("?") ? "" : "?"
    }service=WMS&version=${version}&request=GetMap&layers=${
      layer.layers
    }&styles=${layer.styles || (isWmts ? "default" : "")}&format=${
      layer.format || "image/png"
    }&transparent=${layer.transparent ? "true" : "false"}${
      isWmts ? "&type=wmts" : ""
    }&width=${layer.tileSize ?? 256}&height=${
      layer.tileSize ?? 256
    }&${crsParam}=EPSG:3857&bbox={bbox-epsg-3857}`;

    this.map.addSource(sourceId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: layer.tileSize ?? 256,
    });

    const layerId = `${id}-raster`;
    this.map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": layer.opacity ?? 1 },
        metadata: { "z-index": opts.zIndex, "layer-id": id },
      } as LayerSpecification,
      lastId
    );

    this.managed.set(id, {
      sourceIds: [sourceId],
      layerIds: [layerId],
      spriteId: null,
      firstId,
      lastId,
    });
  }

  // -------------------------------------------------------------------------
  // COG sub-style
  // -------------------------------------------------------------------------

  addCogSubStyle(
    id: string,
    layer: Extract<LibreLayer, { type: "cog" }>,
    opts: AddRasterSubStyleOptions
  ): void {
    // Idempotency: skip if already managed
    if (this.managed.has(id)) return;

    const firstId = `---${id}:first---`;
    const lastId = `---${id}:last---`;
    const sourceId = `${id}::cog`;

    this.map.addLayer(
      {
        id: lastId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      opts.beforeId
    );
    this.map.addLayer(
      {
        id: firstId,
        type: "background",
        paint: { "background-opacity": 0 },
      } as LayerSpecification,
      lastId
    );

    this.map.addSource(sourceId, {
      type: "raster",
      url: `cog://${layer.url}`,
      tileSize: 256,
    });

    const layerId = `${id}-cog`;
    this.map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": layer.opacity ?? 1 },
        metadata: { "z-index": opts.zIndex, "layer-id": id },
      } as LayerSpecification,
      lastId
    );

    this.managed.set(id, {
      sourceIds: [sourceId],
      layerIds: [layerId],
      spriteId: null,
      firstId,
      lastId,
    });
  }

  // -------------------------------------------------------------------------
  // In-place opacity updates (no layer rebuild)
  // -------------------------------------------------------------------------

  updateVectorOpacity(styleUrl: string, opacity: number): void {
    const id = slugifyUrl(styleUrl);
    const entry = this.managed.get(id);
    if (!entry) return;
    for (const namespacedId of entry.layerIds) {
      const layer = this.map.getLayer(namespacedId);
      if (!layer) continue;
      // Skip selection layers
      if (namespacedId.toLowerCase().includes("selection")) continue;
      const type = layer.type;
      if (type === "symbol") {
        this.map.setPaintProperty(namespacedId, "text-opacity", opacity);
        this.map.setPaintProperty(namespacedId, "icon-opacity", opacity);
      } else if (type === "fill") {
        this.map.setPaintProperty(namespacedId, "fill-opacity", opacity);
      } else if (type === "line") {
        this.map.setPaintProperty(namespacedId, "line-opacity", opacity);
      } else if (type === "circle") {
        this.map.setPaintProperty(namespacedId, "circle-opacity", opacity);
      } else if (type === "raster") {
        this.map.setPaintProperty(namespacedId, "raster-opacity", opacity);
      } else if (type === "background") {
        this.map.setPaintProperty(namespacedId, "background-opacity", opacity);
      } else if (type === "fill-extrusion") {
        this.map.setPaintProperty(
          namespacedId,
          "fill-extrusion-opacity",
          opacity
        );
      } else if (type === "heatmap") {
        this.map.setPaintProperty(namespacedId, "heatmap-opacity", opacity);
      }
    }
  }

  updateRasterOpacity(id: string, opacity: number): void {
    const entry = this.managed.get(id);
    if (!entry) return;
    for (const layerId of entry.layerIds) {
      if (this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, "raster-opacity", opacity);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Removal
  // -------------------------------------------------------------------------

  removeSubStyle(id: string): void {
    const entry = this.managed.get(id);
    if (!entry) return;

    // Remove layers in reverse order (top to bottom) and clean up ID mappings
    for (let i = entry.layerIds.length - 1; i >= 0; i--) {
      const namespacedId = entry.layerIds[i];
      const mergedKey = this.namespacedToMerged.get(namespacedId);
      if (mergedKey) {
        this.mergedToNamespaced.delete(mergedKey);
      }
      this.namespacedToMerged.delete(namespacedId);
      try {
        if (this.map.getLayer(namespacedId)) {
          this.map.removeLayer(namespacedId);
        }
      } catch {
        // Layer may already be gone
      }
    }

    // Remove boundary layers
    for (const boundaryId of [entry.firstId, entry.lastId]) {
      try {
        if (this.map.getLayer(boundaryId)) {
          this.map.removeLayer(boundaryId);
        }
      } catch {
        // Already gone
      }
    }

    // Remove sources
    for (const srcId of entry.sourceIds) {
      try {
        if (this.map.getSource(srcId)) {
          this.map.removeSource(srcId);
        }
      } catch {
        // Already gone
      }
    }

    // Remove sprite
    if (entry.spriteId) {
      try {
        this.map.removeSprite(entry.spriteId);
      } catch {
        // Already gone or shared with another sub-style
      }
    }

    this.managed.delete(id);
    this.syncToMapInstance();
  }

  removeAll(): void {
    for (const id of [...this.managed.keys()]) {
      this.removeSubStyle(id);
    }
  }

  destroy(): void {
    this.removeAll();
  }

  /**
   * Fetch the glyphs URL from a remote vector style.
   * Useful for pre-setting glyphs on the base style before adding layers.
   */
  static async fetchGlyphsUrl(styleUrl: string): Promise<string | undefined> {
    try {
      const resp = await fetch(styleUrl);
      const json = await resp.json();
      return json.glyphs as string | undefined;
    } catch {
      return undefined;
    }
  }

  /** Check whether a sub-style with the given ID is currently managed. */
  has(id: string): boolean {
    return this.managed.has(id);
  }

  /** Get the last boundary layer ID for a managed sub-style (useful for beforeId). */
  getLastId(id: string): string | undefined {
    return this.managed.get(id)?.lastId;
  }
}
