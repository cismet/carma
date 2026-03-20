import { PI, PI_OVER_SIX, TWO_PI, clamp } from "@carma-commons/math";
import {
  CarmaResponsiveInfoBox,
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
import type { Meta, StoryObj } from "@storybook/react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type RendererMode =
  | "css3d"
  | "css2d"
  | "canvas2d"
  | "svgAnchored"
  | "svgBatch";

type OverlayRenderBenchmarkArgs = {
  renderer: RendererMode;
  pointCount: number;
  updateEveryFrames: number;
  depthSort: boolean;
  impostorLayerCount: number;
  orthographicScale: number;
  zDepthPx: number;
  labelOffsetPx: number;
  showConnectors: boolean;
  animate: boolean;
  seed: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

type Quat = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type BenchmarkPoint = {
  id: string;
  label: string;
  basePosition: Vec3;
  wobbleAmplitude: Vec3;
  wobblePhase: number;
  wobbleSpeed: number;
  hue: number;
};

type BenchmarkRenderItem = {
  id: string;
  label: string;
  color: string;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  depth: number;
  zIndex: number;
  opacity: number;
  labelWidth: number;
  labelHeight: number;
  depthNormalized: number;
};

type BenchmarkSnapshot = {
  items: BenchmarkRenderItem[];
  lastUpdateMs: number;
  averageUpdateMs: number;
  updateGapMs: number;
  lastFrameDeltaMs: number;
  averageFrameDeltaMs: number;
  updateCount: number;
  renderedAtMs: number;
};

type DragState = {
  pointerId: number;
  startVector: Vec3;
  startQuaternion: Quat;
};

const shellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  overflow: "hidden",
  background: "#e2e8f0",
  color: "#0f172a",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const viewportStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  touchAction: "none",
};

const sceneBackdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "#f1f5f9",
  backgroundImage:
    "linear-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.14) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

const topBarWrapStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  pointerEvents: "none",
};

const infoBoxWrapStyle: CSSProperties = {
  position: "absolute",
  right: 16,
  top: 42,
  zIndex: 20,
  pointerEvents: "auto",
};

const infoContentStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 12,
  lineHeight: 1.45,
  color: "#0f172a",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "6px 14px",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

const infoLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#475569",
};

const infoValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",
};

const surfaceLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const ANCHOR_RADIUS_PX = 4.5;
const CONNECTOR_STROKE_PX = 1;
const LABEL_HEIGHT_PX = 22;
const LABEL_HORIZONTAL_PADDING_PX = 12;
const LABEL_MIN_WIDTH_PX = 52;
const LABEL_CHAR_WIDTH_PX = 6.3;
const LABEL_FONT_SIZE_PX = 11;
const LABEL_FONT_WEIGHT = 600;
const LABEL_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const CSS3D_PERSPECTIVE_PX = 220_000;
const WORLD_EXTENT = 1.55;

const rendererDescriptions: Record<RendererMode, string> = {
  css3d:
    "DOM billboards with translate3d in a fake orthographic scene. Optional impostor layers quantize depth to keep nearby billboards more coherent.",
  css2d:
    "DOM billboards with 2D transforms and explicit depth sorting. This is the reference path for crisp overlays.",
  canvas2d:
    "One raster canvas redraw per update. Useful as the low-node-count baseline when comparing DOM, SVG, and hybrid overlay options.",
  svgAnchored:
    "One SVG subtree per anchor. Good for isolated nodes, but node count grows quickly.",
  svgBatch:
    "One fullscreen SVG with shared defs and batched node updates. Best for comparing DOM count pressure.",
};

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const identityQuat = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

const dot3 = (left: Vec3, right: Vec3): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const cross3 = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const normalize3 = (value: Vec3): Vec3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= 1e-8) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  };
};

const normalizeQuat = (value: Quat): Quat => {
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  if (length <= 1e-8) {
    return identityQuat();
  }
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length,
  };
};

const multiplyQuat = (left: Quat, right: Quat): Quat =>
  normalizeQuat({
    x:
      left.w * right.x +
      left.x * right.w +
      left.y * right.z -
      left.z * right.y,
    y:
      left.w * right.y -
      left.x * right.z +
      left.y * right.w +
      left.z * right.x,
    z:
      left.w * right.z +
      left.x * right.y -
      left.y * right.x +
      left.z * right.w,
    w:
      left.w * right.w -
      left.x * right.x -
      left.y * right.y -
      left.z * right.z,
  });

