import type { Map as MaplibreMap } from "maplibre-gl";
import type { CarmaConf } from "./selectionTypes";

interface LayerSourceInfo {
  source: string;
  sourceLayer?: string;
}

interface HidingForwardingConfig {
  sourceLayerId: string;
  targets: string[];
  resolvedTargets: string[];
  lastVisibleIds: string | null;
}

/**
 * React-agnostic manager for hiding forwarding in MapLibre maps.
 * Syncs label collision visibility with associated background elements.
 *
 * When MapLibre hides a label due to collision detection, this manager
 * propagates the hidden state to target layers via feature-state.
 */
export class HidingForwardingManager {
  private map: MaplibreMap;
  private configs: Map<string, HidingForwardingConfig> = new Map();
  private layerSourceMap: Map<string, LayerSourceInfo> = new Map();
  private idleHandler: (() => void) | null = null;
  private isRunning = false;

  constructor(map: MaplibreMap) {
    this.map = map;
    this.parseStyleForHidingConfig();
  }

  /**
   * Start listening for idle events and syncing hidden state.
   */
  start(): void {
    if (this.isRunning || this.configs.size === 0) return;

    this.idleHandler = () => this.syncHidingState();
    this.map.on("idle", this.idleHandler);
    this.isRunning = true;
  }

  /**
   * Stop listening for idle events.
   */
  stop(): void {
    if (!this.isRunning) return;
    if (this.idleHandler) {
      this.map.off("idle", this.idleHandler);
      this.idleHandler = null;
    }
    this.isRunning = false;
  }

  /**
   * Clean up resources. Call when disposing the manager.
   */
  destroy(): void {
    this.stop();
    this.configs.clear();
    this.layerSourceMap.clear();
  }

  /**
   * Re-parse style for hiding config. Call if style changes.
   */
  refresh(): void {
    this.parseStyleForHidingConfig();
  }

  // --- Private methods ---

  private parseStyleForHidingConfig(): void {
    this.configs.clear();
    this.layerSourceMap.clear();

    const style = this.map.getStyle();
    if (!style?.layers) return;

    for (const layer of style.layers) {
      // Build layer source map for target resolution
      if ("source" in layer && layer.source) {
        this.layerSourceMap.set(layer.id, {
          source: layer.source as string,
          sourceLayer:
            "source-layer" in layer
              ? (layer["source-layer"] as string)
              : undefined,
        });
      }

      // Check for hiding forwarding config
      const metadata = layer.metadata as Record<string, unknown> | undefined;
      const carmaConf = metadata?.carmaConf as CarmaConf | undefined;
      if (
        carmaConf?.hidingForwardingTo &&
        carmaConf.hidingForwardingTo.length > 0
      ) {
        // Extract prefix from layer-id metadata (added by styleBuilder)
        // Detect separator from the layer's own ID: imperative mode uses "::", merged uses "-"
        const layerIdPrefix = metadata?.["layer-id"] as string | undefined;
        let sep = "-";
        if (layerIdPrefix && layer.id.startsWith(`${layerIdPrefix}::`)) {
          sep = "::";
        }
        const prefix = layerIdPrefix ? `${layerIdPrefix}${sep}` : "";

        // Resolve targets by applying the same prefix
        const resolvedTargets = carmaConf.hidingForwardingTo.map(
          (t) => `${prefix}${t}`
        );

        this.configs.set(layer.id, {
          sourceLayerId: layer.id,
          targets: carmaConf.hidingForwardingTo,
          resolvedTargets,
          lastVisibleIds: null,
        });
      }
    }
  }

  private syncHidingState(): void {
    for (const [sourceLayerId, config] of this.configs) {
      try {
        this.syncLayerHidingState(sourceLayerId, config);
      } catch {
        // Silently ignore sync errors
      }
    }
  }

  private syncLayerHidingState(
    sourceLayerId: string,
    config: HidingForwardingConfig
  ): void {
    // Query rendered features from source layer (only visible after collision)
    const visibleFeatures = this.map.queryRenderedFeatures({
      layers: [sourceLayerId],
    });

    // Collect visible feature IDs
    const visibleIds = new Set<string | number>();
    for (const feature of visibleFeatures) {
      if (feature.id !== undefined && feature.id !== null) {
        visibleIds.add(feature.id);
      }
    }

    // Create string representation for comparison
    const visibleIdsString = Array.from(visibleIds).sort().join(",");

    // Skip if unchanged
    if (visibleIdsString === config.lastVisibleIds) return;

    // Collect all feature IDs from target layers
    const allTargetIds = new Set<string | number>();
    const targetLayerInfos: Array<{ id: string } & LayerSourceInfo> = [];

    for (const targetLayerId of config.resolvedTargets) {
      const layerInfo = this.layerSourceMap.get(targetLayerId);
      if (!layerInfo) continue;

      targetLayerInfos.push({ id: targetLayerId, ...layerInfo });

      // Query rendered features in target layer
      try {
        const targetFeatures = this.map.queryRenderedFeatures({
          layers: [targetLayerId],
        });

        for (const feature of targetFeatures) {
          if (feature.id !== undefined && feature.id !== null) {
            allTargetIds.add(feature.id);
          }
        }
      } catch {
        // Layer might not be visible, ignore
      }
    }

    // Set feature state on all target layers for all collected IDs
    for (const layerInfo of targetLayerInfos) {
      for (const featureId of allTargetIds) {
        const isHidden = !visibleIds.has(featureId);

        try {
          this.map.setFeatureState(
            {
              source: layerInfo.source,
              sourceLayer: layerInfo.sourceLayer,
              id: featureId,
            },
            { hidden: isHidden }
          );
        } catch {
          // Feature may not exist in source, ignore
        }
      }
    }

    // Update lastVisibleIds
    config.lastVisibleIds = visibleIdsString;
  }
}
