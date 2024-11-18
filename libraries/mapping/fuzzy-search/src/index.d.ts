import L from "leaflet";
import type { MutableRefObject, RefObject } from "react";
import { Viewer } from "cesium";
import { CesiumOptions } from "@carma-mapping/cesium-engine";

type mapRefType = RefObject<{
  current: { leafletMap: { leafletElement: L.Map } };
}>;

export type SearchGazetteerProps = {
  gazData?: any;
  setGazetteerHit: (hit: any) => void;
  gazetteerHit: any;
  mapRef?: L.Map.leafletMap.leafletElement;
  cesiumViewerRef?: MutableRefObject<Viewer | null>;
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
  cesiumOptions?: CesiumOptions;
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

export type SearchConfig = {
  prepoHandling?: boolean;
  ifShowScore?: boolean;
  limit?: number;
  cut?: number;
  distance?: number;
  threshold?: number;
};
