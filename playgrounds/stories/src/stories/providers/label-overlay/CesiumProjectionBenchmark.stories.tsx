import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  Matrix4 as CesiumMatrix4,
  SceneTransforms,
  Transforms,
  type Cesium3DTileset,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  LabelOverlayProvider,
  useLabelOverlay,
} from "@carma-providers/label-overlay";
import {
  useCesiumLabelOverlayHost,
  useCesiumViewProjector,
} from "@carma-mapping/engines/cesium/react/interactions";
import {
  Matrix4,
  OrthographicCamera,
  Scene as ThreeScene,
  Vector3,
  Vector4,
} from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/api";
import { setupCesium } from "../../map-engine-switcher/helpers/cesium-setup";
import { requestStoryCesiumRender } from "../../shared/cesiumRuntimeGuards";
import {
  formatStoryPerformanceLabel,
  useAnimationFramePerformanceStatus,
} from "./useStoryPerformanceStatus";

import "cesium/Build/Cesium/Widgets/widgets.css";

type BenchmarkOverlayRenderer =
  | "provider-portals"
  | "canvas-2d"
  | "three-css2d";
type BenchmarkProjectionMode = "cesium" | "matrix";
type BenchmarkPointSource = "tileset-random" | "wuppertal-radial";

type CesiumProjectionBenchmarkStoryArgs = {
  pointCount: number;
  benchmarkSamplesPerFrame: number;
  overlayRenderer: BenchmarkOverlayRenderer;
  projectionMode: BenchmarkProjectionMode;
  pointSource: BenchmarkPointSource;
  forceLayoutOnPortalRender: boolean;
};

type BenchmarkPoint = {
  id: string;
  label: string;
  positionECEF: Cartesian3;
};

type ScreenAnchor = {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
};

type ProjectionBenchmarkStatus = {
  cesiumAverageMs: number | null;
  matrixAverageMs: number | null;
  maxDeltaPx: number | null;
  sampleCount: number;
};

type OverlayViewportSize = {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
};

const ROOT_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
};

const TOP_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const BENCHMARK_SAMPLE_WINDOW_MS = 500;
const TILESET_RADIUS_SCALE = 0.55;
const TILESET_HEIGHT_SCALE = 0.12;
const RADIAL_POINT_BASE_ALTITUDE_M = 160;
const RADIAL_POINT_ALTITUDE_VARIATION_M = 30;
const BENCHMARK_POINT_MARKER_SIZE_PX = 8;
const BENCHMARK_POINT_FONT_PX = 8;
const BENCHMARK_POINT_FILL = "rgba(37, 99, 235, 0.88)";
const BENCHMARK_POINT_STROKE = "rgba(255, 255, 255, 0.92)";
const RATHAUS_BARMEN_CENTER = {
  longitude: 7.1999207,
  latitude: 51.2725716,
  altitude: RADIAL_POINT_BASE_ALTITUDE_M,
};

const formatMetric = (
  value: number | null,
  digits: number,
  fallback: string = "?"
): string =>
  value !== null && Number.isFinite(value) ? value.toFixed(digits) : fallback;

const createSeededRandom = (seed: number) => {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
};

const buildPortalPointContent = (label: string): ReactNode => (
  <svg
    width="34"
    height="20"
    viewBox="0 0 34 20"
    style={{ overflow: "visible", display: "block" }}
  >
    <rect
      x="1"
      y="2"
      width="8"
      height="8"
      rx="1.5"
      fill={BENCHMARK_POINT_FILL}
      stroke={BENCHMARK_POINT_STROKE}
      strokeWidth="1"
    />
    <text
      x="13"
      y="9"
      fill="#f8fafc"
      fontSize="8"
      fontWeight="700"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
    >
      {label}
    </text>
  </svg>
);

