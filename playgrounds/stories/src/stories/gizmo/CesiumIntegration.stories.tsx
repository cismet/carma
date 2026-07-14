import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "@storybook/test";

import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import { registerCesiumSceneDragSampleExclusionResolver } from "@carma-mapping/engines/cesium/core";
import {
  useCesiumPointMoveGizmo,
  useCesiumPointMoveGizmoConnector,
  getGroundPointFromClientPosition,
  type CesiumGizmoRotationDelta,
  type CesiumMoveGizmoAxisCandidate,
} from "@carma-mapping/gizmo/cesium";
import {
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";
import {
  createPointQueryIndicatorController,
  type PointQueryIndicatorController,
} from "@carma-mapping/annotations/runtime";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { WUPPERTAL } from "@carma-commons/resources";
import {
  Cartesian3,
  Cartesian4,
  Cartographic,
  CesiumMath,
  Color,
  HeadingPitchRange,
  Material,
  Matrix3,
  Matrix4,
  PolylineCollection,
  Quaternion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  type CesiumWidget,
  type Scene,
} from "@carma-cesium";

import { setupCesium } from "../map-engine-switcher/helpers/cesium-setup";
import {
  buildCubeLocalCorners,
  createCubePrimitiveVisuals,
  getCubePickTargetFromPickedObject,
  resolveCubeAnchorLocalForPickTarget,
  type CubePickTarget,
  type CubePrimitiveVisuals,
} from "./cubePrimitives";

import "cesium/Build/Cesium/Widgets/widgets.css";
if (typeof window !== "undefined") {
  (window as any).__CARMA_DEBUG_AXIS_VISUALIZER__ = true;
}

type AxisMode = "geoportal-default" | "enu" | "up-only" | "world";

type ReferenceObject = "gizmo" | "query-disc";

const STORY_POINT_MOVE_GIZMO_LABELS = {
  verticalAxis: "Move point along the up axis",
  eastAxis: "Move point along the east axis",
  northAxis: "Move point along the north axis",
  genericAxis: "Move point along the axis",
  outerDisc: "Move point on the height plane",
  surfacePlane: "Move point on the surface",
  freePlane: "Move point in the plane",
} as const;

type GizmoSandboxProps = {
  referenceObject: ReferenceObject;
  pointLon: number;
  pointLat: number;
  pointHeight: number;
  radius: number;
  showRotationHandle: boolean;
  showDisc: boolean;
  showCube: boolean;
  showDragSampleOccluder: boolean;
  excludeRegisteredDragSampleOccluders: boolean;
  snapPlaneDragToGround: boolean;
  discScalingMode: ReferenceObjectScalingMode;
  discOutlineScreenPixelRadius: number;
  discResizeWorldRadiusToScreenTarget: boolean;
  discQuantizeWorldRadius: boolean;
  freezeDiscScaleDuringDrag: boolean;
  // Permissible apparent-size band before the disc re-steps: [1/factor, factor]
  // (4 → 0.25×–4×). Applies when world-radius resizing is enabled.
  discResizeStepFactor: number;
  showDiscRadiusLabel: boolean;
  axisWidthPx?: number;
  arrowActiveEdgePx: number;
  arrowInactiveEdgePx: number;
  axisMode: AxisMode;
  preferredAxisId: string;
  axisTitle: string;
};

type CubeState = {
  centerWorld: Cartesian3;
  orientation: Quaternion;
  anchorLocal: Cartesian3;
  selectedTarget: CubePickTarget | null;
};

const CUBE_HALF_SIZE_M = 10;
const ROTATION_DELTA_EPSILON = 1e-7;
// Centre of the Barmen plaza, taken from the WUPPERTAL position preset in the
// resources lib. The preset's nominal altitude is not the real surface; ground
// there is ~162.6 m, so the anchor sits 5 m above ground (the cube extends
// ±CUBE_HALF_SIZE_M around it).
const PLACE_CENTER_GROUND_HEIGHT_M = 162.6;
const PLACE_CENTER = {
  longitude: WUPPERTAL.position.longitude,
  latitude: WUPPERTAL.position.latitude,
  height: PLACE_CENTER_GROUND_HEIGHT_M + 5,
} as const;

const buildEnuCandidates = (
  origin: Cartesian3,
  axisTitle: string
): CesiumMoveGizmoAxisCandidate[] => {
  const enu = Transforms.eastNorthUpToFixedFrame(origin);
  const east4 = Matrix4.getColumn(enu, 0, new Cartesian4());
  const north4 = Matrix4.getColumn(enu, 1, new Cartesian4());
  const up4 = Matrix4.getColumn(enu, 2, new Cartesian4());

  return [
    {
      id: "east",
      direction: Cartesian3.normalize(
        new Cartesian3(east4.x, east4.y, east4.z),
        new Cartesian3()
      ),
      color: "rgba(239, 68, 68, 0.98)",
      title: "Move along ENU east axis",
    },
    {
      id: "north",
      direction: Cartesian3.normalize(
        new Cartesian3(north4.x, north4.y, north4.z),
        new Cartesian3()
      ),
      color: "rgba(34, 197, 94, 0.98)",
      title: "Move along ENU north axis",
    },
    {
      id: "up",
      direction: Cartesian3.normalize(
        new Cartesian3(up4.x, up4.y, up4.z),
        new Cartesian3()
      ),
      color: "rgba(59, 130, 246, 0.98)",
      title: axisTitle,
    },
  ];
};

const buildCandidates = (
  mode: AxisMode,
  origin: Cartesian3,
  axisTitle: string
): CesiumMoveGizmoAxisCandidate[] => {
  if (mode === "geoportal-default") {
    return [];
  }

  if (mode === "up-only") {
    const up = buildEnuCandidates(origin, axisTitle)[2];
    return [up];
  }

  if (mode === "world") {
    return [
      {
        id: "world-z",
        direction: Cartesian3.UNIT_Z,
        color: "rgba(59, 130, 246, 0.98)",
        title: axisTitle,
      },
      {
        id: "world-x",
        direction: Cartesian3.UNIT_X,
        color: "rgba(239, 68, 68, 0.98)",
        title: "Move along world X",
      },
      {
        id: "world-y",
        direction: Cartesian3.UNIT_Y,
        color: "rgba(34, 197, 94, 0.98)",
        title: "Move along world Y",
      },
    ];
  }

  return buildEnuCandidates(origin, axisTitle);
};

const getInitialAxisDirectionForMode = (
  mode: AxisMode,
  origin: Cartesian3,
  axisTitle: string
): Cartesian3 | null => {
  if (mode === "geoportal-default") return null;
  if (mode === "world") return Cartesian3.clone(Cartesian3.UNIT_Z);

  const up = buildEnuCandidates(origin, axisTitle)[2]?.direction;
  return up ? Cartesian3.clone(up) : null;
};

const getEnuOrientationAtWorldPosition = (
  centerWorld: Cartesian3
): Quaternion => {
  const enuFrame = Transforms.eastNorthUpToFixedFrame(centerWorld);
  const enuRotation = Matrix4.getMatrix3(enuFrame, new Matrix3());
  return Quaternion.normalize(
    Quaternion.fromRotationMatrix(enuRotation, new Quaternion()),
    new Quaternion()
  );
};

const createInitialCubeState = (centerWorld: Cartesian3): CubeState => ({
  centerWorld: Cartesian3.clone(centerWorld),
  orientation: getEnuOrientationAtWorldPosition(centerWorld),
  anchorLocal: new Cartesian3(0, 0, 0),
  selectedTarget: null,
});

const getCubeModelMatrix = (
  centerWorld: Cartesian3,
  orientation: Quaternion
): Matrix4 => {
  const rotationMatrix = Matrix3.fromQuaternion(orientation, new Matrix3());
  return Matrix4.fromRotationTranslation(
    rotationMatrix,
    centerWorld,
    new Matrix4()
  );
};

const getCubeAnchorWorld = (
  cubeState: Pick<CubeState, "centerWorld" | "orientation" | "anchorLocal">
): Cartesian3 => {
  const modelMatrix = getCubeModelMatrix(
    cubeState.centerWorld,
    cubeState.orientation
  );
  return Matrix4.multiplyByPoint(
    modelMatrix,
    cubeState.anchorLocal,
    new Cartesian3()
  );
};

const GizmoSandboxContent = ({
  scene,
  onSceneChange,
  rootRef,
  referenceObject,
  pointLon,
  pointLat,
  pointHeight,
  radius,
  showRotationHandle,
  showDisc,
  showCube,
  showDragSampleOccluder,
  excludeRegisteredDragSampleOccluders,
  snapPlaneDragToGround,
  discScalingMode,
  discOutlineScreenPixelRadius,
  discResizeWorldRadiusToScreenTarget,
  discQuantizeWorldRadius,
  freezeDiscScaleDuringDrag,
  discResizeStepFactor,
  showDiscRadiusLabel,
  axisWidthPx,
  arrowActiveEdgePx,
  arrowInactiveEdgePx,
  axisMode,
  preferredAxisId,
  axisTitle,
}: GizmoSandboxProps & {
  scene: Scene | null;
  onSceneChange: (scene: Scene | null) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const cubeVisualsRef = useRef<CubePrimitiveVisuals | null>(null);

  const initialCubeCenter = useMemo(
    () => Cartesian3.fromDegrees(pointLon, pointLat, pointHeight),
    [pointLon, pointLat, pointHeight]
  );

  const localCorners = useMemo(
    () => buildCubeLocalCorners(CUBE_HALF_SIZE_M),
    []
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showDragSampleOccluder) {
      return;
    }

    const localFrame = Transforms.eastNorthUpToFixedFrame(initialCubeCenter);
    const occluderLine = new PolylineCollection();
    occluderLine.add({
      id: "surface-pick-own-measurement-line",
      positions: [
        Matrix4.multiplyByPoint(
          localFrame,
          new Cartesian3(0, -35, 0),
          new Cartesian3()
        ),
        Matrix4.multiplyByPoint(
          localFrame,
          new Cartesian3(0, 35, 0),
          new Cartesian3()
        ),
      ],
      width: 24,
      material: Material.fromType("Color", {
        color: Color.fromCssColorString("rgba(239, 68, 68, 0.96)"),
      }),
    });
    scene.primitives.add(occluderLine);
    const unregisterOccluder = registerCesiumSceneDragSampleExclusionResolver(
      scene,
      () => [occluderLine]
    );
    scene.requestRender();

    return () => {
      unregisterOccluder();
      if (!scene.isDestroyed()) {
        scene.primitives.remove(occluderLine);
        scene.requestRender();
      }
    };
  }, [initialCubeCenter, scene, showDragSampleOccluder]);

  const [cubeState, setCubeState] = useState<CubeState>(() =>
    createInitialCubeState(initialCubeCenter)
  );

  const handleAnchorPositionChange = useCallback(
    (_pointId: string, nextAnchorWorld: Cartesian3) => {
      setCubeState((previous) => {
        const previousAnchorWorld = getCubeAnchorWorld(previous);
        const translationDelta = Cartesian3.subtract(
          nextAnchorWorld,
          previousAnchorWorld,
          new Cartesian3()
        );
        return {
          ...previous,
          centerWorld: Cartesian3.add(
            previous.centerWorld,
            translationDelta,
            new Cartesian3()
          ),
        };
      });
    },
    []
  );

  const {
    pointPosition,
    setPointPosition,
    dragging,
    activeAxisDirection: activeAxis,
    gizmoBinding,
  } = useCesiumPointMoveGizmoConnector({
    initialPoint: initialCubeCenter,
    movePointId: "cube-anchor",
    onPointPositionChange: handleAnchorPositionChange,
  });

  useEffect(() => {
    const nextState = createInitialCubeState(initialCubeCenter);
    setCubeState(nextState);
    setPointPosition(getCubeAnchorWorld(nextState));
    scene?.requestRender();
  }, [initialCubeCenter, scene, setPointPosition]);

  const cubeModelMatrix = useMemo(
    () => getCubeModelMatrix(cubeState.centerWorld, cubeState.orientation),
    [cubeState.centerWorld, cubeState.orientation]
  );

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    let mounted = true;

    const initialize = async () => {
      const result = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement,
        {
          // Physical-pixel (DPR) resolution like the geoportal widget, so the
          // disc/gizmo render sharp instead of blurry.
          useBrowserRecommendedResolution: false,
        }
      );
      if (!mounted) {
        try {
          if (!result.widget.isDestroyed()) {
            result.widget.destroy();
          }
        } catch {
          // Ignore teardown races when initialization resolves after unmount.
        }
        return;
      }

      const widget = result.widget;
      widgetRef.current = widget;
      onSceneChange(widget.scene);

      setPointPosition(initialCubeCenter);

      // Frame the cube wherever it sits (the default camera is over the city
      // centre); release the look-at frame afterwards so free orbit still works.
      widget.camera.lookAt(
        initialCubeCenter,
        new HeadingPitchRange(
          CesiumMath.toRadians(20),
          CesiumMath.toRadians(-30),
          90
        )
      );
      widget.camera.lookAtTransform(Matrix4.IDENTITY);

      widget.scene.requestRender();
    };

    void initialize();

    return () => {
      mounted = false;
      if (cubeVisualsRef.current) {
        cubeVisualsRef.current.destroy();
        cubeVisualsRef.current = null;
      }
      if (widgetRef.current) {
        try {
          if (!widgetRef.current.isDestroyed()) {
            widgetRef.current.destroy();
          }
        } catch {
          // Ignore teardown races.
        }
      }
      widgetRef.current = null;
      onSceneChange(null);
    };
  }, [initialCubeCenter, onSceneChange, setPointPosition]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showCube) {
      if (cubeVisualsRef.current) {
        cubeVisualsRef.current.destroy();
        cubeVisualsRef.current = null;
        scene?.requestRender();
      }
      return;
    }

    const visuals = createCubePrimitiveVisuals(scene, localCorners);
    cubeVisualsRef.current = visuals;

    visuals.setTransform(cubeModelMatrix);
    visuals.setSelection(cubeState.selectedTarget);
    scene.requestRender();

    return () => {
      visuals.destroy();
      if (cubeVisualsRef.current === visuals) {
        cubeVisualsRef.current = null;
      }
    };
  }, [localCorners, scene, showCube]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const visuals = cubeVisualsRef.current;
    if (!visuals) return;

    visuals.setTransform(cubeModelMatrix);
    scene.requestRender();
  }, [cubeModelMatrix, scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const visuals = cubeVisualsRef.current;
    if (!visuals) return;

    visuals.setSelection(cubeState.selectedTarget);
    scene.requestRender();
  }, [cubeState.selectedTarget, scene]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(
      (movement: { position?: { x: number; y: number } }) => {
        if (dragging || !movement.position) return;

        const pickedObject = scene.pick(movement.position);
        const target = getCubePickTargetFromPickedObject(pickedObject);
        if (!target) return;

        let nextAnchorWorld: Cartesian3 | null = null;

        setCubeState((previous) => {
          const nextAnchorLocal = resolveCubeAnchorLocalForPickTarget(
            target,
            localCorners
          );
          const cubeModelMatrixAtPick = getCubeModelMatrix(
            previous.centerWorld,
            previous.orientation
          );

          nextAnchorWorld = Matrix4.multiplyByPoint(
            cubeModelMatrixAtPick,
            nextAnchorLocal,
            new Cartesian3()
          );

          return {
            ...previous,
            anchorLocal: nextAnchorLocal,
            selectedTarget: target,
          };
        });

        if (nextAnchorWorld) {
          setPointPosition(nextAnchorWorld);
        }

        scene.requestRender();
      },
      ScreenSpaceEventType.LEFT_DOWN
    );

    return () => {
      handler.destroy();
    };
  }, [dragging, localCorners, scene, setPointPosition]);

  const handleRotationDelta = useCallback((delta: CesiumGizmoRotationDelta) => {
    if (Math.abs(delta.deltaAngleRad) <= ROTATION_DELTA_EPSILON) {
      return;
    }

    setCubeState((previous) => {
      const normalizedAxis = Cartesian3.normalize(
        delta.rotationNormal,
        new Cartesian3()
      );
      const stepRotation = Quaternion.fromAxisAngle(
        normalizedAxis,
        delta.deltaAngleRad,
        new Quaternion()
      );

      const centerOffset = Cartesian3.subtract(
        previous.centerWorld,
        delta.axisOrigin,
        new Cartesian3()
      );
      const stepRotationMatrix = Matrix3.fromQuaternion(
        stepRotation,
        new Matrix3()
      );
      const rotatedOffset = Matrix3.multiplyByVector(
        stepRotationMatrix,
        centerOffset,
        new Cartesian3()
      );
      const nextCenterWorld = Cartesian3.add(
        delta.axisOrigin,
        rotatedOffset,
        new Cartesian3()
      );

      const nextOrientation = Quaternion.normalize(
        Quaternion.multiply(
          stepRotation,
          previous.orientation,
          new Quaternion()
        ),
        new Quaternion()
      );

      return {
        ...previous,
        centerWorld: nextCenterWorld,
        orientation: nextOrientation,
      };
    });
  }, []);

  const axisCandidates = useMemo(
    () => buildCandidates(axisMode, pointPosition, axisTitle),
    [axisMode, axisTitle, pointPosition]
  );

  const axisCandidatesForHook =
    axisMode === "geoportal-default" ? null : axisCandidates;
  const axisTitleForHook = axisMode === "geoportal-default" ? null : axisTitle;
  const initialAxisDirection = useMemo(
    () =>
      getInitialAxisDirectionForMode(axisMode, initialCubeCenter, axisTitle),
    [axisMode, axisTitle, initialCubeCenter]
  );
  const axisDirectionForHook =
    axisMode === "geoportal-default" || activeAxis
      ? null
      : initialAxisDirection;

  useCesiumPointMoveGizmo(scene, {
    ...gizmoBinding,
    labels: STORY_POINT_MOVE_GIZMO_LABELS,
    axisTitle: axisTitleForHook,
    preferredAxisId:
      preferredAxisId.trim().toLowerCase() === "auto"
        ? null
        : preferredAxisId.trim(),
    axisCandidates: axisCandidatesForHook,
    axisDirection: axisDirectionForHook,
    onRotationDelta: handleRotationDelta,
    // In query-disc mode the point-query indicator draws the reference disc, so
    // hide the gizmo's own disc (the gizmo still anchors/moves the point).
    showDisc: showDisc && referenceObject === "gizmo",
    showRotationHandle,
    snapPlaneDragToGround,
    excludeRegisteredDragSampleOccluders,
    discScalingMode,
    discOutlineScreenPixelRadius,
    discResizeWorldRadiusToScreenTarget,
    discQuantizeWorldRadius,
    freezeDiscScaleDuringDrag,
    discResizeStepFactor,
    showDiscRadiusLabel,
    axisWidthPx,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    radius,
  });

  // Query-disc reference object: the actual point-query indicator controller,
  // locked to the gizmo point and fed the same sizing options as the gizmo.
  const queryControllerRef = useRef<PointQueryIndicatorController | null>(null);
  useEffect(() => {
    if (!scene || scene.isDestroyed() || referenceObject !== "query-disc") {
      queryControllerRef.current?.destroy();
      queryControllerRef.current = null;
      return;
    }
    const controller = createPointQueryIndicatorController(scene, {
      radius,
      scalingMode: discScalingMode,
      resizeWorldRadiusToScreenTarget: discResizeWorldRadiusToScreenTarget,
      discResizeStepFactor,
      quantizeStepWorldRadius: discQuantizeWorldRadius,
      targetScreenRadiusCssPx: discOutlineScreenPixelRadius,
      showNormalLine: false,
    });
    queryControllerRef.current = controller;
    controller.setEnabled(true);
    return () => {
      controller.destroy();
      queryControllerRef.current = null;
    };
  }, [
    scene,
    referenceObject,
    radius,
    discScalingMode,
    discResizeWorldRadiusToScreenTarget,
    discResizeStepFactor,
    discQuantizeWorldRadius,
    discOutlineScreenPixelRadius,
  ]);

  useEffect(() => {
    const controller = queryControllerRef.current;
    if (!controller || referenceObject !== "query-disc") {
      return;
    }
    controller.setPreview({
      pointECEF: pointPosition,
      lockToPreviewPoint: true,
    });
    scene?.requestRender();
  }, [pointPosition, referenceObject, scene]);

  return (
    <div
      ref={rootRef}
      data-test-id="gizmo-sandbox"
      data-point-height-m={Cartographic.fromCartesian(
        pointPosition
      ).height.toFixed(3)}
      style={{
        height: "100vh",
        width: "100%",
        position: "relative",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          height: "100%",
          overflow: "hidden",
        }}
      />
      <button
        data-test-id="surface-pick-test-trigger"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {
          if (!scene || scene.isDestroyed()) {
            return;
          }
          const pointScreenPosition =
            scene.cartesianToCanvasCoordinates(pointPosition);
          if (!pointScreenPosition) {
            return;
          }
          const canvasRect = scene.canvas.getBoundingClientRect();
          const sampleDeltaPx = referenceObject === "gizmo" ? 30 : 1;
          const sampledPoint = getGroundPointFromClientPosition(
            scene,
            canvasRect.left + pointScreenPosition.x + sampleDeltaPx,
            canvasRect.top + pointScreenPosition.y,
            {
              ignoreTranslucentDepth: true,
              includeDragSampleExclusions: excludeRegisteredDragSampleOccluders,
            }
          );
          if (sampledPoint) {
            setPointPosition(sampledPoint);
          }
        }}
        style={{ display: "none" }}
      />
      {showDragSampleOccluder ? (
        <div
          data-test-id="surface-pick-exclusion-status"
          data-point-height-m={Cartographic.fromCartesian(
            pointPosition
          ).height.toFixed(3)}
          data-own-geometry-excluded={`${excludeRegisteredDragSampleOccluders}`}
          style={{
            position: "fixed",
            left: 12,
            bottom: 12,
            zIndex: 4000,
            padding: "6px 9px",
            background: "rgba(17, 24, 39, 0.86)",
            color: "#e5e7eb",
            font: "12px/1.4 Inter, system-ui, sans-serif",
            pointerEvents: "none",
          }}
        >
          Mittleren Griff auf der roten Eigengeometrie ziehen · Höhe{" "}
          {Cartographic.fromCartesian(pointPosition).height.toFixed(2)} m ·{" "}
          Eigengeometrie{" "}
          {excludeRegisteredDragSampleOccluders ? "ausgeschlossen" : "pickbar"}
        </div>
      ) : null}
    </div>
  );
};

