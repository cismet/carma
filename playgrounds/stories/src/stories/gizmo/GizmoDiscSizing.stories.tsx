import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { Vector3 } from "three";

import {
  GIZMO_DISC_RESIZE_TRIGGERS,
  createProjectedMoveGizmoView,
  resolveGizmoDiscWorldRadius,
  type GizmoDiscResizeTrigger,
  type ProjectedMoveGizmoAxisCandidate,
  type ProjectedMoveGizmoView,
} from "@carma-mapping/gizmo/core";

// Demonstrates the two independent disc-sizing dimensions (cismet/wupp#4078):
//   - quantize: continuous world radius vs snapped to a 1-2-5 series.
//   - resizeTrigger: recompute as the camera changes (hold screen size) vs
//     freeze the world size at selection (apparent size follows perspective).
// Toggle both to cover all four combinations and change the zoom to compare.

type ViewportSize = { width: number; height: number };

type GizmoDiscSizingStoryProps = {
  fovDeg: number;
  cameraDistance: number;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  targetScreenPx: number;
  quantize: boolean;
  resizeTrigger: GizmoDiscResizeTrigger;
};

const AXIS_CANDIDATES: ProjectedMoveGizmoAxisCandidate[] = [
  { id: "z", direction: new Vector3(0, 0, 1), color: "rgba(59, 130, 246, 0.98)" },
];

const toRad = (deg: number): number => (deg * Math.PI) / 180;

// Camera orbits the origin at `cameraDistance`; the gizmo point sits at the
// origin, so its view-space depth equals the camera distance.
const buildLookAtViewMatrix = (
  cameraDistance: number,
  yawDeg: number,
  pitchDeg: number
): number[] => {
  const yaw = toRad(yawDeg);
  const pitch = toRad(pitchDeg);
  const d = Math.max(0.2, cameraDistance);
  const eye = {
    x: Math.cos(yaw) * Math.cos(pitch) * d,
    y: Math.sin(yaw) * Math.cos(pitch) * d,
    z: Math.sin(pitch) * d,
  };
  const norm = (v: { x: number; y: number; z: number }) => {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
  const crossP = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const dotP = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ) => a.x * b.x + a.y * b.y + a.z * b.z;
  const forward = norm({ x: -eye.x, y: -eye.y, z: -eye.z });
  let right = norm(crossP(forward, { x: 0, y: 0, z: 1 }));
  if (Math.hypot(right.x, right.y, right.z) <= 1e-6) {
    right = norm(crossP(forward, { x: 0, y: 1, z: 0 }));
  }
  const up = norm(crossP(right, forward));
  return [
    right.x, right.y, right.z, -dotP(right, eye),
    up.x, up.y, up.z, -dotP(up, eye),
    forward.x, forward.y, forward.z, -dotP(forward, eye),
    0, 0, 0, 1,
  ];
};

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 2000,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(17, 24, 39, 0.82)",
  color: "#e5e7eb",
  font: "12px/1.5 ui-monospace, monospace",
  pointerEvents: "auto",
};

