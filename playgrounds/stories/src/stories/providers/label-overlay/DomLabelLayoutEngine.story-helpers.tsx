import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { CssPixelPosition } from "@carma/units/types";
import { Vector3 } from "three";
import { createScreenPointSvgLineVisualizers } from "@carma-commons/svg";
import {
  createProjectedMoveGizmoView,
  transformPointWithMatrix,
  type ProjectedMoveGizmoAxisCandidate,
  type ProjectedMoveGizmoView,
} from "@carma-mapping/gizmo/core";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  computePointLabelLayout,
  resolvePillCapCenterPoint,
  resolvePointLabelLayoutConfig,
  resolveSegmentEndOutsideCircle,
  type LayoutPointInput,
} from "@carma-providers/label-overlay";
import { buildAxisGridSegments3d } from "../../shared/buildAxisGridSegments3d";
import {
  formatStoryPerformanceLabel,
  useAnimationFramePerformanceStatus,
} from "./useStoryPerformanceStatus";

export type DomLabelLayoutStoryArgs = {
  showGrid: boolean;
  gridExtent: number;
  gridStep: number;
  labelCount: number;
  clusterScale: number;
  stemDistance: number;
  forceEnabled: boolean;
  forceOnTop: boolean;
  forceIterations: number;
  forceStep: number;
  forceMaxDelta: number;
  forceRepulsionBase: number;
  forceViewportAdjustmentStep: number;
  initialOffset: number;
  fovDeg: number;
  cameraDistance: number;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  discRadius: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ScreenPoint = {
  x: number;
  y: number;
};

type ProjectedScreenPoint = {
  x: number;
  y: number;
  depth: number;
};

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

type AxisId = "x" | "y" | "z";

type OrbitDragState = {
  startClientX: number;
  startClientY: number;
  startYawDeg: number;
  startPitchDeg: number;
};

const TOP_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  background: "#020617",
  color: "#e2e8f0",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const ORIGIN: Vec3Like = { x: 0, y: 0, z: 0 };
const WORLD_UP: Vec3Like = { x: 0, y: 0, z: 1 };
const SAFE_UP_FALLBACK: Vec3Like = { x: 0, y: 1, z: 0 };

const AXIS_CANDIDATES: ProjectedMoveGizmoAxisCandidate[] = [
  {
    id: "x",
    direction: new Vector3(1, 0, 0),
    color: "rgba(239, 68, 68, 0.98)",
    title: "Move along X axis",
  },
  {
    id: "y",
    direction: new Vector3(0, 1, 0),
    color: "rgba(34, 197, 94, 0.98)",
    title: "Move along Y axis",
  },
  {
    id: "z",
    direction: new Vector3(0, 0, 1),
    color: "rgba(59, 130, 246, 0.98)",
    title: "Move along Z axis",
  },
];

const ORBIT_YAW_SENSITIVITY_DEG_PER_PX = 0.22;
const ORBIT_PITCH_SENSITIVITY_DEG_PER_PX = 0.18;

const toCssPixelPosition = (x: number, y: number): CssPixelPosition =>
  ({
    x: x as CssPixelPosition["x"],
    y: y as CssPixelPosition["y"],
  } as CssPixelPosition);

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const dot = (a: Vec3Like, b: Vec3Like): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vec3Like, b: Vec3Like): Vec3Like => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const normalize = (vector: Vec3Like): Vec3Like => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 1e-6) return { x: 0, y: 0, z: 1 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

const buildLookAtViewMatrix = (
  cameraDistance: number,
  cameraYawDeg: number,
  cameraPitchDeg: number
): number[] => {
  const yaw = toRad(cameraYawDeg);
  const pitch = toRad(cameraPitchDeg);
  const safeDistance = Math.max(0.2, cameraDistance);

  const eye: Vec3Like = {
    x: Math.cos(yaw) * Math.cos(pitch) * safeDistance,
    y: Math.sin(yaw) * Math.cos(pitch) * safeDistance,
    z: Math.sin(pitch) * safeDistance,
  };

  const forward = normalize({
    x: ORIGIN.x - eye.x,
    y: ORIGIN.y - eye.y,
    z: ORIGIN.z - eye.z,
  });

  let right = normalize(cross(forward, WORLD_UP));
  if (Math.hypot(right.x, right.y, right.z) <= 1e-6) {
    right = normalize(cross(forward, SAFE_UP_FALLBACK));
  }

  const up = normalize(cross(right, forward));

  return [
    right.x,
    right.y,
    right.z,
    -dot(right, eye),
    up.x,
    up.y,
    up.z,
    -dot(up, eye),
    forward.x,
    forward.y,
    forward.z,
    -dot(forward, eye),
    0,
    0,
    0,
    1,
  ] as const;
};

const projectPointWithView = (
  point: Vec3Like,
  viewMatrix: number[],
  viewport: ViewportSize,
  fovDeg: number
): ProjectedScreenPoint | null => {
  const safeWidth = Math.max(1, viewport.width);
  const safeHeight = Math.max(1, viewport.height);
  const safeFov = clamp(fovDeg, 10, 150);
  const tanHalfFov = Math.tan(toRad(safeFov) / 2);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 1e-6) return null;

  const view = transformPointWithMatrix(point, viewMatrix, {
    matrixOrder: "row-major",
  });
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.z)
  ) {
    return null;
  }
  if (view.z <= 0.05) return null;

  const aspect = safeWidth / safeHeight;
  const xNdc = view.x / (view.z * tanHalfFov * aspect);
  const yNdc = view.y / (view.z * tanHalfFov);

  return {
    x: (xNdc + 1) * 0.5 * safeWidth,
    y: (1 - yNdc) * 0.5 * safeHeight,
    depth: view.z,
  };
};