// Resolution/status bar, like the other Cesium stories. Lives in screen space;
// all sizing/scaling is driven by the Storybook controls (no in-canvas panel
// that would clash with them).
const STATUS_BAR_STYLE: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 4000,
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  padding: "6px 12px",
  background: "rgba(17, 24, 39, 0.86)",
  color: "#e5e7eb",
  font: "12px/1.4 Inter, system-ui, sans-serif",
  pointerEvents: "none",
  userSelect: "none",
};

const GizmoStoryStatusBar = ({
  scene,
  referenceObject,
  scaling,
}: {
  scene: Scene | null;
  referenceObject: ReferenceObject;
  scaling: string;
}) => {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const intervalId = window.setInterval(
      () => forceUpdate((value) => value + 1),
      250
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const bufferWidth = scene?.drawingBufferWidth ?? 0;
  const bufferHeight = scene?.drawingBufferHeight ?? 0;
  const cssWidth = scene?.canvas?.clientWidth ?? 0;
  const cssHeight = scene?.canvas?.clientHeight ?? 0;

  return (
    <div style={STATUS_BAR_STYLE}>
      <span>physical pixels (DPR {dpr})</span>
      <span>
        buffer {bufferWidth}×{bufferHeight}
      </span>
      <span>
        css {cssWidth}×{cssHeight}
      </span>
      <span>object: {referenceObject}</span>
      <span>scaling: {scaling}</span>
    </div>
  );
};

const GizmoSandbox = (props: GizmoSandboxProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });

  return (
    <LabelOverlayProvider host={overlayHost}>
      <GizmoSandboxContent
        {...props}
        scene={scene}
        onSceneChange={setScene}
        rootRef={rootRef}
      />
      <GizmoStoryStatusBar
        scene={scene}
        referenceObject={props.referenceObject}
        scaling={
          props.discScalingMode === REFERENCE_OBJECT_SCALING_MODES.SCREEN
            ? "screen"
            : props.discResizeWorldRadiusToScreenTarget
            ? `world, adaptive range (${1 / props.discResizeStepFactor}×–${
                props.discResizeStepFactor
              }×)`
            : "world"
        }
      />
    </LabelOverlayProvider>
  );
};

