import * as utils from "./lib/utils/utils";
export type * from "./lib/types";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };

export { Save } from "./lib/components/Save.tsx";
export { Share } from "./lib/components/Share.tsx";
export {
  FileUploader,
  InfoBox,
  GenericInfoBoxFromFeature,
  PieChart,
  ResponsiveInfoBox,
  FeatureInfobox,
} from "@carma-commons/cismap";
export { CarmaMapProviderWrapper } from "./lib/components/CarmaMapProviderWrapper.tsx";
export { ContactMailButton } from "./lib/components/ContactMailButton.tsx";
export { InfoBoxHeader } from "./lib/components/InfoBoxHeader.tsx";

export { GazDataProvider, useGazData } from "@carma-providers/gaz-data";

export {
  SandboxedEvalProvider,
  useSandboxedEval,
  sandboxedEvalExternal,
} from "@carma-providers/sandboxed-eval";

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
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-providers/selection";

export { LibreMapSelectionContent } from "./lib/components/LibreMapSelectionContent";
export { useSelectionCesium } from "@carma-mapping/engines/cesium/selection";
export { useSelectionLibreMap } from "./lib/hooks/useSelectionLibreMap";
export { useShareUrl, SHORTENER_URL } from "./lib/hooks/useShareUrl";
export { useProgress, ProgressIndicator } from "@carma-commons/cismap";
export { useCesiumModels } from "./lib/hooks/useCesiumModels";
export {
  useMapHashRouting,
  type LatLngZoom,
} from "./lib/hooks/useMapHashRouting";
export { uploadImage, getActionLinksForFeature } from "@carma-commons/cismap";
export {
  defaultBackgroundConfigurations,
  backgroundConfWithFastOrtho2024,
} from "@carma-commons/resources";
