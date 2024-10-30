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