const meta: Meta<GizmoSandboxProps> = {
  title: "Mapping Components/Gizmo",
  component: GizmoSandbox,
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
  },
  argTypes: {
    pointLon: {
      control: { type: "number" },
      table: { category: "Position" },
    },
    pointLat: {
      control: { type: "number" },
      table: { category: "Position" },
    },
    pointHeight: {
      control: { type: "number" },
      table: { category: "Position" },
    },
    radius: {
      control: { type: "range", min: 0.5, max: 30, step: 0.5 },
      table: { category: "Disc" },
    },
    showRotationHandle: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    showDisc: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    showCube: {
      control: { type: "boolean" },
      table: { category: "Scene" },
    },
    showDragSampleOccluder: {
      control: { type: "boolean" },
      table: { category: "Surface pick test" },
    },
    excludeRegisteredDragSampleOccluders: {
      control: { type: "boolean" },
      table: { category: "Surface pick test" },
    },
    snapPlaneDragToGround: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discOutlineScreenPixelRadius: {
      control: { type: "range", min: 8, max: 120, step: 1 },
      table: { category: "Disc" },
    },
    discScalingMode: {
      control: { type: "inline-radio" },
      options: [
        REFERENCE_OBJECT_SCALING_MODES.SCREEN,
        REFERENCE_OBJECT_SCALING_MODES.WORLD,
      ],
      table: { category: "Disc" },
    },
    discQuantizeWorldRadius: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discResizeWorldRadiusToScreenTarget: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    freezeDiscScaleDuringDrag: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discResizeStepFactor: {
      control: { type: "range", min: 2, max: 8, step: 1 },
      table: { category: "Disc" },
    },
    showDiscRadiusLabel: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    axisWidthPx: {
      control: { type: "range", min: 0.5, max: 6, step: 0.5 },
      table: { category: "Axes" },
    },
    arrowActiveEdgePx: {
      control: { type: "range", min: 8, max: 40, step: 1 },
      table: { category: "Axes" },
    },
    arrowInactiveEdgePx: {
      control: { type: "range", min: 6, max: 30, step: 1 },
      table: { category: "Axes" },
    },
    axisMode: {
      control: {
        type: "inline-radio",
        labels: {
          "geoportal-default": "Vertical axis + disc only",
          enu: "ENU (E/N/Up)",
          "up-only": "Up only",
          world: "World X/Y/Z",
        },
      },
      options: ["geoportal-default", "enu", "up-only", "world"],
      table: { category: "Axes" },
    },
    preferredAxisId: {
      control: { type: "select" },
      options: [
        "auto",
        "vertical",
        "horizontal-east",
        "horizontal-north",
        "east",
        "north",
        "up",
        "world-x",
        "world-y",
        "world-z",
      ],
      table: { category: "Axes" },
    },
    axisTitle: {
      control: { type: "text" },
      table: { category: "Axes" },
    },
    referenceObject: {
      control: { type: "inline-radio" },
      options: ["gizmo", "query-disc"],
      table: { category: "Reference object" },
    },
  },
};

