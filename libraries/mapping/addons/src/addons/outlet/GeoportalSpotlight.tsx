import { useEffect, useMemo, useState } from "react";
import type { Map as LibreMap } from "maplibre-gl";
import type { Bounds3857 } from "@carma-mapping/show-remote";

import type { MapRelayHeard } from "../MapRelay";
import {
  freshForMs,
  geoportalLightOf,
  projectedLightOf,
  type GeoportalLight,
} from "./geoportal-light";
import { viewOf } from "./highlight-geometry";
import { HighlightSpots } from "./HighlightSpots";

const NO_LIGHT: GeoportalLight = { frame: null, spots: null };

/** what the map shows, again after every move */
const useMapView = (map: LibreMap | null): Bounds3857 | null => {
  const [view, setView] = useState<Bounds3857 | null>(null);
  useEffect(() => {
    if (!map) {
      setView(null);
      return;
    }
    const update = () => setView(viewOf(map));
    update();
    map.on("moveend", update);
    map.on("resize", update);
    return () => {
      map.off("moveend", update);
      map.off("resize", update);
    };
  }, [map]);
  return view;
};

/**
 * What the geoportal following the show points out on the model: its
 * selection fully lit, the area it shows half lit (fully lit with no selection
 * in it), everything else dark. A geoportal showing more than the projection
 * points out nothing, so nothing goes dark (`projectedLightOf`). It goes out
 * once the geoportal has said nothing for a while (`GEOPORTAL_VIEW_TTL_MS`),
 * and pauses while the presenter lights something (`suppressed`): the pointer
 * and the scene's highlights come first.
 */
export const GeoportalSpotlight = ({
  map,
  heard,
  suppressed,
}: {
  map: LibreMap | null;
  heard: MapRelayHeard | undefined;
  suppressed: boolean;
}) => {
  const [light, setLight] = useState<GeoportalLight>(NO_LIGHT);
  const projection = useMapView(map);
  const shown = useMemo(
    () => projectedLightOf(light, projection),
    [light, projection]
  );

  useEffect(() => {
    const now = Date.now();
    setLight(geoportalLightOf(heard, now));
    const left = freshForMs(heard, now);
    if (left <= 0) {
      return;
    }
    const expiry = window.setTimeout(() => setLight(NO_LIGHT), left);
    return () => window.clearTimeout(expiry);
  }, [heard]);

  return (
    <HighlightSpots
      map={map}
      spots={shown.spots}
      frame={shown.frame}
      frameOpening={shown.frameOpening}
      suppressed={suppressed}
    />
  );
};
