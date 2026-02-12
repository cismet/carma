import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type {
  CarmaConf,
  EnrichedFeature,
  FeatureIdentifier,
  SelectedFeatureRecord,
  SelectionManagerOptions,
  SelectionResult,
} from "./selectionTypes";

// Re-export types for convenience
export type { CarmaConf, FeatureIdentifier };

/**
 * React-agnostic selection manager for MapLibre maps.
 * Handles click-to-select, selection forwarding, property target resolution,
 * and manual selection management.
 */
export class SelectionManager {
  private map: MaplibreMap;
  private options: Required<
    Omit<
      SelectionManagerOptions,
      "initialVisualSelection" | "onSelectionChanged"
    >
  > & {
    initialVisualSelection?: FeatureIdentifier;
    onSelectionChanged?: (result: SelectionResult) => void;
  };
  private selectedFeatures: Set<string> = new Set();

  constructor(map: MaplibreMap, options: SelectionManagerOptions = {}) {
    this.map = map;
    this.options = {
      maxSelectionCount: options.maxSelectionCount ?? 1,
      normalizeFeatureHitsById: options.normalizeFeatureHitsById ?? false,
      manualSelectionManagement: options.manualSelectionManagement ?? false,
      initialVisualSelection: options.initialVisualSelection,
      onSelectionChanged: options.onSelectionChanged,
    };
  }

  /**
   * Process a click event and return selection result.
   * Call this from your map click handler.
   */
  handleClick(lngLat: { lng: number; lat: number }): SelectionResult {
    const point = this.map.project([lngLat.lng, lngLat.lat]);
    const rect: [[number, number], [number, number]] = [
      [point.x, point.y],
      [point.x, point.y],
    ];

    const hits = this.map.queryRenderedFeatures(rect);
    const filteredHits = this.filterHits(hits);

    // Clear previous selection
    this.clearSelection();

    if (filteredHits.length === 0) {
      const result: SelectionResult = {
        hits: [],
        hit: undefined,
        lngLat,
      };
      this.options.onSelectionChanged?.(result);
      return result;
    }

    // Limit to maxSelectionCount
    const limitedHits = filteredHits.slice(0, this.options.maxSelectionCount);

    // Enrich hits with carmaInfo and targetProperties
    const enrichedHits = this.enrichHits(limitedHits);

    // Normalize by ID if requested
    const normalizedHits = this.options.normalizeFeatureHitsById
      ? this.normalizeById(enrichedHits)
      : enrichedHits;

    // Apply selection (unless manual mode)
    if (!this.options.manualSelectionManagement) {
      for (const hit of normalizedHits) {
        this.applySelection(hit, true);
      }
    }

    const result: SelectionResult = {
      hits: normalizedHits,
      hit: normalizedHits[0],
      lngLat,
    };

    this.options.onSelectionChanged?.(result);
    return result;
  }

  /**
   * Programmatically select or deselect a feature.
   */
  selectFeature(id: FeatureIdentifier, selected: boolean): void {
    if (selected) {
      this.setFeatureState(id, { selected: true });
      this.trackFeature(id);
      this.applySelectionForwarding(id, true);
    } else {
      this.setFeatureState(id, { selected: false });
      this.untrackFeature(id);
      this.applySelectionForwarding(id, false);
    }
  }

  /**
   * Clear all current selections.
   */
  clearSelection(): void {
    for (const key of this.selectedFeatures) {
      const record = this.parseFeatureKey(key);
      if (record) {
        this.setFeatureState(record, { selected: false });
      }
    }
    this.selectedFeatures.clear();
  }

  /**
   * Apply initial selection if configured. Call after map style is loaded.
   */
  applyInitialSelection(): void {
    if (this.options.initialVisualSelection) {
      this.selectFeature(this.options.initialVisualSelection, true);
    }
  }

  /**
   * Clean up resources. Call when disposing the manager.
   */
  destroy(): void {
    this.clearSelection();
  }

  // --- Private methods ---

  private filterHits(hits: MapGeoJSONFeature[]): MapGeoJSONFeature[] {
    return hits.filter((hit) => {
      const layerId = hit.layer?.id ?? "";
      const carmaConf = this.getCarmaConf(hit);

      // Exclude selection visualization layers
      if (layerId.includes("selection")) {
        return false;
      }

      // Exclude cluster layers
      if (layerId.includes("cluster")) {
        return false;
      }

      // Exclude if explicitly marked nonSelectable
      if (carmaConf?.nonSelectable) {
        return false;
      }

      return true;
    });
  }

