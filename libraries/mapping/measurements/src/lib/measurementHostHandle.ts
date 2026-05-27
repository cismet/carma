// Module-level escape hatch so consumers outside the React tree (save
// handlers, helpers) can drop terra-draw markers without prop-drilling a
// ref. Only one MeasurementHost is expected to be mounted at a time; the
// active host registers its draw on mount via `setActiveRemoveFeatures`
// and clears the slot on unmount.

import type { Feature } from "geojson";

let activeRemoveFeatures: ((ids: string[]) => void) | null = null;
let activeAddFeatures: ((features: Feature[]) => void) | null = null;

export function setActiveRemoveFeatures(
  fn: ((ids: string[]) => void) | null
): void {
  activeRemoveFeatures = fn;
}

export function setActiveAddFeatures(
  fn: ((features: Feature[]) => void) | null
): void {
  activeAddFeatures = fn;
}

/**
 * Remove terra-draw measurement markers from the host map by id. Ids are
 * the raw terra-draw feature ids (the uuids it mints internally), NOT any
 * namespaced/prefixed variant a consumer may have stored elsewhere — strip
 * prefixes before calling. No-op when no MeasurementHost is mounted.
 */
export function removeMeasurements(ids: (string | number)[]): void {
  if (ids.length === 0 || !activeRemoveFeatures) return;
  activeRemoveFeatures(ids.map(String));
}

/**
 * Add terra-draw measurement markers to the host map. Features must carry
 * the raw terra-draw feature ids (uuids) — strip any consumer-side
 * namespacing prefix before calling. No-op when no MeasurementHost is
 * mounted.
 */
export function addMeasurements(features: Feature[]): void {
  if (features.length === 0 || !activeAddFeatures) return;
  activeAddFeatures(features);
}