const buildCss2dPointElement = (label: string): HTMLDivElement => {
  const element = document.createElement("div");
  element.style.position = "absolute";
  element.style.pointerEvents = "none";
  element.style.color = "#f8fafc";
  element.style.fontSize = `${BENCHMARK_POINT_FONT_PX}px`;
  element.style.fontWeight = "700";
  element.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
  element.style.whiteSpace = "nowrap";
  element.style.transform = "translate(-50%, -50%)";
  element.innerHTML = [
    `<span style="display:inline-block;width:${BENCHMARK_POINT_MARKER_SIZE_PX}px;height:${BENCHMARK_POINT_MARKER_SIZE_PX}px;border-radius:1.5px;background:${BENCHMARK_POINT_FILL};border:1px solid ${BENCHMARK_POINT_STROKE};margin-right:4px;vertical-align:middle;"></span>`,
    `<span>${label}</span>`,
  ].join("");
  return element;
};

const buildRadialBenchmarkPoints = (
  pointCount: number
): readonly BenchmarkPoint[] => {
  const safePointCount = Math.max(1, Math.floor(pointCount));
  const seededRandom = createSeededRandom(4242);

  return Array.from({ length: safePointCount }, (_, index) => {
    const ringIndex = Math.floor(index / 24);
    const angle = (index / safePointCount) * Math.PI * 2;
    const radiusMeters = 20 + ringIndex * 12 + (index % 7) * 3;
    const altitude =
      RADIAL_POINT_BASE_ALTITUDE_M +
      (seededRandom() * 2 - 1) * RADIAL_POINT_ALTITUDE_VARIATION_M;
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLon =
      111_320 * Math.cos((RATHAUS_BARMEN_CENTER.latitude * Math.PI) / 180);

    return {
      id: `point-${index + 1}`,
      label: `${index + 1}`,
      positionECEF: cartesian3FromGeographicCoordinate({
        longitude:
          RATHAUS_BARMEN_CENTER.longitude +
          (Math.cos(angle) * radiusMeters) / metersPerDegreeLon,
        latitude:
          RATHAUS_BARMEN_CENTER.latitude +
          (Math.sin(angle) * radiusMeters) / metersPerDegreeLat,
        altitude,
      }),
    };
  });
};

const buildTilesetBenchmarkPoints = (
  pointCount: number,
  tileset: Cesium3DTileset | null
): readonly BenchmarkPoint[] => {
  if (!tileset) {
    return buildRadialBenchmarkPoints(pointCount);
  }

  const safePointCount = Math.max(1, Math.floor(pointCount));
  const seededRandom = createSeededRandom(1337);
  const center = tileset.boundingSphere.center;
  const baseRadius = Math.max(
    24,
    Math.min(tileset.boundingSphere.radius * TILESET_RADIUS_SCALE, 420)
  );
  const baseHeight = Math.max(6, baseRadius * TILESET_HEIGHT_SCALE);
  const enuTransform = Transforms.eastNorthUpToFixedFrame(center);

  return Array.from({ length: safePointCount }, (_, index) => {
    const angle = seededRandom() * Math.PI * 2;
    const distance = Math.sqrt(seededRandom()) * baseRadius;
    const localPoint = new Cartesian3(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
      (seededRandom() - 0.5) * baseHeight
    );

    return {
      id: `point-${index + 1}`,
      label: `${index + 1}`,
      positionECEF: CesiumMatrix4.multiplyByPoint(
        enuTransform,
        localPoint,
        new Cartesian3()
      ),
    };
  });
};

const isVisibleAnchor = (x: number, y: number, width: number, height: number) =>
  Number.isFinite(x) &&
  Number.isFinite(y) &&
  x >= 0 &&
  x <= width &&
  y >= 0 &&
  y <= height;

const projectPointsWithCesium = (
  scene: Scene,
  points: readonly BenchmarkPoint[],
  viewportWidth: number,
  viewportHeight: number
): ScreenAnchor[] =>
  points.map((point) => {
    const windowPoint = SceneTransforms.worldToWindowCoordinates(
      scene,
      point.positionECEF
    );
    const x = windowPoint?.x ?? Number.NaN;
    const y = windowPoint?.y ?? Number.NaN;

    return {
      id: point.id,
      label: point.label,
      x,
      y,
      visible: Boolean(
        windowPoint && isVisibleAnchor(x, y, viewportWidth, viewportHeight)
      ),
    };
  });

