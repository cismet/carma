import type maplibregl from "maplibre-gl";
import {
  LABEL_LAYER_ID,
  LABEL_ROTATED_LAYER_ID,
} from "@carma-mapping/measurements";

const MEASUREMENT_LABEL_LAYER_IDS: readonly string[] = [
  LABEL_LAYER_ID,
  LABEL_ROTATED_LAYER_ID,
];

// Measurement features are an annotation overlay that must sit on top of
// everything — including the background raster. terra-draw renders the
// geometry as `td-*` layers (e.g. `td-point`, the measurement dots) and
// MeasurementHost adds the `carma-measurements-*` label/snap layers.
// MeasurementHost re-asserts only the label layer to the top, not the `td-*`
// geometry, so when the imperative style composes an opaque basemap above the
// geometry the dots get buried — visible only once "Blass" fades the basemap
// to ~10% opacity. Re-assert the whole measurement group to the top on every
// style mutation, keeping the label above the geometry.
export const isMeasurementLayerId = (id: string): boolean =>
  id.startsWith("td-") || id.startsWith("carma-measurements-");

/**
 * Keep the measurement layer group (terra-draw `td-*` geometry +
 * `carma-measurements-*` labels/snap) above every other layer on `map`,
 * re-asserting on every `styledata` event. Returns a cleanup that detaches the
 * listener.
 */
export const attachMeasurementsOnTop = (map: maplibregl.Map): (() => void) => {
  const reorder = () => {
    const allLayers = map.getStyle()?.layers ?? [];
    if (allLayers.length === 0) return;
    // moveLayer fires styledata; without this guard the handler would loop.
    // The group is already correct when every measurement layer sits above
    // every non-measurement layer.
    let firstMeasurementIdx = -1;
    let lastNonMeasurementIdx = -1;
    for (let i = 0; i < allLayers.length; i++) {
      if (isMeasurementLayerId(allLayers[i].id)) {
        if (firstMeasurementIdx < 0) firstMeasurementIdx = i;
      } else {
        lastNonMeasurementIdx = i;
      }
    }
    if (firstMeasurementIdx < 0) return; // no measurement layers yet
    if (firstMeasurementIdx > lastNonMeasurementIdx) return; // already on top
    // Move geometry/snap layers up first, then the label last (stable sort
    // preserves each group's relative order) so the label stays above the dots.
    const ids = allLayers.map((l) => l.id).filter(isMeasurementLayerId);
    ids.sort(
      (a, b) =>
        Number(MEASUREMENT_LABEL_LAYER_IDS.includes(a)) -
        Number(MEASUREMENT_LABEL_LAYER_IDS.includes(b))
    );
    for (const id of ids) {
      try {
        map.moveLayer(id);
      } catch {
        /* layer may have been removed mid-reorder */
      }
    }
  };
  reorder();
  map.on("styledata", reorder);
  return () => {
    map.off("styledata", reorder);
  };
};
