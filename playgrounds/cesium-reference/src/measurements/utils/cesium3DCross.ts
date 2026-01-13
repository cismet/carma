import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  PointPrimitiveCollection,
  PolylineCollection,
  Transforms,
  colorFromConstructorArgs,
  type Scene,
} from "@carma/cesium";
import { COLORS, type UnitRgba } from "@carma-commons/utils";

export interface Cross3DOptions {
  position: Cartesian3;
  radius?: number;
  colorX?: UnitRgba;
  colorY?: UnitRgba;
  colorZ?: UnitRgba;
  width?: number;
  id?: string;
  showAxes?: boolean;
}

export interface Cross3DGroup {
  id: string;
  cleanup: (scene: Scene) => void;
  addToScene: (scene: Scene) => void;
}

/**
 * Creates a 3D cross visualization using primitives instead of entities.
 * This is more performant for many crosses and doesn't depend on the entity system.
 */
export const create3DCrossGroup = (
  scene: Scene,
  options: Cross3DOptions
): Cross3DGroup => {
  const {
    position,
    radius = 10,
    colorX = Color.RED,
    colorY = Color.GREEN,
    colorZ = Color.BLUE,
    width = 1,
    id = "3d-cross",
    showAxes = true,
  } = options;

  let polylineCollection = scene.primitives.add(new PolylineCollection());
  let pointCollection = scene.primitives.add(new PointPrimitiveCollection());

  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(position);

  const xAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 0, new Cartesian4());
  const yAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 1, new Cartesian4());
  const zAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());

  const xAxis = new Cartesian3(xAxis4.x, xAxis4.y, xAxis4.z);
  const yAxis = new Cartesian3(yAxis4.x, yAxis4.y, yAxis4.z);
  const zAxis = new Cartesian3(zAxis4.x, zAxis4.y, zAxis4.z);

  Cartesian3.normalize(xAxis, xAxis);
  Cartesian3.normalize(yAxis, yAxis);
  Cartesian3.normalize(zAxis, zAxis);

  Cartesian3.multiplyByScalar(xAxis, radius, xAxis);
  Cartesian3.multiplyByScalar(yAxis, radius, yAxis);
  Cartesian3.multiplyByScalar(zAxis, radius, zAxis);

  const xPositive = Cartesian3.add(position, xAxis, new Cartesian3());
  const xNegative = Cartesian3.subtract(position, xAxis, new Cartesian3());

  const yPositive = Cartesian3.add(position, yAxis, new Cartesian3());
  const yNegative = Cartesian3.subtract(position, yAxis, new Cartesian3());

  const zPositive = Cartesian3.add(position, zAxis, new Cartesian3());
  const zNegative = Cartesian3.subtract(position, zAxis, new Cartesian3());

  pointCollection.add({
    position: position,
    pixelSize: 1,
    color: Color.WHITE,
    outlineColor: Color.WHITE,
    outlineWidth: 0,
    id: `${id}-center-dot`,
  });

  if (showAxes) {
    polylineCollection.add({
      positions: [xNegative, xPositive],
      width: width,
      material: colorX,
      id: `${id}-x-axis`,
    });

    polylineCollection.add({
      positions: [yNegative, yPositive],
      width: width,
      material: colorY,
      id: `${id}-y-axis`,
    });

    polylineCollection.add({
      positions: [zNegative, zPositive],
      width: width,
      material: colorZ,
      id: `${id}-z-axis`,
    });
  }

  return {
    id,
    addToScene: (s: Scene) => {
      if (!s.primitives.contains(polylineCollection)) {
        polylineCollection = s.primitives.add(polylineCollection);
      }
      if (!s.primitives.contains(pointCollection)) {
        pointCollection = s.primitives.add(pointCollection);
      }
    },
    cleanup: (s: Scene) => {
      try {
        if (s.primitives.contains(polylineCollection)) {
          s.primitives.remove(polylineCollection);
        }
        if (s.primitives.contains(pointCollection)) {
          s.primitives.remove(pointCollection);
        }
      } catch (error) {
        console.warn("Error cleaning up 3D cross primitives:", error);
      }
    },
  };
};

export const update3dCrossVisibility = (
  cross: Cross3DGroup,
  show: boolean
): void => {
  console.debug(
    `[3D Cross] Visibility control for primitives not yet implemented. ID: ${cross.id}, show: ${show}`
  );
};
