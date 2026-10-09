import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import {
  BoundingSphere,
  Cartesian2,
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
  SceneTransforms,
  defined,
  type Scene,
} from "@carma-cesium";
import {
  captureCesiumSceneProjectionSnapshot,
  createDisc,
  createRing,
  flyToBoundingSphereExtent,
  getCesiumSceneFrameKey,
  getScreenPixelsPerMeterAtWorldPoint,
  pickCesiumSceneAtPosition,
  pickCesiumSceneFromRay,
  projectCesiumScenePoint,
  registerCesiumSceneDragSampleExclusionResolver,
  registerCesiumScenePickExclusionResolver,
  resolvePreferredSurfacePick,
  sampleSurfacePickNormalAtScreenPosition,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  CESIUM_POINT_QUERY_CLICK_STRATEGY,
  clearCesiumScenePointerTracker,
  getCesiumScenePointerClientPosition,
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
  useCesiumPointQuery,
  type CesiumPointQueryOptions,
} from "@carma-mapping/engines/cesium/react/interactions";
import {
  useCesiumPointMoveGizmo,
  type CesiumGizmoPoint,
  type CesiumMoveGizmoAxisCandidate,
  type UseCesiumPointMoveGizmoOptions,
} from "@carma-mapping/gizmo/cesium";
import {
  ANNOTATION_ENGINE_KINDS,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
  type AnnotationGizmoPoint,
  type AnnotationPointMoveGizmoOptions,
  type AnnotationPointQueryOptions,
  type AnnotationProjectionSnapshot,
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
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/runtime";

import {
  cartesian2FromScreenPosition,
  cartesian3FromVector3,
  vector3FromCartesian3,
} from "./cesium-vector-conversions";

/**
 * Cesium adapter of the annotations engine contract: the behaviour the
 * annotations runtime had while it called the Cesium `Scene` directly, now
 * behind `AnnotationEngine` (cismet/carma#680). Every helper here existed
 * before the split; this file only converts between the runtime's ECEF
 * `Vector3` and Cesium's `Cartesian3` at the boundary.
 */

const SNAPSHOT_POSITION_DECIMALS = 4;
const SNAPSHOT_DIRECTION_DECIMALS = 6;

const quantize = (value: number, decimals: number) =>
  Number.isFinite(value) ? value.toFixed(decimals) : "nan";

const buildSnapshotViewKey = (
  snapshot: NonNullable<ReturnType<typeof captureCesiumSceneProjectionSnapshot>>
): string => {
  const { cameraSnapshot } = snapshot;
  const vectorKey = (vector: Cartesian3, decimals: number) =>
    [vector.x, vector.y, vector.z]
      .map((component) => quantize(component, decimals))
      .join(",");
  const projectionKey = cameraSnapshot.projectionMatrix
    ? Array.from(
        CesiumMatrix4.toArray(cameraSnapshot.projectionMatrix) as number[]
      )
        .map((element) => quantize(element, SNAPSHOT_DIRECTION_DECIMALS))
        .join(",")
    : "none";
  return [
    vectorKey(cameraSnapshot.position, SNAPSHOT_POSITION_DECIMALS),
    vectorKey(cameraSnapshot.direction, SNAPSHOT_DIRECTION_DECIMALS),
    vectorKey(cameraSnapshot.up, SNAPSHOT_DIRECTION_DECIMALS),
    quantize(cameraSnapshot.frustumFovY, SNAPSHOT_DIRECTION_DECIMALS),
    projectionKey,
  ].join("|");
};

const cesiumColorFromCss = (css: string, opacity?: number): Color => {
  const color = Color.fromCssColorString(css) ?? Color.WHITE;
  return opacity === undefined ? color : color.withAlpha(opacity);
};

const cesiumMatrixFromThree = (
  elements: ArrayLike<number>,
  out: CesiumMatrix4 = new CesiumMatrix4()
): CesiumMatrix4 => CesiumMatrix4.fromArray(Array.from(elements), 0, out);

const resolvePickedIdCandidates = (pickedObject: unknown): string[] => {
  if (typeof pickedObject !== "object" || pickedObject === null) {
    return [];
  }
  const candidates: unknown[] = [];
  const directId = (pickedObject as { id?: unknown }).id;
  candidates.push(directId);
  if (typeof directId === "object" && directId !== null) {
    candidates.push((directId as { polygonGroupId?: unknown }).polygonGroupId);
  }
  const primitive = (pickedObject as { primitive?: unknown }).primitive;
  if (typeof primitive === "object" && primitive !== null) {
    candidates.push((primitive as { id?: unknown }).id);
  }
  return candidates.filter(
    (candidate): candidate is string => typeof candidate === "string"
  );
};

const createCesiumLineCollection = (
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

const createCesiumRing = (
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

const createCesiumDisc = (
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

const createCesiumPolygonFills = (
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

const clickStrategyToCesium = (
  strategy: AnnotationPointQueryOptions["clickStrategy"]
) =>
  strategy === ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
    ? CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
    : CESIUM_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE;

const toScreenPosition = (position: Cartesian2): AnnotationScreenPosition => ({
  x: position.x,
  y: position.y,
});

const cesiumPointQueryOptions = (
  options: AnnotationPointQueryOptions
): CesiumPointQueryOptions => ({
  enabled: options.enabled,
  hideCursorWhileEnabled: options.hideCursorWhileEnabled,
  clickStrategy: clickStrategyToCesium(options.clickStrategy),
  config: options.config,
  inputModifiers: options.inputModifiers,
  // The Cesium hook asks before a pick resolved (null on a miss); the engine
  // contract only vetoes resolved picks, so a miss passes through untouched.
  onBeforePointCreate: options.onBeforePointCreate
    ? (positionECEF, screenPosition) =>
        positionECEF
          ? options.onBeforePointCreate!({
              screenPosition: toScreenPosition(screenPosition),
              pickedPositionECEF: vector3FromCartesian3(positionECEF),
              globePositionECEF: null,
            })
          : true
    : undefined,
  onPointCreate: options.onPointCreate
    ? (payload) =>
        options.onPointCreate!({
          screenPosition: toScreenPosition(payload.screenPosition),
          pickedPositionECEF: vector3FromCartesian3(payload.pickedPositionECEF),
          globePositionECEF: payload.globePositionECEF
            ? vector3FromCartesian3(payload.globePositionECEF)
            : null,
          inputModifier: payload.inputModifier,
        })
    : undefined,
  onLineFinish: options.onLineFinish,
  onPointerMove: options.onPointerMove
    ? (positionECEF, screenPosition, surfaceNormalECEF, moveOptions) =>
        options.onPointerMove!(
          positionECEF ? vector3FromCartesian3(positionECEF) : null,
          toScreenPosition(screenPosition),
          surfaceNormalECEF ? vector3FromCartesian3(surfaceNormalECEF) : null,
          moveOptions
        )
    : undefined,
  onScreenPositionChange: options.onScreenPositionChange
    ? (screenPosition) =>
        options.onScreenPositionChange!(
          screenPosition ? toScreenPosition(screenPosition) : null
        )
    : undefined,
});

/**
 * Converted gizmo inputs keep their identity while their source values keep
 * theirs, so the Cesium gizmo effects do not restart on every render.
 */
const createGizmoInputCache = () => {
  const pointsCache = new WeakMap<
    AnnotationGizmoPoint[],
    { source: AnnotationGizmoPoint[]; converted: CesiumGizmoPoint[] }
  >();
  const vectorCache = new WeakMap<
    Vector3,
    { key: string; converted: Cartesian3 }
  >();
  const candidatesCache = new WeakMap<
    AnnotationGizmoAxisCandidate[],
    CesiumMoveGizmoAxisCandidate[]
  >();
  const vectorKey = (vector: Vector3) => `${vector.x},${vector.y},${vector.z}`;
  const convertVector = (
    vector: Vector3 | null | undefined
  ): Cartesian3 | null => {
    if (!vector) return null;
    const cached = vectorCache.get(vector);
    const key = vectorKey(vector);
    if (cached && cached.key === key) return cached.converted;
    const converted = cartesian3FromVector3(vector);
    vectorCache.set(vector, { key, converted });
    return converted;
  };
  const convertPoints = (points: AnnotationGizmoPoint[]) => {
    const cached = pointsCache.get(points);
    if (cached) return cached.converted;
    const converted = points.map((point) => ({
      id: point.id,
      geometryECEF: cartesian3FromVector3(point.geometryECEF),
    }));
    pointsCache.set(points, { source: points, converted });
    return converted;
  };
  const convertCandidates = (
    candidates: AnnotationGizmoAxisCandidate[] | null | undefined
  ): CesiumMoveGizmoAxisCandidate[] | null => {
    if (!candidates) return null;
    const cached = candidatesCache.get(candidates);
    if (cached) return cached;
    const converted = candidates.map((candidate) => ({
      id: candidate.id,
      direction: cartesian3FromVector3(candidate.direction),
      color: candidate.color,
      title: candidate.title,
    }));
    candidatesCache.set(candidates, converted);
    return converted;
  };
  return { convertVector, convertPoints, convertCandidates };
};

const cesiumGizmoOptions = (
  options: AnnotationPointMoveGizmoOptions,
  cache: ReturnType<typeof createGizmoInputCache>
): UseCesiumPointMoveGizmoOptions => ({
  points: cache.convertPoints(options.points),
  labels: options.labels,
  movePointId: options.movePointId,
  axisDirection: cache.convertVector(options.axisDirection),
  discPlaneNormal: cache.convertVector(options.discPlaneNormal),
  axisTitle: options.axisTitle,
  preferredAxisId: options.preferredAxisId,
  axisCandidates: cache.convertCandidates(options.axisCandidates),
  showRotationHandle: options.showRotationHandle,
  showDisc: options.showDisc,
  discScalingMode: options.discScalingMode,
  discOutlineScreenPixelRadius: options.discOutlineScreenPixelRadius,
  discResizeWorldRadiusToScreenTarget:
    options.discResizeWorldRadiusToScreenTarget,
  discQuantizeWorldRadius: options.discQuantizeWorldRadius,
  freezeDiscScaleDuringDrag: options.freezeDiscScaleDuringDrag,
  discResizeStepFactor: options.discResizeStepFactor,
  showDiscRadiusLabel: options.showDiscRadiusLabel,
  axisWidthPx: options.axisWidthPx,
  outlineWidthPx: options.outlineWidthPx,
  arrowActiveEdgePx: options.arrowActiveEdgePx,
  arrowInactiveEdgePx: options.arrowInactiveEdgePx,
  snapPlaneDragToGround: options.snapPlaneDragToGround,
  excludeRegisteredDragSampleOccluders:
    options.excludeRegisteredDragSampleOccluders,
  radius: options.radius,
  onPointPositionChange: options.onPointPositionChange
    ? (pointId, nextPosition, screenPosition) =>
        options.onPointPositionChange!(
          pointId,
          vector3FromCartesian3(nextPosition),
          screenPosition
        )
    : undefined,
  onDragStateChange: options.onDragStateChange,
  onAxisDirectionChange: options.onAxisDirectionChange
    ? (axisDirection, axisTitle) =>
        options.onAxisDirectionChange!(
          vector3FromCartesian3(axisDirection),
          axisTitle
        )
    : undefined,
  onRotationDelta: options.onRotationDelta
    ? (delta) =>
        options.onRotationDelta!({
          pointId: delta.pointId,
          axisOrigin: vector3FromCartesian3(delta.axisOrigin),
          rotationNormal: vector3FromCartesian3(delta.rotationNormal),
          deltaAngleRad: delta.deltaAngleRad,
          accumulatedAngleRad: delta.accumulatedAngleRad,
        })
    : undefined,
  onExit: options.onExit,
});

export const createCesiumAnnotationEngine = (
  scene: Scene
): AnnotationEngine => {
  const screenScratch = new Cartesian2();
  const worldScratch = new Cartesian3();
  const gizmoInputCache = createGizmoInputCache();
  let disposed = false;
  const isDestroyed = () => disposed || scene.isDestroyed();

  const worldToScreen: AnnotationEngine["worldToScreen"] = (
    positionECEF,
    out
  ) => {
    if (isDestroyed()) return null;
    const projected = SceneTransforms.worldToWindowCoordinates(
      scene,
      cartesian3FromVector3(positionECEF, worldScratch),
      screenScratch
    );
    if (!defined(projected)) return null;
    if (out) {
      out.x = projected.x;
      out.y = projected.y;
      return out;
    }
    return { x: projected.x, y: projected.y };
  };

  return {
    kind: ANNOTATION_ENGINE_KINDS.CESIUM,
    capabilities: { occludedLinesInScene: false },
    canvas: scene.canvas,
    getOverlayContainer: () => scene.canvas.parentElement,
    isDestroyed,
    requestRender: () => {
      if (!isDestroyed()) scene.requestRender();
    },
    subscribePreRender: (listener) =>
      isDestroyed()
        ? () => undefined
        : scene.preRender.addEventListener(listener),
    subscribePostRender: (listener) =>
      isDestroyed()
        ? () => undefined
        : scene.postRender.addEventListener(listener),
    subscribeCameraMove: ({ onMoveStart, onMoveEnd }) => {
      if (isDestroyed()) return () => undefined;
      const removeStart = onMoveStart
        ? scene.camera.moveStart.addEventListener(onMoveStart)
        : null;
      const removeEnd = onMoveEnd
        ? scene.camera.moveEnd.addEventListener(onMoveEnd)
        : null;
      return () => {
        removeStart?.();
        removeEnd?.();
      };
    },
    getFrameKey: () => (isDestroyed() ? null : getCesiumSceneFrameKey(scene)),
    captureProjectionSnapshot: (): AnnotationProjectionSnapshot | null => {
      if (isDestroyed()) return null;
      const snapshot = captureCesiumSceneProjectionSnapshot(scene);
      return snapshot
        ? {
            viewportWidth: snapshot.viewportWidth,
            viewportHeight: snapshot.viewportHeight,
            viewKey: buildSnapshotViewKey(snapshot),
          }
        : null;
    },
    getCameraPositionECEF: (out) =>
      isDestroyed()
        ? null
        : vector3FromCartesian3(scene.camera.positionWC, out),
    getCameraPitchRad: () =>
      isDestroyed() || typeof scene.camera.pitch !== "number"
        ? 0
        : scene.camera.pitch,
    worldToScreen,
    projectPoint: (positionECEF, options) => {
      const state = projectCesiumScenePoint(
        isDestroyed() ? null : scene,
        cartesian3FromVector3(positionECEF),
        options
      );
      return {
        screenPosition: state.screenPosition,
        isInViewport: state.isInViewport,
        isHidden: state.isHidden,
        isOccluded: state.isOccluded,
      };
    },
    getPickRay: (screenPosition) => {
      if (isDestroyed()) return null;
      const ray = scene.camera.getPickRay(
        cartesian2FromScreenPosition(screenPosition)
      );
      return ray
        ? {
            origin: vector3FromCartesian3(ray.origin),
            direction: vector3FromCartesian3(ray.direction),
          }
        : null;
    },
    getScreenPixelsPerMeterAt: (positionECEF) =>
      isDestroyed()
        ? 0
        : getScreenPixelsPerMeterAtWorldPoint(
            scene,
            cartesian3FromVector3(positionECEF)
          ),
    resolveSurfacePick: (screenPosition, options) => {
      if (isDestroyed()) {
        return { surfacePositionECEF: null, globePositionECEF: null };
      }
      if (options?.excludeDragSampleOccluders) {
        const ray = scene.camera.getPickRay(
          cartesian2FromScreenPosition(screenPosition)
        );
        const rayPick = ray
          ? pickCesiumSceneFromRay(scene, ray, {
              includeDragSampleExclusions: true,
            })
          : undefined;
        const surfacePositionECEF = rayPick?.position
          ? vector3FromCartesian3(rayPick.position)
          : null;
        if (!options.resolveGlobePosition) {
          return { surfacePositionECEF, globePositionECEF: null };
        }
        const globePick = resolvePreferredSurfacePick(
          scene,
          cartesian2FromScreenPosition(screenPosition),
          { resolveGlobePosition: true }
        );
        return {
          surfacePositionECEF,
          globePositionECEF: globePick.globePositionECEF
            ? vector3FromCartesian3(globePick.globePositionECEF)
            : null,
        };
      }
      const pick = resolvePreferredSurfacePick(
        scene,
        cartesian2FromScreenPosition(screenPosition),
        options
      );
      return {
        surfacePositionECEF: pick.surfacePositionECEF
          ? vector3FromCartesian3(pick.surfacePositionECEF)
          : null,
        globePositionECEF: pick.globePositionECEF
          ? vector3FromCartesian3(pick.globePositionECEF)
          : null,
      };
    },
    sampleSurfaceNormalAt: (screenPosition, centerECEF) => {
      if (isDestroyed()) return null;
      const normal = sampleSurfacePickNormalAtScreenPosition(
        scene,
        cartesian2FromScreenPosition(screenPosition),
        cartesian3FromVector3(centerECEF)
      );
      return normal ? vector3FromCartesian3(normal) : null;
    },
    pickAnnotationIdsAt: (screenPosition) =>
      isDestroyed()
        ? []
        : resolvePickedIdCandidates(
            pickCesiumSceneAtPosition(
              scene,
              cartesian2FromScreenPosition(screenPosition)
            )
          ),
    flyToPoints: (pointsECEF, options) => {
      if (isDestroyed() || pointsECEF.length === 0) return;
      const sphere = BoundingSphere.fromPoints(
        pointsECEF.map((point) => cartesian3FromVector3(point))
      );
      sphere.radius = Math.max(sphere.radius, options.minRadiusMeters);
      flyToBoundingSphereExtent(scene.camera, sphere, {
        minRange: options.minRadiusMeters,
        paddingFactor: options.paddingFactor,
      });
    },
    pointer: {
      register: () =>
        isDestroyed()
          ? () => undefined
          : registerCesiumScenePointerTracker(scene),
      getScreenPosition: () => {
        if (isDestroyed()) return null;
        const position = getCesiumScenePointerScreenPosition(scene);
        return position ? toScreenPosition(position) : null;
      },
      getClientPosition: () =>
        isDestroyed() ? null : getCesiumScenePointerClientPosition(scene),
      subscribeClientPosition: (listener) =>
        isDestroyed()
          ? () => undefined
          : subscribeCesiumScenePointerClientPosition(scene, listener),
      clear: () => {
        if (!isDestroyed()) clearCesiumScenePointerTracker(scene);
      },
    },
    createLineCollection: (options) =>
      createCesiumLineCollection(scene, options),
    createRing: (options) => createCesiumRing(scene, options),
    createDisc: (options) => createCesiumDisc(scene, options),
    createPolygonFills: (options) => createCesiumPolygonFills(scene, options),
    hooks: {
      usePointQuery: (options) =>
        useCesiumPointQuery(
          isDestroyed() ? null : scene,
          cesiumPointQueryOptions(options)
        ),
      usePointMoveGizmo: (options) =>
        useCesiumPointMoveGizmo(
          isDestroyed() ? null : scene,
          cesiumGizmoOptions(options, gizmoInputCache)
        ),
    },
    dispose: () => {
      disposed = true;
    },
  };
};

/** One engine per scene instance, disposed when the scene changes or unmounts. */
export const useCesiumAnnotationEngine = (
  scene: Scene | null
): AnnotationEngine | null => {
  const engine = useMemo(
    () =>
      scene && !scene.isDestroyed()
        ? createCesiumAnnotationEngine(scene)
        : null,
    [scene]
  );
  useEffect(() => () => engine?.dispose(), [engine]);
  return engine;
};