const quatFromUnitVectors = (from: Vec3, to: Vec3): Quat => {
  const normalizedFrom = normalize3(from);
  const normalizedTo = normalize3(to);
  const sum = dot3(normalizedFrom, normalizedTo) + 1;

  if (sum <= 1e-6) {
    const axis =
      Math.abs(normalizedFrom.x) > Math.abs(normalizedFrom.z)
        ? normalize3({ x: -normalizedFrom.y, y: normalizedFrom.x, z: 0 })
        : normalize3({ x: 0, y: -normalizedFrom.z, z: normalizedFrom.y });
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }

  const axis = cross3(normalizedFrom, normalizedTo);
  return normalizeQuat({
    x: axis.x,
    y: axis.y,
    z: axis.z,
    w: sum,
  });
};

const multiplyMat4 = (left: Mat4, right: Mat4): Mat4 => {
  const result = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      result[row * 4 + column] =
        left[row * 4 + 0] * right[0 * 4 + column] +
        left[row * 4 + 1] * right[1 * 4 + column] +
        left[row * 4 + 2] * right[2 * 4 + column] +
        left[row * 4 + 3] * right[3 * 4 + column];
    }
  }
  return result as Mat4;
};

const createRotationXMatrix = (angleRad: number): Mat4 => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [
    1, 0, 0, 0,
    0, cos, -sin, 0,
    0, sin, cos, 0,
    0, 0, 0, 1,
  ];
};

const createRotationYMatrix = (angleRad: number): Mat4 => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [
    cos, 0, sin, 0,
    0, 1, 0, 0,
    -sin, 0, cos, 0,
    0, 0, 0, 1,
  ];
};

const createRotationZMatrix = (angleRad: number): Mat4 => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [
    cos, -sin, 0, 0,
    sin, cos, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
};

const createRotationMatrixFromQuat = (quat: Quat): Mat4 => {
  const normalized = normalizeQuat(quat);
  const xx = normalized.x * normalized.x;
  const yy = normalized.y * normalized.y;
  const zz = normalized.z * normalized.z;
  const xy = normalized.x * normalized.y;
  const xz = normalized.x * normalized.z;
  const yz = normalized.y * normalized.z;
  const wx = normalized.w * normalized.x;
  const wy = normalized.w * normalized.y;
  const wz = normalized.w * normalized.z;

  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    0,
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    0,
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ];
};

const transformPoint = (matrix: Mat4, point: Vec3): Vec3 => ({
  x: matrix[0] * point.x + matrix[1] * point.y + matrix[2] * point.z + matrix[3],
  y: matrix[4] * point.x + matrix[5] * point.y + matrix[6] * point.z + matrix[7],
  z: matrix[8] * point.x + matrix[9] * point.y + matrix[10] * point.z + matrix[11],
});

const pointerToArcball = (
  clientX: number,
  clientY: number,
  rect: DOMRect
): Vec3 => {
  const nx = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / Math.max(rect.height, 1)) * 2;
  const lengthSquared = nx * nx + ny * ny;

  if (lengthSquared <= 1) {
    return { x: nx, y: ny, z: Math.sqrt(1 - lengthSquared) };
  }

  const length = Math.sqrt(lengthSquared);
  return { x: nx / length, y: ny / length, z: 0 };
};

const estimateLabelWidthPx = (label: string) =>
  Math.max(
    LABEL_MIN_WIDTH_PX,
    Math.round(label.length * LABEL_CHAR_WIDTH_PX + LABEL_HORIZONTAL_PADDING_PX * 2)
  );

const formatNumber = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const clampedRadius = Math.min(radius, width * 0.5, height * 0.5);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, clampedRadius);
  context.arcTo(x + width, y + height, x, y + height, clampedRadius);
  context.arcTo(x, y + height, x, y, clampedRadius);
  context.arcTo(x, y, x + width, y, clampedRadius);
  context.closePath();
};

const resolveCss3dDepthPx = ({
  depth,
  depthNormalized,
  zDepthPx,
  impostorLayerCount,
}: {
  depth: number;
  depthNormalized: number;
  zDepthPx: number;
  impostorLayerCount: number;
}) => {
  if (impostorLayerCount <= 1) {
    return depth * zDepthPx;
  }

  const layerCount = Math.max(2, Math.round(impostorLayerCount));
  const layerIndex = Math.round(depthNormalized * (layerCount - 1));
  const layerNormalized = layerIndex / (layerCount - 1);
  const quantizedDepth = (layerNormalized * 2 - 1) * WORLD_EXTENT;

  return quantizedDepth * zDepthPx;
};

