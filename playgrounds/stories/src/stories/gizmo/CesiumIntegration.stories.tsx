import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import {
  useCesiumPointMoveGizmo,
  useCesiumPointMoveGizmoConnector,
  type CesiumGizmoRotationDelta,
  type CesiumMoveGizmoAxisCandidate,
} from "@carma-mapping/gizmo/cesium";
import {
  GIZMO_DISC_RESIZE_TRIGGERS,
  type GizmoDiscResizeTrigger,
} from "@carma-mapping/gizmo/core";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { WUPPERTAL } from "@carma-commons/resources";
import {
  Cartesian3,
  Cartesian4,
  CesiumMath,
  HeadingPitchRange,
  Matrix3,
  Matrix4,
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

type GizmoSandboxProps = {
  pointLon: number;
  pointLat: number;
  pointHeight: number;
  radius: number;
  showRotationHandle: boolean;
  showDisc: boolean;
  showCube: boolean;
  snapPlaneDragToGround: boolean;
  discOutlineFixedScreenSize: boolean;
  discOutlineScreenPixelRadius: number;
  discQuantizeWorldRadius: boolean;
  discResizeTrigger: GizmoDiscResizeTrigger;
  freezeDiscScaleDuringDrag: boolean;
  // Permissible apparent-size band before the disc re-steps: [1/factor, factor]
  // (4 → 0.25×–4×). Applies to the `selection` trigger and the query disc.
  discResizeStepFactor: number;
  showDiscRadiusLabel: boolean;
  axisWidthPx?: number;
  arrowActiveEdgePx: number;
  arrowInactiveEdgePx: number;
  axisMode: AxisMode;
  preferredAxisId: string;
  axisTitle: string;
  // Render the in-canvas disc-sizing panel and let it drive the disc options
  // (overriding the Storybook args for those three controls).
  interactiveDiscControls?: boolean;
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
  pointLon,
  pointLat,
  pointHeight,
  radius,
  showRotationHandle,
  showDisc,
  showCube,
  snapPlaneDragToGround,
  discOutlineFixedScreenSize,
  discOutlineScreenPixelRadius,
  discQuantizeWorldRadius,
  discResizeTrigger,
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
          // disc/gizmo render sharp instead of blurry (cismet/wupp#4078).
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
    axisTitle: axisTitleForHook,
    preferredAxisId:
      preferredAxisId.trim().toLowerCase() === "auto"
        ? null
        : preferredAxisId.trim(),
    axisCandidates: axisCandidatesForHook,
    axisDirection: axisDirectionForHook,
    onRotationDelta: handleRotationDelta,
    showDisc,
    showRotationHandle,
    snapPlaneDragToGround,
    discOutlineFixedScreenSize,
    discOutlineScreenPixelRadius,
    discQuantizeWorldRadius,
    discResizeTrigger,
    freezeDiscScaleDuringDrag,
    discResizeStepFactor,
    showDiscRadiusLabel,
    axisWidthPx,
    arrowActiveEdgePx,
    arrowInactiveEdgePx,
    radius,
  });

  return (
    <div
      ref={rootRef}
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
    </div>
  );
};

const PANEL_STYLE: CSSProperties = {
  position: "fixed",
  top: 12,
  left: 12,
  zIndex: 4000,
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(17, 24, 39, 0.86)",
  color: "#e5e7eb",
  font: "12px/1.5 Inter, system-ui, sans-serif",
  pointerEvents: "auto",
  minWidth: 232,
  boxShadow: "0 6px 24px rgba(0, 0, 0, 0.35)",
  userSelect: "none",
};

const segmentButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: "5px 8px",
  borderRadius: 6,
  border: `1px solid ${active ? "#60a5fa" : "rgba(148,163,184,0.4)"}`,
  background: active ? "rgba(59,130,246,0.32)" : "transparent",
  color: active ? "#e0f2fe" : "#cbd5e1",
  cursor: "pointer",
  font: "inherit",
});

const RESIZE_TRIGGER_OPTIONS: ReadonlyArray<{
  value: GizmoDiscResizeTrigger;
  label: string;
}> = [
  { value: GIZMO_DISC_RESIZE_TRIGGERS.CAMERA, label: "Follow camera" },
  { value: GIZMO_DISC_RESIZE_TRIGGERS.SELECTION, label: "Fixed on selection" },
];

type DiscControlPanelProps = {
  resizeTrigger: GizmoDiscResizeTrigger;
  onResizeTriggerChange: (next: GizmoDiscResizeTrigger) => void;
  quantize: boolean;
  onQuantizeChange: (next: boolean) => void;
  targetPx: number;
  onTargetPxChange: (next: number) => void;
};

