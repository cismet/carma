import type {ENDPOINT} from '@carma-mapping/fuzzy-search/';

export type Option = {
  key: string;
  value: string;
  label: JSX.Element;
  sData: GazDataItem;
};

export type OptionItem = {
  label: JSX.Element;
  options: Option[];
};

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

// see also CesiumMarkerContainer Props
export type ModelAsset = {
  uri: string;
  scale?: number;
  isCameraFacing?: boolean;
  rotation?: boolean | number;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  hasAnimation?: boolean;
};
