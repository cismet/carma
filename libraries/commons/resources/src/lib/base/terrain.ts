/**
 * An XYZ elevation tile service in the shape a MapLibre `raster-dem` source
 * takes, so a resource can be handed to the style without translation.
 */
export type RasterDemTerrainResource = Readonly<{
  /** Stable source id in the map style. */
  id: string;
  /** Tile url template with `{z}`, `{x}` and `{y}`. */
  url: string;
  tileSize: number;
  minzoom: number;
  maxzoom: number;
  /**
   * How a pixel encodes its height. Terrarium resolves 1/256 m; Mapbox steps
   * in 0.1 m and terraces flat ground, so the offered services use Terrarium.
   */
  encoding: "terrarium" | "mapbox";
  /** Tile image format as stated in the service's TileJSON. */
  format: "png" | "webp";
  bounds: readonly [west: number, south: number, east: number, north: number];
  /** Height reference of the encoded values, e.g. "DHHN2016". */
  verticalDatum: string;
  /**
   * Height quality at `maxzoom`, in metres: the source raster's ground
   * sampling distance, the smallest height step the tile encoding expresses,
   * and the source's stated height accuracy at 95 % confidence as a best
   * case (flat, open ground) and worst case (steep or vegetated) pair.
   */
  elevation: Readonly<{
    groundSamplingMeters: number;
    heightStepMeters: number;
    accuracyMeters95: readonly [best: number, worst: number];
  }>;
  /** Change when content at an unchanged URL or its height datum changes. */
  revision?: string;
  /** Where the underlying dataset is published, for licence and metadata display. */
  sourceUrl?: string;
  /**
   * Free text for everything the fields above do not cover: source dataset
   * and its state, derivation date and steps, horizontal CRS, licence,
   * attribution, known limits.
   */
  notes?: string;
}>;
