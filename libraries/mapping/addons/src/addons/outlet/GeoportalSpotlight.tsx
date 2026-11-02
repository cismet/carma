import { useEffect, useState } from "react";
import type { Map as LibreMap } from "maplibre-gl";

import type { MapRelayHeard } from "../MapRelay";
import {
  freshForMs,
  geoportalLightOf,
  type GeoportalLight,
} from "./geoportal-light";
import { HighlightSpots } from "./HighlightSpots";

const NO_LIGHT: GeoportalLight = { frame: null, spots: null };

/**
 * What the geoportal following the show points out on the model: its
 * selection fully lit, the area it shows half lit, everything else dark. It
 * goes out once the geoportal has said nothing for a while
 * (`GEOPORTAL_VIEW_TTL_MS`), and pauses while the presenter lights something
 * (`suppressed`): the pointer and the scene's highlights come first.
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
      spots={light.spots}
      frame={light.frame}
      suppressed={suppressed}
    />
  );
};
