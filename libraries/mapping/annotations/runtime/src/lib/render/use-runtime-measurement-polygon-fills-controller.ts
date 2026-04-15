import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  GroundPrimitive,
  Matrix4,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  PrimitiveCollection,
} from "@carma-cesium";
import { offsetCartesian3Positions } from "@carma-mapping/engines/cesium/core";

import type { RuntimeScene } from "../types/runtime-scene.types";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type RuntimePolygonFillRenderModel,
} from "./measurement-render-models";

const removeGroundPrimitives = (
  scene: RuntimeScene,
  groundPrimitives: readonly GroundPrimitive[]
) => {
  groundPrimitives.forEach((groundPrimitive) => {
    scene.groundPrimitives.remove(groundPrimitive);
  });
};

const removePrimitiveCollection = (
  scene: RuntimeScene,
  primitiveCollection: PrimitiveCollection | null
) => {
  if (!primitiveCollection) {
    return;
  }

  scene.primitives.remove(primitiveCollection);
};

export const useRuntimeMeasurementPolygonFillsController = (
  scene: RuntimeScene | null,
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) => {
  const groundPrimitivesRef = useRef<GroundPrimitive[]>([]);
  const coplanarCollectionRef = useRef<PrimitiveCollection | null>(null);

  const normalizedPolygonFills = useMemo(
    () =>
      polygonFills.map((polygonFill) => ({
        ...polygonFill,
        placement:
          polygonFill.placement ?? RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
      })),
    [polygonFills]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }

    removeGroundPrimitives(scene, groundPrimitivesRef.current);
    groundPrimitivesRef.current = [];
    removePrimitiveCollection(scene, coplanarCollectionRef.current);
    coplanarCollectionRef.current = null;

    if (normalizedPolygonFills.length === 0) {
      scene.requestRender();
      return;
    }

    const nextGroundPrimitives: GroundPrimitive[] = [];
    const nextCoplanarCollection = new PrimitiveCollection();
    let hasCoplanarPrimitive = false;

    normalizedPolygonFills.forEach((polygonFill) => {
      if (polygonFill.coordinates.length < 3) {
        return;
      }

      const fillColor =
        Color.fromCssColorString(polygonFill.fill) ?? Color.WHITE;
      const positions = polygonFill.coordinates.map((coordinate) =>
        Cartesian3.fromDegrees(
          coordinate.longitude,
          coordinate.latitude,
          coordinate.altitude
        )
      );

      if (polygonFill.placement === RUNTIME_POLYGON_FILL_PLACEMENT.GROUND) {
        const groundGeometry = new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(positions),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        });

        const groundInstance = new GeometryInstance({
          geometry: groundGeometry,
          id: { polygonGroupId: polygonFill.id },
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
        return;
      }

      const anchor = positions[0];
      if (!anchor) {
        return;
      }

      const localPositions = offsetCartesian3Positions(
        positions,
        Cartesian3.negate(anchor, new Cartesian3())
      );
      const coplanarGeometry = CoplanarPolygonGeometry.fromPositions({
        positions: localPositions,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      });
      if (!coplanarGeometry) {
        return;
      }

      const instance = new GeometryInstance({
        geometry: coplanarGeometry,
        id: { polygonGroupId: polygonFill.id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      nextCoplanarCollection.add(
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
      hasCoplanarPrimitive = true;
    });

    groundPrimitivesRef.current = nextGroundPrimitives;
    if (hasCoplanarPrimitive) {
      coplanarCollectionRef.current = nextCoplanarCollection;
      scene.primitives.add(nextCoplanarCollection);
    }

    scene.requestRender();

    return () => {
      if (scene.isDestroyed()) {
        return;
      }

      removeGroundPrimitives(scene, nextGroundPrimitives);
      groundPrimitivesRef.current = [];
      removePrimitiveCollection(scene, nextCoplanarCollection);
      coplanarCollectionRef.current = null;
      scene.requestRender();
    };
  }, [normalizedPolygonFills, scene]);
};
