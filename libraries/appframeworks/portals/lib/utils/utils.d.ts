import {
  FeatureInfoProperties,
  Item,
  Layer,
} from "../../../../../types/src/index.ts";
import { Map as LeafletMap } from "leaflet";
export declare const parseDescription: (description: string) => {
  inhalt: string;
  sichtbarkeit: string;
  nutzung: string;
};
export declare function paramsToObject(entries: URLSearchParams): {
  [key: string]: string;
};
export declare const parseToMapLayer: (
  layer: Item,
  forceWMS: boolean,
  visible: boolean,
  opacity?: number
) => Promise<Layer>;
export declare const getCoordinates: (geometry: any) => any;
export declare const zoomToFeature: (
  selectedFeature: any,
  routedMapRef: {
    leafletMap: {
      leafletElement: LeafletMap;
    };
  },
  padding?: [number, number]
) => void;
export declare const getFunctionRegex: () => RegExp;
export declare const parseHeader: (
  header: string,
  properties?: FeatureInfoProperties
) => Promise<any>;
