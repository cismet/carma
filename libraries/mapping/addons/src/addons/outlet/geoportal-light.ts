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

/** a frame around a lit selection is half lit, so the selection stands out */
export const FRAME_OPENING_AROUND_SPOT = 0.5;
/** a frame with nothing lit inside it is the thing pointed out: fully lit */
export const FRAME_OPENING_ALONE = 1;

/** the light as the projection draws it */
export type ProjectedLight = GeoportalLight & {
  /** how far the frame is lit, 0 to 1 */
  frameOpening: number;
};

const isInside = (
  [x, y]: readonly [number, number],
  [minX, minY, maxX, maxY]: Bounds3857
): boolean => x >= minX && x <= maxX && y >= minY && y <= maxY;

/**
 * What the projection makes of the geoportal's light. `projection` is what
 * the projection shows. A geoportal showing at least as much in both
 * directions points out nothing on it, so nothing goes dark, its selection
 * included. A smaller frame is half lit around a selection inside it and fully
 * lit without one.
 */
export const projectedLightOf = (
  light: GeoportalLight,
  projection: Bounds3857 | null
): ProjectedLight => {
  const { frame, spots } = light;
  if (!frame) {
    return { ...light, frameOpening: FRAME_OPENING_AROUND_SPOT };
  }
  if (
    projection &&
    frame[2] - frame[0] >= projection[2] - projection[0] &&
    frame[3] - frame[1] >= projection[3] - projection[1]
  ) {
    return { ...NO_LIGHT, frameOpening: FRAME_OPENING_AROUND_SPOT };
  }
  const spotInside = (spots ?? []).some(({ center }) =>
    isInside(center, frame)
  );
  return {
    frame,
    spots,
    frameOpening: spotInside ? FRAME_OPENING_AROUND_SPOT : FRAME_OPENING_ALONE,
  };
};

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