  private enrichHits(hits: MapGeoJSONFeature[]): EnrichedFeature[] {
    return hits.map((hit) => {
      const enriched = hit as EnrichedFeature;
      const carmaConf = this.getCarmaConf(hit);

      // Attach carmaInfo
      enriched.properties = {
        ...enriched.properties,
        carmaInfo: {
          source: hit.source,
          sourceLayer: hit.sourceLayer,
          layerId: hit.layer?.id,
        },
      };

      // Resolve property target if configured
      if (carmaConf?.propertyTarget) {
        const targetProps = this.resolvePropertyTarget(
          hit,
          carmaConf.propertyTarget
        );
        if (targetProps) {
          enriched.properties.targetProperties = targetProps;
        }
      }

      // Attach setSelection function for manual mode
      if (this.options.manualSelectionManagement) {
        enriched.setSelection = (selected: boolean, sourceLayer?: string) => {
          const id: FeatureIdentifier = {
            source: hit.source,
            sourceLayer: sourceLayer ?? hit.sourceLayer,
            id: hit.id as string | number,
          };
          this.selectFeature(id, selected);
        };
      }

      return enriched;
    });
  }

  private normalizeById(hits: EnrichedFeature[]): EnrichedFeature[] {
    const seen = new Set<string | number>();
    return hits.filter((hit) => {
      if (hit.id === undefined || hit.id === null) return true;
      if (seen.has(hit.id)) return false;
      seen.add(hit.id);
      return true;
    });
  }

  private applySelection(hit: EnrichedFeature, selected: boolean): void {
    const id: FeatureIdentifier = {
      source: hit.source,
      sourceLayer: hit.sourceLayer,
      id: hit.id as string | number,
    };

    this.setFeatureState(id, { selected });

    if (selected) {
      this.trackFeature(id);
    } else {
      this.untrackFeature(id);
    }

    // Apply forwarding
    this.applySelectionForwarding(id, selected, hit);
  }

  private applySelectionForwarding(
    id: FeatureIdentifier,
    selected: boolean,
    hit?: MapGeoJSONFeature
  ): void {
    // Get carmaConf from hit or from style
    let carmaConf: CarmaConf | undefined;
    if (hit) {
      carmaConf = this.getCarmaConf(hit);
    } else {
      // Without a hit, try to get carmaConf from the style definition
      carmaConf = this.getCarmaConfFromStyle(id.sourceLayer);
    }

    const targets = carmaConf?.selectionForwardingTo;
    if (!targets || targets.length === 0) return;

    for (const targetSourceLayer of targets) {
      // Skip if target is the same as source
      if (targetSourceLayer === id.sourceLayer) continue;

      const forwardedId: FeatureIdentifier = {
        source: id.source,
        sourceLayer: targetSourceLayer,
        id: id.id,
      };

      this.setFeatureState(forwardedId, { selected });

      if (selected) {
        this.trackFeature(forwardedId);
      } else {
        this.untrackFeature(forwardedId);
      }
    }
  }

  private resolvePropertyTarget(
    hit: MapGeoJSONFeature,
    propertyTarget: string
  ): Record<string, unknown> | undefined {
    const [source, sourceLayer] = propertyTarget.split(".");
    if (!source || !sourceLayer) {
      console.warn(
        `Invalid propertyTarget format: "${propertyTarget}". Expected "source.sourceLayer"`
      );
      return undefined;
    }

    try {
      const features = this.map.querySourceFeatures(source, {
        sourceLayer,
        filter: ["==", ["get", "fid"], hit.id],
      });

      return features[0]?.properties as Record<string, unknown> | undefined;
    } catch (e) {
      console.warn(`Failed to resolve propertyTarget "${propertyTarget}":`, e);
      return undefined;
    }
  }

  private getCarmaConf(feature: MapGeoJSONFeature): CarmaConf | undefined {
    const metadata = feature.layer?.metadata as
      | Record<string, unknown>
      | undefined;
    return metadata?.carmaConf as CarmaConf | undefined;
  }

  private getCarmaConfFromStyle(sourceLayer?: string): CarmaConf | undefined {
    if (!sourceLayer) return undefined;

    const style = this.map.getStyle();
    if (!style?.layers) return undefined;

    // Find a layer that uses this source-layer
    for (const layer of style.layers) {
      if ("source-layer" in layer && layer["source-layer"] === sourceLayer) {
        const metadata = layer.metadata as Record<string, unknown> | undefined;
        return metadata?.carmaConf as CarmaConf | undefined;
      }
    }
    return undefined;
  }

  private setFeatureState(
    id: FeatureIdentifier,
    state: { selected?: boolean; hidden?: boolean }
  ): void {
    try {
      this.map.setFeatureState(
        {
          source: id.source,
          sourceLayer: id.sourceLayer,
          id: id.id,
        },
        state
      );
    } catch (e) {
      // Silently ignore errors (feature may not exist in current view)
    }
  }

