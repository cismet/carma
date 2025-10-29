import { FeatureInfo } from "../../../../../types/src/index.ts";
/**
 * Returns a stable handler that syncs 3D model selection to SelectionProvider
 * This is the Redux-free version - moved from geoportal app
 *
 * Model selection is separate from topicmap selection:
 * - Uses FeatureInfo type (not SearchResultItem)
 * - Shows standalone feature info box (not topicmap info box)
 * - Active when 2D mode is disabled
 */
export declare const useModelSelectionHandler: () => (
  feature: FeatureInfo | null
) => void;