export default meta;

export const Cesium: StoryObj<GizmoSandboxProps> = {
  name: "Cesium Integration",
  args: {
    referenceObject: "gizmo",
    pointLon: PLACE_CENTER.longitude,
    pointLat: PLACE_CENTER.latitude,
    pointHeight: PLACE_CENTER.height,
    radius: 8,
    showRotationHandle: false,
    showDisc: true,
    showCube: true,
    showDragSampleOccluder: false,
    excludeRegisteredDragSampleOccluders: false,
    snapPlaneDragToGround: true,
    discScalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
    discOutlineScreenPixelRadius: 48,
    discResizeWorldRadiusToScreenTarget: false,
    discQuantizeWorldRadius: false,
    freezeDiscScaleDuringDrag: false,
    discResizeStepFactor: 4,
    showDiscRadiusLabel: false,
    axisWidthPx: 1,
    arrowActiveEdgePx: 16,
    arrowInactiveEdgePx: 12,
    axisMode: "enu",
    preferredAxisId: "auto",
    axisTitle: "Move cube anchor along selected axis",
  },
};

export const ReferenceObjectSizing: StoryObj<GizmoSandboxProps> = {
  name: "Dynamic Scene Reference Object Sizing",
  args: {
    ...Cesium.args,
    referenceObject: "gizmo",
    axisMode: "geoportal-default",
    showCube: false,
    discScalingMode: REFERENCE_OBJECT_SCALING_MODES.WORLD,
    discResizeWorldRadiusToScreenTarget: true,
    discQuantizeWorldRadius: true,
    freezeDiscScaleDuringDrag: true,
    showDiscRadiusLabel: true,
    discOutlineScreenPixelRadius: 48,
  },
};