  private trackFeature(id: FeatureIdentifier): void {
    this.selectedFeatures.add(this.makeFeatureKey(id));
  }

  private untrackFeature(id: FeatureIdentifier): void {
    this.selectedFeatures.delete(this.makeFeatureKey(id));
  }

  private makeFeatureKey(id: FeatureIdentifier): string {
    return `${id.source}|${id.sourceLayer ?? ""}|${id.id}`;
  }

  private parseFeatureKey(key: string): SelectedFeatureRecord | undefined {
    const parts = key.split("|");
    if (parts.length !== 3) return undefined;
    return {
      source: parts[0],
      sourceLayer: parts[1] || undefined,
      id: parts[2],
    };
  }
}

// --- Static utility functions for use without full SelectionManager ---

/**
 * Extract carmaConf metadata from a MapLibre feature.
 */
export function getCarmaConf(
  feature: MapGeoJSONFeature
): CarmaConf | undefined {
  const metadata = feature.layer?.metadata as
    | Record<string, unknown>
    | undefined;
  return metadata?.carmaConf as CarmaConf | undefined;
}

/**
 * Get carmaConf from style for a given source-layer.
 */
export function getCarmaConfFromStyle(
  map: MaplibreMap,
  sourceLayer?: string
): CarmaConf | undefined {
  if (!sourceLayer) return undefined;

  const style = map.getStyle();
  if (!style?.layers) return undefined;

  for (const layer of style.layers) {
    if ("source-layer" in layer && layer["source-layer"] === sourceLayer) {
      const metadata = layer.metadata as Record<string, unknown> | undefined;
      return metadata?.carmaConf as CarmaConf | undefined;
    }
  }
  return undefined;
}

/**
 * Apply selection forwarding for a feature.
 * Sets feature-state { selected } on all target source-layers defined in carmaConf.
 *
 * @returns Array of forwarded feature identifiers (for tracking/cleanup)
 */
export function applySelectionForwarding(
  map: MaplibreMap,
  featureId: FeatureIdentifier,
  selected: boolean,
  feature?: MapGeoJSONFeature
): FeatureIdentifier[] {
  const forwardedFeatures: FeatureIdentifier[] = [];

  // Get carmaConf from feature or style
  let carmaConf: CarmaConf | undefined;
  if (feature) {
    carmaConf = getCarmaConf(feature);
  } else {
    carmaConf = getCarmaConfFromStyle(map, featureId.sourceLayer);
  }

  const targets = carmaConf?.selectionForwardingTo;
  if (!targets || targets.length === 0) return forwardedFeatures;

  for (const targetSourceLayer of targets) {
    // Skip if target is the same as source
    if (targetSourceLayer === featureId.sourceLayer) continue;

    const forwardedId: FeatureIdentifier = {
      source: featureId.source,
      sourceLayer: targetSourceLayer,
      id: featureId.id,
    };

    try {
      map.setFeatureState(
        {
          source: forwardedId.source,
          sourceLayer: forwardedId.sourceLayer,
          id: forwardedId.id,
        },
        { selected }
      );
      forwardedFeatures.push(forwardedId);
    } catch {
      // Feature may not exist in this source-layer
    }
  }

  return forwardedFeatures;
}

/**
 * Resolve property target: look up full properties from a different source-layer.
 * Matches the original react-cismap implementation exactly.
 *
 * @param propertyTarget Format: "source.sourceLayer"
 * @returns Properties from the target feature, or undefined if not found
 */
export function resolvePropertyTarget(
  map: MaplibreMap,
  featureId: string | number,
  propertyTarget: string
): Record<string, unknown> | undefined {
  const parts = propertyTarget.split(".");
  const source = parts[0];
  const sourceLayer = parts[1];

  // Try exact source name first, then look for a namespaced match (e.g. "prefix::source")
  let resolvedSource = source;
  if (!map.getSource(source)) {
    const style = map.getStyle();
    if (style?.sources) {
      const match = Object.keys(style.sources).find((s) =>
        s.endsWith(`::${source}`)
      );
      if (match) resolvedSource = match;
    }
  }

  console.debug(
    "[resolvePropertyTarget] Querying source:",
    resolvedSource,
    "sourceLayer:",
    sourceLayer,
    "with fid:",
    featureId
  );

  const features = map.querySourceFeatures(resolvedSource, {
    sourceLayer,
    filter: ["==", ["get", "fid"], featureId],
  });

  console.debug("[resolvePropertyTarget] Found", features.length, "features");
  if (features.length > 0) {
    console.debug(
      "[resolvePropertyTarget] First feature fid:",
      features[0]?.properties?.fid,
      "id:",
      features[0]?.id
    );
  }

  return features[0]?.properties as Record<string, unknown> | undefined;
}
