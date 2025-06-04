import { Cartesian3, Cartesian4, Color, Entity, PolylineGraphics, Transforms, Matrix4 } from "cesium";

export interface Cross3DOptions {
  position: Cartesian3;
  size?: number;
  color?: Color;
  width?: number;
  id?: string;
}

interface ViewerLike {
  entities: {
    add: (entity: Entity) => void;
    remove: (entity: Entity) => void;
  };
}

/**
 * Creates a 3D cross visualization using three polylines extending in X, Y, and Z directions
 * Similar to Cesium's debug entities but as a reusable utility
 */
export const create3DCross = (options: Cross3DOptions): Entity[] => {
  const {
    position,
    size = 0.1, // Size in meters
    colorX = Color.RED,
    colorY = Color.GREEN,
    colorZ = Color.BLUE,
    width = 1,
    id = "3d-cross",
  } = options;

  // Create transformation matrix for the position to get local coordinate system
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(position);
  
  // Define half-size for extending in both directions
  const halfSize = size / 2;

  // Create vectors for the three axes in local coordinate system
  const xAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 0, new Cartesian4());
  const yAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 1, new Cartesian4());
  const zAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());

  // Convert to Cartesian3 (ignore w component)
  const xAxis = new Cartesian3(xAxis4.x, xAxis4.y, xAxis4.z);
  const yAxis = new Cartesian3(yAxis4.x, yAxis4.y, yAxis4.z);
  const zAxis = new Cartesian3(zAxis4.x, zAxis4.y, zAxis4.z);

  // Normalize the axes
  Cartesian3.normalize(xAxis, xAxis);
  Cartesian3.normalize(yAxis, yAxis);
  Cartesian3.normalize(zAxis, zAxis);

  // Scale axes by half size
  Cartesian3.multiplyByScalar(xAxis, halfSize, xAxis);
  Cartesian3.multiplyByScalar(yAxis, halfSize, yAxis);
  Cartesian3.multiplyByScalar(zAxis, halfSize, zAxis);

  // Calculate endpoints for each axis
  const xPositive = Cartesian3.add(position, xAxis, new Cartesian3());
  const xNegative = Cartesian3.subtract(position, xAxis, new Cartesian3());
  
  const yPositive = Cartesian3.add(position, yAxis, new Cartesian3());
  const yNegative = Cartesian3.subtract(position, yAxis, new Cartesian3());
  
  const zPositive = Cartesian3.add(position, zAxis, new Cartesian3());
  const zNegative = Cartesian3.subtract(position, zAxis, new Cartesian3());

  // Create three entities for the three axes
  const xAxisEntity = new Entity({
    id: `${id}-x-axis`,
    name: "3D Cross X-Axis",
    polyline: new PolylineGraphics({
      positions: [xNegative, xPositive],
      width,
      material: colorX,
      clampToGround: false,
    }),
  });

  const yAxisEntity = new Entity({
    id: `${id}-y-axis`,
    name: "3D Cross Y-Axis", 
    polyline: new PolylineGraphics({
      positions: [yNegative, yPositive],
      width,
      material: colorY,
      clampToGround: false,
    }),
  });

  const zAxisEntity = new Entity({
    id: `${id}-z-axis`,
    name: "3D Cross Z-Axis",
    polyline: new PolylineGraphics({
      positions: [zNegative, zPositive],
      width,
      material: colorZ,
      clampToGround: false,
    }),
  });

  return [xAxisEntity, yAxisEntity, zAxisEntity];
};

/**
 * Creates a 3D cross entity group with all three axes combined
 * Returns an object with the entities for easier management
 */
export const create3DCrossGroup = (options: Cross3DOptions) => {
  const crossEntities = create3DCross(options);
  const { id = "3d-cross" } = options;

  return {
    id,
    entities: crossEntities,
    cleanup: (viewer: ViewerLike) => {
      crossEntities.forEach(entity => viewer.entities.remove(entity));
    },
    addToViewer: (viewer: ViewerLike) => {
      crossEntities.forEach(entity => viewer.entities.add(entity));
    }
  };
};