const dragSurfacePickTestHandle = async (
  canvasElement: HTMLElement,
  expectOwnGeometryExcluded: boolean
) => {
  const centerHit = await waitFor(
    () => {
      const candidate = canvasElement.querySelector<HTMLElement>(
        '[data-point-move-axis-center-hit="true"]'
      );
      expect(candidate).not.toBeNull();
      return candidate as HTMLElement;
    },
    { timeout: 20_000 }
  );
  const status = canvasElement.querySelector<HTMLElement>(
    '[data-test-id="gizmo-sandbox"]'
  );
  expect(status).not.toBeNull();
  const initialHeight = Number(status?.dataset.pointHeightM);
  expect(Number.isFinite(initialHeight)).toBe(true);

  expect(centerHit.getBoundingClientRect().width).toBeGreaterThan(0);
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  const testTrigger = canvasElement.querySelector<HTMLButtonElement>(
    '[data-test-id="surface-pick-test-trigger"]'
  );
  expect(testTrigger).not.toBeNull();
  testTrigger?.click();

  await waitFor(
    () => {
      const height = Number(status?.dataset.pointHeightM);
      expect(Number.isFinite(height)).toBe(true);
      if (expectOwnGeometryExcluded) {
        expect(height).toBeLessThan(initialHeight - 5);
      } else {
        expect(height).toBeGreaterThan(initialHeight - 1);
      }
    },
    { timeout: 10_000 }
  );
};

