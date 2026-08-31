import type { ComponentType } from "react";

import type { Layer } from "@carma-mapping/layers";

import {
  HighlightInteractionPanel,
  HIGHLIGHT_TOOLS_INTERACTION_ID,
} from "../addons/VectorHighlight";
import {
  TimeSliderInteractionPanel,
  TIME_SLIDER_TOOLS_INTERACTION_ID,
} from "../addons/TimeSlider";
import {
  FloodInteractionPanel,
  FLOOD_TOOLS_INTERACTION_ID,
} from "../addons/FloodSimulation";
import {
  FlowFieldTuningInteractionPanel,
  FLOW_FIELD_TUNING_INTERACTION_ID,
} from "../addons/FlowField";
import {
  ExcalidrawInteractionPanel,
  EXCALIDRAW_TOOLS_INTERACTION_ID,
} from "../addons/Excalidraw";

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
  [TIME_SLIDER_TOOLS_INTERACTION_ID]: TimeSliderInteractionPanel,
  [FLOOD_TOOLS_INTERACTION_ID]: FloodInteractionPanel,
  // the row only offers the button that opens this under `?ff=admin`
  [FLOW_FIELD_TUNING_INTERACTION_ID]: FlowFieldTuningInteractionPanel,
  [EXCALIDRAW_TOOLS_INTERACTION_ID]: ExcalidrawInteractionPanel,
};
