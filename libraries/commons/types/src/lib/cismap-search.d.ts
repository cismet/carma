interface MoreData {
  zl: number;
  pid: number;
  kid?: number;
  v?: string;
  // use any for now to fix build. change it to proper type afterwards
  g?: any;
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
