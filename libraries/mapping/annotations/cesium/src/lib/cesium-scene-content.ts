import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  GroundPrimitive,
  Material,
  Matrix4 as CesiumMatrix4,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineCollection,
  Primitive,
  PrimitiveCollection,
  type Scene,
} from "@carma-cesium";
import {
  createDisc,
  createRing,
  registerCesiumSceneDragSampleExclusionResolver,
  registerCesiumScenePickExclusionResolver,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationSceneDiscOptions,
  type AnnotationSceneLineCollection,
  type AnnotationSceneLineCollectionOptions,
  type AnnotationSceneLineHandle,
  type AnnotationSceneLineOptions,
  type AnnotationSceneLineStyle,
  type AnnotationScenePolygonFill,
  type AnnotationScenePolygonFillsHandle,
  type AnnotationScenePolygonFillsOptions,
  type AnnotationScenePrimitiveHandle,
  type AnnotationSceneRingOptions,
} from "@carma-mapping/annotations/runtime";

import { cartesian3FromVector3 } from "./cesium-vector-conversions";

/** Lines, rings, discs and polygon fills of the annotations in a Cesium scene. */

const cesiumColorFromCss = (css: string): Color =>
  Color.fromCssColorString(css) ?? Color.WHITE;

const cesiumMatrixFromThree = (
  elements: ArrayLike<number>,
  out: CesiumMatrix4 = new CesiumMatrix4()
): CesiumMatrix4 => CesiumMatrix4.fromArray(Array.from(elements), 0, out);

