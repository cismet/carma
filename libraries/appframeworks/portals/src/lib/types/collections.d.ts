import type { Layer } from "@carma/types";
import type { FeatureInfo, SearchResultItem } from "@carma/types";

/**
 * Collection and feature info types
 */

export type GeoportalCollection = {
  title: string;
  description: string;
  type: "collection";
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  thumbnail: any;
  id: string;
  serviceName: string;
};

export interface FeatureInfoState {
  features: (FeatureInfo | SearchResultItem)[];
  selectedFeature: FeatureInfo | null; // Only FeatureInfo - SearchResultItem is for gazetteer search, not selection
  secondaryInfoBoxElements: FeatureInfo[]; // Only FeatureInfo - overlapping WMS features
  infoText: string;
  preferredLayerId: string;
  preferredVectorLayerId?: number;
  vectorInfo: FeatureInfo | undefined; // Only FeatureInfo - vector layer features
  vectorInfos: FeatureInfo[];
  nothingFoundIDs: string[];
  loading: boolean;
  completedVectorLayers: string[];
}

// Note: BackgroundLayer and SavedLayerConfig need to be defined or imported
// These are referenced but not defined in the original types
export type BackgroundLayer = any; // TODO: Define proper type
export type SavedLayerConfig = any; // TODO: Define proper type