const DiscControlPanel = ({
  resizeTrigger,
  onResizeTriggerChange,
  quantize,
  onQuantizeChange,
  targetPx,
  onTargetPxChange,
}: DiscControlPanelProps) => (
  <div style={PANEL_STYLE}>
    <div style={{ fontWeight: 700, marginBottom: 8 }}>Disc sizing</div>

    <div style={{ marginBottom: 4, color: "#94a3b8" }}>Resize trigger</div>
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {RESIZE_TRIGGER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          style={segmentButtonStyle(resizeTrigger === option.value)}
          onClick={() => onResizeTriggerChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>

    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={quantize}
        onChange={(event) => onQuantizeChange(event.target.checked)}
      />
      Quantize to 1-2-5 steps
    </label>

    <div style={{ marginBottom: 4, color: "#94a3b8" }}>
      Target size: {targetPx}px
    </div>
    <input
      type="range"
      min={8}
      max={64}
      step={1}
      value={targetPx}
      onChange={(event) => onTargetPxChange(Number(event.target.value))}
      style={{ width: "100%" }}
    />
  </div>
);

const GizmoSandbox = ({
  interactiveDiscControls = false,
  ...props
}: GizmoSandboxProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });

  // Seed the in-canvas controls from the args; the panel then owns these three
  // disc options live. Re-seed if the corresponding arg changes.
  const [resizeTrigger, setResizeTrigger] = useState(props.discResizeTrigger);
  const [quantize, setQuantize] = useState(props.discQuantizeWorldRadius);
  const [targetPx, setTargetPx] = useState(props.discOutlineScreenPixelRadius);

  useEffect(() => {
    setResizeTrigger(props.discResizeTrigger);
  }, [props.discResizeTrigger]);
  useEffect(() => {
    setQuantize(props.discQuantizeWorldRadius);
  }, [props.discQuantizeWorldRadius]);
  useEffect(() => {
    setTargetPx(props.discOutlineScreenPixelRadius);
  }, [props.discOutlineScreenPixelRadius]);

  const effectiveProps = interactiveDiscControls
    ? {
        ...props,
        discResizeTrigger: resizeTrigger,
        discQuantizeWorldRadius: quantize,
        discOutlineScreenPixelRadius: targetPx,
      }
    : props;

  return (
    <LabelOverlayProvider host={overlayHost}>
      <GizmoSandboxContent
        {...effectiveProps}
        scene={scene}
        onSceneChange={setScene}
        rootRef={rootRef}
      />
      {interactiveDiscControls ? (
        <DiscControlPanel
          resizeTrigger={resizeTrigger}
          onResizeTriggerChange={setResizeTrigger}
          quantize={quantize}
          onQuantizeChange={setQuantize}
          targetPx={targetPx}
          onTargetPxChange={setTargetPx}
        />
      ) : null}
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
    snapPlaneDragToGround: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discOutlineScreenPixelRadius: {
      control: { type: "range", min: 8, max: 120, step: 1 },
      table: { category: "Disc" },
    },
    discOutlineFixedScreenSize: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discQuantizeWorldRadius: {
      control: { type: "boolean" },
      table: { category: "Disc" },
    },
    discResizeTrigger: {
      control: { type: "inline-radio" },
      options: [
        GIZMO_DISC_RESIZE_TRIGGERS.CAMERA,
        GIZMO_DISC_RESIZE_TRIGGERS.SELECTION,
      ],
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
    interactiveDiscControls: {
      table: { disable: true },
    },
  },
};

export default meta;

export const Cesium: StoryObj<GizmoSandboxProps> = {
  name: "Cesium Integration",
  args: {
    pointLon: PLACE_CENTER.longitude,
    pointLat: PLACE_CENTER.latitude,
    pointHeight: PLACE_CENTER.height,
    radius: 8,
    showRotationHandle: false,
    showDisc: true,
    showCube: true,
    snapPlaneDragToGround: true,
    discOutlineFixedScreenSize: true,
    discOutlineScreenPixelRadius: 48,
    discQuantizeWorldRadius: false,
    discResizeTrigger: GIZMO_DISC_RESIZE_TRIGGERS.CAMERA,
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

// Single interactive disc-sizing demo (cismet/wupp#4078). The in-canvas panel
// switches the two mode dimensions and the main sizing option:
//   - Resize trigger: "Follow camera" continuously holds the on-screen size,
//     while "Fixed on selection" holds the world size for the whole selection
//     and only steps to the next size once the screen-centre resolution doubles
//     or halves (so it stays stable while panning/orbiting).
//   - Quantize: snap each size step to the 1-2-5 series.
//   - Target size: the on-screen radius the steps aim for.
// Defaults to the intended behaviour (fixed-on-selection + quantized); zoom
// in/out and re-select the cube to watch it step.
export const DiscSizing: StoryObj<GizmoSandboxProps> = {
  name: "Dynamic Scene Reference Object Sizing",
  args: {
    ...Cesium.args,
    interactiveDiscControls: true,
    // The geoportal edit-tool default: only the vertical (height) axis plus the
    // disc, no cube — so the demo matches the in-app gizmo (cismet/wupp#4078).
    axisMode: "geoportal-default",
    showCube: false,
    discResizeTrigger: GIZMO_DISC_RESIZE_TRIGGERS.SELECTION,
    discQuantizeWorldRadius: true,
    // Hold the disc size during a drag; it re-steps only at the next drag start.
    freezeDiscScaleDuringDrag: true,
    // Show the world-radius readout hairline + 8px label.
    showDiscRadiusLabel: true,
    discOutlineScreenPixelRadius: 48,
  },
};
