import * as utils from "./lib/utils/utils";
export type * from "./lib/types";

export enum SELECTED_LAYER_INDEX {
  NO_SELECTION = -2,
  BACKGROUND_LAYER = -1,
}

export { utils };
export { replaceHashRoutedHistory } from "./lib/utils/routing";
export { Save } from "./lib/components/Save.tsx";
export { Share } from "./lib/components/Share.tsx";
export {
  CarmaMapContextProvider,
  useCarmaMapContext,
} from "./lib/components/CarmaMapContextProvider.tsx";

export { GazDataProvider, useGazData } from "./lib/components/GazDataProvider";

export {
  SelectionProvider,
  useSelection,
} from "./lib/components/SelectionProvider";
export { useSelectionTopicMap } from "./lib/hooks/useSelectionTopicMap";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";