const renderDomLine = (
  key: string,
  start: ScreenPoint,
  end: ScreenPoint,
  color: string,
  width: number,
  opacity: number,
  zIndex: number
) => {
  const [lineVisualizer] = createScreenPointSvgLineVisualizers({
    id: key,
    start: toCssPixelPosition(start.x, start.y),
    end: toCssPixelPosition(end.x, end.y),
    stroke: color,
    strokeWidth: width,
    opacity,
    dashed: false,
    capStyle: "round",
  });
  const svgLine = lineVisualizer.getSvgLine?.();
  if (!svgLine) {
    return null;
  }

  return (
    <svg
      key={key}
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex,
      }}
    >
      <line
        x1={svgLine.start.x}
        y1={svgLine.start.y}
        x2={svgLine.end.x}
        y2={svgLine.end.y}
        stroke={lineVisualizer.stroke ?? color}
        strokeWidth={lineVisualizer.strokeWidth ?? width}
        strokeLinecap={lineVisualizer.strokeLinecap ?? "round"}
        strokeDasharray={lineVisualizer.strokeDasharray ?? "none"}
        strokeDashoffset={lineVisualizer.strokeDashoffset ?? 0}
        opacity={lineVisualizer.opacity ?? opacity}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const getLabelTransform = (attach: "left" | "right" | "center") => {
  if (attach === "left") {
    return "translate(0, -50%)";
  }
  if (attach === "right") {
    return "translate(-100%, -50%)";
  }
  return "translate(-50%, -50%)";
};

const LABEL_FONT_SIZE_PX = 12;
const LABEL_LINE_HEIGHT = 1.2;
const LABEL_VERTICAL_PADDING_PX = 3;
const LABEL_CAP_RADIUS_PX =
  (LABEL_FONT_SIZE_PX * LABEL_LINE_HEIGHT + LABEL_VERTICAL_PADDING_PX * 2) *
  0.5;

export const DOM_LABEL_LAYOUT_DEFAULT_ARGS = {
  showGrid: true,
  gridExtent: 6,
  gridStep: 1,
  labelCount: 18,
  clusterScale: 0.6,
  stemDistance: 22,
  forceEnabled: true,
  forceOnTop: false,
  forceIterations: 14,
  forceStep: 0.38,
  forceMaxDelta: 14,
  forceRepulsionBase: 2.2,
  forceViewportAdjustmentStep: 8,
  initialOffset: 0.4,
  fovDeg: 56,
  cameraDistance: 6.8,
  cameraYawDeg: -36,
  cameraPitchDeg: 32,
  discRadius: 1.1,
};

