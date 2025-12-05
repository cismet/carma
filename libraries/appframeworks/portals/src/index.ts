import * as utils from "./lib/utils/utils";
export type * from "./lib/types";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };

export { Save } from "./lib/components/Save.tsx";
export { Share } from "./lib/components/Share.tsx";
export { FileUploader } from "./lib/components/FileUploader.tsx";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";
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
  SelectionMapMode,
} from "./lib/components/SelectionProvider";

export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";
export { TopicMapSelectionContent } from "./lib/components/TopicMapSelectionContent";
export { ProgressIndicator } from "./lib/components/ProgressIndicator";

export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
export { useShareUrl, SHORTENER_URL } from "./lib/hooks/useShareUrl";
export { useProgress } from "./lib/hooks/useProgress";
export { useCesiumModels } from "./lib/hooks/useCesiumModels";
export { useUrlFeatureSelection } from "./lib/hooks/useUrlFeatureSelection";
export {
  useMapHashRouting,
  type LatLngZoom,
} from "./lib/hooks/useMapHashRouting";
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
