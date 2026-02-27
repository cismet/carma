import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { Viewer } from "cesium";
import type {
  CesiumTerrainProvider,
  ImageryLayer,
  Scene,
  CesiumWidget,
  Cesium3DTileset,
} from "@carma/cesium";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import {
  AnnotationProvider,
  type MEASUREMENT_MODE,
} from "../../../../../libraries/mapping/annotations/core/src";
import { CesiumMeasurementsProvider } from "@carma-mapping/annotations/cesium";
import {
  CesiumContext,
  type CesiumContextType,
} from "../../../../../libraries/mapping/engines/cesium/legacy/src/lib/CesiumContext";
import type { SceneAnimationMap } from "../../../../../libraries/mapping/engines/cesium/legacy/src/lib/utils/sceneAnimationMap";
import { setupCesium } from "../../map-framework-switcher/helpers/cesium-setup";

import "cesium/Build/Cesium/Widgets/widgets.css";

if (
  typeof window !== "undefined" &&
  !(window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL
) {
  (window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/__cesium__/";
}

const STORY_HEIGHT_PX = 560;
const MEASUREMENT_MODE_MEASUREMENT = "measurement" as MEASUREMENT_MODE;

const requestRenderWithOptions = (
  scene: Scene | null,
  opts?: {
    delay?: number;
    repeat?: number;
    repeatInterval?: number;
  }
) => {
  if (!scene || scene.isDestroyed()) return;
  const delay = Math.max(0, opts?.delay ?? 0);
  const repeat = Math.max(1, opts?.repeat ?? 1);
  const repeatInterval = Math.max(0, opts?.repeatInterval ?? 50);

  const renderOnce = () => {
    if (!scene.isDestroyed()) {
      scene.requestRender();
    }
  };

  if (delay > 0) {
    window.setTimeout(renderOnce, delay);
  } else {
    renderOnce();
  }

  for (let index = 1; index < repeat; index += 1) {
    window.setTimeout(renderOnce, delay + repeatInterval * index);
  }
};

export const MeasurementCesiumStoryShell = ({
  children,
  overlayWidth = 880,
  height = STORY_HEIGHT_PX,
}: {
  children: ReactNode;
  overlayWidth?: number;
  height?: number;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sceneAnimationMapRef = useRef<SceneAnimationMap | null>(null);
  const shouldSuspendPitchLimiterRef = useRef(false);
  const shouldSuspendCameraLimitersRef = useRef(false);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [providersReady, setProvidersReady] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [initialViewApplied, setInitialViewApplied] = useState(true);

  useEffect(() => {
    if (!cesiumContainerRef.current) return;
    let disposed = false;

    const initialize = async () => {
      const setup = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement
      );
      if (disposed) {
        if (!setup.widget.isDestroyed()) {
          setup.widget.destroy();
        }
        return;
      }

      widgetRef.current = setup.widget;
      terrainProviderRef.current = setup.terrainProviders.TERRAIN;
      surfaceProviderRef.current = setup.terrainProviders.SURFACE;
      tilesetRef.current = setup.tileset;
      setProvidersReady(true);
      setIsViewerReady(true);
      setInitialViewApplied(true);
      setup.widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[STORY][MEASUREMENTS] Failed to initialize Cesium shell",
        error
      );
    });

    return () => {
      disposed = true;
      setProvidersReady(false);
      setIsViewerReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, []);

  const contextValue = useMemo<CesiumContextType>(() => {
    const getScene = () => {
      const widget = widgetRef.current;
      if (!widget || widget.isDestroyed()) return null;
      return widget.scene;
    };

    const withScene = (cb: (scene: Scene, viewer: Viewer) => void): boolean => {
      const scene = getScene();
      if (!scene) return false;
      cb(scene, viewerRef.current as Viewer);
      return true;
    };

    return {
      viewerRef: viewerRef as MutableRefObject<Viewer | null>,
      sceneAnimationMapRef:
        sceneAnimationMapRef as MutableRefObject<SceneAnimationMap | null>,
      shouldSuspendPitchLimiterRef,
      shouldSuspendCameraLimitersRef,
      isViewerReady,
      setIsViewerReady,
      providersReady,
      initialViewApplied,
      setInitialViewApplied,
      requestRender: (opts) => requestRenderWithOptions(getScene(), opts),
      isValidViewer: () => false,
      withViewer: () => false,
      withCamera: () => false,
      withCanvas: () => false,
      withScene,
      withEntities: () => false,
      withImageryLayer: () => false,
      withPrimaryTileset: (cb) => {
        const tileset = tilesetRef.current;
        if (!tileset) return false;
        cb(tileset, viewerRef.current as Viewer);
        return true;
      },
      withSecondaryTileset: () => false,
      withEllipsoidTerrainProvider: () => false,
      withTerrainProvider: (cb) => {
        const provider = terrainProviderRef.current;
        if (!provider) return false;
        cb(provider, viewerRef.current as Viewer);
        return true;
      },
      withSurfaceProvider: (cb) => {
        const provider = surfaceProviderRef.current;
        if (!provider) return false;
        cb(provider, viewerRef.current as Viewer);
        return true;
      },
      getTerrainProvider: () => terrainProviderRef.current,
      getSurfaceProvider: () => surfaceProviderRef.current,
      getImageryLayer: () => null as ImageryLayer | null,
      getScene,
    };
  }, [initialViewApplied, isViewerReady, providersReady]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#0f172a",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <CesiumContext.Provider value={contextValue}>
        <AnnotationProvider
          externalMode={MEASUREMENT_MODE_MEASUREMENT}
          setModeExternal={() => undefined}
          config={{
            editableTitle: true,
            snappingEnabled: false,
            snappingOnUpdate: false,
            localStorageKey: "@storybook.measurements.base",
          }}
        >
          <LabelOverlayProvider containerRef={rootRef}>
            <CesiumMeasurementsProvider
              options={{
                persistenceEnabled: false,
                scriptApi: { enabled: true },
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  width: overlayWidth,
                  maxWidth: "calc(100% - 24px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                <div style={{ pointerEvents: "auto" }}>{children}</div>
              </div>
            </CesiumMeasurementsProvider>
          </LabelOverlayProvider>
        </AnnotationProvider>
      </CesiumContext.Provider>
    </div>
  );
};
