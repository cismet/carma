import * as utils from "./lib/utils/utils";
export type * from "./lib/types";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };

export {
  FeatureFlagProvider,
  type FeatureFlagConfig,
  useFeatureFlags,
} from "./lib/components/FeatureFlagProvider.tsx";

export { Save } from "./lib/components/Save.tsx";
export { Share, useShareUrl, SHORTENER_URL } from "./lib/components/Share.tsx";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";

export { GazDataProvider, useGazData } from "./lib/components/GazDataProvider";

export { MessageOverlay } from "./lib/components/MessageOverlay";

export {
  SelectionProvider,
  type SelectionMetaData,
  useSelection,
  type SelectionItem,
} from "./lib/components/SelectionProvider";

export { TopicMapSelectionContent } from "./lib/components/TopicMapSelectionContent";
export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";

export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
