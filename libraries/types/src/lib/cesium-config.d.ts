export type WebMapServiceProviderConfig = {
  url: string;
  layers: string;
  parameters: { transparent: boolean; format: string };
  minimumLevel?: number;
  maximumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
};

export type WebMapTileServiceProviderConfig = {
  url: string;
  format?: string;
  layer: string;
  style: string;
  tileMatrixSetID: string;
  minimumLevel?: number;
  maximumLevel?: number;
  tileMatrixLabels?: string[];
  subdomains?: string[];
};
