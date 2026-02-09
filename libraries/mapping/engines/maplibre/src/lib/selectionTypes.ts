import type { MapGeoJSONFeature } from "maplibre-gl";

/**
 * CarmaConf metadata embedded in MapLibre style layer.metadata.carmaConf
 */
export interface CarmaConf {
  // Selection forwarding
  selectionForwardingTo?: string[]; // source-layer names to forward selection state
  propertyTarget?: string; // "source.sourceLayer" format for property lookup
  nonSelectable?: boolean; // exclude from selection hits
  selectable?: boolean; // explicitly mark as selectable

  // Hiding forwarding
  hidingForwardingTo?: string[]; // layer IDs to sync hidden state with

  // Existing (used by infobox)
  infoboxMapping?: string[];
  staticProps?: Record<string, unknown>;
}

/**
 * Identifies a specific feature for selection operations
 */
export interface FeatureIdentifier {
  source: string;
  sourceLayer?: string;
  id: string | number;
}

/**
 * Metadata attached to selected features
 */
export interface CarmaInfo {
  source: string;
  sourceLayer?: string;
  layerId?: string;
}

/**
 * Feature enriched with carmaInfo and optional targetProperties
 */
export interface EnrichedFeature extends MapGeoJSONFeature {
  properties: MapGeoJSONFeature["properties"] & {
    carmaInfo?: CarmaInfo;
    targetProperties?: Record<string, unknown>;
  };
  /** Manual selection function (only present when manualSelectionManagement is true) */
  setSelection?: (selected: boolean, sourceLayer?: string) => void;
}

/**
 * Result returned from selection operations
 */
export interface SelectionResult {
  hits: EnrichedFeature[];
  hit: EnrichedFeature | undefined;
  lngLat: { lng: number; lat: number };
}

/**
 * Options for SelectionManager
 */
export interface SelectionManagerOptions {
  /** Maximum features to select per click (default: 1) */
  maxSelectionCount?: number;
  /** Deduplicate hits by feature ID (default: false) */
  normalizeFeatureHitsById?: boolean;
  /** Don't auto-select; expose setSelection on hits instead (default: false) */
  manualSelectionManagement?: boolean;
  /** Feature to select on initialization */
  initialVisualSelection?: FeatureIdentifier;
  /** Callback when selection changes */
  onSelectionChanged?: (result: SelectionResult) => void;
}

/**
 * Internal tracking of selected features for cleanup
 */
export interface SelectedFeatureRecord {
  source: string;
  sourceLayer?: string;
  id: string | number;
}