const GizmoDiscSizingStory = ({
  fovDeg,
  cameraDistance,
  cameraYawDeg,
  cameraPitchDeg,
  targetScreenPx,
  quantize,
  resizeTrigger,
}: GizmoDiscSizingStoryProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<ProjectedMoveGizmoView | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 1,
    height: 1,
  });
  const [frozenWorldRadius, setFrozenWorldRadius] = useState<number | null>(
    null
  );

  const viewMatrix = useMemo(
    () => buildLookAtViewMatrix(cameraDistance, cameraYawDeg, cameraPitchDeg),
    [cameraDistance, cameraYawDeg, cameraPitchDeg]
  );

  // Projected pixels per world unit at the origin: H / (2 · depth · tan(fov/2)).
  const pixelPerWorld = useMemo(() => {
    const tanHalfFov = Math.tan(toRad(Math.min(150, Math.max(10, fovDeg))) / 2);
    const depth = Math.max(0.2, cameraDistance);
    return viewportSize.height / (2 * depth * tanHalfFov);
  }, [fovDeg, cameraDistance, viewportSize.height]);

  const continuousWorldRadius = useMemo(
    () => resolveGizmoDiscWorldRadius({ targetScreenPx, pixelPerWorld, quantize }),
    [targetScreenPx, pixelPerWorld, quantize]
  );

  const isSelectionTrigger =
    resizeTrigger === GIZMO_DISC_RESIZE_TRIGGERS.SELECTION;

  // In `selection` mode freeze the world radius once (re-freeze on settings /
  // mode change); the "Freeze at current view" button recaptures it.
  useEffect(() => {
    if (!isSelectionTrigger) {
      setFrozenWorldRadius(null);
      return;
    }
    setFrozenWorldRadius(continuousWorldRadius);
    // Intentionally not depending on continuousWorldRadius/cameraDistance so the
    // frozen size is only re-captured on mode/quantize/target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectionTrigger, quantize, targetScreenPx]);

  const discRadius =
    isSelectionTrigger && frozenWorldRadius !== null
      ? frozenWorldRadius
      : continuousWorldRadius;

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
      initialPoint: new Vector3(0, 0, 0),
      initialActiveAxisId: "z",
      viewMatrix,
      fovRad: toRad(fovDeg),
      discRadius,
      showRotationHandle: false,
    });
    gizmoRef.current = gizmo;
    return () => {
      gizmo.destroy();
      gizmoRef.current = null;
    };
    // Created once; subsequent prop changes are pushed via the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gizmoRef.current?.setViewMatrix(viewMatrix);
  }, [viewMatrix]);
  useEffect(() => {
    gizmoRef.current?.setFovRad(toRad(fovDeg));
  }, [fovDeg]);
  useEffect(() => {
    gizmoRef.current?.setDiscRadius(discRadius);
  }, [discRadius]);
  useEffect(() => {
    gizmoRef.current?.refresh();
  }, [viewportSize]);

  const effectiveScreenPx = discRadius * pixelPerWorld;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background:
          "repeating-linear-gradient(45deg,#0b1220,#0b1220 18px,#0d1526 18px,#0d1526 36px)",
        overflow: "hidden",
      }}
    >
      <div ref={viewportRef} style={{ position: "absolute", inset: 0 }} />
      <div style={PANEL_STYLE}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Disc sizing</div>
        <div>quantize: {quantize ? "1-2-5 snapped" : "continuous"}</div>
        <div>resize: {resizeTrigger}</div>
        <div>pixels / world: {pixelPerWorld.toFixed(2)}</div>
        <div>disc radius (world): {discRadius.toFixed(3)}</div>
        <div>effective screen px: {effectiveScreenPx.toFixed(1)}</div>
        {isSelectionTrigger ? (
          <button
            type="button"
            style={{ marginTop: 8, cursor: "pointer" }}
            onClick={() => setFrozenWorldRadius(continuousWorldRadius)}
          >
            Freeze at current view
          </button>
        ) : null}
      </div>
    </div>
  );
};

const meta: Meta<typeof GizmoDiscSizingStory> = {
  title: "Gizmo/Disc Sizing",
  component: GizmoDiscSizingStory,
  parameters: { layout: "fullscreen" },
  argTypes: {
    fovDeg: { control: { type: "range", min: 20, max: 110, step: 1 } },
    cameraDistance: { control: { type: "range", min: 1, max: 40, step: 0.5 } },
    cameraYawDeg: { control: { type: "range", min: -180, max: 180, step: 1 } },
    cameraPitchDeg: { control: { type: "range", min: 0, max: 85, step: 1 } },
    targetScreenPx: { control: { type: "range", min: 8, max: 160, step: 1 } },
    quantize: { control: "boolean" },
    resizeTrigger: {
      control: "inline-radio",
      options: [
        GIZMO_DISC_RESIZE_TRIGGERS.CAMERA,
        GIZMO_DISC_RESIZE_TRIGGERS.SELECTION,
      ],
    },
  },
  args: {
    fovDeg: 60,
    cameraDistance: 8,
    cameraYawDeg: 35,
    cameraPitchDeg: 35,
    targetScreenPx: 48,
    quantize: false,
    resizeTrigger: GIZMO_DISC_RESIZE_TRIGGERS.CAMERA,
  },
};

export default meta;

type Story = StoryObj<typeof GizmoDiscSizingStory>;

// Old behavior: continuous world radius, recomputed with the camera.
export const ContinuousFollowCamera: Story = {};

// Quantized world radius, recomputed with the camera (jumps in 1-2-5 steps).
export const QuantizedFollowCamera: Story = { args: { quantize: true } };

// Continuous world radius frozen at selection (apparent size follows perspective).
export const ContinuousFixedOnSelection: Story = {
  args: { resizeTrigger: GIZMO_DISC_RESIZE_TRIGGERS.SELECTION },
};

// Quantized world radius frozen at selection.
export const QuantizedFixedOnSelection: Story = {
  args: {
    quantize: true,
    resizeTrigger: GIZMO_DISC_RESIZE_TRIGGERS.SELECTION,
  },
};
