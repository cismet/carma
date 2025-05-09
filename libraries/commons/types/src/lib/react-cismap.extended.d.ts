// TODO intergrate with React-Cismap Package Type or replace with Carma-Equivalent

export type CismapSupportedLayerTypes =
  | "wms"
  | "wmts"
  | "wms-nt"
  | "wmts-nt"
  | "tiles"
  | "vector"
  | "graphql";

export interface CismapLayerProps {
  type: CismapSupportedLayerTypes;
  opacity?: number;
  opacityFunction?: (opacity: number) => number;
  format?: string;
  maxZoom?: number;
  version?: string;
  pane?: string;
  tiled?: boolean;
  url?: string;
  layers?: string;
  styles?: string;
  attribution?: string;
}
