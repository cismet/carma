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

  const fc = featureCollection(
    withGeom.map((f) => feature(f.geometry!))
  );
  const [w, s, e, n] = bbox(fc);
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding }
  );
}
