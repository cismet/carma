import L from "leaflet";
import type { RefObject } from "react";
import { Viewer } from "cesium";
import { stopwords } from './lib/config/stopwords.de-de';

type mapRefType = RefObject<{
  current: { leafletMap: { leafletElement: L.Map } };
}>;

export type SearchGazetteerProps = {
  gazData?: any;
  setGazetteerHit: (hit: any) => void;
  gazetteerHit: any;
  // mapRef?: RefObject<{
  //   leafletMap?: {
  //     leafletElement: L.Map;
  //   };
  // }>;
  // mapRef?: mapRefType | L.Map;
  mapRef?: L.Map.leafletMap.leafletElement;
  //overlayFeature: any;
  setOverlayFeature: (feature: any) => void;
  //crs?: string;
  referenceSystem: any;
  referenceSystemDefinition: any;
  stopwords?: string[];
  pixelwidth?: number;
  ifShowCategories?: boolean;
  placeholder?: string;
  config?: SearchConfig;
  cesiumConfig?: {
    viewer?: Viewer;
    markerAsset?: ModelAsset;
  }
};

export type MapConsumer = L.Map | Viewer;
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
export interface GruppedOptions {
  label?: JSX.Element;
  options?: Option[];
}

export type SourceConfig = {
  topic: ENDPOINT;
  url: string;
  crs: string;
};

export type SourceWithPayload = SourceConfig & {
  payload?: unknown;
};

export type PayloadItem = {
  s?: string;
  g?: string;
  x?: number;
  y?: number;
  m?: { id?: string };
  n?: string;
  nr?: string | number;
  z?: string;
};

export type GazDataItem = {
  sorter: number;
  string: string;
  glyph: string;
  glyphPrefix?: string;
  overlay?: string;
  x: number;
  y: number;
  more?: { zl?; id? };
  type: string;
  crs: string;
};

export type PayloadItemType = {
  s?: string;
  g?: string;
  x?: number;
  y?: number;
  m?: { id?: string };
  n?: string;
  nr?: string | number;
  z?: string;
};

export type SearchConfig = {
  prepoHandling?: boolean;
  ifShowScore?: boolean;
  limit?: number;
  cut?: number;
  distance?: number;
  threshold?: number;
};
