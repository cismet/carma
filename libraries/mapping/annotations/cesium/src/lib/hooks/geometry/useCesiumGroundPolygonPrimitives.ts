import { useEffect, useRef } from "react";

import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  type Scene,
} from "@carma/cesium";
import { type PolygonPreviewGroup } from "@carma-mapping/annotations/core";

const removeGroundPrimitives = (
  scene: Scene,
  groundPrimitives: readonly GroundPrimitive[]
) => {
  groundPrimitives.forEach((groundPrimitive) => {
    scene.groundPrimitives.remove(groundPrimitive);
  });
};

export type CesiumPolygonPrimitive = {
  id: string;
  vertexPoints: ReadonlyArray<PolygonPreviewGroup["vertexPoints"][number]>;
  fillColor: Color;
};

export const useCesiumGroundPolygonPrimitives = (
  scene: Scene | null,
  polygonPrimitives: readonly CesiumPolygonPrimitive[]
) => {
  const groundPrimitivesRef = useRef<GroundPrimitive[]>([]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    removeGroundPrimitives(scene, groundPrimitivesRef.current);
    groundPrimitivesRef.current = [];

    if (polygonPrimitives.length === 0) return;

    const nextGroundPrimitives: GroundPrimitive[] = [];

    for (const { id, vertexPoints, fillColor } of polygonPrimitives) {
      if (vertexPoints.length < 3) continue;
      const geometryVertexPoints = vertexPoints.map((point) =>
        Cartesian3.clone(point)
      );
      const groundGeometry = new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(geometryVertexPoints),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      });

      const groundInstance = new GeometryInstance({
        geometry: groundGeometry,
        id: { polygonGroupId: id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      const groundPrimitive = new GroundPrimitive({
        geometryInstances: [groundInstance],
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: true,
        }),
        asynchronous: false,
        releaseGeometryInstances: false,
        classificationType: ClassificationType.BOTH,
      });

      scene.groundPrimitives.add(groundPrimitive);
      nextGroundPrimitives.push(groundPrimitive);
    }

    groundPrimitivesRef.current = nextGroundPrimitives;
    scene.requestRender();

    return () => {
      if (scene.isDestroyed()) return;
      removeGroundPrimitives(scene, nextGroundPrimitives);
      groundPrimitivesRef.current = [];
      scene.requestRender();
    };
  }, [polygonPrimitives, scene]);
};
