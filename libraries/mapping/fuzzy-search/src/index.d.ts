import { SelectionItem } from "@carma-appframeworks/portals";
import { GazDataItem } from "@carma-commons/utils";
import { ReactNode } from "react";
import { LandParcelDataStructure } from "./lib/utils/landParcelSearchHelper";

export type SearchGazetteerProps = {
  gazData?: GazDataItem[];
  onSelection?: (hit: SearchResultItem | null) => void;
  onCLose?: () => void;
  ifIconDisabled?: boolean;
  icon?: ReactNode;
  hideIcon?: boolean;
  //referenceSystem: undefined;
  //referenceSystemDefinition: undefined;
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
  landParcelData?: LandParcelDataStructure;
  onLandParcelSelection?: (parcel: Record<string, unknown>) => void;
};

export interface SearchResultItemWithScore {
  item: SearchResultItem;
  refIndex: Number;
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
  distance?: number; // in CRS units
  threshold?: number;
};

export type SearchItem = SearchResultItem & {
  xSearchData: string;
  glyph?: string;
  string: string;
  sorter?: string;
};
