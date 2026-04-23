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

import type { Scene } from "@carma-cesium";
import type { RuntimePolygonFillRenderModel } from "./measurement-render-models";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "./measurement-render-models";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";

export type MeasurementPolygonFillsController = {
  setPolygonFills: (
    polygonFills: readonly RuntimePolygonFillRenderModel[]
  ) => void;
  clear: () => void;
  destroy: () => void;
};

const removeGroundPrimitives = (
  scene: Scene,
  groundPrimitives: readonly GroundPrimitive[]
) => {
  groundPrimitives.forEach((groundPrimitive) => {
    scene.groundPrimitives.remove(groundPrimitive);
  });
};

const removePrimitiveCollection = (
  scene: Scene,
  primitiveCollection: PrimitiveCollection | null
) => {
  if (!primitiveCollection) {
    return;
  }

  scene.primitives.remove(primitiveCollection);
};

const normalizePolygonFills = (
  polygonFills: readonly RuntimePolygonFillRenderModel[]
) =>
  polygonFills.map((polygonFill) => ({
    ...polygonFill,
    placement: polygonFill.placement ?? RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
  }));

const arePolygonFillsEqual = (
  left: readonly RuntimePolygonFillRenderModel[],
  right: readonly RuntimePolygonFillRenderModel[]
) =>
  left.length === right.length &&
  left.every((polygonFill, index) => {
    const otherPolygonFill = right[index];

    return (
      otherPolygonFill !== undefined &&
      polygonFill.id === otherPolygonFill.id &&
      polygonFill.measurementId === otherPolygonFill.measurementId &&
      polygonFill.fill === otherPolygonFill.fill &&
      polygonFill.placement === otherPolygonFill.placement &&
      polygonFill.selected === otherPolygonFill.selected &&
      areCoordinateListsEqual(
        polygonFill.coordinates,
        otherPolygonFill.coordinates
      )
    );
  });

export const createMeasurementPolygonFillsController = (
  scene: Scene | null
): MeasurementPolygonFillsController => {
  if (!scene || scene.isDestroyed()) {
    return {
      setPolygonFills: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  let currentPolygonFills: readonly RuntimePolygonFillRenderModel[] = [];
  let groundPrimitives: GroundPrimitive[] = [];
  let coplanarCollection: PrimitiveCollection | null = null;

  const clearRenderedPolygonFills = ({
    requestRender,
  }: {
    requestRender: boolean;
  }) => {
    removeGroundPrimitives(scene, groundPrimitives);
    groundPrimitives = [];
    removePrimitiveCollection(scene, coplanarCollection);
    coplanarCollection = null;

    if (requestRender) {
      scene.requestRender();
    }
  };

  const renderPolygonFills = (
    normalizedPolygonFills: readonly RuntimePolygonFillRenderModel[]
  ) => {
    clearRenderedPolygonFills({ requestRender: false });

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

    groundPrimitives = nextGroundPrimitives;
    if (hasCoplanarPrimitive) {
      coplanarCollection = nextCoplanarCollection;
      scene.primitives.add(nextCoplanarCollection);
    }

    scene.requestRender();
  };

  return {
    setPolygonFills: (polygonFills) => {
      const normalizedPolygonFills = normalizePolygonFills(polygonFills);
      if (arePolygonFillsEqual(currentPolygonFills, normalizedPolygonFills)) {
        return;
      }

      currentPolygonFills = normalizedPolygonFills;
      if (scene.isDestroyed()) {
        return;
      }

      renderPolygonFills(normalizedPolygonFills);
    },
    clear: () => {
      if (currentPolygonFills.length === 0) {
        return;
      }

      currentPolygonFills = [];
      if (scene.isDestroyed()) {
        groundPrimitives = [];
        coplanarCollection = null;
        return;
      }

      clearRenderedPolygonFills({ requestRender: true });
    },
    destroy: () => {
      currentPolygonFills = [];
      if (scene.isDestroyed()) {
        groundPrimitives = [];
        coplanarCollection = null;
        return;
      }

      clearRenderedPolygonFills({ requestRender: true });
    },
  };
};
