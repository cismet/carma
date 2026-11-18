import { Matrix4 as CesiumMatrix4, type Cartesian3 } from "@carma-cesium";
import type { CesiumSceneProjectionSnapshot } from "@carma-mapping/engines/cesium/core";

const POSITION_DECIMALS = 4;
const DIRECTION_DECIMALS = 6;

/** A number as a fixed-decimal string, the building block of the view key. */
const toFixedKey = (value: number, decimals: number) =>
  Number.isFinite(value) ? value.toFixed(decimals) : "nan";

const vectorKey = (vector: Cartesian3, decimals: number) =>
  [vector.x, vector.y, vector.z]
    .map((component) => toFixedKey(component, decimals))
    .join(",");

/** Identifies the camera view a projection was taken under. */
export const buildProjectionViewKey = ({
  cameraSnapshot,
}: CesiumSceneProjectionSnapshot): string => {
  const projectionKey = cameraSnapshot.projectionMatrix
    ? Array.from(
        CesiumMatrix4.toArray(cameraSnapshot.projectionMatrix) as number[]
      )
        .map((element) => toFixedKey(element, DIRECTION_DECIMALS))
        .join(",")
    : "none";
  return [
    vectorKey(cameraSnapshot.position, POSITION_DECIMALS),
    vectorKey(cameraSnapshot.direction, DIRECTION_DECIMALS),
    vectorKey(cameraSnapshot.up, DIRECTION_DECIMALS),
    toFixedKey(cameraSnapshot.frustumFovY, DIRECTION_DECIMALS),
    projectionKey,
  ].join("|");
};
