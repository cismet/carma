import { GazDataItem } from "@carma-commons/utils";

export type SearchGazetteerProps = {
  gazData?: GazDataItem[];
  onSelection: (hit: SearchResultItem | null) => void;
  //referenceSystem: undefined;
  //referenceSystemDefinition: undefined;
  stopwords?: string[];
  pixelwidth?: number;
  ifShowCategories?: boolean;
  placeholder?: string;
  config?: SearchConfig;
};
interface MoreData {
  zl: number;
  pid: number;
  kid?: number;
}
export interface SearchResultItem {
  sorter: number;
  string: string;
  glyph: string;
  x: number;
  y: number;
  more: MoreData;
  type: string;
  xSearchData: string;
}

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
