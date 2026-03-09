import { useEffect, useMemo, useRef } from "react";

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
  Primitive,
  PrimitiveCollection,
} from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  type PlanarPolygonGroup,
} from "../types/AnnotationTypes";
import { createAnchoredCoplanarPolygonGeometry } from "../utils/createAnchoredCoplanarPolygonGeometry";
import { type CesiumPolygonAreaPrimitivesOptions } from "./areaVisualizer.types";

const POLYGON_FILL_ALPHA = 0.25;
const POLYGON_FILL_SELECTED_ALPHA = 0.35;
type PlanarAreaMeasurementType =
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_PLANAR
  | typeof ANNOTATION_TYPE_AREA_VERTICAL;

const POLYGON_FILL_RGB_BY_MEASUREMENT_TYPE: Readonly<
  Record<PlanarAreaMeasurementType, readonly [number, number, number]>
> = {
  [ANNOTATION_TYPE_AREA_VERTICAL]: [0.44, 0.66, 1.0],
  [ANNOTATION_TYPE_AREA_GROUND]: [0.42, 0.74, 0.48],
  [ANNOTATION_TYPE_AREA_PLANAR]: [0.94, 0.87, 0.57],
};

const getPolygonFillCesiumColor = (
  group: Pick<PlanarPolygonGroup, "measurementKind">,
  isSelected: boolean
): Color => {
  const alpha = isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA;
  const resolvedMeasurementType = group.measurementKind;
  const [red, green, blue] =
    POLYGON_FILL_RGB_BY_MEASUREMENT_TYPE[resolvedMeasurementType];
  return new Color(red, green, blue, alpha);
};

export const useCesiumPolygonAreaPrimitives = ({
  scene,
  polygonPreviewGroups,
  focusedPolygonGroupId,
}: CesiumPolygonAreaPrimitivesOptions) => {
  const primitiveCollectionRef = useRef<PrimitiveCollection | null>(null);
  const groundPrimitivesRef = useRef<GroundPrimitive[]>([]);
  const relevantGroups = useMemo(
    () => polygonPreviewGroups,
    [polygonPreviewGroups]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    if (primitiveCollectionRef.current) {
      scene.primitives.remove(primitiveCollectionRef.current);
      primitiveCollectionRef.current = null;
    }
    groundPrimitivesRef.current.forEach((groundPrimitive) => {
      scene.groundPrimitives.remove(groundPrimitive);
    });
    groundPrimitivesRef.current = [];

    if (relevantGroups.length === 0) return;

    const collection = new PrimitiveCollection();
    let hasCoplanarPolygonPrimitive = false;
    const nextGroundPrimitives: GroundPrimitive[] = [];

    for (const { group, vertexPoints } of relevantGroups) {
      if (vertexPoints.length < 3) continue;

      const geometryVertexPoints = vertexPoints.map((point) =>
        Cartesian3.clone(point)
      );
      const isSelected = group.id === focusedPolygonGroupId;
      const fillColor = getPolygonFillCesiumColor(group, isSelected);
      const isGroundSurface =
        group.measurementKind === ANNOTATION_TYPE_AREA_GROUND;

      if (isGroundSurface) {
        const groundGeometry = new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(geometryVertexPoints),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        });

        const groundInstance = new GeometryInstance({
          geometry: groundGeometry,
          id: { polygonGroupId: group.id },
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
        continue;
      }

      const anchoredCoplanarGeometry =
        createAnchoredCoplanarPolygonGeometry(geometryVertexPoints);
      if (!anchoredCoplanarGeometry) continue;

      const instance = new GeometryInstance({
        geometry: anchoredCoplanarGeometry.geometry,
        id: { polygonGroupId: group.id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      collection.add(
        new Primitive({
          geometryInstances: [instance],
          modelMatrix: anchoredCoplanarGeometry.modelMatrix,
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: false,
        })
      );
      hasCoplanarPolygonPrimitive = true;
    }

    groundPrimitivesRef.current = nextGroundPrimitives;

    if (hasCoplanarPolygonPrimitive) {
      primitiveCollectionRef.current = collection;
      scene.primitives.add(collection);
    }

    scene.requestRender();

    return () => {
      if (primitiveCollectionRef.current && !scene.isDestroyed()) {
        scene.primitives.remove(primitiveCollectionRef.current);
        primitiveCollectionRef.current = null;
      }
      groundPrimitivesRef.current.forEach((groundPrimitive) => {
        scene.groundPrimitives.remove(groundPrimitive);
      });
      groundPrimitivesRef.current = [];
      scene.requestRender();
    };
  }, [focusedPolygonGroupId, relevantGroups, scene]);
};
