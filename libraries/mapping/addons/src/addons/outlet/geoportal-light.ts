import {
  geoportalViewOf,
  type Bounds3857,
  type HighlightSpot,
} from "@carma-mapping/show-remote";

import type { MapRelayHeard } from "../MapRelay";

/**
 * How long the outlet keeps what the geoportal last said. The geoportal says
 * it again every 30 s while there is something to show, so a closed tab or a
 * lost network lets it go out by itself.
 */
export const GEOPORTAL_VIEW_TTL_MS = 90_000;

/** what the geoportal following the show lights on the model */
export type GeoportalLight = {
  /** the area the geoportal shows, half lit; null while it sits on the scene */
  frame: Bounds3857 | null;
  /** its selection, fully lit */
  spots: HighlightSpot[] | null;
};

const NO_LIGHT: GeoportalLight = { frame: null, spots: null };

/** how much longer what the geoportal said counts, on the relay's clock */
export const freshForMs = (
  heard: MapRelayHeard | undefined,
  now: number
): number => {
  if (!heard?.state) {
    return 0;
  }
  const writtenAt = heard.heardAt - heard.ageMs;
  return Math.max(writtenAt + GEOPORTAL_VIEW_TTL_MS - now, 0);
};

/** the geoportal's frame and selection while they are fresh */
export const geoportalLightOf = (
  heard: MapRelayHeard | undefined,
  now: number
): GeoportalLight => {
  if (freshForMs(heard, now) <= 0) {
    return NO_LIGHT;
  }
  const { frame, selection } = geoportalViewOf(heard?.state);
  return { frame, spots: selection ? [selection.spot] : null };
};
