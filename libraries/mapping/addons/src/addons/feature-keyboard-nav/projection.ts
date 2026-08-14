import type { Map as MaplibreMap } from "maplibre-gl";

import type { NavCandidate } from "./candidates";
import { boxOfPoints, boxRejection } from "./geometry";
import type { ProjectedCandidate, ScreenPoint } from "./types";

/**
 * Geographic candidates to screen outlines, with the cheap prune in between.
 *
 * Projection is the expensive part of a keypress, so a candidate's four
 * bounding-box corners are projected first and the whole candidate dropped when
 * that box cannot possibly satisfy the direction gates. Only the survivors have
 * their full rings projected.
 *
 * The box is the axis-aligned hull of the projected corners, which under map
 * rotation is larger than the true projected extent — larger is the safe side,
 * since the prune must never drop a candidate that could have won.
 */

const toScreenPoint = (point: { x: number; y: number }): ScreenPoint => ({
  x: point.x,
  y: point.y,
});

export const projectCandidates = ({
  map,
  candidates,
  origin,
  axis,
  coneAngleDeg,
  excludeKey,
  excludeKeys,
}: {
  map: MaplibreMap;
  candidates: NavCandidate[];
  origin: ScreenPoint;
  axis: ScreenPoint;
  coneAngleDeg: number;
  /** the origin's own feature, which must not be a candidate for itself */
  excludeKey?: string;
  /**
   * Anything else the caller wants kept out of this one pick, currently the
   * feature the walk stood on one step ago. Two features sharing a long
   * diagonal border each lie in the pressed direction from the other, so
   * repeating the key bounces between them forever unless the step before is
   * remembered.
   */
  excludeKeys?: ReadonlySet<string>;
}): ProjectedCandidate[] => {
  const projected: ProjectedCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.key === excludeKey) continue;
    if (excludeKeys?.has(candidate.key)) continue;

    const [west, south, east, north] = candidate.bbox;
    const box = boxOfPoints([
      toScreenPoint(map.project([west, south])),
      toScreenPoint(map.project([east, south])),
      toScreenPoint(map.project([east, north])),
      toScreenPoint(map.project([west, north])),
    ]);
    // the ray strategy needs the boundary a walk crosses, which for a candidate
    // wrapping the origin lies in every direction; the cone rejects it on angle
    // anyway, so the prune stays a prune and not a second gate
    if (boxRejection(box, origin, axis, coneAngleDeg)) continue;

    projected.push({
      key: candidate.key,
      ...(candidate.catalogLayerId
        ? { layerId: candidate.catalogLayerId }
        : {}),
      isArea: candidate.isArea,
      parts: candidate.parts.map((part) =>
        part.map((position) =>
          toScreenPoint(map.project([position[0], position[1]]))
        )
      ),
    });
  }

  return projected;
};

/** Length the rays of `first-crossed` reach: the viewport's own diagonal. */
export const viewportDiagonalPx = (map: MaplibreMap): number => {
  const canvas = map.getCanvas();
  return Math.hypot(canvas.clientWidth, canvas.clientHeight);
};
