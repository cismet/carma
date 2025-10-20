/**
 * CarmaConfig - Configuration extracted from WMS layer keywords
 * Keywords follow the pattern: carmaconf://propertyName:value
 *
 * Common properties:
 * - infoBoxMapping: JavaScript function as string for feature info rendering
 * - featureInfoZoom: Zoom level for feature info queries
 * - thumbnail: URL to thumbnail image
 * - opendata: URL to open data portal
 * - vectorStyle: URL to vector tile style JSON
 * - hideLayer: Boolean flag to hide layer
 * - blockLegacyGetFeatureInfo: Boolean flag to disable legacy feature info
 */
export type CarmaConfig = {
  infoboxMapping?: string[];
  featureInfoZoom?: string;
  thumbnail?: string;
  opendata?: string;
  vectorStyle?: string;
  hideLayer?: string;
  blockLegacyGetFeatureInfo?: string;
  [key: string]: string | string[] | undefined;
};