const projectPointsWithMatrix = (
  scene: Scene,
  points: readonly BenchmarkPoint[],
  viewportWidth: number,
  viewportHeight: number,
  threeViewProjection: Matrix4,
  worldPointScratch: Cartesian3,
  clipPointScratch: Vector4
): ScreenAnchor[] =>
  points.map((point) => {
    Cartesian3.clone(point.positionECEF, worldPointScratch);
    clipPointScratch.set(
      worldPointScratch.x,
      worldPointScratch.y,
      worldPointScratch.z,
      1
    );
    clipPointScratch.applyMatrix4(threeViewProjection);

    if (
      !Number.isFinite(clipPointScratch.x) ||
      !Number.isFinite(clipPointScratch.y) ||
      !Number.isFinite(clipPointScratch.w) ||
      clipPointScratch.w <= 0
    ) {
      return {
        id: point.id,
        label: point.label,
        x: Number.NaN,
        y: Number.NaN,
        visible: false,
      };
    }

    const ndcX = clipPointScratch.x / clipPointScratch.w;
    const ndcY = clipPointScratch.y / clipPointScratch.w;
    const x = (ndcX + 1) * 0.5 * viewportWidth;
    const y = (1 - ndcY) * 0.5 * viewportHeight;

    return {
      id: point.id,
      label: point.label,
      x,
      y,
      visible: isVisibleAnchor(x, y, viewportWidth, viewportHeight),
    };
  });

