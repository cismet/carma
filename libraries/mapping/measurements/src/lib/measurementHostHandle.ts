// Module-level escape hatch so consumers outside the React tree (save
// handlers, helpers) can drop terra-draw markers without prop-drilling a
// ref. Only one MeasurementHost is expected to be mounted at a time; the
// active host registers its draw on mount via `setActiveRemoveFeatures`
// and clears the slot on unmount.

import type { Feature } from "geojson";

export interface AddMeasurementsOptions {
  /** Treat the features as new measurements of the user: give the ones
   *  without a title the next P/L/F title and publish the snapshot to the
   *  surrounding MeasurementsProvider (list, info box, persistence), as a
   *  finished drawing does. Waits for the host's storage hydration: until
   *  that is done the call adds nothing and returns `null`. */
  publish?: boolean;
}

export interface AddMeasurementsResult {
  /** terra-draw ids of the features that were added */
  added: string[];
  /** features terra-draw refused, with its reason */
  rejected: { id: string | null; reason: string }[];
}

type AddFeatures = (
  features: Feature[],
  options: AddMeasurementsOptions
) => AddMeasurementsResult | null;

let activeRemoveFeatures: ((ids: string[]) => void) | null = null;
let activeAddFeatures: AddFeatures | null = null;
let activeIsReady: (() => boolean) | null = null;

export function setActiveIsReady(fn: (() => boolean) | null): void {
  activeIsReady = fn;
}

/**
 * Whether a MeasurementHost is mounted, attached to its map and done loading
 * the stored measurements: from then on `addMeasurements` with `publish` and
 * the provider's `deleteById` / `clearAll` take effect.
 */
export function measurementHostReady(): boolean {
  return activeIsReady?.() ?? false;
}

export function setActiveRemoveFeatures(
  fn: ((ids: string[]) => void) | null
): void {
  activeRemoveFeatures = fn;
}

export function setActiveAddFeatures(fn: AddFeatures | null): void {
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
 * namespacing prefix before calling. Returns `null` and does nothing when
 * no MeasurementHost is mounted (or, with `publish`, before it has loaded
 * the stored measurements).
 */
export function addMeasurements(
  features: Feature[],
  options: AddMeasurementsOptions = {}
): AddMeasurementsResult | null {
  if (features.length === 0) return { added: [], rejected: [] };
  if (!activeAddFeatures) return null;
  return activeAddFeatures(features, options);
}
