import { SearchResultItem } from "../../../../../types/src/index.ts";
export interface DerivedGeometries {
  pos: {
    lon: number;
    lat: number;
  };
  zoom: number;
  polygon?: number[][][];
}
export declare const getDerivedGeometries: (
  hitObject: SearchResultItem
) => DerivedGeometries;