const useProjectionBenchmarkFrameState = (
  scene: Scene | null,
  points: readonly BenchmarkPoint[],
  projectionMode: BenchmarkProjectionMode,
  benchmarkSamplesPerFrame: number
) => {
  const viewProjector = useCesiumViewProjector(scene);
  const anchorsRef = useRef<readonly ScreenAnchor[]>([]);
  const viewportSizeRef = useRef<OverlayViewportSize>({
    width: 1,
    height: 1,
    displayWidth: 1,
    displayHeight: 1,
  });
  const [status, setStatus] = useState<ProjectionBenchmarkStatus>({
    cesiumAverageMs: null,
    matrixAverageMs: null,
    maxDeltaPx: null,
    sampleCount: 0,
  });

  useEffect(() => {
    if (!scene || scene.isDestroyed() || points.length === 0) {
      anchorsRef.current = [];
      viewportSizeRef.current = {
        width: 1,
        height: 1,
        displayWidth: 1,
        displayHeight: 1,
      };
      setStatus({
        cesiumAverageMs: null,
        matrixAverageMs: null,
        maxDeltaPx: null,
        sampleCount: 0,
      });
      return;
    }

    let nextBenchmarkAtMs = performance.now();
    const worldPointScratch = new Cartesian3();
    const clipPointScratch = new Vector4();
    const threeViewProjection = new Matrix4();

    const updateFrameState = () => {
      if (!scene || scene.isDestroyed()) {
        return;
      }

      const nowMs = performance.now();
      const viewState = viewProjector.getViewState();
      const viewProjectionMatrix = viewProjector.getViewProjectionMatrix();
      if (!viewState || !viewProjectionMatrix) {
        return;
      }

      const viewportWidth = Math.max(1, viewState.width);
      const viewportHeight = Math.max(1, viewState.height);
      viewportSizeRef.current = {
        width: viewportWidth,
        height: viewportHeight,
        displayWidth: Math.max(1, viewState.displayWidth),
        displayHeight: Math.max(1, viewState.displayHeight),
      };
      threeViewProjection.fromArray(viewProjectionMatrix);

      const chosenAnchors =
        projectionMode === "matrix"
          ? projectPointsWithMatrix(
              scene,
              points,
              viewportWidth,
              viewportHeight,
              threeViewProjection,
              worldPointScratch,
              clipPointScratch
            )
          : projectPointsWithCesium(
              scene,
              points,
              viewportWidth,
              viewportHeight
            );
      anchorsRef.current = chosenAnchors;

      if (nowMs < nextBenchmarkAtMs) {
        return;
      }

      const safeSampleCount = Math.max(1, Math.floor(benchmarkSamplesPerFrame));
      let cesiumDurationSumMs = 0;
      let matrixDurationSumMs = 0;
      let maxDeltaPx = 0;

      for (
        let sampleIndex = 0;
        sampleIndex < safeSampleCount;
        sampleIndex += 1
      ) {
        const cesiumStartedAtMs = performance.now();
        const cesiumAnchors = projectPointsWithCesium(
          scene,
          points,
          viewportWidth,
          viewportHeight
        );
        cesiumDurationSumMs += performance.now() - cesiumStartedAtMs;

        const matrixStartedAtMs = performance.now();
        const matrixAnchors = projectPointsWithMatrix(
          scene,
          points,
          viewportWidth,
          viewportHeight,
          threeViewProjection,
          worldPointScratch,
          clipPointScratch
        );
        matrixDurationSumMs += performance.now() - matrixStartedAtMs;

        const comparableCount = Math.min(
          cesiumAnchors.length,
          matrixAnchors.length
        );
        for (let index = 0; index < comparableCount; index += 1) {
          const cesiumAnchor = cesiumAnchors[index];
          const matrixAnchor = matrixAnchors[index];
          if (!cesiumAnchor || !matrixAnchor) {
            continue;
          }
          if (!cesiumAnchor.visible || !matrixAnchor.visible) {
            continue;
          }

          const deltaPx = Math.hypot(
            cesiumAnchor.x - matrixAnchor.x,
            cesiumAnchor.y - matrixAnchor.y
          );
          if (deltaPx > maxDeltaPx) {
            maxDeltaPx = deltaPx;
          }
        }
      }

      setStatus({
        cesiumAverageMs: cesiumDurationSumMs / safeSampleCount,
        matrixAverageMs: matrixDurationSumMs / safeSampleCount,
        maxDeltaPx,
        sampleCount: safeSampleCount,
      });
      nextBenchmarkAtMs = nowMs + BENCHMARK_SAMPLE_WINDOW_MS;
    };

    updateFrameState();
    const removePreRenderListener =
      scene.preRender.addEventListener(updateFrameState);

    return () => {
      removePreRenderListener?.();
    };
  }, [benchmarkSamplesPerFrame, points, projectionMode, scene, viewProjector]);

  return {
    anchorsRef,
    viewportSizeRef,
    status,
  };
};

const BenchmarkPortalSquares = ({
  points,
  anchorsRef,
}: {
  points: readonly BenchmarkPoint[];
  anchorsRef: MutableRefObject<readonly ScreenAnchor[]>;
}) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    clearLabelOverlayElements,
  } = useLabelOverlay();

  useEffect(() => {
    points.forEach((point, index) => {
      addLabelOverlayElement({
        id: point.id,
        contentKey: point.id,
        content: buildPortalPointContent(point.label),
        getCanvasPosition: () => {
          const anchor = anchorsRef.current[index];
          if (!anchor || !anchor.visible) {
            return null;
          }

          return {
            x: anchor.x,
            y: anchor.y,
          };
        },
      });
    });

    return () => {
      points.forEach((point) => {
        removeLabelOverlayElement(point.id);
      });
      clearLabelOverlayElements();
    };
  }, [
    addLabelOverlayElement,
    anchorsRef,
    clearLabelOverlayElements,
    points,
    removeLabelOverlayElement,
  ]);

  return null;
};

const BenchmarkPortalOverlay = ({
  scene,
  rootRef,
  points,
  anchorsRef,
  forceLayoutOnPortalRender,
}: {
  scene: Scene | null;
  rootRef: RefObject<HTMLDivElement | null>;
  points: readonly BenchmarkPoint[];
  anchorsRef: MutableRefObject<readonly ScreenAnchor[]>;
  forceLayoutOnPortalRender: boolean;
}) => {
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    kind: "benchmark-cesium",
    containerRef: rootRef,
    forceLayoutOnPortalRender,
  });

  return (
    <LabelOverlayProvider host={overlayHost}>
      <BenchmarkPortalSquares points={points} anchorsRef={anchorsRef} />
    </LabelOverlayProvider>
  );
};