export const DOM_LABEL_LAYOUT_ARG_TYPES = {
  showGrid: { control: "boolean", table: { category: "Scene" } },
  gridExtent: {
    control: { type: "range", min: 2, max: 14, step: 1 },
    table: { category: "Scene" },
  },
  gridStep: {
    control: { type: "range", min: 0.5, max: 2, step: 0.25 },
    table: { category: "Scene" },
  },
  initialOffset: {
    control: { type: "range", min: -3, max: 3, step: 0.05 },
    table: { category: "Scene" },
  },
  fovDeg: {
    control: { type: "range", min: 10, max: 130, step: 1 },
    table: { category: "Scene" },
  },
  cameraDistance: {
    control: { type: "range", min: 2, max: 18, step: 0.05 },
    table: { category: "Scene" },
  },
  cameraYawDeg: {
    control: { type: "range", min: -180, max: 180, step: 1 },
    table: { category: "Scene" },
  },
  cameraPitchDeg: {
    control: { type: "range", min: -80, max: 80, step: 1 },
    table: { category: "Scene" },
  },
  discRadius: {
    control: { type: "range", min: 0.25, max: 4, step: 0.05 },
    table: { category: "Scene" },
  },
  labelCount: {
    control: { type: "range", min: 4, max: 40, step: 1 },
    table: { category: "Layout" },
  },
  clusterScale: {
    control: { type: "range", min: 0.15, max: 1.5, step: 0.01 },
    table: { category: "Layout" },
  },
  stemDistance: {
    control: { type: "range", min: 8, max: 120, step: 1 },
    table: { category: "Layout" },
  },
  forceEnabled: {
    control: "boolean",
    table: { category: "Force Engine" },
  },
  forceOnTop: {
    control: "boolean",
    table: { category: "Force Engine" },
  },
  forceIterations: {
    control: { type: "range", min: 2, max: 36, step: 1 },
    table: { category: "Force Engine" },
  },
  forceStep: {
    control: { type: "range", min: 0.05, max: 1.2, step: 0.01 },
    table: { category: "Force Engine" },
  },
  forceMaxDelta: {
    control: { type: "range", min: 2, max: 28, step: 1 },
    table: { category: "Force Engine" },
  },
  forceRepulsionBase: {
    control: { type: "range", min: 0.2, max: 8, step: 0.1 },
    table: { category: "Force Engine" },
  },
  forceViewportAdjustmentStep: {
    control: { type: "range", min: 1, max: 18, step: 1 },
    table: { category: "Force Engine" },
  },
};