export const createCesiumLineCollection = (
  scene: Scene,
  options: AnnotationSceneLineCollectionOptions = {}
): AnnotationSceneLineCollection => {
  const collection = new PolylineCollection();
  scene.primitives.add(collection);
  const unregisterPickExclusion = registerCesiumScenePickExclusionResolver(
    scene,
    () => [collection]
  );
  const unregisterDragSampleExclusion = options.excludeFromDragSamples
    ? registerCesiumSceneDragSampleExclusionResolver(scene, () => [collection])
    : null;
  let destroyed = false;
  const materialFor = (style: AnnotationSceneLineStyle) =>
    Material.fromType("Color", { color: cesiumColorFromCss(style.color) });
  return {
    addLine: (
      lineOptions: AnnotationSceneLineOptions
    ): AnnotationSceneLineHandle => {
      const positions = (lineOptions.positions ?? []).map((position) =>
        cartesian3FromVector3(position)
      );
      const polyline = collection.add({
        id: lineOptions.id,
        positions:
          positions.length >= 2
            ? positions
            : [Cartesian3.ZERO, Cartesian3.ZERO],
        width: lineOptions.width,
        material: materialFor(lineOptions),
        show: (lineOptions.visible ?? true) && positions.length >= 2,
      });
      let currentColor = lineOptions.color;
      return {
        id: lineOptions.id,
        setPositions: (nextPositions) => {
          if (destroyed) return;
          polyline.positions = nextPositions.map((position) =>
            cartesian3FromVector3(position)
          );
        },
        setStyle: (style) => {
          if (destroyed) return;
          if (style.color !== currentColor) {
            polyline.material = materialFor(style);
            currentColor = style.color;
          }
          polyline.width = style.width;
        },
        setVisible: (visible) => {
          if (destroyed) return;
          polyline.show = visible;
        },
        destroy: () => {
          if (destroyed) return;
          collection.remove(polyline);
        },
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unregisterPickExclusion();
      unregisterDragSampleExclusion?.();
      if (scene.isDestroyed()) return;
      try {
        if (!collection.isDestroyed()) {
          scene.primitives.remove(collection);
        }
      } catch {
        // Scene teardown can race with cleanup.
      }
    },
  };
};

const createCesiumPrimitiveHandle = (
  scene: Scene,
  primitive: Primitive
): AnnotationScenePrimitiveHandle => {
  scene.primitives.add(primitive);
  const unregisterPickExclusion = registerCesiumScenePickExclusionResolver(
    scene,
    () => [primitive]
  );
  let destroyed = false;
  return {
    setModelMatrix: (modelMatrix) => {
      if (destroyed) return;
      primitive.modelMatrix = cesiumMatrixFromThree(
        modelMatrix.elements,
        primitive.modelMatrix
      );
    },
    setVisible: (visible) => {
      if (destroyed) return;
      primitive.show = visible;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unregisterPickExclusion();
      if (scene.isDestroyed()) return;
      try {
        scene.primitives.remove(primitive);
      } catch {
        // Scene teardown can race with cleanup.
      }
    },
  };
};

export const createCesiumRing = (
  scene: Scene,
  options: AnnotationSceneRingOptions
): AnnotationScenePrimitiveHandle =>
  createCesiumPrimitiveHandle(
    scene,
    createRing(options.id, {
      radius: options.radius,
      innerRadius: options.innerRadius,
      color: cesiumColorFromCss(options.color),
      opacity: options.opacity,
      materialPreset: options.materialPreset as RingMaterialPreset | undefined,
      segments: options.segments,
      modelMatrix: cesiumMatrixFromThree(options.modelMatrix.elements),
    })
  );

export const createCesiumDisc = (
  scene: Scene,
  options: AnnotationSceneDiscOptions
): AnnotationScenePrimitiveHandle =>
  createCesiumPrimitiveHandle(
    scene,
    createDisc(options.id, {
      radius: options.radius,
      color: cesiumColorFromCss(options.color),
      opacity: options.opacity,
      materialPreset: options.materialPreset as RingMaterialPreset | undefined,
      segments: options.segments,
      modelMatrix: cesiumMatrixFromThree(options.modelMatrix.elements),
    })
  );

export const createCesiumPolygonFills = (
  scene: Scene,
  options: AnnotationScenePolygonFillsOptions = {}
): AnnotationScenePolygonFillsHandle => {
  const allowPicking = options.allowPicking ?? true;
  let groundPrimitives: GroundPrimitive[] = [];
  let coplanarCollection: PrimitiveCollection | null = null;
  let destroyed = false;
  const clearRendered = () => {
    if (scene.isDestroyed()) {
      groundPrimitives = [];
      coplanarCollection = null;
      return;
    }
    groundPrimitives.forEach((groundPrimitive) => {
      scene.groundPrimitives.remove(groundPrimitive);
    });
    groundPrimitives = [];
    if (coplanarCollection) {
      scene.primitives.remove(coplanarCollection);
    }
    coplanarCollection = null;
  };
  return {
    setPolygonFills: (polygonFills: readonly AnnotationScenePolygonFill[]) => {
      if (destroyed || scene.isDestroyed()) return;
      clearRendered();
      const nextGroundPrimitives: GroundPrimitive[] = [];
      const nextCoplanarCollection = new PrimitiveCollection();
      let hasCoplanarPrimitive = false;
      polygonFills.forEach((polygonFill) => {
        if (polygonFill.positionsECEF.length < 3) {
          return;
        }
        const fillColor = cesiumColorFromCss(polygonFill.fill);
        const positions = polygonFill.positionsECEF.map((position) =>
          cartesian3FromVector3(position)
        );
        if (
          polygonFill.placement ===
          ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND
        ) {
          const groundInstance = new GeometryInstance({
            geometry: new PolygonGeometry({
              polygonHierarchy: new PolygonHierarchy(positions),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
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
            allowPicking,
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
        const negatedAnchor = Cartesian3.negate(anchor, new Cartesian3());
        const localPositions = positions.map((position) =>
          Cartesian3.add(position, negatedAnchor, new Cartesian3())
        );
        const coplanarGeometry = CoplanarPolygonGeometry.fromPositions({
          positions: localPositions,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        if (!coplanarGeometry) {
          return;
        }
        nextCoplanarCollection.add(
          new Primitive({
            geometryInstances: [
              new GeometryInstance({
                geometry: coplanarGeometry,
                id: { polygonGroupId: polygonFill.id },
                attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(fillColor),
                },
              }),
            ],
            modelMatrix: CesiumMatrix4.fromTranslation(
              anchor,
              new CesiumMatrix4()
            ),
            appearance: new PerInstanceColorAppearance({
              flat: true,
              translucent: true,
            }),
            allowPicking,
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
    },
    clear: () => {
      if (destroyed) return;
      clearRendered();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearRendered();
    },
  };
};
