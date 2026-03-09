import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { Card } from "antd";
import {
  CarmaTransforms,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive as CesiumPrimitive,
  Transforms,
  createMinimalCesiumWidget,
  type CesiumWidget,
  type Primitive,
} from "@carma/cesium";
import {
  createDisc,
  createRing,
  createRingSegment,
  createUnitRingSegmentGeometry,
} from "@carma-mapping/engines/cesium/primitives";
import { clamp, lerp } from "@carma-commons/math";
import {
  StoryKeyValueList,
  type StoryKeyValueItem,
} from "../shared/StoryKeyValueList";

import "cesium/Build/Cesium/Widgets/widgets.css";

if (
  typeof window !== "undefined" &&
  !(window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL
) {
  (window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/__cesium__/";
}

type PrimitiveContentMode = "unit-disc" | "unique-primitives";

type DiscStoryArgs = {
  radius: number;
  segments: number;
};

type RingStoryArgs = {
  radius: number;
  innerRadius: number;
  segments: number;
};

type RingSegmentStoryArgs = {
  radius: number;
  innerRadius: number;
  rotationDeg: number;
  angleDeg: number;
  segments: number;
};

type StressStoryArgs = {
  contentMode: PrimitiveContentMode;
  gridEdgeLength: number;
  gridDepth: number;
  spacing: number;
  radius: number;
  segments: number;
};

const PREVIEW_HEIGHT_PX = 640;
const MIN_RADIUS = 0.1;
const FULL_CIRCLE_DEG = 360;
const FULL_CIRCLE_RAD = Math.PI * 2;
const INITIAL_CAMERA_DISTANCE = 5;
const INITIAL_CAMERA_PITCH_RAD = -Math.PI / 2 + 0.1;
const DEMO_ANCHOR = Cartesian3.fromDegrees(7.19993, 51.27225, 185);
const BACKGROUND_COLOR = Color.fromCssColorString("#0b1220");
const GLOBE_COLOR = Color.fromCssColorString("#1a1a1a");
const DISC_BASE_COLOR = Color.fromCssColorString("rgb(96, 165, 250)");
const RING_BASE_COLOR = Color.fromCssColorString("rgb(34, 197, 94)");
const SECTOR_BASE_COLOR = Color.fromCssColorString("rgb(251, 146, 60)");

const STRESS_SECTOR_ROTATION_CENTER_DEG = 30;
const STRESS_SECTOR_ANGLE_CENTER_DEG = 240;
const STRESS_SECTOR_ANGLE_VARIATION_DEG = 160;
const STRESS_INNER_RADIUS_MIN_RATIO = 0.1;
const STRESS_INNER_RADIUS_MAX_RATIO = 0.9;
const SINGLE_SHAPE_OPACITY = 1;
const STRESS_SHAPE_OPACITY = 0.1;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const toFiniteNumber = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toSafeRadius = (value: number | undefined, fallback = MIN_RADIUS) =>
  Math.max(toFiniteNumber(value, fallback), MIN_RADIUS);

const toSafeSegments = (value: number | undefined, fallback = 8) =>
  Math.max(8, Math.floor(toFiniteNumber(value, fallback)));

const toSafeGridLength = (value: number | undefined, fallback = 1) =>
  Math.max(1, Math.floor(toFiniteNumber(value, fallback)));

const toSafeSpacing = (value: number | undefined, fallback = 1) =>
  Math.max(0.2, toFiniteNumber(value, fallback));

const withOpacity = (color: Color, opacity: number) =>
  Color.fromAlpha(color, clamp(opacity, 0, 1), new Color());

const toNormalizedInnerRadius = (innerRadius: number, radius: number) =>
  clamp(innerRadius / toSafeRadius(radius), 0, 1 - 1e-3);


const createBatchedPrimitive = (
  geometryInstances: GeometryInstance[],
  translucent: boolean
) =>
  new CesiumPrimitive({
    geometryInstances,
    appearance: new PerInstanceColorAppearance({
      translucent,
      closed: false,
    }),
    allowPicking: false,
    asynchronous: true,
    releaseGeometryInstances: true,
    show: true,
  });

const resolveDevicePixelRatio = () =>
  typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);

const applyPhysicalPixelResolution = (widget: CesiumWidget) => {
  widget.useBrowserRecommendedResolution = false;
  widget.resolutionScale = resolveDevicePixelRatio();
};

const withLocalOffset = (
  anchor: Cartesian3,
  eastOffset: number,
  northOffset: number,
  upOffset = 0
) =>
  Matrix4.multiplyByPoint(
    Transforms.eastNorthUpToFixedFrame(anchor),
    new Cartesian3(eastOffset, northOffset, upOffset),
    new Cartesian3()
  );

const createEnuPlanarModelMatrix = (
  center: Cartesian3,
  planarScale = 1,
  rotationRad = 0
): Matrix4 => {
  const enu = Transforms.eastNorthUpToFixedFrame(center);
  const planar = CarmaTransforms.createPlanarScaleRotationTranslationMatrix(
    Cartesian3.ZERO,
    planarScale,
    rotationRad,
    1e-6
  );
  return Matrix4.multiply(enu, planar, new Matrix4());
};

const initializeStoryWidget = (container: HTMLDivElement): CesiumWidget => {
  const widget = createMinimalCesiumWidget(container, {
    baseLayer: false,
    skyBox: false,
    skyAtmosphere: false,
    requestRenderMode: true,
    useBrowserRecommendedResolution: false,
  });

  applyPhysicalPixelResolution(widget);
  widget.scene.backgroundColor = BACKGROUND_COLOR;
  widget.scene.screenSpaceCameraController.enableCollisionDetection = false;

  if (widget.scene.globe) {
    widget.scene.globe.baseColor = GLOBE_COLOR;
    widget.scene.globe.showGroundAtmosphere = false;
    widget.scene.globe.enableLighting = false;
  }

  return widget;
};

const attachPixelRatioResizeListener = (widget: CesiumWidget) => {
  const onResize = () => {
    if (widget.isDestroyed()) return;
    applyPhysicalPixelResolution(widget);
    widget.scene.requestRender();
  };

  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
};

const removePrimitiveSafe = (
  widget: CesiumWidget,
  primitive: Primitive | null | undefined
) => {
  if (!primitive || widget.isDestroyed()) return;
  try {
    widget.scene.primitives.remove(primitive);
  } catch {
    // Ignore teardown races while Storybook remounts.
  }
};

const clearPrimitivesSafe = (
  widget: CesiumWidget,
  primitivesRef: MutableRefObject<Primitive[]>
) => {
  if (widget.isDestroyed()) return;
  for (const primitive of primitivesRef.current) {
    removePrimitiveSafe(widget, primitive);
  }
  primitivesRef.current = [];
};

const setInitialTopDownCamera = (widget: CesiumWidget) => {
  const destination = withLocalOffset(DEMO_ANCHOR, 0, 0, INITIAL_CAMERA_DISTANCE);
  widget.camera.setView({
    destination,
    orientation: {
      heading: 0,
      pitch: INITIAL_CAMERA_PITCH_RAD,
      roll: 0,
    },
  });
  widget.camera.lookAtTransform(Matrix4.IDENTITY);
};

const StoryOverlay = ({
  title,
  details,
}: {
  title: string;
  details: StoryKeyValueItem[];
}) => (
  <Card
    size="small"
    bordered={false}
    style={{
      position: "absolute",
      top: 12,
      left: 12,
      display: "inline-block",
      width: "fit-content",
      maxWidth: "min(320px, calc(100vw - 24px))",
      pointerEvents: "none",
      background: "rgba(2, 6, 23, 0.85)",
      boxShadow: "0 6px 18px rgba(2, 6, 23, 0.42)",
    }}
    bodyStyle={{ padding: "8px 10px" }}
  >
    <div
      style={{
        display: "block",
        color: "#f8fafc",
        fontWeight: 700,
        marginBottom: 2,
      }}
    >
      {title}
    </div>
    <StoryKeyValueList items={details} />
  </Card>
);

const SinglePrimitiveCanvas = ({
  createPrimitive,
  title,
  details,
}: {
  createPrimitive: (center: Cartesian3) => Primitive;
  title: string;
  details: StoryKeyValueItem[];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const primitiveRef = useRef<Primitive | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const widget = initializeStoryWidget(containerRef.current);
    const detachResize = attachPixelRatioResizeListener(widget);
    setInitialTopDownCamera(widget);
    widget.scene.requestRender();
    widgetRef.current = widget;

    return () => {
      detachResize();
      const activeWidget = widgetRef.current;
      if (!activeWidget) return;
      removePrimitiveSafe(activeWidget, primitiveRef.current);
      primitiveRef.current = null;
      try {
        if (!activeWidget.isDestroyed()) {
          activeWidget.destroy();
        }
      } catch {
        // Ignore teardown races during Storybook hot-reload/unmount.
      }
      widgetRef.current = null;
    };
  }, []);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) return;

    removePrimitiveSafe(widget, primitiveRef.current);
    const center = withLocalOffset(DEMO_ANCHOR, 0, 0, 0);
    const nextPrimitive = createPrimitive(center);
    widget.scene.primitives.add(nextPrimitive);
    primitiveRef.current = nextPrimitive;

    widget.scene.requestRender();

    return () => {
      removePrimitiveSafe(widget, primitiveRef.current);
      primitiveRef.current = null;
      if (!widget.isDestroyed()) {
        widget.scene.requestRender();
      }
    };
  }, [createPrimitive]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: PREVIEW_HEIGHT_PX,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <StoryOverlay title={title} details={details} />
    </div>
  );
};

