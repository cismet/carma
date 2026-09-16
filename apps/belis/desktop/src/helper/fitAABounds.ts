import { bbox, featureCollection, feature } from "@turf/turf";

import type { Map } from "maplibre-gl";
import type { ArbeitsauftragTileFeature } from "../store/slices/arbeitsauftraege";

export function fitAABounds(
  aaFeatures: ArbeitsauftragTileFeature[],
  map: Map | null | undefined,
  padding = 100
) {
  if (!map) return;

  const withGeom = aaFeatures.filter((f) => f.geometry);
  if (withGeom.length === 0) return;

  const fc = featureCollection(withGeom.map((f) => feature(f.geometry!)));
  const [w, s, e, n] = bbox(fc);
  // A single broken hull coordinate poisons the whole bbox; fitBounds would
  // then throw and leave the map wherever it was.
  if (![w, s, e, n].every(Number.isFinite)) return;

  // The canvas can still carry the size it had before the sidebar and the
  // toolbar were laid out. fitBounds would centre on that stale box and clip
  // the features on two sides, so settle the size first and fit one frame
  // later, once the surrounding layout has been painted.
  requestAnimationFrame(() => {
    map.resize();
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding }
    );
  });
}
