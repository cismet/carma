import type { ComponentType } from "react";

import type { Layer } from "@carma-mapping/layers";

import {
  HighlightInteractionPanel,
  HIGHLIGHT_TOOLS_INTERACTION_ID,
} from "../addons/VectorHighlight";

/**
 * Panels addons contribute to the host's interaction view, keyed by the id of
 * the interaction button that opens them. The host merges this into its own
 * map, so an addon can bring a panel without the app knowing it exists.
 */
export const ADDON_INTERACTION_COMPONENTS: Record<
  string,
  ComponentType<{ layer: Layer }>
> = {
  [HIGHLIGHT_TOOLS_INTERACTION_ID]: HighlightInteractionPanel,
};