const DiscPreview = ({
  radius,
  segments,
}: DiscStoryArgs) => {
  const safeRadius = toSafeRadius(radius, 2.5);
  const safeSegments = toSafeSegments(segments, 24);
  const color = DISC_BASE_COLOR;

  const createPrimitive = useCallback(
    (center: Cartesian3) =>
      createDisc("story-disc", {
        radius: safeRadius,
        segments: safeSegments,
        color,
        modelMatrix: createEnuPlanarModelMatrix(center),
      }),
    [color, safeRadius, safeSegments]
  );

  return (
    <SinglePrimitiveCanvas
      createPrimitive={createPrimitive}
      title="createDisc"
      details={[
        { id: "radius", label: "radius", value: safeRadius, fractionDigits: 2 },
        { id: "segments", label: "segments", value: safeSegments, fractionDigits: 0 },
      ]}
    />
  );
};

const RingPreview = ({
  radius,
  innerRadius,
  segments,
}: RingStoryArgs) => {
  const safeRadius = toSafeRadius(radius, 3);
  const maxInner = Math.max(0, safeRadius - 1e-3);
  const safeInnerRadius = clamp(
    toFiniteNumber(innerRadius, safeRadius * 0.5),
    0,
    maxInner
  );
  const safeSegments = toSafeSegments(segments, 48);
  const color = withOpacity(RING_BASE_COLOR, SINGLE_SHAPE_OPACITY);

  const createPrimitive = useCallback(
    (center: Cartesian3) =>
      createRing("story-ring", {
        radius: safeRadius,
        innerRadius: safeInnerRadius,
        segments: safeSegments,
        color,
        modelMatrix: createEnuPlanarModelMatrix(center),
      }),
    [color, safeInnerRadius, safeRadius, safeSegments]
  );

  return (
    <SinglePrimitiveCanvas
      createPrimitive={createPrimitive}
      title="createRing"
      details={[
        { id: "radius", label: "radius", value: safeRadius, fractionDigits: 2 },
        { id: "inner", label: "inner", value: safeInnerRadius, fractionDigits: 2 },
        { id: "segments", label: "segments", value: safeSegments, fractionDigits: 0 },
      ]}
    />
  );
};

