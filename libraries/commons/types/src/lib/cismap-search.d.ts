interface MoreData {
  zl: number;
  pid: number;
  kid?: number;
  v?: string;
  g?: maplibregl.GeoJSONSource;
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
  glyphPrefix?: string;
  overlay?: string;
}
