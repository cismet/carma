import { SelectionItem } from "@carma-apps/portals";
import { GazDataItem } from "@carma-commons/utils";
import { ReactNode } from "react";

export type SearchGazetteerProps = {
  gazData?: GazDataItem[];
  onSelection?: (hit: SearchResultItem | null) => void;
  onCLose?: () => void;
  ifIconDisabled?: boolean;
  icon?: ReactNode;
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
}
export interface GroupedOptions {
  label?: JSX.Element;
  options?: Option[];
}

export type SearchConfig = {
  prepoHandling?: boolean;
  ifShowScore?: boolean;
  limit?: number;
  cut?: number;
  distance?: number; // in CRS units
  threshold?: number;
};