const BenchmarkCanvasOverlay = ({
  scene,
  rootRef,
  anchorsRef,
  viewportSizeRef,
}: {
  scene: Scene | null;
  rootRef: RefObject<HTMLDivElement | null>;
  anchorsRef: MutableRefObject<readonly ScreenAnchor[]>;
  viewportSizeRef: MutableRefObject<OverlayViewportSize>;
}) => {
  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement || !scene || scene.isDestroyed()) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1500";
    rootElement.appendChild(canvas);

    const context = canvas.getContext("2d");
    if (!context) {
      rootElement.removeChild(canvas);
      return;
    }

    const render = () => {
      const viewportWidth = Math.max(1, viewportSizeRef.current.width);
      const viewportHeight = Math.max(1, viewportSizeRef.current.height);
      const displayWidth = Math.max(1, viewportSizeRef.current.displayWidth);
      const displayHeight = Math.max(1, viewportSizeRef.current.displayHeight);
      const scaleX = displayWidth / viewportWidth;
      const scaleY = displayHeight / viewportHeight;
      const displayScale = Math.min(scaleX, scaleY);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${viewportHeight}px`;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, displayWidth, displayHeight);
      context.font = `${
        BENCHMARK_POINT_FONT_PX * displayScale
      }px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textBaseline = "middle";
      context.lineWidth = displayScale;

      anchorsRef.current.forEach((anchor) => {
        if (!anchor.visible) {
          return;
        }

        const anchorX = anchor.x * scaleX;
        const anchorY = anchor.y * scaleY;
        const markerSizePx = BENCHMARK_POINT_MARKER_SIZE_PX * displayScale;

        context.fillStyle = BENCHMARK_POINT_FILL;
        context.strokeStyle = BENCHMARK_POINT_STROKE;
        context.fillRect(
          anchorX - markerSizePx * 0.5,
          anchorY - markerSizePx * 0.5,
          markerSizePx,
          markerSizePx
        );
        context.strokeRect(
          anchorX - markerSizePx * 0.5,
          anchorY - markerSizePx * 0.5,
          markerSizePx,
          markerSizePx
        );
        context.fillStyle = "#f8fafc";
        context.fillText(anchor.label, anchorX + markerSizePx, anchorY);
      });
    };

    render();
    const removePreRenderListener = scene.preRender.addEventListener(render);

    return () => {
      removePreRenderListener?.();
      if (canvas.parentElement === rootElement) {
        rootElement.removeChild(canvas);
      }
    };
  }, [anchorsRef, rootRef, scene, viewportSizeRef]);

  return null;
};

const BenchmarkCss2dOverlay = ({
  scene,
  rootRef,
  anchorsRef,
  viewportSizeRef,
}: {
  scene: Scene | null;
  rootRef: RefObject<HTMLDivElement | null>;
  anchorsRef: MutableRefObject<readonly ScreenAnchor[]>;
  viewportSizeRef: MutableRefObject<OverlayViewportSize>;
}) => {
  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement || !scene || scene.isDestroyed()) {
      return;
    }

    const renderer = new CSS2DRenderer();
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.pointerEvents = "none";
    renderer.domElement.style.zIndex = "1500";
    rootElement.appendChild(renderer.domElement);

    const scene2d = new ThreeScene();
    const camera2d = new OrthographicCamera(0, 1, 1, 0, 0.1, 10);
    camera2d.position.set(0, 0, 1);

    const objects = anchorsRef.current.map((anchor) => {
      const object = new CSS2DObject(buildCss2dPointElement(anchor.label));
      scene2d.add(object);
      return object;
    });

    const render = () => {
      const viewportWidth = Math.max(1, viewportSizeRef.current.width);
      const viewportHeight = Math.max(1, viewportSizeRef.current.height);

      renderer.setSize(viewportWidth, viewportHeight);
      camera2d.left = 0;
      camera2d.right = viewportWidth;
      camera2d.top = viewportHeight;
      camera2d.bottom = 0;
      camera2d.updateProjectionMatrix();

      const anchors = anchorsRef.current;
      for (let index = 0; index < objects.length; index += 1) {
        const object = objects[index];
        const anchor = anchors[index];
        if (!object || !anchor || !anchor.visible) {
          if (object) {
            object.visible = false;
          }
          continue;
        }

        object.visible = true;
        object.position.set(anchor.x, viewportHeight - anchor.y, 0);
      }

      renderer.render(scene2d, camera2d);
    };

    render();
    const removePreRenderListener = scene.preRender.addEventListener(render);

    return () => {
      removePreRenderListener?.();
      objects.forEach((object) => {
        object.removeFromParent();
      });
      if (renderer.domElement.parentElement === rootElement) {
        rootElement.removeChild(renderer.domElement);
      }
    };
  }, [anchorsRef, rootRef, scene, viewportSizeRef]);

  return null;
};