export const SurfacePickExclusions: StoryObj<GizmoSandboxProps> = {
  name: "Surface Pick Exclusions",
  tags: ["pick-exclusion"],
  args: {
    ...Cesium.args,
    referenceObject: "query-disc",
    pointHeight: PLACE_CENTER.height + 20,
    axisMode: "geoportal-default",
    showCube: false,
    showDragSampleOccluder: true,
    excludeRegisteredDragSampleOccluders: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The query disc is always excluded from surface picking. The red line emulates a measurement's own geometry: point/distance editing excludes it, while the control can be disabled to test tools that intentionally use their own geometry as a surface.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    await dragSurfacePickTestHandle(canvasElement, true);
  },
};

export const GizmoSelfPickExclusion: StoryObj<GizmoSandboxProps> = {
  name: "Gizmo Never Picks Itself",
  tags: ["pick-exclusion"],
  args: {
    ...Cesium.args,
    referenceObject: "gizmo",
    pointHeight: PLACE_CENTER.height + 50,
    axisMode: "geoportal-default",
    showCube: false,
    showDragSampleOccluder: false,
    excludeRegisteredDragSampleOccluders: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The gizmo axis and disc are permanent scene-picking exclusions. Dragging the centre samples the scene below the gizmo even without domain-geometry exclusions.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    await dragSurfacePickTestHandle(canvasElement, true);
  },
};

export const OwnGeometryAsSurface: StoryObj<GizmoSandboxProps> = {
  name: "Own Geometry As Surface (Opt-in)",
  tags: ["pick-exclusion"],
  args: {
    ...SurfacePickExclusions.args,
    excludeRegisteredDragSampleOccluders: false,
  },
  play: async ({ canvasElement }) => {
    await dragSurfacePickTestHandle(canvasElement, false);
  },
};
