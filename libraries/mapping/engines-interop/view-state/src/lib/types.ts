export type * from "./runtime";

export type { HashZoomConvention } from "./core/viewStateHash";

export type ShareableViewState = {
  // URL-hash equivalent numeric values:
  // - angular values in degrees
  // - values may be rounded for stable share links
  lat: number;
  lng: number;
  // Canonical vertical key in hash/shareable payloads.
  // We keep `altitude` (not `elevation`/`height`) for one stable schema.
  altitude: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  roll?: number;
  fov?: number;
};
