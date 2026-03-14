import {
  Cartesian2,
  Cartesian3,
  type Scene,
} from "../../cesium";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionAtPosition,
} from "../primitives/GuidePrimitives";

const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;

export const pickScenePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => scene.pickPosition(screenPosition) ?? null;

export const pickGlobePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const pickRay = scene.camera.getPickRay(screenPosition);
  if (!pickRay) return null;
  return scene.globe.pick(pickRay, scene) ?? null;
};

export const sampleSurfaceNormalAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3
): Cartesian3 => {
  const rightPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x + POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const leftPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x - POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const upPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y - POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );
  const downPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y + POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );

  if (!rightPosition || !leftPosition || !upPosition || !downPosition) {
    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const tangentX = Cartesian3.subtract(
    rightPosition,
    leftPosition,
    new Cartesian3()
  );
  const tangentY = Cartesian3.subtract(
    downPosition,
    upPosition,
    new Cartesian3()
  );
  if (
    Cartesian3.magnitudeSquared(tangentX) <= GUIDE_NORMAL_EPSILON_SQUARED ||
    Cartesian3.magnitudeSquared(tangentY) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpDirectionAtPosition(centerPosition);
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
