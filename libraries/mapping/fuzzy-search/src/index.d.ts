export type SearchGazetteerProps = {
  gazData?: any;
  setGazetteerHit: (hit: any) => void;
  gazetteerHit: any;
  setOverlayFeature: (feature: any) => void;
  referenceSystem: any;
  referenceSystemDefinition: any;
  stopwords?: string[];
  pixelwidth?: number;
  ifShowCategories?: boolean;
  placeholder?: string;
  config?: SearchConfig;
};
interface MoreData {
  zl: number;
  pid: number;
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
  distance?: number;
  threshold?: number;
};
