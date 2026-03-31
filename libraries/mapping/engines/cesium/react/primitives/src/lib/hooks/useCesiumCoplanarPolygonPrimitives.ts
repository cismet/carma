import { useEffect, useRef } from "react";

import {
  Cartesian3,
  CoplanarPolygonGeometry,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveCollection,
  offsetCartesian3Positions,
  type Scene,
} from "@carma/cesium";

import type { CesiumPolygonPrimitive } from "./useCesiumGroundPolygonPrimitives";
const removePrimitiveCollection = (
  scene: Scene,
  primitiveCollection: PrimitiveCollection | null
) => {
  if (!primitiveCollection) return;
  scene.primitives.remove(primitiveCollection);
};

export const useCesiumCoplanarPolygonPrimitives = (
  scene: Scene | null,
  polygonPrimitives: readonly CesiumPolygonPrimitive[]
) => {
  const primitiveCollectionRef = useRef<PrimitiveCollection | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    removePrimitiveCollection(scene, primitiveCollectionRef.current);
    primitiveCollectionRef.current = null;

    if (polygonPrimitives.length === 0) return;

    const collection = new PrimitiveCollection();
    let hasPrimitive = false;

    for (const { id, vertexPoints, fillColor } of polygonPrimitives) {
      if (vertexPoints.length < 3) continue;

      const geometryVertexPoints = vertexPoints.map((point) =>
        Cartesian3.clone(point)
      );
      const anchor = geometryVertexPoints[0];
      if (!anchor) continue;

      const localPositions = offsetCartesian3Positions(
        geometryVertexPoints,
        Cartesian3.negate(anchor, new Cartesian3())
      );
      const coplanarGeometry = CoplanarPolygonGeometry.fromPositions({
        positions: localPositions,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      });
      if (!coplanarGeometry) continue;

      const instance = new GeometryInstance({
        geometry: coplanarGeometry,
        id: { polygonGroupId: id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      collection.add(
        new Primitive({
          geometryInstances: [instance],
          modelMatrix: Matrix4.fromTranslation(anchor, new Matrix4()),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: false,
        })
      );
      hasPrimitive = true;
    }

    if (!hasPrimitive) {
      scene.requestRender();
      return;
    }

    primitiveCollectionRef.current = collection;
    scene.primitives.add(collection);
    scene.requestRender();

    return () => {
      if (scene.isDestroyed()) return;
      removePrimitiveCollection(scene, collection);
      primitiveCollectionRef.current = null;
      scene.requestRender();
    };
  }, [polygonPrimitives, scene]);
};