const RingSegmentPreview = ({
  radius,
  innerRadius,
  rotationDeg,
  angleDeg,
  segments,
}: RingSegmentStoryArgs) => {
  const safeRadius = toSafeRadius(radius, 3);
  const maxInner = Math.max(0, safeRadius - 1e-3);
  const safeInnerRadius = clamp(
    toFiniteNumber(innerRadius, safeRadius * 0.4),
    0,
    maxInner
  );
  const safeSegments = toSafeSegments(segments, 48);
  const safeRotationDeg = toFiniteNumber(rotationDeg, 20);
  const safeAngleDeg = clamp(toFiniteNumber(angleDeg, 220), 0, FULL_CIRCLE_DEG);
  const color = withOpacity(SECTOR_BASE_COLOR, SINGLE_SHAPE_OPACITY);

  const createPrimitive = useCallback(
    (center: Cartesian3) =>
      createRingSegment("story-ring-segment", {
        radius: safeRadius,
        innerRadius: safeInnerRadius,
        angleRad: toRadians(safeAngleDeg),
        rotationRad: toRadians(safeRotationDeg),
        segments: safeSegments,
        color,
        modelMatrix: createEnuPlanarModelMatrix(center),
      }),
    [
      color,
      safeInnerRadius,
      safeRotationDeg,
      safeRadius,
      safeSegments,
      safeAngleDeg,
    ]
  );

  return (
    <SinglePrimitiveCanvas
      createPrimitive={createPrimitive}
      title="createRingSegment"
      details={[
        { id: "radius", label: "radius", value: safeRadius, fractionDigits: 2 },
        { id: "inner", label: "inner", value: safeInnerRadius, fractionDigits: 2 },
        {
          id: "rotation",
          label: "rotation",
          value: safeRotationDeg,
          unit: "°",
          fractionDigits: 1,
        },
        {
          id: "angle",
          label: "angle",
          value: safeAngleDeg,
          unit: "°",
          fractionDigits: 1,
        },
      ]}
    />
  );
};

