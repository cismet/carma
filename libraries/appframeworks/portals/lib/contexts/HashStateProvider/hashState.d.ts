import { HashCodec, HashCodecs } from ".";
/**
 * Generic helper for boolean-like codec mappings
 * Maps a truthy string value to one state and falsy/absent to another
 */
export declare function createBooleanCodec<T>(
  truthyValue: string,
  truthyResult: T,
  falsyResult: T
): HashCodec;
/**
 * Default hash codecs for URL encoding/decoding.
 *
 * - mapStyle: Uses mapStyleShortNames for compression ("karte" <-> "0")
 * - lat/lng/zoom: Numeric with precision from defaultPrecisions
 * - engine: Boolean codec ("1" = cesium3d, absent = leaflet2d)
 * - heading/bearing/pitch: Numeric position parameters
 */
export declare const defaultHashCodecs: HashCodecs;