export const DomLabelLayoutEngineStory = ({
  showGrid,
  gridExtent,
  gridStep,
  labelCount,
  clusterScale,
  stemDistance,
  forceEnabled,
  forceOnTop,
  forceIterations,
  forceStep,
  forceMaxDelta,
  forceRepulsionBase,
  forceViewportAdjustmentStep,
  initialOffset,
  fovDeg,
  cameraDistance,
  cameraYawDeg,
  cameraPitchDeg,
  discRadius,
}: DomLabelLayoutStoryArgs) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const gizmoRef = useRef<ProjectedMoveGizmoView | null>(null);
  const orbitDragStateRef = useRef<OrbitDragState | null>(null);
  const stopOrbitListenersRef = useRef<(() => void) | null>(null);

  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 1,
    height: 1,
  });
  const [point, setPoint] = useState<Vector3>(new Vector3(0, 0, initialOffset));
  const [activeAxis, setActiveAxis] = useState<AxisId>("z");
  const [dragging, setDragging] = useState(false);
  const [orbitYawDeg, setOrbitYawDeg] = useState(cameraYawDeg);
  const [orbitPitchDeg, setOrbitPitchDeg] = useState(cameraPitchDeg);
  const [orbiting, setOrbiting] = useState(false);
  const performanceStatus = useAnimationFramePerformanceStatus(true);
  const previousInitialOffsetRef = useRef(initialOffset);
  const previousCameraYawRef = useRef(cameraYawDeg);
  const previousCameraPitchRef = useRef(cameraPitchDeg);

  const viewMatrix = useMemo(
    () => buildLookAtViewMatrix(cameraDistance, orbitYawDeg, orbitPitchDeg),
    [cameraDistance, orbitYawDeg, orbitPitchDeg]
  );

  useEffect(() => {
    const cameraChanged =
      previousCameraYawRef.current !== cameraYawDeg ||
      previousCameraPitchRef.current !== cameraPitchDeg;
    if (!cameraChanged) return;

    previousCameraYawRef.current = cameraYawDeg;
    previousCameraPitchRef.current = cameraPitchDeg;
    if (orbiting) return;

    setOrbitYawDeg(cameraYawDeg);
    setOrbitPitchDeg(cameraPitchDeg);
  }, [cameraPitchDeg, cameraYawDeg, orbiting]);

  useEffect(() => {
    if (!viewportRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportSize({
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: Math.max(1, Math.round(entry.contentRect.height)),
      });
    });

    resizeObserver.observe(viewportRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!viewportRef.current) return;

    const gizmo = createProjectedMoveGizmoView({
      container: viewportRef.current,
      axisCandidates: AXIS_CANDIDATES,
      initialPoint: new Vector3(0, 0, initialOffset),
      initialActiveAxisId: "z",
      viewMatrix,
      fovRad: toRad(fovDeg),
      discRadius,
      showRotationHandle: false,
      onPointChange: (nextPoint) => setPoint(nextPoint.clone()),
      onActiveAxisChange: (axisId) => {
        if (axisId === "x" || axisId === "y" || axisId === "z") {
          setActiveAxis(axisId);
        }
      },
      onDragStateChange: (nextDragging) => setDragging(nextDragging),
    });

    gizmoRef.current = gizmo;
    setPoint(gizmo.getPoint().clone());
    setActiveAxis(gizmo.getActiveAxisId() as AxisId);

    return () => {
      gizmo.destroy();
      gizmoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    gizmo.setViewMatrix(viewMatrix);
  }, [viewMatrix]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    gizmo.setFovRad(toRad(fovDeg));
  }, [fovDeg]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    gizmo.setDiscRadius(discRadius);
  }, [discRadius]);

  useEffect(() => {
    gizmoRef.current?.refresh();
  }, [viewportSize]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    if (previousInitialOffsetRef.current === initialOffset) return;
    if (dragging) return;

    previousInitialOffsetRef.current = initialOffset;
    const nextPoint = new Vector3(0, 0, initialOffset);
    gizmo.setPoint(nextPoint);
    setPoint(nextPoint.clone());
  }, [initialOffset, dragging]);

  const stopOrbitDrag = () => {
    if (stopOrbitListenersRef.current) {
      stopOrbitListenersRef.current();
      stopOrbitListenersRef.current = null;
    }
    orbitDragStateRef.current = null;
    setOrbiting(false);
  };

  useEffect(() => {
    return () => {
      stopOrbitDrag();
    };
  }, []);

  const handleViewportMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (dragging) return;

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('[data-projected-move-gizmo-interactive="true"]')
    ) {
      return;
    }

    if (!viewportRef.current) return;

    event.preventDefault();
    stopOrbitDrag();

    orbitDragStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startYawDeg: orbitYawDeg,
      startPitchDeg: orbitPitchDeg,
    };
    setOrbiting(true);

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      const dragState = orbitDragStateRef.current;
      if (!dragState) return;
      const dx = moveEvent.clientX - dragState.startClientX;
      const dy = moveEvent.clientY - dragState.startClientY;
      setOrbitYawDeg(
        dragState.startYawDeg + dx * ORBIT_YAW_SENSITIVITY_DEG_PER_PX
      );
      setOrbitPitchDeg(
        clamp(
          dragState.startPitchDeg - dy * ORBIT_PITCH_SENSITIVITY_DEG_PER_PX,
          -85,
          85
        )
      );
    };

    const handleWindowMouseUp = () => {
      stopOrbitDrag();
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("pointerup", handleWindowMouseUp);

    stopOrbitListenersRef.current = () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("pointerup", handleWindowMouseUp);
    };
  };

  const gridSegments = useMemo(
    () => buildAxisGridSegments3d(gridExtent, gridStep),
    [gridExtent, gridStep]
  );

  const projectedSegments = useMemo(() => {
    return gridSegments
      .map((segment) => {
        const projectedA = projectPointWithView(
          segment.a,
          viewMatrix,
          viewportSize,
          fovDeg
        );
        const projectedB = projectPointWithView(
          segment.b,
          viewMatrix,
          viewportSize,
          fovDeg
        );
        if (!projectedA || !projectedB) return null;
        return {
          ...segment,
          a: projectedA,
          b: projectedB,
        };
      })
      .filter(
        (segment): segment is NonNullable<typeof segment> => segment !== null
      );
  }, [fovDeg, gridSegments, viewMatrix, viewportSize]);

  const projectedPoint = useMemo(
    () => projectPointWithView(point, viewMatrix, viewportSize, fovDeg),
    [fovDeg, point, viewMatrix, viewportSize]
  );

  const fauxSphereRadiusPx = useMemo(() => {
    if (!projectedPoint) return 0;
    const safeFov = clamp(fovDeg, 10, 150);
    const tanHalfFov = Math.tan(toRad(safeFov) / 2);
    if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 1e-6) return 0;
    const focal = viewportSize.height / (2 * tanHalfFov);
    return clamp((0.2 * focal) / Math.max(projectedPoint.depth, 0.05), 6, 22);
  }, [fovDeg, projectedPoint, viewportSize.height]);

  const requestedLabelCount = clamp(Math.floor(labelCount), 4, 64);
  const anchorPoints = useMemo(() => {
    const points: LayoutPointInput[] = [];
    const baseRadius = Math.max(0.25, clusterScale * 2.2);
    const ringScale = [0.55, 0.85, 1.15, 1.45];

    for (let index = 0; index < requestedLabelCount; index += 1) {
      const ring = ringScale[index % ringScale.length] ?? 1;
      const angle = (index / requestedLabelCount) * Math.PI * 2;
      const world: Vec3Like = {
        x: point.x + Math.cos(angle) * baseRadius * ring,
        y: point.y + Math.sin(angle) * baseRadius * ring * 0.82,
        z: point.z + Math.sin(angle * 2) * baseRadius * 0.24,
      };
      const projected = projectPointWithView(
        world,
        viewMatrix,
        viewportSize,
        fovDeg
      );
      if (!projected) {
        continue;
      }

      points.push({
        id: `label-${index + 1}`,
        text: `Landmark ${index + 1}`,
        compactText: `${index + 1}`,
        index,
        anchor: toCssPixelPosition(projected.x, projected.y),
        layoutPriority: requestedLabelCount - index,
      });
    }

    return points;
  }, [
    clusterScale,
    fovDeg,
    point.x,
    point.y,
    point.z,
    requestedLabelCount,
    viewMatrix,
    viewportSize,
  ]);

  const layoutConfig = useMemo(
    () =>
      resolvePointLabelLayoutConfig({
        placementOrder: ["left", "right", "center"],
        stemDistance,
        dynamicLabelPlacement: forceEnabled,
        forceLayoutOnTop: forceOnTop,
        pitchResponsiveAngle: true,
        dynamicLabelPlacementConfig: {
          iterations: forceIterations,
          step: forceStep,
          maxDelta: forceMaxDelta,
          repulsionBase: forceRepulsionBase,
          viewportAdjustmentStep: forceViewportAdjustmentStep,
        },
      }),
    [
      forceEnabled,
      forceOnTop,
      forceIterations,
      forceMaxDelta,
      forceRepulsionBase,
      forceStep,
      forceViewportAdjustmentStep,
      stemDistance,
    ]
  );

  const layoutComputation = useMemo(() => {
    const startedAtMs = performance.now();
    const result = computePointLabelLayout({
      points: anchorPoints,
      viewportWidth: Math.max(1, viewportSize.width),
      viewportHeight: Math.max(1, viewportSize.height),
      cameraPitch: toRad(orbitPitchDeg),
      config: layoutConfig,
    });

    return {
      result,
      durationMs: performance.now() - startedAtMs,
    };
  }, [
    anchorPoints,
    layoutConfig,
    orbitPitchDeg,
    viewportSize.height,
    viewportSize.width,
  ]);
  const layout = layoutComputation.result;

  const statusValues = useMemo(
    () => [
      forceEnabled
        ? forceOnTop
          ? "forced on top"
          : "forced fallback"
        : "static layout",
      `${anchorPoints.length}/${requestedLabelCount} labels visible`,
      `${Object.keys(layout.placements).length} placed`,
      `${layout.hiddenByLayout.size} hidden`,
      `${layout.collapsedToCompact.size} compact`,
      `perf ${formatStoryPerformanceLabel(performanceStatus)}`,
      `layout ${layoutComputation.durationMs.toFixed(2)} ms`,
      `axis ${activeAxis.toUpperCase()} • gizmo ${
        dragging ? "dragging" : "idle"
      }`,
      `orbit ${orbitYawDeg.toFixed(1)}deg / ${orbitPitchDeg.toFixed(1)}deg`,
    ],
    [
      activeAxis,
      anchorPoints.length,
      dragging,
      forceEnabled,
      forceOnTop,
      layout,
      layoutComputation.durationMs,
      orbitPitchDeg,
      orbitYawDeg,
      performanceStatus,
      requestedLabelCount,
    ]
  );

  return (
    <div style={frameStyle}>
      <div
        ref={viewportRef}
        onMouseDown={handleViewportMouseDown}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          touchAction: "none",
          cursor: orbiting ? "grabbing" : "grab",
          background:
            "radial-gradient(circle at 36% 28%, rgba(56,189,248,0.24), rgba(2,6,23,0.95) 44%), #020617",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          <defs>
            <radialGradient
              id="dom-layout-faux-sphere-gradient"
              cx="34%"
              cy="30%"
              r="72%"
            >
              <stop offset="0%" stopColor="rgba(190, 242, 255, 0.98)" />
              <stop offset="35%" stopColor="rgba(34, 211, 238, 0.96)" />
              <stop offset="100%" stopColor="rgba(8, 145, 178, 0.95)" />
            </radialGradient>
          </defs>

          {showGrid
            ? projectedSegments.map((segment, index) => (
                <line
                  key={`segment-${index}`}
                  x1={segment.a.x}
                  y1={segment.a.y}
                  x2={segment.b.x}
                  y2={segment.b.y}
                  stroke={segment.stroke}
                  strokeOpacity={segment.strokeOpacity}
                  strokeWidth={segment.strokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              ))
            : null}

          {projectedPoint ? (
            <>
              <circle
                cx={projectedPoint.x + fauxSphereRadiusPx * 0.28}
                cy={projectedPoint.y - fauxSphereRadiusPx * 0.32}
                r={Math.max(1.5, fauxSphereRadiusPx * 0.28)}
                fill="rgba(255,255,255,0.75)"
              />
              <circle
                cx={projectedPoint.x}
                cy={projectedPoint.y}
                r={fauxSphereRadiusPx}
                fill="url(#dom-layout-faux-sphere-gradient)"
                stroke="rgba(255,255,255,0.96)"
                strokeWidth={1.5}
              />
            </>
          ) : null}
        </svg>

        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {anchorPoints.map((pointData) => {
            const placement = layout.placements[pointData.id];
            if (!placement) {
              return null;
            }

            const connectorPoint: ScreenPoint = {
              x:
                pointData.anchor.x +
                Math.cos(placement.angleRad) * placement.distance,
              y:
                pointData.anchor.y +
                Math.sin(placement.angleRad) * placement.distance,
            };
            const pillCapCenterPoint = resolvePillCapCenterPoint(
              placement.attach,
              connectorPoint,
              LABEL_CAP_RADIUS_PX
            );
            const stemEndPoint = resolveSegmentEndOutsideCircle(
              pointData.anchor,
              pillCapCenterPoint,
              LABEL_CAP_RADIUS_PX
            );

            return (
              <div
                key={pointData.id}
                style={{ position: "absolute", inset: 0 }}
              >
                {renderDomLine(
                  `stem-${pointData.id}`,
                  pointData.anchor,
                  stemEndPoint,
                  "rgba(148, 163, 184, 0.86)",
                  2,
                  1,
                  6
                )}
                <div
                  style={{
                    position: "absolute",
                    left: pointData.anchor.x,
                    top: pointData.anchor.y,
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    transform: "translate(-50%, -50%)",
                    background: "#60a5fa",
                    boxShadow: "0 0 0 2px rgba(15, 23, 42, 0.85)",
                    zIndex: 7,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: connectorPoint.x,
                    top: connectorPoint.y,
                    transform: getLabelTransform(placement.attach),
                    background: "rgba(255,255,255,0.95)",
                    color: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.9)",
                    borderRadius: 9999,
                    padding: "3px 10px",
                    fontSize: LABEL_FONT_SIZE_PX,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    lineHeight: LABEL_LINE_HEIGHT,
                    zIndex: 8,
                  }}
                >
                  {pointData.text}
                </div>
              </div>
            );
          })}
        </div>

        <div style={TOP_STATUS_BAR_OVERLAY_STYLE}>
          <ResponsiveStatusBar label="dom label layout" values={statusValues} />
        </div>
      </div>
    </div>
  );
};
