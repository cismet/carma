import { useMemo } from "react";

import type { Meta, StoryObj } from "@storybook/react";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  projectPointToSvg,
  toSvgPathD,
  transformPointWithMatrix,
  type GizmoVec3,
  type SvgProjectedPoint,
} from "@carma-mapping/gizmo/core";
type SvgReprojectionProps = {
  fovDeg: number;
  zoomPx: number;
  m00: number;
  m01: number;
  m02: number;
  m03: number;
  m10: number;
  m11: number;
  m12: number;
  m13: number;
  m20: number;
  m21: number;
  m22: number;
  m23: number;
};

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 800;
const CIRCLE_SEGMENTS = 64;
const STAR_TIPS = 5;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const formatMatrixCell = (value: number): string =>
  value.toFixed(3).padStart(7, " ");

const buildSquarePoints = (
  center: GizmoVec3,
  halfSize: number
): GizmoVec3[] => {
  const { x, y, z } = center;
  return [
    { x: x - halfSize, y: y - halfSize, z },
    { x: x + halfSize, y: y - halfSize, z },
    { x: x + halfSize, y: y + halfSize, z },
    { x: x - halfSize, y: y + halfSize, z },
  ];
};

const buildCirclePoints = (
  center: GizmoVec3,
  radius: number,
  segments: number
): GizmoVec3[] => {
  const points: GizmoVec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(t) * radius,
      y: center.y + Math.sin(t) * radius,
      z: center.z,
    });
  }
  return points;
};

const buildStarPoints = (
  center: GizmoVec3,
  outerRadius: number,
  innerRadius: number,
  tips: number
): GizmoVec3[] => {
  const points: GizmoVec3[] = [];
  const total = tips * 2;
  for (let i = 0; i < total; i += 1) {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      z: center.z,
    });
  }
  return points;
};

const SvgReprojectionStory = ({
  fovDeg,
  zoomPx,
  m00,
  m01,
  m02,
  m03,
  m10,
  m11,
  m12,
  m13,
  m20,
  m21,
  m22,
  m23,
}: SvgReprojectionProps) => {
  const viewMatrix = useMemo(
    () =>
      [
        m00,
        m01,
        m02,
        m03,
        m10,
        m11,
        m12,
        m13,
        m20,
        m21,
        m22,
        m23,
        0,
        0,
        0,
        1,
      ] as const,
    [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23]
  );

  const aspect = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;
  const safeFovDeg = Math.min(140, Math.max(10, fovDeg));
  const tanHalfFov = Math.tan(toRad(safeFovDeg) / 2);

  const project = useMemo(
    () =>
      (point: GizmoVec3): SvgProjectedPoint | null => {
        const view = transformPointWithMatrix(point, viewMatrix, {
          matrixOrder: "row-major",
        });

        if (!Number.isFinite(view.z) || view.z <= 0.05) return null;
        if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 1e-6) return null;

        const xNdc = view.x / (view.z * tanHalfFov * aspect);
        const yNdc = view.y / (view.z * tanHalfFov);

        return projectPointToSvg(
          { x: xNdc, y: yNdc, z: view.z },
          [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          {
            matrixOrder: "row-major",
            perspectiveDivide: false,
            ndcToScreen: (x, y, z) => ({
              x: VIEWBOX_WIDTH * 0.5 + x * zoomPx,
              y: VIEWBOX_HEIGHT * 0.5 - y * zoomPx,
              z,
            }),
          }
        );
      },
    [aspect, tanHalfFov, viewMatrix, zoomPx]
  );

  const shapePaths = useMemo(() => {
    const square = buildSquarePoints({ x: -1.7, y: 0, z: 0 }, 0.55);
    const circle = buildCirclePoints(
      { x: 0, y: 0, z: 0 },
      0.58,
      CIRCLE_SEGMENTS
    );
    const star = buildStarPoints({ x: 1.7, y: 0, z: 0 }, 0.62, 0.28, STAR_TIPS);

    const toPath = (points: GizmoVec3[]): string => {
      const projected = points
        .map(project)
        .filter((p): p is SvgProjectedPoint => p !== null);

      if (projected.length !== points.length || projected.length < 3) return "";
      return toSvgPathD(projected, { close: true, digits: 2 });
    };

    return {
      squarePath: toPath(square),
      circlePath: toPath(circle),
      starPath: toPath(star),
    };
  }, [project]);

  const matrixText = useMemo(
    () =>
      [
        "view matrix (4x4 row-major)",
        `[${formatMatrixCell(m00)} ${formatMatrixCell(m01)} ${formatMatrixCell(
          m02
        )} ${formatMatrixCell(m03)}]`,
        `[${formatMatrixCell(m10)} ${formatMatrixCell(m11)} ${formatMatrixCell(
          m12
        )} ${formatMatrixCell(m13)}]`,
        `[${formatMatrixCell(m20)} ${formatMatrixCell(m21)} ${formatMatrixCell(
          m22
        )} ${formatMatrixCell(m23)}]`,
        `[${formatMatrixCell(0)} ${formatMatrixCell(0)} ${formatMatrixCell(
          0
        )} ${formatMatrixCell(1)}]`,
      ].join("\n"),
    [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23]
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0b1220",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <ResponsiveStatusBar
          tone="dark"
          text={
            <pre
              style={{
                margin: 0,
                width: "100%",
                textAlign: "center",
                whiteSpace: "pre",
                lineHeight: 1.25,
                fontSize: 11,
              }}
            >
              {matrixText}
            </pre>
          }
          barHeight="86px"
        />
      </div>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        style={{ display: "block" }}
      >
        <rect
          x={0}
          y={0}
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          fill="rgba(15, 23, 42, 1)"
        />

        <path
          d={shapePaths.squarePath}
          fill="rgba(56,189,248,0.18)"
          stroke="rgba(56,189,248,0.98)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={shapePaths.circlePath}
          fill="rgba(34,197,94,0.18)"
          stroke="rgba(34,197,94,0.98)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={shapePaths.starPath}
          fill="rgba(248,113,113,0.18)"
          stroke="rgba(248,113,113,0.98)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

const matrixControl = {
  control: { type: "range", min: -2, max: 2, step: 0.01 },
};

const translationControl = {
  control: { type: "range", min: -8, max: 8, step: 0.05 },
};

const meta: Meta<SvgReprojectionProps> = {
  title: "Mapping Components/Gizmo",
  component: SvgReprojectionStory,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    fovDeg: { control: { type: "range", min: 10, max: 140, step: 1 } },
    zoomPx: { control: { type: "range", min: 120, max: 800, step: 1 } },

    m00: matrixControl,
    m01: matrixControl,
    m02: matrixControl,
    m03: translationControl,

    m10: matrixControl,
    m11: matrixControl,
    m12: matrixControl,
    m13: translationControl,

    m20: matrixControl,
    m21: matrixControl,
    m22: matrixControl,
    m23: translationControl,
  },
};

export default meta;

export const Shapes: StoryObj<SvgReprojectionProps> = {
  name: "SVG Reprojection",
  args: {
    fovDeg: 55,
    zoomPx: 380,

    m00: 1,
    m01: 0,
    m02: 0,
    m03: 0,

    m10: 0,
    m11: 1,
    m12: 0,
    m13: 0,

    m20: 0,
    m21: 0,
    m22: 1,
    m23: 4.2,
  },
};
