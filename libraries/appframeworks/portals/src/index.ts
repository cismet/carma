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
export { Share } from "./lib/components/Share.tsx";
export { FileUploader } from "./lib/components/FileUploader.tsx";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";
export { FontAwesomeLikeIcon } from "./lib/components/FontAwesomeLikeIcon.tsx";
export { InfoBox } from "./lib/components/InfoBox.tsx";
export { ResponsiveInfoBox } from "./lib/components/ResponsiveInfoBox.tsx";
export { GenericInfoBoxFromFeature } from "./lib/components/GenericInfoBoxFromFeature.tsx";
export { PieChart } from "./lib/components/PieChart.tsx";

export { GazDataProvider, useGazData } from "./lib/components/GazDataProvider";

export { useAuth } from "./lib/components/AuthProvider";

export {
  HashStateProvider,
  useHashState,
} from "./lib/contexts/HashStateProvider";
export {
  MapStyleProvider,
  useMapStyle,
  type MapStyleConfig,
} from "./lib/contexts/MapStyleProvider";

export { MessageOverlay } from "./lib/components/MessageOverlay";

export {
  SelectionProvider,
  type SelectionMetaData,
  useSelection,
  type SelectionItem,
} from "./lib/components/SelectionProvider";

export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";
export { TopicMapSelectionContent } from "./lib/components/TopicMapSelectionContent";
export { ProgressIndicator } from "./lib/components/ProgressIndicator";

export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
export { useShareUrl, SHORTENER_URL } from "./lib/hooks/useShareUrl";
export { useProgress } from "./lib/hooks/useProgress";
export { uploadImage } from "./lib/utils/fileUpload";
export {
  defaultBackgroundConfigurations,
  backgroundConfWithFastOrtho2024,
} from "./lib/utils/topicmapConfigs";