const resolveCss3dImpostorScale = (depthPx: number) =>
  clamp((CSS3D_PERSPECTIVE_PX - depthPx) / CSS3D_PERSPECTIVE_PX, 0.92, 1.08);

const buildBenchmarkPoints = (
  pointCount: number,
  seed: number
): BenchmarkPoint[] => {
  const random = createSeededRandom(seed);
  return Array.from({ length: pointCount }, (_, index) => {
    const yaw = random() * TWO_PI;
    const pitch = (random() - 0.5) * (PI - PI_OVER_SIX);
    const radius = 0.3 + random() * (WORLD_EXTENT - 0.2);
    const planarRadius = Math.cos(pitch) * radius;

    return {
      id: `anchor-${index + 1}`,
      label: `L${String(index + 1).padStart(3, "0")}`,
      basePosition: {
        x: Math.cos(yaw) * planarRadius,
        y: Math.sin(pitch) * radius,
        z: Math.sin(yaw) * planarRadius,
      },
      wobbleAmplitude: {
        x: 0.05 + random() * 0.08,
        y: 0.04 + random() * 0.06,
        z: 0.05 + random() * 0.08,
      },
      wobblePhase: random() * TWO_PI,
      wobbleSpeed: 0.35 + random() * 1.1,
      hue: Math.round(random() * 360),
    };
  });
};

const buildAutoRotationMatrix = (timeMs: number): Mat4 => {
  const yaw = (timeMs * 0.00014) % TWO_PI;
  const pitch = PI_OVER_SIX + Math.sin(timeMs * 0.00009) * 0.28;
  const roll = Math.sin(timeMs * 0.00005) * 0.12;

  return multiplyMat4(
    multiplyMat4(createRotationYMatrix(yaw), createRotationXMatrix(pitch)),
    createRotationZMatrix(roll)
  );
};

const buildViewMatrix = ({
  animate,
  timeMs,
  manualQuaternion,
}: {
  animate: boolean;
  timeMs: number;
  manualQuaternion: Quat;
}): Mat4 => {
  const baseMatrix = buildAutoRotationMatrix(animate ? timeMs : 0);
  return multiplyMat4(createRotationMatrixFromQuat(manualQuaternion), baseMatrix);
};

const buildBenchmarkSnapshot = ({
  points,
  timeMs,
  viewport,
  orthographicScale,
  labelOffsetPx,
  depthSort,
  animate,
  manualQuaternion,
}: {
  points: BenchmarkPoint[];
  timeMs: number;
  viewport: ViewportSize;
  orthographicScale: number;
  labelOffsetPx: number;
  depthSort: boolean;
  animate: boolean;
  manualQuaternion: Quat;
}): BenchmarkRenderItem[] => {
  const centerX = viewport.width * 0.5;
  const centerY = viewport.height * 0.5;
  const viewMatrix = buildViewMatrix({
    animate,
    timeMs,
    manualQuaternion,
  });
  const safeScale = Math.max(60, orthographicScale);
  const visiblePaddingPx = 96;

  const items = points
    .map((point, index) => {
      const wobbleTime = timeMs * 0.001 * point.wobbleSpeed + point.wobblePhase;
      const animatedPoint: Vec3 = {
        x:
          point.basePosition.x +
          Math.cos(wobbleTime) * point.wobbleAmplitude.x,
        y:
          point.basePosition.y +
          Math.sin(wobbleTime * 0.82) * point.wobbleAmplitude.y,
        z:
          point.basePosition.z +
          Math.sin(wobbleTime * 1.17) * point.wobbleAmplitude.z,
      };
      const transformed = transformPoint(viewMatrix, animatedPoint);
      const anchorX = centerX + transformed.x * safeScale;
      const anchorY = centerY - transformed.y * safeScale;
      const depthNormalized = clamp(
        (transformed.z + WORLD_EXTENT) / (WORLD_EXTENT * 2),
        0,
        1
      );
      const labelSide = index % 2 === 0 ? 1 : -1;
      const labelX = anchorX + labelSide * (labelOffsetPx + depthNormalized * 8);
      const labelY =
        anchorY -
        labelOffsetPx * 0.56 +
        Math.sin(point.wobblePhase + timeMs * 0.00041) * 5;
      const labelWidth = estimateLabelWidthPx(point.label);

      return {
        id: point.id,
        label: point.label,
        color: `hsl(${point.hue} 72% 46%)`,
        anchorX,
        anchorY,
        labelX,
        labelY,
        depth: transformed.z,
        zIndex: Math.round(depthNormalized * 10_000),
        opacity: 0.48 + depthNormalized * 0.52,
        labelWidth,
        labelHeight: LABEL_HEIGHT_PX,
        depthNormalized,
      } satisfies BenchmarkRenderItem;
    })
    .filter(
      (item) =>
        item.anchorX >= -visiblePaddingPx &&
        item.anchorX <= viewport.width + visiblePaddingPx &&
        item.anchorY >= -visiblePaddingPx &&
        item.anchorY <= viewport.height + visiblePaddingPx
    );

  if (!depthSort) {
    return items;
  }

  return [...items].sort((left, right) => left.depth - right.depth);
};

