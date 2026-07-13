// Engine-agnostic print types. No Leaflet / MapLibre / React here.

export type Orientation = "portrait" | "landscape";

/**
 * Normalized input layer the core understands. Each engine / app is
 * responsible for mapping its own layer model (redux config, MapLibre
 * style layers, …) onto this shape before calling getPrintLayers.
 */
export interface PrintInputLayer {
  visible?: boolean;
  layerType: "wms" | "wmts" | "wmts-nt" | "vector" | "tiles" | "inline";
  opacity?: number;
  url?: string;
  layers?: string;
  style?: string;
  /**
   * A complete, self-contained MapLibre style object (with its data inlined as
   * a geojson source). Used by layerType "inline": the tgl-wms renderer is
   * handed this whole style via customParams.style + layers:["inline"] instead
   * of resolving a hosted style by name. See buildInlineStylePrint.
   */
  inlineStyle?: Record<string, unknown>;
  props?: {
    url?: string;
    name?: string;
    style?: string;
  };
  conf?: {
    printingStyle?: string;
  };
}

/** A single layer entry in the MapFish request payload. */
export interface MapFishLayer {
  type: "WMS" | "WMTS" | "OSM";
  baseURL: string;
  opacity?: number;
  [key: string]: unknown;
}

/** Everything an engine preview must hand to the core to produce a PDF. */
export interface PrintJob {
  /** Map center in EPSG:3857. */
  center: [number, number];
  /** Map scale denominator (e.g. 250 for 1:250). */
  scale: number;
  orientation: Orientation;
  dpi: number;
  /** Already translated MapFish layers (see getPrintLayers). */
  layers: MapFishLayer[];
  /** File name used for the iOS download fallback. */
  name?: string;
}

export interface ScaleOption {
  value: string;
  label: string;
}