const StressPreview = ({
  contentMode,
  gridEdgeLength,
  gridDepth,
  spacing,
  radius,
  segments,
}: StressStoryArgs) => {
  const safeContentMode: PrimitiveContentMode =
    contentMode === "unit-disc" ? "unit-disc" : "unique-primitives";
  const safeEdgeLength = toSafeGridLength(gridEdgeLength, 10);
  const safeDepth = toSafeGridLength(gridDepth, 10);
  const safeSpacing = toSafeSpacing(spacing, 3.5);
  const safeRadius = toSafeRadius(radius, 1.3);
  const safeSegments = toSafeSegments(segments, 16);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const primitivesRef = useRef<Primitive[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const widget = initializeStoryWidget(containerRef.current);
    const detachResize = attachPixelRatioResizeListener(widget);
    setInitialTopDownCamera(widget);
    widget.scene.requestRender();
    widgetRef.current = widget;

    return () => {
      detachResize();
      const activeWidget = widgetRef.current;
      if (!activeWidget) return;
      clearPrimitivesSafe(activeWidget, primitivesRef);
      try {
        if (!activeWidget.isDestroyed()) {
          activeWidget.destroy();
        }
      } catch {
        // Ignore teardown races during Storybook hot-reload/unmount.
      }
      widgetRef.current = null;
    };
  }, []);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) return;

    clearPrimitivesSafe(widget, primitivesRef);

    const halfEdge = (safeEdgeLength - 1) / 2;
    const halfDepth = (safeDepth - 1) / 2;
    const discColor = withOpacity(DISC_BASE_COLOR, STRESS_SHAPE_OPACITY);
    const sectorColor = withOpacity(SECTOR_BASE_COLOR, STRESS_SHAPE_OPACITY);

    const maxInnerRadius = Math.max(0, safeRadius - 1e-3);
    const safeInnerMin = clamp(
      safeRadius * STRESS_INNER_RADIUS_MIN_RATIO,
      0,
      maxInnerRadius
    );
    const safeInnerMax = clamp(
      safeRadius * STRESS_INNER_RADIUS_MAX_RATIO,
      safeInnerMin,
      maxInnerRadius
    );

    const frames = Array.from(
      { length: safeEdgeLength * safeEdgeLength * safeDepth },
      (_, index) => {
        const layerArea = safeEdgeLength * safeEdgeLength;
        const layer = Math.floor(index / layerArea);
        const indexWithinLayer = index % layerArea;
        const row = Math.floor(indexWithinLayer / safeEdgeLength);
        const col = indexWithinLayer % safeEdgeLength;

        return {
          layer,
          row,
          col,
          rowRatio: safeEdgeLength <= 1 ? 0 : row / (safeEdgeLength - 1),
          colRatio: safeEdgeLength <= 1 ? 0 : col / (safeEdgeLength - 1),
          layerRatio: safeDepth <= 1 ? 0 : layer / (safeDepth - 1),
          center: withLocalOffset(
            DEMO_ANCHOR,
            (col - halfEdge) * safeSpacing,
            (row - halfEdge) * safeSpacing,
            (layer - halfDepth) * safeSpacing
          ),
        };
      }
    );

    const nextPrimitives =
      safeContentMode === "unit-disc"
        ? (() => {
            const sharedDiscGeometry = createUnitRingSegmentGeometry({
              innerRadiusRatio: 0,
              angleRad: FULL_CIRCLE_RAD,
              segments: safeSegments,
            });
            const instances = frames.map((frame) => {
              return new GeometryInstance({
                id: `stress-disc-${frame.layer}-${frame.row}-${frame.col}`,
                geometry: sharedDiscGeometry,
                modelMatrix: createEnuPlanarModelMatrix(
                  frame.center,
                  safeRadius
                ),
                attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(discColor),
                },
              });
            });

            return [createBatchedPrimitive(instances, discColor.alpha < 1)];
          })()
        : (() => {
            const geometryCache = new Map<string, ReturnType<typeof createUnitRingSegmentGeometry>>();
            const resolveGeometry = (normalizedInnerRadius: number, angleRad: number) => {
              const key = `${normalizedInnerRadius.toFixed(6)}|${angleRad.toFixed(
                6
              )}|${safeSegments}`;
              const cached = geometryCache.get(key);
              if (cached) return cached;
              const geometry = createUnitRingSegmentGeometry({
                innerRadiusRatio: normalizedInnerRadius,
                angleRad,
                segments: safeSegments,
              });
              geometryCache.set(key, geometry);
              return geometry;
            };

            const instances = frames.map((frame) => {
              const rotationDeg = lerp(
                STRESS_SECTOR_ROTATION_CENTER_DEG -
                  STRESS_SECTOR_ANGLE_VARIATION_DEG * 0.5,
                STRESS_SECTOR_ROTATION_CENTER_DEG +
                  STRESS_SECTOR_ANGLE_VARIATION_DEG * 0.5,
                frame.colRatio
              );
              const angleDeg = clamp(
                lerp(
                  STRESS_SECTOR_ANGLE_CENTER_DEG -
                    STRESS_SECTOR_ANGLE_VARIATION_DEG * 0.5,
                  STRESS_SECTOR_ANGLE_CENTER_DEG +
                    STRESS_SECTOR_ANGLE_VARIATION_DEG * 0.5,
                  frame.rowRatio
                ),
                0,
                FULL_CIRCLE_DEG
              );
              const innerRadius = lerp(safeInnerMin, safeInnerMax, frame.layerRatio);
              const normalizedInnerRadius = toNormalizedInnerRadius(
                innerRadius,
                safeRadius
              );
              const angleRad = toRadians(angleDeg);

              return new GeometryInstance({
                id: `stress-sector-${frame.layer}-${frame.row}-${frame.col}`,
                geometry: resolveGeometry(normalizedInnerRadius, angleRad),
                modelMatrix: createEnuPlanarModelMatrix(
                  frame.center,
                  safeRadius,
                  toRadians(rotationDeg)
                ),
                attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(sectorColor),
                },
              });
            });

            return [createBatchedPrimitive(instances, sectorColor.alpha < 1)];
          })();

    for (const primitive of nextPrimitives) {
      widget.scene.primitives.add(primitive);
    }
    primitivesRef.current = nextPrimitives;

    widget.scene.requestRender();

    return () => {
      clearPrimitivesSafe(widget, primitivesRef);
      if (!widget.isDestroyed()) {
        widget.scene.requestRender();
      }
    };
  }, [
    safeContentMode,
    safeDepth,
    safeEdgeLength,
    safeRadius,
    safeSegments,
    safeSpacing,
  ]);

  const total = safeEdgeLength * safeEdgeLength * safeDepth;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: PREVIEW_HEIGHT_PX,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <StoryOverlay
        title="StressTest"
        details={[
          { id: "mode", label: "mode", value: safeContentMode },
          {
            id: "grid",
            label: "grid",
            value: `${safeEdgeLength}x${safeEdgeLength}x${safeDepth} (${total})`,
          },
          { id: "radius", label: "radius", value: safeRadius, fractionDigits: 2 },
        ]}
      />
    </div>
  );
};