const useViewportSize = (
  containerRef: React.RefObject<HTMLDivElement | null>
): ViewportSize => {
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
};

const BenchmarkCssLayer = memo(function BenchmarkCssLayer({
  items,
  renderer,
  depthSort,
  showConnectors,
  zDepthPx,
  impostorLayerCount,
}: {
  items: BenchmarkRenderItem[];
  renderer: "css3d" | "css2d";
  depthSort: boolean;
  showConnectors: boolean;
  zDepthPx: number;
  impostorLayerCount: number;
}) {
  return (
    <div
      style={{
        ...surfaceLayerStyle,
        ...(renderer === "css3d"
          ? {
              perspective: `${CSS3D_PERSPECTIVE_PX}px`,
              transformStyle: "preserve-3d",
            }
          : null),
      }}
    >
      {items.map((item) => {
        const dx = item.labelX - item.anchorX;
        const dy = item.labelY - item.anchorY;
        const lineLength = Math.hypot(dx, dy);
        const lineAngleDeg = (Math.atan2(dy, dx) * 180) / PI;
        const resolvedDepthPx =
          renderer === "css3d"
            ? resolveCss3dDepthPx({
                depth: item.depth,
                depthNormalized: item.depthNormalized,
                zDepthPx,
                impostorLayerCount,
              })
            : 0;
        const useImpostorLayering =
          renderer === "css3d" && impostorLayerCount > 1;
        const contentScale = useImpostorLayering
          ? resolveCss3dImpostorScale(resolvedDepthPx)
          : 1;

        return (
          <div
            key={item.id}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              opacity: item.opacity,
              zIndex: depthSort ? item.zIndex : undefined,
              transform:
                renderer === "css3d"
                  ? `translate3d(${item.anchorX}px, ${item.anchorY}px, ${
                      resolvedDepthPx
                    }px)`
                  : `translate(${item.anchorX}px, ${item.anchorY}px)`,
              transformStyle: renderer === "css3d" ? "preserve-3d" : undefined,
              willChange: "transform",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform:
                  renderer === "css3d" && useImpostorLayering
                    ? `scale(${contentScale})`
                    : undefined,
                transformOrigin: "0 0",
                willChange:
                  renderer === "css3d" && useImpostorLayering
                    ? "transform"
                    : undefined,
              }}
            >
              {showConnectors ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: `${lineLength}px`,
                    height: `${CONNECTOR_STROKE_PX}px`,
                    transform: `rotate(${lineAngleDeg}deg)`,
                    transformOrigin: "0 50%",
                    background: "rgba(15, 23, 42, 0.28)",
                  }}
                />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  left: -ANCHOR_RADIUS_PX,
                  top: -ANCHOR_RADIUS_PX,
                  width: ANCHOR_RADIUS_PX * 2,
                  height: ANCHOR_RADIUS_PX * 2,
                  borderRadius: "999px",
                  background: item.color,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.92)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${dx}px`,
                  top: `${dy}px`,
                  width: `${item.labelWidth}px`,
                  height: `${item.labelHeight}px`,
                  marginLeft: `${item.labelWidth * -0.5}px`,
                  marginTop: `${item.labelHeight * -0.5}px`,
                  borderRadius: 999,
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  background: "rgba(255,255,255,0.94)",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.1)",
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const BenchmarkCanvas2dLayer = memo(function BenchmarkCanvas2dLayer({
  items,
  viewport,
  showConnectors,
}: {
  items: BenchmarkRenderItem[];
  viewport: ViewportSize;
  showConnectors: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) {
      return;
    }

    const widthPx = Math.max(1, Math.round(viewport.width));
    const heightPx = Math.max(1, Math.round(viewport.height));
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidthPx = Math.max(
      1,
      Math.round(widthPx * devicePixelRatio)
    );
    const backingHeightPx = Math.max(
      1,
      Math.round(heightPx * devicePixelRatio)
    );

    if (
      canvas.width !== backingWidthPx ||
      canvas.height !== backingHeightPx
    ) {
      canvas.width = backingWidthPx;
      canvas.height = backingHeightPx;
    }

    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, widthPx, heightPx);
    context.font = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE_PX}px ${LABEL_FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineCap = "round";

    items.forEach((item) => {
      const labelLeftPx = item.labelX - item.labelWidth * 0.5;
      const labelTopPx = item.labelY - item.labelHeight * 0.5;

      context.save();
      context.globalAlpha = item.opacity;

      if (showConnectors) {
        context.beginPath();
        context.moveTo(item.anchorX, item.anchorY);
        context.lineTo(item.labelX, item.labelY);
        context.strokeStyle = "rgba(15, 23, 42, 0.28)";
        context.lineWidth = CONNECTOR_STROKE_PX;
        context.stroke();
      }

      context.beginPath();
      context.arc(
        item.anchorX,
        item.anchorY,
        ANCHOR_RADIUS_PX,
        0,
        TWO_PI
      );
      context.fillStyle = item.color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.92)";
      context.lineWidth = 1;
      context.stroke();

      context.save();
      context.shadowColor = "rgba(15, 23, 42, 0.1)";
      context.shadowBlur = 12;
      context.shadowOffsetY = 4;
      roundRect(
        context,
        labelLeftPx,
        labelTopPx,
        item.labelWidth,
        item.labelHeight,
        item.labelHeight * 0.5
      );
      context.fillStyle = "rgba(255,255,255,0.94)";
      context.fill();
      context.restore();

      roundRect(
        context,
        labelLeftPx,
        labelTopPx,
        item.labelWidth,
        item.labelHeight,
        item.labelHeight * 0.5
      );
      context.strokeStyle = "rgba(15, 23, 42, 0.12)";
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = "#0f172a";
      context.fillText(item.label, item.labelX, item.labelY);
      context.restore();
    });
  }, [items, showConnectors, viewport.height, viewport.width]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        ...surfaceLayerStyle,
        display: "block",
      }}
    />
  );
});

const BenchmarkSvgAnchoredLayer = memo(function BenchmarkSvgAnchoredLayer({
  items,
  depthSort,
  showConnectors,
}: {
  items: BenchmarkRenderItem[];
  depthSort: boolean;
  showConnectors: boolean;
}) {
  return (
    <div style={surfaceLayerStyle}>
      {items.map((item) => {
        const dx = item.labelX - item.anchorX;
        const dy = item.labelY - item.anchorY;
        const padding = 12;
        const minX = Math.min(0, dx - item.labelWidth * 0.5) - padding;
        const minY = Math.min(0, dy - item.labelHeight * 0.5) - padding;
        const maxX = Math.max(0, dx + item.labelWidth * 0.5) + padding;
        const maxY = Math.max(0, dy + item.labelHeight * 0.5) + padding;
        const width = maxX - minX;
        const height = maxY - minY;
        const anchorLocalX = -minX;
        const anchorLocalY = -minY;

        return (
          <svg
            key={item.id}
            width={width}
            height={height}
            style={{
              position: "absolute",
              left: `${item.anchorX + minX}px`,
              top: `${item.anchorY + minY}px`,
              overflow: "visible",
              zIndex: depthSort ? item.zIndex : undefined,
              opacity: item.opacity,
              pointerEvents: "none",
            }}
          >
            {showConnectors ? (
              <line
                x1={anchorLocalX}
                y1={anchorLocalY}
                x2={anchorLocalX + dx}
                y2={anchorLocalY + dy}
                stroke="rgba(15, 23, 42, 0.28)"
                strokeWidth={CONNECTOR_STROKE_PX}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <circle
              cx={anchorLocalX}
              cy={anchorLocalY}
              r={ANCHOR_RADIUS_PX}
              fill={item.color}
              stroke="rgba(255,255,255,0.92)"
              strokeWidth={1}
            />
            <rect
              x={anchorLocalX + dx - item.labelWidth * 0.5}
              y={anchorLocalY + dy - item.labelHeight * 0.5}
              width={item.labelWidth}
              height={item.labelHeight}
              rx={item.labelHeight * 0.5}
              ry={item.labelHeight * 0.5}
              fill="rgba(255,255,255,0.94)"
              stroke="rgba(15, 23, 42, 0.12)"
              strokeWidth={1}
            />
            <text
              x={anchorLocalX + dx}
              y={anchorLocalY + dy}
              fill="#0f172a"
              fontSize={11}
              fontWeight={600}
              dominantBaseline="middle"
              textAnchor="middle"
            >
              {item.label}
            </text>
          </svg>
        );
      })}
    </div>
  );
});

const BenchmarkSvgBatchLayer = memo(function BenchmarkSvgBatchLayer({
  items,
  viewport,
  showConnectors,
}: {
  items: BenchmarkRenderItem[];
  viewport: ViewportSize;
  showConnectors: boolean;
}) {
  return (
    <svg
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      style={surfaceLayerStyle}
    >
      <defs>
        <circle id="benchmark-anchor-dot" r={ANCHOR_RADIUS_PX} />
      </defs>
      {items.map((item) => (
        <g key={item.id} opacity={item.opacity}>
          {showConnectors ? (
            <line
              x1={item.anchorX}
              y1={item.anchorY}
              x2={item.labelX}
              y2={item.labelY}
              stroke="rgba(15, 23, 42, 0.28)"
              strokeWidth={CONNECTOR_STROKE_PX}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <use
            href="#benchmark-anchor-dot"
            x={item.anchorX}
            y={item.anchorY}
            fill={item.color}
            stroke="rgba(255,255,255,0.92)"
            strokeWidth={1}
          />
          <rect
            x={item.labelX - item.labelWidth * 0.5}
            y={item.labelY - item.labelHeight * 0.5}
            width={item.labelWidth}
            height={item.labelHeight}
            rx={item.labelHeight * 0.5}
            ry={item.labelHeight * 0.5}
            fill="rgba(255,255,255,0.94)"
            stroke="rgba(15, 23, 42, 0.12)"
            strokeWidth={1}
          />
          <text
            x={item.labelX}
            y={item.labelY}
            fill="#0f172a"
            fontSize={11}
            fontWeight={600}
            dominantBaseline="middle"
            textAnchor="middle"
          >
            {item.label}
          </text>
        </g>
      ))}
    </svg>
  );
});

const OverlayRenderBenchmarkStory = ({
  renderer,
  pointCount,
  updateEveryFrames,
  depthSort,
  impostorLayerCount,
  orthographicScale,
  zDepthPx,
  labelOffsetPx,
  showConnectors,
  animate,
  seed,
}: OverlayRenderBenchmarkArgs) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewport = useViewportSize(viewportRef);
  const points = useMemo(
    () => buildBenchmarkPoints(pointCount, seed),
    [pointCount, seed]
  );

  const [snapshot, setSnapshot] = useState<BenchmarkSnapshot>({
    items: [],
    lastUpdateMs: 0,
    averageUpdateMs: 0,
    updateGapMs: 0,
    lastFrameDeltaMs: 0,
    averageFrameDeltaMs: 0,
    updateCount: 0,
    renderedAtMs: 0,
  });
  const [manualQuaternion, setManualQuaternion] = useState<Quat>(identityQuat);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<DragState | null>(null);
  const manualQuaternionRef = useRef<Quat>(manualQuaternion);
  const isDraggingRef = useRef(false);
  const needsUpdateRef = useRef(true);

  useEffect(() => {
    manualQuaternionRef.current = manualQuaternion;
  }, [manualQuaternion]);

  useEffect(() => {
    needsUpdateRef.current = true;
  }, [
    animate,
    depthSort,
    impostorLayerCount,
    labelOffsetPx,
    orthographicScale,
    pointCount,
    renderer,
    seed,
    showConnectors,
    updateEveryFrames,
    viewport.height,
    viewport.width,
    zDepthPx,
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const viewportElement = viewportRef.current;
      if (
        !dragState ||
        dragState.pointerId !== event.pointerId ||
        !viewportElement
      ) {
        return;
      }

      const nextVector = pointerToArcball(
        event.clientX,
        event.clientY,
        viewportElement.getBoundingClientRect()
      );
      const deltaQuaternion = quatFromUnitVectors(
        dragState.startVector,
        nextVector
      );
      const nextQuaternion = multiplyQuat(
        deltaQuaternion,
        dragState.startQuaternion
      );

      manualQuaternionRef.current = nextQuaternion;
      needsUpdateRef.current = true;
      setManualQuaternion(nextQuaternion);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
      isDraggingRef.current = false;
      needsUpdateRef.current = true;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) {
      return;
    }

    const cadence = Math.max(1, Math.round(updateEveryFrames));
    let frameId = 0;
    let frameCount = 0;
    let lastFrameAtMs = 0;
    let previousRenderedAtMs = 0;
    let updateCountLocal = 0;
    let totalUpdateMs = 0;
    let totalFrameDeltaMs = 0;
    let isCancelled = false;

    const loop = (timeMs: number) => {
      frameCount += 1;
      const frameDeltaMs = lastFrameAtMs > 0 ? timeMs - lastFrameAtMs : 0;
      if (frameDeltaMs > 0) {
        totalFrameDeltaMs += frameDeltaMs;
      }
      lastFrameAtMs = timeMs;

      const shouldUpdate =
        frameCount === 1 ||
        needsUpdateRef.current ||
        isDraggingRef.current ||
        (animate && frameCount % cadence === 0);

      if (shouldUpdate) {
        needsUpdateRef.current = false;
        const startedAt = performance.now();
        const items = buildBenchmarkSnapshot({
          points,
          timeMs,
          viewport,
          orthographicScale,
          labelOffsetPx,
          depthSort,
          animate,
          manualQuaternion: manualQuaternionRef.current,
        });
        const durationMs = performance.now() - startedAt;
        updateCountLocal += 1;
        totalUpdateMs += durationMs;
        const averageFrameDeltaMs =
          frameCount > 1 ? totalFrameDeltaMs / (frameCount - 1) : 0;
        const updateGapMs =
          previousRenderedAtMs > 0 ? timeMs - previousRenderedAtMs : 0;
        previousRenderedAtMs = timeMs;

        if (!isCancelled) {
          setSnapshot({
            items,
            lastUpdateMs: durationMs,
            averageUpdateMs: totalUpdateMs / updateCountLocal,
            updateGapMs,
            lastFrameDeltaMs: frameDeltaMs,
            averageFrameDeltaMs,
            updateCount: updateCountLocal,
            renderedAtMs: timeMs,
          });
        }
      }

      if (!isCancelled) {
        frameId = requestAnimationFrame(loop);
      }
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    animate,
    depthSort,
    labelOffsetPx,
    orthographicScale,
    points,
    updateEveryFrames,
    viewport.height,
    viewport.width,
  ]);

  const statusValues = useMemo(() => {
    const fps =
      snapshot.averageFrameDeltaMs > 0
        ? 1000 / snapshot.averageFrameDeltaMs
        : 0;

    return [
      `renderer ${renderer}`,
      `visible ${snapshot.items.length}`,
      `lag ${formatNumber(snapshot.updateGapMs)} ms`,
      `update ${formatNumber(snapshot.lastUpdateMs)} ms`,
      `frame ${formatNumber(snapshot.lastFrameDeltaMs)} ms`,
      `fps ${formatNumber(fps, 1)}`,
      renderer === "css3d" && impostorLayerCount > 1
        ? `impostor ${Math.round(impostorLayerCount)} layers`
        : "impostor off",
      isDragging ? "drag active" : "drag idle",
    ] as const;
  }, [
    impostorLayerCount,
    isDragging,
    renderer,
    snapshot.averageFrameDeltaMs,
    snapshot.items.length,
    snapshot.lastFrameDeltaMs,
    snapshot.lastUpdateMs,
    snapshot.updateGapMs,
  ]);

  const infoContent = (
    <div style={infoContentStyle}>
      <div>{rendererDescriptions[renderer]}</div>
      <div style={infoGridStyle}>
        <div>
          <div style={infoLabelStyle}>Point Count</div>
          <div style={infoValueStyle}>{pointCount}</div>
        </div>
        <div>
          <div style={infoLabelStyle}>Visible</div>
          <div style={infoValueStyle}>{snapshot.items.length}</div>
        </div>
        <div>
          <div style={infoLabelStyle}>Update Gap</div>
          <div style={infoValueStyle}>
            {formatNumber(snapshot.updateGapMs)} ms
          </div>
        </div>
        <div>
          <div style={infoLabelStyle}>Avg Update</div>
          <div style={infoValueStyle}>
            {formatNumber(snapshot.averageUpdateMs)} ms
          </div>
        </div>
        <div>
          <div style={infoLabelStyle}>Frame Delta</div>
          <div style={infoValueStyle}>
            {formatNumber(snapshot.lastFrameDeltaMs)} ms
          </div>
        </div>
        <div>
          <div style={infoLabelStyle}>Cadence</div>
          <div style={infoValueStyle}>every {updateEveryFrames} frame(s)</div>
        </div>
        <div>
          <div style={infoLabelStyle}>Depth Sort</div>
          <div style={infoValueStyle}>{depthSort ? "on" : "off"}</div>
        </div>
        <div>
          <div style={infoLabelStyle}>Impostor Layers</div>
          <div style={infoValueStyle}>
            {renderer === "css3d" && impostorLayerCount > 1
              ? Math.round(impostorLayerCount)
              : "off"}
          </div>
        </div>
        <div>
          <div style={infoLabelStyle}>Interaction</div>
          <div style={infoValueStyle}>{isDragging ? "versor drag" : "idle"}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={shellStyle}>
      <div style={topBarWrapStyle}>
        <ResponsiveStatusBar label="overlay render benchmark" values={statusValues} />
      </div>

      <div style={infoBoxWrapStyle}>
        <CarmaResponsiveInfoBox
          draggable
          useControlLayout={false}
          width={360}
          heading={
            <span style={{ color: "#ffffff", fontWeight: 600 }}>
              Overlay Render Benchmark
            </span>
          }
          headingColor="rgba(15, 23, 42, 0.92)"
          subtitle="Drag inside the viewport for versor-style rotation."
          content={infoContent}
          footer="Status bar shows the most important timing counters."
        />
      </div>

      <div
        ref={viewportRef}
        style={{
          ...viewportStyle,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !viewportRef.current) {
            return;
          }

          dragStateRef.current = {
            pointerId: event.pointerId,
            startVector: pointerToArcball(
              event.clientX,
              event.clientY,
              viewportRef.current.getBoundingClientRect()
            ),
            startQuaternion: manualQuaternionRef.current,
          };
          isDraggingRef.current = true;
          needsUpdateRef.current = true;
          setIsDragging(true);
          event.preventDefault();
        }}
        onDoubleClick={() => {
          const nextQuaternion = identityQuat();
          manualQuaternionRef.current = nextQuaternion;
          needsUpdateRef.current = true;
          setManualQuaternion(nextQuaternion);
        }}
      >
        <div style={sceneBackdropStyle} />

        {renderer === "css3d" || renderer === "css2d" ? (
          <BenchmarkCssLayer
            items={snapshot.items}
            renderer={renderer}
            depthSort={depthSort}
            showConnectors={showConnectors}
            zDepthPx={zDepthPx}
            impostorLayerCount={impostorLayerCount}
          />
        ) : null}

        {renderer === "canvas2d" ? (
          <BenchmarkCanvas2dLayer
            items={snapshot.items}
            viewport={viewport}
            showConnectors={showConnectors}
          />
        ) : null}

        {renderer === "svgAnchored" ? (
          <BenchmarkSvgAnchoredLayer
            items={snapshot.items}
            depthSort={depthSort}
            showConnectors={showConnectors}
          />
        ) : null}

        {renderer === "svgBatch" ? (
          <BenchmarkSvgBatchLayer
            items={snapshot.items}
            viewport={viewport}
            showConnectors={showConnectors}
          />
        ) : null}
      </div>
    </div>
  );
};

const meta = {
  title: "Providers/LabelOverlay/Benchmarks/Renderer Comparison",
  component: OverlayRenderBenchmarkStory,
  args: {
    renderer: "css3d",
    pointCount: 320,
    updateEveryFrames: 3,
    depthSort: true,
    impostorLayerCount: 6,
    orthographicScale: 180,
    zDepthPx: 220,
    labelOffsetPx: 26,
    showConnectors: true,
    animate: true,
    seed: 7,
  },
  argTypes: {
    renderer: {
      control: "inline-radio",
      options: ["css3d", "css2d", "canvas2d", "svgAnchored", "svgBatch"],
    },
    pointCount: {
      control: { type: "range", min: 40, max: 1600, step: 20 },
    },
    updateEveryFrames: {
      control: { type: "range", min: 1, max: 12, step: 1 },
    },
    orthographicScale: {
      control: { type: "range", min: 80, max: 320, step: 4 },
    },
    impostorLayerCount: {
      control: { type: "range", min: 1, max: 24, step: 1 },
    },
    zDepthPx: {
      control: { type: "range", min: 0, max: 480, step: 8 },
    },
    labelOffsetPx: {
      control: { type: "range", min: 10, max: 48, step: 1 },
    },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OverlayRenderBenchmarkStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Css3dBillboards: Story = {
  args: {
    renderer: "css3d",
  },
};

export const Css2dDepthSorted: Story = {
  args: {
    renderer: "css2d",
    zDepthPx: 0,
  },
};

export const Canvas2dParity: Story = {
  args: {
    renderer: "canvas2d",
    zDepthPx: 0,
  },
};

export const SvgAnchorsVsSingleSvg: Story = {
  args: {
    renderer: "svgAnchored",
    zDepthPx: 0,
  },
};
