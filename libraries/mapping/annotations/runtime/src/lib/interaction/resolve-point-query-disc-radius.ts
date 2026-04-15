import { type Cartesian3, type Scene } from "@carma-cesium";
import { getDiscWorldRadius } from "@carma-mapping/engines/cesium/core";

export const resolvePointQueryDiscRadius = ({
  scene,
  pointECEF,
  discNormalECEF,
  radiusMeters,
  scalingMode,
  targetScreenRadiusCssPx,
}: {
  scene: Scene;
  pointECEF: Cartesian3;
  discNormalECEF: Cartesian3;
  radiusMeters: number;
  scalingMode: "screen" | "world";
  targetScreenRadiusCssPx: number;
}) => {
  const resolvedRadiusMeters = Math.max(radiusMeters, 0.1);

  return scalingMode === "world"
    ? resolvedRadiusMeters
    : getDiscWorldRadius(
        scene,
        pointECEF,
        discNormalECEF,
        resolvedRadiusMeters,
        targetScreenRadiusCssPx
      );
};
