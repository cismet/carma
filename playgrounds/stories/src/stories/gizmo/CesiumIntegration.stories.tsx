import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  PointPrimitiveCollection,
  SceneTransforms,
  Transforms,
  defined,
  type PointPrimitive,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import {
  LabelOverlayProvider,
  PointLabel,
  useLabelOverlay,
} from "@carma-providers/label-overlay";
import {
  useCesiumPointMoveGizmo,
  useCesiumPointMoveGizmoConnector,
  type CesiumMoveGizmoAxisCandidate,
} from "@carma-mapping/engines-interop/gizmo/cesium-integration";
import { WUPPERTAL } from "@carma-commons/resources";
import { setupCesium } from "../map-framework-switcher/helpers/cesium-setup";

import "cesium/Build/Cesium/Widgets/widgets.css";

if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
  (window as any).__CARMA_DEBUG_AXIS_VISUALIZER__ = true;
  (window as any).__CARMA_DEBUG_DISC_VISUALIZER__ = true;
}

type AxisMode = "geoportal-default" | "enu" | "up-only" | "world";

type GizmoSandboxProps = {
  pointLon: number;
  pointLat: number;
  pointHeight: number;
  radius: number;
  axisMode: AxisMode;
  axisTitle: string;
  showGridMirror: boolean;
  showPointLabelVis: boolean;
  gridTiltDeg: number;
  gridDeltaScale: number;
};

const DOT_START_HEIGHT_M = 240;
const DEMO_POINT_LABEL_ID = "gizmo-demo-point-label";

const number = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";

const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Cesium teardown can race with effect cleanup.
  }
};

const hasMeaningfulMatrixHeadChange = (
  previous: number[],
  next: number[],
  epsilon = 1e-3
): boolean => {
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs((previous[i] ?? 0) - (next[i] ?? 0)) > epsilon) {
      return true;
    }
  }
  return false;
};

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

