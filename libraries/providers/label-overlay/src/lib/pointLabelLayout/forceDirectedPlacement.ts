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
  ScreenPoint,
} from "./types";

type RelaxPlacementWithForcesInput = {
  anchor: ScreenPoint;
  labelText: string;
  basePlacement: LabelPlacement;
  occupiedLabelRects: Rect[];
  otherAnchorRects: Rect[];
  viewportWidth: number;
  viewportHeight: number;
  config: DynamicLabelPlacementConfig;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

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

  const preferredDistance = basePlacement.distance;
  let distance = preferredDistance;
  let connector = {
    x: anchor.x + direction.x * distance,
    y: anchor.y + direction.y * distance,
  };

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const rect = createLabelRectFromConnector(
      connector,
      labelText,
      basePlacement.attach
    );

    let forceX =
      direction.x * (preferredDistance - distance) * config.springStrength;
    let forceY =
      direction.y * (preferredDistance - distance) * config.springStrength;

    [...occupiedLabelRects, ...otherAnchorRects].forEach((obstacle) => {
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
      const nx = dx / magnitude;
      const ny = dy / magnitude;

      const overlapX = Math.max(
        0,
        Math.min(rect.right, obstacle.right) -
          Math.max(rect.left, obstacle.left)
      );
      const overlapY = Math.max(
        0,
        Math.min(rect.bottom, obstacle.bottom) -
          Math.max(rect.top, obstacle.top)
      );
      const overlapArea = overlapX * overlapY;

      const strength = config.repulsionBase + Math.min(24, overlapArea * 0.02);
      forceX += nx * strength;
      forceY += ny * strength;
    });

    connector = {
      x:
        connector.x +
        clamp(forceX * config.step, -config.maxDelta, config.maxDelta),
      y:
        connector.y +
        clamp(forceY * config.step, -config.maxDelta, config.maxDelta),
    };

    // Keep connector on the chosen placement ray.
    const projectedDistance = clamp(
      (connector.x - anchor.x) * direction.x +
        (connector.y - anchor.y) * direction.y,
      config.minDistance,
      config.maxDistance
    );

    distance = projectedDistance;
    connector = {
      x: anchor.x + direction.x * distance,
      y: anchor.y + direction.y * distance,
    };

    // Bias toward visible viewport while staying on the same ray.
    const rectAfterProjection = createLabelRectFromConnector(
      connector,
      labelText,
      basePlacement.attach
    );
    const overflowPenalty = getViewportOverflowPenalty(
      rectAfterProjection,
      viewportWidth,
      viewportHeight
    );

    if (overflowPenalty <= 0) {
      continue;
    }

    const inwardDistance = clamp(
      distance - config.viewportAdjustmentStep,
      config.minDistance,
      config.maxDistance
    );
    const outwardDistance = clamp(
      distance + config.viewportAdjustmentStep,
      config.minDistance,
      config.maxDistance
    );

    const inwardRect = createLabelRectFromConnector(
      {
        x: anchor.x + direction.x * inwardDistance,
        y: anchor.y + direction.y * inwardDistance,
      },
      labelText,
      basePlacement.attach
    );
    const outwardRect = createLabelRectFromConnector(
      {
        x: anchor.x + direction.x * outwardDistance,
        y: anchor.y + direction.y * outwardDistance,
      },
      labelText,
      basePlacement.attach
    );

    const inwardPenalty = getViewportOverflowPenalty(
      inwardRect,
      viewportWidth,
      viewportHeight
    );
    const outwardPenalty = getViewportOverflowPenalty(
      outwardRect,
      viewportWidth,
      viewportHeight
    );

    if (inwardPenalty < overflowPenalty || outwardPenalty < overflowPenalty) {
      distance =
        inwardPenalty <= outwardPenalty ? inwardDistance : outwardDistance;
      connector = {
        x: anchor.x + direction.x * distance,
        y: anchor.y + direction.y * distance,
      };
    }
  }

  return {
    id: `force-${basePlacement.id}`,
    angleRad: basePlacement.angleRad,
    distance,
    attach: basePlacement.attach,
  };
};
