import type { ReactNode } from "react";

import type { SelectionItem } from "@carma-appframeworks/portals";

import type { SearchResultItem } from "./lib/contracts/search-result-item.d";
import type { DynamicSearchOption, GazDataItem } from "./lib/gazData";
import type { LandParcelDataStructure } from "./lib/utils/landParcelSearchHelper";

export * from "./lib/lib-fuzzy-search";
export { LandParcelSearch } from "./lib/LandParcelSearch";
export type {
  LandParcelSearchProps,
  ParcelChangeInfo,
} from "./lib/LandParcelSearch";
// export { EmptySearchComponent } from ''
export { EmptySearchComponent } from "./lib/components/EmptySearchComponent";
export { defaultTypeInference } from "./lib/utils/fuzzySearchHelper";
export type { SearchResultItem } from "./lib/contracts/search-result-item.d";
export {
  builtInGazetteerHitTrigger,
  getGazData,
  getGazDataFromSources,
  type DynamicSearchGroup,
  type DynamicSearchOption,
  type GazDataAdditionalMode,
  type GazDataAdditionalModeConfig,
  type GazDataConfig,
  type GazDataItem,
  type GazDataSourceConfig,
} from "./lib/gazData";

export type SearchGazetteerProps = {
  gazData?: GazDataItem[];
  onSelection?: (hit: SearchResultItem | null) => void;
  onCLose?: () => void;
  ifIconDisabled?: boolean;
  icon?: ReactNode;
  hideIcon?: boolean;
  stopwords?: string[];
  typeInference?: {
    [key: string]: (item: SearchResultItem) => string;
  };
  pixelwidth?: number | string;
  ifShowCategories?: boolean;
  placeholder?: string;
  config?: SearchConfig;
  priorityTypes?: string[];
  selection?: SelectionItem;
  showDropdownBelow?: boolean;
  landParcelSearch?: boolean;
};

export interface SearchResultItemWithScore {
  item: SearchResultItem;
  refIndex: number;
  score: string;
}

export interface SearchResult<T> {
  item: T;
  refIndex: number;
  score?: number;
}

export interface Option {
  key: number;
  label: JSX.Element;
  value: string;
  sData: SearchResultItem;
  options?: Option[];
  isLandParcel?: boolean;
  parcelStage?: "gemarkung" | "flur" | "flurstueck";
  parcelData?: Record<string, unknown>;
  dynamicOption?: DynamicSearchOption;
}

export interface GroupedOptions {
  label?: JSX.Element;
  options?: Option[];
  titleText?: string;
}

export type SearchConfig = {
  prepoHandling?: boolean;
  ifShowScore?: boolean;
  limit?: number;
  cut?: number;
  distance?: number;
  threshold?: number;
};

export type SearchItem = SearchResultItem & {
  xSearchData: string;
  glyph?: string;
  string: string;
  sorter?: string;
};

export type { LandParcelDataStructure };