const GizmoSandboxContent = ({
  rootRef,
  pointLon,
  pointLat,
  pointHeight,
  radius,
  axisMode,
  axisTitle,
  showGridMirror,
  showPointLabelVis,
  gridTiltDeg,
  gridDeltaScale,
}: GizmoSandboxProps & { rootRef: React.RefObject<HTMLDivElement | null> }) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const pointPrimitiveCollectionRef = useRef<PointPrimitiveCollection | null>(
    null
  );
  const pointPrimitiveRef = useRef<PointPrimitive | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  const initialPoint = useMemo(
    () => Cartesian3.fromDegrees(pointLon, pointLat, pointHeight),
    [pointLon, pointLat, pointHeight]
  );

  const [viewMatrixSnapshot, setViewMatrixSnapshot] = useState<number[]>(
    Array.from({ length: 16 }, () => 0)
  );

  const {
    pointPosition,
    setPointPosition,
    dragging,
    activeAxisDirection: activeAxis,
    gizmoBinding,
  } = useCesiumPointMoveGizmoConnector({
    initialPoint,
    movePointId: "demo-point",
  });

  const storyStartPoint = useMemo(
    () =>
      Cartesian3.fromDegrees(
        WUPPERTAL.position.longitude,
        WUPPERTAL.position.latitude,
        DOT_START_HEIGHT_M
      ),
    []
  );

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    let mounted = true;

    const initialize = async () => {
      const result = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement,
        {
          useBrowserRecommendedResolution: true,
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
      setScene(widget.scene);

      setPointPosition(storyStartPoint);

      const pointCollection = new PointPrimitiveCollection();
      widget.scene.primitives.add(pointCollection);
      pointPrimitiveCollectionRef.current = pointCollection;
      pointPrimitiveRef.current = pointCollection.add({
        position: storyStartPoint,
        pixelSize: 14,
        color: Color.CYAN,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });

      widget.scene.requestRender();
    };

    void initialize();

    return () => {
      mounted = false;
      pointPrimitiveRef.current = null;
      pointPrimitiveCollectionRef.current = null;
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
      setScene(null);
    };
  }, [initialPoint, setPointPosition, storyStartPoint]);

  useEffect(() => {
    if (!showGridMirror || !scene || scene.isDestroyed()) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!scene || scene.isDestroyed()) return;
      try {
        const nextSnapshot = Matrix4.toArray(
          scene.camera.viewMatrix,
          new Array<number>(16)
        );
        setViewMatrixSnapshot((previous) =>
          hasMeaningfulMatrixHeadChange(previous, nextSnapshot)
            ? nextSnapshot
            : previous
        );
      } catch {
        // Ignore camera sampling races during teardown.
      }
    }, 200);

    return () => {
      window.clearInterval(timer);
    };
  }, [scene, showGridMirror]);

  useEffect(() => {
    const point = pointPrimitiveRef.current;
    if (point) {
      point.position = pointPosition;
      scene?.requestRender();
    }
  }, [pointPosition, scene]);

  const axisCandidates = useMemo(
    () => buildCandidates(axisMode, pointPosition, axisTitle),
    [axisMode, axisTitle, pointPosition]
  );

  const axisCandidatesForHook =
    axisMode === "geoportal-default" ? null : axisCandidates;
  const axisTitleForHook = axisMode === "geoportal-default" ? null : axisTitle;
  const initialAxisDirection = useMemo(
    () => getInitialAxisDirectionForMode(axisMode, storyStartPoint, axisTitle),
    [axisMode, axisTitle, storyStartPoint]
  );
  const axisDirectionForHook =
    axisMode === "geoportal-default" || activeAxis
      ? null
      : initialAxisDirection;

  useCesiumPointMoveGizmo(scene, {
    ...gizmoBinding,
    axisTitle: axisTitleForHook,
    axisCandidates: axisCandidatesForHook,
    axisDirection: axisDirectionForHook,
    radius,
  });

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showPointLabelVis) {
      removeLabelOverlayElement(DEMO_POINT_LABEL_ID);
      return;
    }

    addLabelOverlayElement({
      id: DEMO_POINT_LABEL_ID,
      zIndex: 20,
      content: (
        <PointLabel
          content="Demo Point"
          lineColor="rgba(255,255,255,0.95)"
          textColor="white"
          textBackgroundColor="rgba(15,23,42,0.85)"
          selectedBackgroundColor="rgba(15,23,42,0.85)"
          hoverBackgroundColor="rgba(15,23,42,0.85)"
          markerSize={10}
          markerStrokeWidth={1}
          labelDistance={18}
        />
      ),
      getCanvasPosition: () => {
        if (!scene || scene.isDestroyed()) return null;
        const p = SceneTransforms.worldToWindowCoordinates(
          scene,
          pointPosition
        );
        if (!defined(p)) return null;
        return { x: p.x, y: p.y };
      },
      visible: true,
      isHidden: false,
    });

    return () => {
      removeLabelOverlayElement(DEMO_POINT_LABEL_ID);
    };
  }, [
    addLabelOverlayElement,
    removeLabelOverlayElement,
    scene,
    showPointLabelVis,
    pointPosition,
  ]);

  const delta = useMemo(
    () => Cartesian3.subtract(pointPosition, initialPoint, new Cartesian3()),
    [pointPosition, initialPoint]
  );

  const cssGridTransform = useMemo(() => {
    const dx = delta.x * gridDeltaScale;
    const dy = delta.y * gridDeltaScale;
    const dz = delta.z * gridDeltaScale;

    return `perspective(900px) rotateX(${gridTiltDeg + dz}deg) rotateZ(${
      dx * 0.6
    }deg) translate3d(${dx}px, ${-dy}px, 0px)`;
  }, [delta.x, delta.y, delta.z, gridDeltaScale, gridTiltDeg]);

  const cameraHeight = scene?.camera?.positionCartographic?.height ?? null;

  return (
    <div
      ref={rootRef}
      style={{
        display: "grid",
        gridTemplateColumns: showGridMirror ? "1fr 360px" : "1fr",
        gap: 12,
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

      {showGridMirror && (
        <div
          style={{
            background: "#0b1020",
            color: "#d1d5db",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <strong style={{ color: "#fff" }}>CSS Grid Mirror</strong>
          <div
            style={{
              position: "relative",
              height: 220,
              background:
                "radial-gradient(circle at 50% 45%, rgba(148,163,184,0.16), rgba(15,23,42,0.96))",
              border: "1px solid rgba(148,163,184,0.35)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: 260,
                height: 260,
                transformStyle: "preserve-3d",
                transform: cssGridTransform,
                backgroundImage:
                  "linear-gradient(rgba(34,211,238,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.35) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                boxShadow: "0 0 30px rgba(34,211,238,0.18)",
              }}
            />
          </div>

          <div style={{ fontSize: 12, lineHeight: 1.45 }}>
            <div>
              <strong>Drag state:</strong> {dragging ? "dragging" : "idle"}
            </div>
            <div>
              <strong>ECEF Δx/Δy/Δz:</strong> {number(delta.x, 2)} /{" "}
              {number(delta.y, 2)} / {number(delta.z, 2)}
            </div>
            <div>
              <strong>Point x/y/z:</strong> {number(pointPosition.x, 1)} /{" "}
              {number(pointPosition.y, 1)} / {number(pointPosition.z, 1)}
            </div>
            <div>
              <strong>Camera h:</strong>{" "}
              {cameraHeight !== null ? `${number(cameraHeight, 2)}m` : "—"}
            </div>
            <div>
              <strong>Axis dir:</strong>{" "}
              {activeAxis
                ? `${number(activeAxis.x, 3)}, ${number(
                    activeAxis.y,
                    3
                  )}, ${number(activeAxis.z, 3)}`
                : "—"}
            </div>
            <div>
              <strong>View matrix m00..m03:</strong>{" "}
              {viewMatrixSnapshot
                .slice(0, 4)
                .map((value) => number(value, 3))
                .join(", ")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GizmoSandbox = (props: GizmoSandboxProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <LabelOverlayProvider containerRef={rootRef}>
      <GizmoSandboxContent {...props} rootRef={rootRef} />
    </LabelOverlayProvider>
  );
};

const meta: Meta<GizmoSandboxProps> = {
  title: "Gizmo/Cesium Integration",
  component: GizmoSandbox,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    pointLon: { control: { type: "number" } },
    pointLat: { control: { type: "number" } },
    pointHeight: { control: { type: "number" } },
    radius: { control: { type: "range", min: 0.5, max: 30, step: 0.5 } },
    axisMode: {
      control: { type: "inline-radio" },
      options: ["geoportal-default", "enu", "up-only", "world"],
    },
    axisTitle: { control: { type: "text" } },
    showGridMirror: { control: { type: "boolean" } },
    showPointLabelVis: { control: { type: "boolean" } },
    gridTiltDeg: { control: { type: "range", min: -85, max: 85, step: 1 } },
    gridDeltaScale: {
      control: { type: "range", min: 0.0001, max: 0.02, step: 0.0001 },
    },
  },
};

export default meta;

export const Cesium: StoryObj<GizmoSandboxProps> = {
  name: "Cesium Integration",
  args: {
    pointLon: 7.1527,
    pointLat: 51.2562,
    pointHeight: 165,
    radius: 8,
    axisMode: "enu",
    axisTitle: "Move point along selected axis",
    showGridMirror: false,
    showPointLabelVis: true,
    gridTiltDeg: 62,
    gridDeltaScale: 0.002,
  },
};
