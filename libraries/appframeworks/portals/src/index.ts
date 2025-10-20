import * as utils from "./lib/utils/utils";
export type * from "./lib/types";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };

export {
  MapStyleKeys,
  ManagedCesiumStyleKeys,
  isMapStyleKey,
  type MapStyleKey,
  type ManagedCesiumStyleKey,
  DEFAULT_TILESET_IDS,
  DEFAULT_MARKER_KEYS,
  type TilesetId,
  type MarkerKey,
} from "./lib/constants";

export { Save } from "./lib/components/Save.tsx";
export { Share } from "./lib/components/Share.tsx";
export { FileUploader } from "./lib/components/FileUploader.tsx";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";
export { CesiumMapComponentWrapper } from "./lib/components/CesiumMapComponentWrapper.tsx";
export { FontAwesomeLikeIcon } from "./lib/components/FontAwesomeLikeIcon.tsx";
export { InfoBox } from "./lib/components/InfoBox.tsx";
export { ResponsiveInfoBox } from "./lib/components/ResponsiveInfoBox.tsx";
export { GenericInfoBoxFromFeature } from "./lib/components/GenericInfoBoxFromFeature.tsx";
export { PieChart } from "./lib/components/PieChart.tsx";
export { ContactMailButton } from "./lib/components/ContactMailButton.tsx";
export { FeatureInfobox } from "./lib/components/FeatureInfobox.tsx";
export { InfoBoxHeader } from "./lib/components/InfoBoxHeader.tsx";

export { GazDataProvider, useGazData } from "./lib/components/GazDataProvider";

export {
  SandboxedEvalProvider,
  useSandboxedEval,
  sandboxedEvalExternal,
} from "./lib/components/SandboxedEvalProvider";

export {
  HashStateProvider,
  useHashState,
  type HashChangeEvent,
  type HashChangeSource,
  type HashSubscribeOptions,
} from "./lib/contexts/HashStateProvider";
export {
  MapStyleProvider,
  useMapStyle,
  type MapStyleConfig,
} from "./lib/contexts/MapStyleProvider";

export { MessageOverlay } from "./lib/components/MessageOverlay";

export {
  SelectionProvider,
  useSelection,
  type SelectionItem,
  type SelectionMetaData,
  SelectionMapMode,
} from "./lib/components/SelectionProvider";
export type { FeatureInfo } from "@carma/types";

export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";
export { TopicMapSelectionContent } from "./lib/components/TopicMapSelectionContent";
export { ProgressIndicator } from "./lib/components/ProgressIndicator";

export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
// useSelectionCesium REMOVED - use <CesiumSelectionMarker /> component from @carma-cesium/selections instead
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
export { useModelSelectionHandler } from "./lib/hooks/useModelSelectionHandler";
export { useShareUrl, SHORTENER_URL } from "./lib/hooks/useShareUrl";
export { useProgress } from "./lib/hooks/useProgress";
export { useMapHashRoutingLeafletLike } from "./lib/hooks/useMapHashRoutingLeafletLike";
export { useSyncCesiumSceneStyle } from "./lib/hooks/useSyncCesiumSceneStyle";
export {
  useInitialViewModeFromUrl,
  type UseInitialViewModeFromUrlOptions,
} from "./lib/hooks/useInitialViewModeFromUrl";
export { useMapStyleBus } from "./lib/hooks/useMapStyleBus";
export {
  getLatLngZoomFromLeafletLike,
  setViewLeafletLike,
  triggerLeafletLikeLocationChangeEvent,
} from "./lib/utils/leafletLikeMapUtils";
export type { LatLngZoom, LeafletLikeMap } from "@carma/types";
export {
  useMapHashRoutingCesium,
  triggerCesiumSceneChangeEvent,
} from "./lib/hooks/useMapHashRoutingCesium";
export { uploadImage } from "./lib/utils/fileUpload";
export {
  defaultBackgroundConfigurations,
  backgroundConfWithFastOrtho2024,
} from "./lib/utils/topicmapConfigs";
export {
  createUrl,
  functionToFeature,
  objectToFeature,
  createVectorFeature,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
} from "./lib/utils/featureInfo";

export { getActionLinksForFeature } from "./lib/components/helper";
