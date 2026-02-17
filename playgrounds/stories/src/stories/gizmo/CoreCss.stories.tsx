import type { Meta, StoryObj } from "@storybook/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  createProjectedMoveGizmoView,
  transformPointWithMatrix,
  type GizmoVec3,
  type ProjectedMoveGizmoAxisCandidate,
  type ProjectedMoveGizmoView,
} from "@carma-mapping/engines-interop/gizmo/core";

type CoreCssStoryProps = {
  initialOffset: number;
  fovDeg: number;
  cameraDistance: number;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  gridExtent: number;
  gridStep: number;
  discRadius: number;
  showReadouts: boolean;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ProjectedScreenPoint = {
  x: number;
  y: number;
  depth: number;
};

type Segment3 = {
  a: GizmoVec3;
  b: GizmoVec3;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
};

type AxisId = "x" | "y" | "z";

type OrbitDragState = {
  startClientX: number;
  startClientY: number;
  startYawDeg: number;
  startPitchDeg: number;
};

const ORIGIN: GizmoVec3 = { x: 0, y: 0, z: 0 };
const WORLD_UP: GizmoVec3 = { x: 0, y: 0, z: 1 };
const SAFE_UP_FALLBACK: GizmoVec3 = { x: 0, y: 1, z: 0 };

const AXIS_CANDIDATES: ProjectedMoveGizmoAxisCandidate[] = [
  {
    id: "x",
    direction: { x: 1, y: 0, z: 0 },
    color: "rgba(239, 68, 68, 0.98)",
    title: "Move along X axis",
  },
  {
    id: "y",
    direction: { x: 0, y: 1, z: 0 },
    color: "rgba(34, 197, 94, 0.98)",
    title: "Move along Y axis",
  },
  {
    id: "z",
    direction: { x: 0, y: 0, z: 1 },
    color: "rgba(59, 130, 246, 0.98)",
    title: "Move along Z axis",
  },
];

const ORBIT_YAW_SENSITIVITY_DEG_PER_PX = 0.22;
const ORBIT_PITCH_SENSITIVITY_DEG_PER_PX = 0.18;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const dot = (a: GizmoVec3, b: GizmoVec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: GizmoVec3, b: GizmoVec3): GizmoVec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const normalize = (vector: GizmoVec3): GizmoVec3 => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 1e-6) return { x: 0, y: 0, z: 1 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

const pretty = (value: number): string => value.toFixed(2);

const buildLookAtViewMatrix = (
  cameraDistance: number,
  cameraYawDeg: number,
  cameraPitchDeg: number
): number[] => {
  const yaw = toRad(cameraYawDeg);
  const pitch = toRad(cameraPitchDeg);
  const safeDistance = Math.max(0.2, cameraDistance);

  const eye: GizmoVec3 = {
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
  point: GizmoVec3,
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

const buildGridSegments = (extent: number, step: number): Segment3[] => {
  const safeExtent = Math.max(1, Math.floor(extent));
  const safeStep = Math.max(0.5, step);
  const segments: Segment3[] = [];

  for (let t = -safeExtent; t <= safeExtent + 1e-6; t += safeStep) {
    segments.push({
      a: { x: -safeExtent, y: t, z: 0 },
      b: { x: safeExtent, y: t, z: 0 },
      stroke: "rgba(56,189,248,0.55)",
      strokeOpacity: 0.55,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: t, y: -safeExtent, z: 0 },
      b: { x: t, y: safeExtent, z: 0 },
      stroke: "rgba(56,189,248,0.55)",
      strokeOpacity: 0.55,
      strokeWidth: 1,
    });

    segments.push({
      a: { x: -safeExtent, y: 0, z: t },
      b: { x: safeExtent, y: 0, z: t },
      stroke: "rgba(34,197,94,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: t, y: 0, z: -safeExtent },
      b: { x: t, y: 0, z: safeExtent },
      stroke: "rgba(34,197,94,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });

    segments.push({
      a: { x: 0, y: -safeExtent, z: t },
      b: { x: 0, y: safeExtent, z: t },
      stroke: "rgba(59,130,246,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
    segments.push({
      a: { x: 0, y: t, z: -safeExtent },
      b: { x: 0, y: t, z: safeExtent },
      stroke: "rgba(59,130,246,0.48)",
      strokeOpacity: 0.48,
      strokeWidth: 1,
    });
  }

  segments.push({
    a: { x: -safeExtent, y: 0, z: 0 },
    b: { x: safeExtent, y: 0, z: 0 },
    stroke: "rgba(239,68,68,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });
  segments.push({
    a: { x: 0, y: -safeExtent, z: 0 },
    b: { x: 0, y: safeExtent, z: 0 },
    stroke: "rgba(34,197,94,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });
  segments.push({
    a: { x: 0, y: 0, z: -safeExtent },
    b: { x: 0, y: 0, z: safeExtent },
    stroke: "rgba(59,130,246,0.98)",
    strokeOpacity: 1,
    strokeWidth: 1.4,
  });

  return segments;
};

const CoreCssStory = ({
  initialOffset,
  fovDeg,
  cameraDistance,
  cameraYawDeg,
  cameraPitchDeg,
  gridExtent,
  gridStep,
  discRadius,
  showReadouts,
}: CoreCssStoryProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<ProjectedMoveGizmoView | null>(null);
  const orbitDragStateRef = useRef<OrbitDragState | null>(null);
  const stopOrbitListenersRef = useRef<(() => void) | null>(null);

  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 1,
    height: 1,
  });
  const [point, setPoint] = useState<GizmoVec3>({
    x: 0,
    y: 0,
    z: initialOffset,
  });
  const [activeAxis, setActiveAxis] = useState<AxisId>("z");
  const [dragging, setDragging] = useState(false);
  const [orbitYawDeg, setOrbitYawDeg] = useState(cameraYawDeg);
  const [orbitPitchDeg, setOrbitPitchDeg] = useState(cameraPitchDeg);
  const [orbiting, setOrbiting] = useState(false);
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
      initialPoint: { x: 0, y: 0, z: initialOffset },
      initialActiveAxisId: "z",
      viewMatrix,
      fovDeg,
      discRadius,
      showRotationHandle: false,
      onPointChange: (nextPoint) => setPoint(nextPoint),
      onActiveAxisChange: (axisId) => {
        if (axisId === "x" || axisId === "y" || axisId === "z") {
          setActiveAxis(axisId);
        }
      },
      onDragStateChange: (nextDragging) => setDragging(nextDragging),
    });

    gizmoRef.current = gizmo;
    setPoint(gizmo.getPoint());
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
    gizmo.setFovDeg(fovDeg);
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
    const nextPoint = { x: 0, y: 0, z: initialOffset };
    gizmo.setPoint(nextPoint);
    setPoint(nextPoint);
  }, [initialOffset, dragging]);

  const gridSegments = useMemo(
    () => buildGridSegments(gridExtent, gridStep),
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

    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

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

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
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
              id="core-faux-sphere-gradient"
              cx="34%"
              cy="30%"
              r="72%"
            >
              <stop offset="0%" stopColor="rgba(190, 242, 255, 0.98)" />
              <stop offset="35%" stopColor="rgba(34, 211, 238, 0.96)" />
              <stop offset="100%" stopColor="rgba(8, 145, 178, 0.95)" />
            </radialGradient>
          </defs>

          {projectedSegments.map((segment, index) => (
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
          ))}

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
                fill="url(#core-faux-sphere-gradient)"
                stroke="rgba(255,255,255,0.96)"
                strokeWidth={1.5}
              />
            </>
          ) : null}
        </svg>

        <div
          style={{
            position: "absolute",
            left: 14,
            top: 14,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(2, 6, 23, 0.82)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: "none",
          }}
        >
          Drag gizmo arrows/disc to move the sphere.
          <br />
          Drag empty space to orbit the scene.
        </div>

        {showReadouts ? (
          <div
            style={{
              position: "absolute",
              left: 14,
              bottom: 14,
              fontSize: 11,
              lineHeight: 1.5,
              color: "rgba(226, 232, 240, 0.9)",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: 8,
              background: "rgba(2, 6, 23, 0.78)",
              padding: "8px 10px",
              pointerEvents: "none",
            }}
          >
            <div>
              <strong>Point:</strong> ({pretty(point.x)}, {pretty(point.y)},{" "}
              {pretty(point.z)})
            </div>
            <div>
              <strong>Active axis:</strong> {activeAxis.toUpperCase()}
            </div>
            <div>
              <strong>Gizmo drag:</strong> {dragging ? "yes" : "no"}
            </div>
            <div>
              <strong>Orbit drag:</strong> {orbiting ? "yes" : "no"}
            </div>
            <div>
              <strong>Yaw/Pitch:</strong> {orbitYawDeg.toFixed(1)}° /{" "}
              {orbitPitchDeg.toFixed(1)}°
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const meta: Meta<CoreCssStoryProps> = {
  title: "Gizmo/CSS View Matrix (WIP)",
  component: CoreCssStory,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    initialOffset: { control: { type: "range", min: -3, max: 3, step: 0.05 } },
    fovDeg: { control: { type: "range", min: 10, max: 130, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.05 } },
    cameraYawDeg: { control: { type: "range", min: -180, max: 180, step: 1 } },
    cameraPitchDeg: { control: { type: "range", min: -80, max: 80, step: 1 } },
    gridExtent: { control: { type: "range", min: 2, max: 14, step: 1 } },
    gridStep: { control: { type: "range", min: 0.5, max: 2, step: 0.25 } },
    discRadius: { control: { type: "range", min: 0.25, max: 4, step: 0.05 } },
    showReadouts: { control: { type: "boolean" } },
  },
};

export default meta;

export const CssViewMatrixWip: StoryObj<CoreCssStoryProps> = {
  name: "CSS View Matrix (WIP)",
  args: {
    initialOffset: 0.4,
    fovDeg: 56,
    cameraDistance: 6.8,
    cameraYawDeg: -36,
    cameraPitchDeg: 32,
    gridExtent: 6,
    gridStep: 1,
    discRadius: 1.1,
    showReadouts: false,
  },
};
