import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionAtPosition,
} from "../primitives/GuidePrimitives";
import { resolvePreferredSurfacePick } from "./SurfacePicking";

const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;
const OFFSET_SCREEN_POSITION_SCRATCH = new Cartesian2();

const offsetScreenPosition = (
  screenPosition: Cartesian2,
  offsetX: number,
  offsetY: number,
  result: Cartesian2
) => {
  result.x = screenPosition.x + offsetX;
  result.y = screenPosition.y + offsetY;
  return result;
};

const resolveScreenSpaceTangent = (
  centerPosition: Cartesian3,
  positiveDirectionPosition: Cartesian3 | null,
  negativeDirectionPosition: Cartesian3 | null
) => {
  const tangent = new Cartesian3();

  if (positiveDirectionPosition && negativeDirectionPosition) {
    return Cartesian3.subtract(
      positiveDirectionPosition,
      negativeDirectionPosition,
      tangent
    );
  }

  if (positiveDirectionPosition) {
    return Cartesian3.subtract(
      positiveDirectionPosition,
      centerPosition,
      tangent
    );
  }

  if (negativeDirectionPosition) {
    return Cartesian3.subtract(
      centerPosition,
      negativeDirectionPosition,
      tangent
    );
  }

  return null;
};

export const sampleSurfacePickNormalAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3
): Cartesian3 | null => {
  const rightPosition = resolvePreferredSurfacePick(
    scene,
    offsetScreenPosition(
      screenPosition,
      POINTER_NORMAL_SAMPLE_OFFSET_PX,
      0,
      OFFSET_SCREEN_POSITION_SCRATCH
    ),
    {
      resolveGlobePosition: false,
    }
  ).surfacePositionECEF;
  const leftPosition = resolvePreferredSurfacePick(
    scene,
    offsetScreenPosition(
      screenPosition,
      -POINTER_NORMAL_SAMPLE_OFFSET_PX,
      0,
      OFFSET_SCREEN_POSITION_SCRATCH
    ),
    {
      resolveGlobePosition: false,
    }
  ).surfacePositionECEF;
  const upPosition = resolvePreferredSurfacePick(
    scene,
    offsetScreenPosition(
      screenPosition,
      0,
      -POINTER_NORMAL_SAMPLE_OFFSET_PX,
      OFFSET_SCREEN_POSITION_SCRATCH
    ),
    {
      resolveGlobePosition: false,
    }
  ).surfacePositionECEF;
  const downPosition = resolvePreferredSurfacePick(
    scene,
    offsetScreenPosition(
      screenPosition,
      0,
      POINTER_NORMAL_SAMPLE_OFFSET_PX,
      OFFSET_SCREEN_POSITION_SCRATCH
    ),
    {
      resolveGlobePosition: false,
    }
  ).surfacePositionECEF;

  const tangentX = resolveScreenSpaceTangent(
    centerPosition,
    rightPosition,
    leftPosition
  );
  const tangentY = resolveScreenSpaceTangent(
    centerPosition,
    downPosition,
    upPosition
  );

  if (
    !tangentX ||
    !tangentY ||
    Cartesian3.magnitudeSquared(tangentX) <= GUIDE_NORMAL_EPSILON_SQUARED ||
    Cartesian3.magnitudeSquared(tangentY) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return null;
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return null;
  }

  const normalizedNormal = Cartesian3.normalize(
    sampledNormal,
    new Cartesian3()
  );
  const localUp = getLocalUpDirectionAtPosition(centerPosition);
  if (Cartesian3.dot(normalizedNormal, localUp) < 0) {
    return Cartesian3.negate(normalizedNormal, new Cartesian3());
  }

  return normalizedNormal;
};
