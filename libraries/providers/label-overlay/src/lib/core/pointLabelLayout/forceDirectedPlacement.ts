import { clamp } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import {
  createLabelRectFromConnector,
  getRectCenter,
  getViewportOverflowPenalty,
  rectsIntersect,
  LABEL_COLLISION_PADDING,
} from "./geometry";
import type {
  DynamicLabelPlacementConfig,
  LabelPlacement,
  Rect,
} from "./types";

type RelaxPlacementWithForcesInput = {
  anchor: CssPixelPosition;
  labelText: string;
  basePlacement: LabelPlacement;
  occupiedLabelRects: Rect[];
  otherAnchorRects: Rect[];
  viewportWidth: number;
  viewportHeight: number;
  config: DynamicLabelPlacementConfig;
};

const getOverlapArea = (rect: Rect, obstacle: Rect): number =>
  Math.max(
    0,
    Math.min(rect.right, obstacle.right) - Math.max(rect.left, obstacle.left)
  ) *
  Math.max(
    0,
    Math.min(rect.bottom, obstacle.bottom) - Math.max(rect.top, obstacle.top)
  );

/** Moves a label along its placement ray until it clears obstacles and the viewport edge. */
export const relaxPlacementWithForces = ({
  anchor,
  labelText,
  basePlacement,
  occupiedLabelRects,
  otherAnchorRects,
  viewportWidth,
  viewportHeight,
  config,
}: RelaxPlacementWithForcesInput): LabelPlacement => {
  const direction = {
    x: Math.cos(basePlacement.angleRad),
    y: Math.sin(basePlacement.angleRad),
  };
  const obstacles = [...occupiedLabelRects, ...otherAnchorRects];
  const preferredDistance = basePlacement.distance;

  const connectorAt = (distance: number) =>
    ({
      x: anchor.x + direction.x * distance,
      y: anchor.y + direction.y * distance,
    } as CssPixelPosition);
  const rectAt = (distance: number) =>
    createLabelRectFromConnector(
      connectorAt(distance),
      labelText,
      basePlacement.attach
    );
  const clampDistance = (distance: number) =>
    clamp(distance, config.minDistance, config.maxDistance);

  let distance = preferredDistance;

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const connector = connectorAt(distance);
    const rect = createLabelRectFromConnector(
      connector,
      labelText,
      basePlacement.attach
    );

    let forceX =
      direction.x * (preferredDistance - distance) * config.springStrength;
    let forceY =
      direction.y * (preferredDistance - distance) * config.springStrength;

    obstacles.forEach((obstacle) => {
      if (!rectsIntersect(rect, obstacle, LABEL_COLLISION_PADDING)) {
        return;
      }

      const rectCenter = getRectCenter(rect);
      const obstacleCenter = getRectCenter(obstacle);
      let dx = rectCenter.x - obstacleCenter.x;
      let dy = rectCenter.y - obstacleCenter.y;

      if (dx === 0 && dy === 0) {
        dx = direction.x || 1;
        dy = direction.y || -1;
      }

      const magnitude = Math.hypot(dx, dy) || 1;
      const strength =
        config.repulsionBase +
        Math.min(24, getOverlapArea(rect, obstacle) * 0.02);
      forceX += (dx / magnitude) * strength;
      forceY += (dy / magnitude) * strength;
    });

    const movedX =
      connector.x +
      clamp(forceX * config.step, -config.maxDelta, config.maxDelta);
    const movedY =
      connector.y +
      clamp(forceY * config.step, -config.maxDelta, config.maxDelta);

    // Project back onto the placement ray.
    distance = clampDistance(
      (movedX - anchor.x) * direction.x + (movedY - anchor.y) * direction.y
    );

    const overflowPenalty = getViewportOverflowPenalty(
      rectAt(distance),
      viewportWidth,
      viewportHeight
    );
    if (overflowPenalty <= 0) {
      continue;
    }

    const inwardDistance = clampDistance(
      distance - config.viewportAdjustmentStep
    );
    const outwardDistance = clampDistance(
      distance + config.viewportAdjustmentStep
    );
    const inwardPenalty = getViewportOverflowPenalty(
      rectAt(inwardDistance),
      viewportWidth,
      viewportHeight
    );
    const outwardPenalty = getViewportOverflowPenalty(
      rectAt(outwardDistance),
      viewportWidth,
      viewportHeight
    );

    if (inwardPenalty < overflowPenalty || outwardPenalty < overflowPenalty) {
      distance =
        inwardPenalty <= outwardPenalty ? inwardDistance : outwardDistance;
    }
  }

  return {
    id: `force-${basePlacement.id}`,
    angleRad: basePlacement.angleRad,
    distance,
    attach: basePlacement.attach,
  };
};