const BenchmarkOverlayLayer = ({
  scene,
  rootRef,
  points,
  anchorsRef,
  viewportSizeRef,
  overlayRenderer,
  forceLayoutOnPortalRender,
}: {
  scene: Scene | null;
  rootRef: RefObject<HTMLDivElement | null>;
  points: readonly BenchmarkPoint[];
  anchorsRef: MutableRefObject<readonly ScreenAnchor[]>;
  viewportSizeRef: MutableRefObject<OverlayViewportSize>;
  overlayRenderer: BenchmarkOverlayRenderer;
  forceLayoutOnPortalRender: boolean;
}) => {
  if (overlayRenderer === "provider-portals") {
    return (
      <BenchmarkPortalOverlay
        scene={scene}
        rootRef={rootRef}
        points={points}
        anchorsRef={anchorsRef}
        forceLayoutOnPortalRender={forceLayoutOnPortalRender}
      />
    );
  }

  if (overlayRenderer === "three-css2d") {
    return (
      <BenchmarkCss2dOverlay
        scene={scene}
        rootRef={rootRef}
        anchorsRef={anchorsRef}
        viewportSizeRef={viewportSizeRef}
      />
    );
  }

  return (
    <BenchmarkCanvasOverlay
      scene={scene}
      rootRef={rootRef}
      anchorsRef={anchorsRef}
      viewportSizeRef={viewportSizeRef}
    />
  );
};