const meta = {
  title: "cesium-primitives/Generators",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

export const Disc: StoryObj<DiscStoryArgs> = {
  render: (args) => <DiscPreview {...args} />,
  args: {
    radius: 2.5,
    segments: 24,
  },
  argTypes: {
    radius: {
      control: { type: "range", min: 0.1, max: 20, step: 0.1 },
    },
    segments: {
      control: { type: "range", min: 8, max: 256, step: 1 },
    },
  },
};

export const Ring: StoryObj<RingStoryArgs> = {
  render: (args) => <RingPreview {...args} />,
  args: {
    radius: 3,
    innerRadius: 1.4,
    segments: 48,
  },
  argTypes: {
    radius: {
      control: { type: "range", min: 0.1, max: 20, step: 0.1 },
    },
    innerRadius: {
      control: { type: "range", min: 0, max: 20, step: 0.1 },
    },
    segments: {
      control: { type: "range", min: 8, max: 256, step: 1 },
    },
  },
};

export const RingSegment: StoryObj<RingSegmentStoryArgs> = {
  render: (args) => <RingSegmentPreview {...args} />,
  args: {
    radius: 3,
    innerRadius: 1.2,
    rotationDeg: 20,
    angleDeg: 220,
    segments: 48,
  },
  argTypes: {
    radius: {
      control: { type: "range", min: 0.1, max: 20, step: 0.1 },
    },
    innerRadius: {
      control: { type: "range", min: 0, max: 20, step: 0.1 },
    },
    rotationDeg: {
      control: {
        type: "range",
        min: -FULL_CIRCLE_DEG,
        max: FULL_CIRCLE_DEG,
        step: 1,
      },
    },
    angleDeg: {
      control: { type: "range", min: 0, max: FULL_CIRCLE_DEG, step: 1 },
    },
    segments: {
      control: { type: "range", min: 8, max: 256, step: 1 },
    },
  },
};

export const StressTest: StoryObj<StressStoryArgs> = {
  render: (args) => <StressPreview {...args} />,
  args: {
    contentMode: "unique-primitives",
    gridEdgeLength: 10,
    gridDepth: 10,
    spacing: 3.5,
    radius: 1.3,
    segments: 16,
  },
  argTypes: {
    contentMode: {
      control: { type: "radio" },
      options: ["unit-disc", "unique-primitives"],
    },
    gridEdgeLength: {
      control: { type: "range", min: 1, max: 160, step: 1 },
    },
    gridDepth: {
      control: { type: "range", min: 1, max: 160, step: 1 },
    },
    spacing: {
      control: { type: "range", min: 0.2, max: 30, step: 0.1 },
    },
    radius: {
      control: { type: "range", min: 0.1, max: 12, step: 0.1 },
    },
    segments: {
      control: { type: "range", min: 8, max: 128, step: 1 },
    },
  },
};
