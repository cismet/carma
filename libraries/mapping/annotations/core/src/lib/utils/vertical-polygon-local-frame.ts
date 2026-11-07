import {
  normalizeVector3Direction,
  removeVector3ComponentAlongAxis,
} from "@carma-commons/math";
import {
  getEllipsoidalUpDirectionAtAnchor,
  metricVector3FromVector3,
  vector3FromMetricVector3,
} from "@carma-geo/proj";
import { Vector3 } from "three";

import type {
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
} from "../types/annotation-types";

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

/**
 * East/north/up frame of a vertical polygon: north is the plane normal, east
 * runs along the plane; the sign follows the previous frame so it does not flip
 * between updates.
 */
export const deriveVerticalPolygonLocalFrame = (
  vertices: readonly Vector3[],
  plane: PlanarPolygonPlane,
  previousFrame?: PlanarPolygonLocalFrame
): PlanarPolygonLocalFrame | undefined => {
  if (vertices.length === 0) return undefined;

  const origin = vertices[0] ?? vector3FromMetricVector3(plane.anchorECEF);
  let north = normalizeVector3Direction(
    vector3FromMetricVector3(plane.normalECEF)
  );
  if (!north) return undefined;

  if (previousFrame) {
    const previousNorth = normalizeVector3Direction(
      vector3FromMetricVector3(previousFrame.northECEF)
    );
    if (previousNorth && north.dot(previousNorth) < 0) {
      north = north.clone().negate();
    }
  }

  const upInPlane = normalizeVector3Direction(
    removeVector3ComponentAlongAxis(
      getEllipsoidalUpDirectionAtAnchor(origin),
      north
    )
  );
  let east = upInPlane
    ? normalizeVector3Direction(new Vector3().crossVectors(north, upInPlane))
    : null;

  for (let index = 0; !east && index < vertices.length - 1; index += 1) {
    const start = vertices[index];
    const end = vertices[index + 1];
    if (!start || !end) continue;
    east = normalizeVector3Direction(
      removeVector3ComponentAlongAxis(
        new Vector3().subVectors(end, start),
        north
      )
    );
  }

  east ??= normalizeVector3Direction(new Vector3().crossVectors(north, X_AXIS));
  east ??= normalizeVector3Direction(new Vector3().crossVectors(north, Y_AXIS));
  if (!east) return undefined;

  const up = normalizeVector3Direction(new Vector3().crossVectors(east, north));
  if (!up) return undefined;

  if (previousFrame) {
    const previousEast = normalizeVector3Direction(
      vector3FromMetricVector3(previousFrame.eastECEF)
    );
    if (previousEast && east.dot(previousEast) < 0) {
      east = east.clone().negate();
      north = north.clone().negate();
    }
  }

  return {
    originECEF: metricVector3FromVector3(origin),
    eastECEF: metricVector3FromVector3(east),
    northECEF: metricVector3FromVector3(north),
    upECEF: metricVector3FromVector3(up),
  };
};
