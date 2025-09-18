interface PolygonGeometryData {
  type: "Polygon";
  crs?: {
    type: "name";
    properties: {
      name: string;
    };
  };
  coordinates: number[][][];
}

interface MoreData {
  zl: number;
  pid?: number;
  kid?: number;
  v?: string;
  g?: PolygonGeometryData;
}
export interface SearchResultItem {
  crs: string;
  sorter: number;
  string: string;
  glyph: string;
  x: number;
  y: number;
  more: MoreData;
  type: string;
  xSearchData: string;
  modifiedSearchData?: string;
  glyphPrefix?: string;
  overlay?: string;
}