const CesiumProjectionBenchmarkStory = ({
  pointCount,
  benchmarkSamplesPerFrame,
  overlayRenderer,
  projectionMode,
  pointSource,
  forceLayoutOnPortalRender,
}: CesiumProjectionBenchmarkStoryArgs) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [tileset, setTileset] = useState<Cesium3DTileset | null>(null);
  const animationFrameStatus = useAnimationFramePerformanceStatus(true);

  const points = useMemo(
    () =>
      pointSource === "tileset-random"
        ? buildTilesetBenchmarkPoints(pointCount, tileset)
        : buildRadialBenchmarkPoints(pointCount),
    [pointCount, pointSource, tileset]
  );
  const pointBoundingSphere = useMemo(
    () =>
      points.length > 0
        ? BoundingSphere.fromPoints(points.map((point) => point.positionECEF))
        : null,
    [points]
  );
  const { anchorsRef, viewportSizeRef, status } =
    useProjectionBenchmarkFrameState(
      scene,
      points,
      projectionMode,
      benchmarkSamplesPerFrame
    );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;

    const initialize = async () => {
      const setup = await setupCesium(container, {
        useBrowserRecommendedResolution: false,
      });
      if (disposed) {
        if (!setup.widget.isDestroyed()) {
          setup.widget.destroy();
        }
        return;
      }

      widgetRef.current = setup.widget;
      setup.widget.camera.setView({
        destination: cartesian3FromGeographicCoordinate({
          longitude: RATHAUS_BARMEN_CENTER.longitude,
          latitude: RATHAUS_BARMEN_CENTER.latitude,
          altitude: 900,
        }),
        orientation: {
          heading: 0.42,
          pitch: -0.78,
          roll: 0,
        },
      });

      setTileset(setup.tileset);
      setScene(setup.widget.scene);
    };

    initialize().catch((error) => {
      console.error(
        "[STORY][LABEL-OVERLAY] Cesium projection benchmark init failed",
        error
      );
    });

    return () => {
      disposed = true;
      setScene(null);
      setTileset(null);
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed() || !pointBoundingSphere) {
      return;
    }

    widget.camera.flyToBoundingSphere(pointBoundingSphere, {
      duration: 0,
      offset: new HeadingPitchRange(
        0.35,
        -0.65,
        Math.max(pointBoundingSphere.radius * 2.8, 180)
      ),
    });
    requestStoryCesiumRender(widget.scene);
  }, [pointBoundingSphere]);

  const visibleAnchorCount = anchorsRef.current.filter(
    (anchor) => anchor.visible
  ).length;
  const speedup =
    status.cesiumAverageMs !== null &&
    status.matrixAverageMs !== null &&
    status.matrixAverageMs > 0
      ? status.cesiumAverageMs / status.matrixAverageMs
      : null;

  const statusValues = [
    `${pointSource === "tileset-random" ? "tileset random" : "radial"} source`,
    `${overlayRenderer} overlay`,
    `${projectionMode} projection`,
    `${pointCount} points`,
    `${visibleAnchorCount} visible`,
    `frame ${formatStoryPerformanceLabel(animationFrameStatus)}`,
    `Cesium ${formatMetric(status.cesiumAverageMs, 3)} ms`,
    `Matrix ${formatMetric(status.matrixAverageMs, 3)} ms`,
    `speedup ${formatMetric(speedup, 2)}x`,
    `delta ${formatMetric(status.maxDeltaPx, 3)} px`,
    `${status.sampleCount} benchmark samples`,
    overlayRenderer === "provider-portals"
      ? `portal layout ${forceLayoutOnPortalRender ? "forced" : "deferred"}`
      : "portal layout n/a",
  ];

  return (
    <div ref={rootRef} style={ROOT_STYLE}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <BenchmarkOverlayLayer
        scene={scene}
        rootRef={rootRef}
        points={points}
        anchorsRef={anchorsRef}
        viewportSizeRef={viewportSizeRef}
        overlayRenderer={overlayRenderer}
        forceLayoutOnPortalRender={forceLayoutOnPortalRender}
      />
      <div style={TOP_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar
          label="cesium projection benchmark"
          values={statusValues}
        />
      </div>
    </div>
  );
};

const meta: Meta<CesiumProjectionBenchmarkStoryArgs> = {
  title: "Overlay/Layout",
  component: CesiumProjectionBenchmarkStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    pointCount: 2000,
    benchmarkSamplesPerFrame: 2,
    overlayRenderer: "canvas-2d",
    projectionMode: "matrix",
    pointSource: "tileset-random",
    forceLayoutOnPortalRender: false,
  },
  argTypes: {
    pointCount: {
      control: { type: "range", min: 100, max: 10000, step: 100 },
    },
    benchmarkSamplesPerFrame: {
      control: { type: "range", min: 1, max: 8, step: 1 },
    },
    overlayRenderer: {
      control: { type: "inline-radio" },
      options: ["provider-portals", "canvas-2d", "three-css2d"],
    },
    projectionMode: {
      control: { type: "inline-radio" },
      options: ["matrix", "cesium"],
    },
    pointSource: {
      control: { type: "inline-radio" },
      options: ["tileset-random", "wuppertal-radial"],
    },
    forceLayoutOnPortalRender: {
      control: { type: "boolean" },
    },
  },
};

export default meta;

export const CesiumProjectionBenchmark: StoryObj<CesiumProjectionBenchmarkStoryArgs> =
  {
    name: "Cesium Projection Benchmark",
  };
