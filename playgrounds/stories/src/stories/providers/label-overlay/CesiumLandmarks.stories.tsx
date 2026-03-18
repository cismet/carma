import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Cartesian3,
  Cartographic,
  sampleTerrainMostDetailedGuardedAsync,
  type CesiumTerrainProvider,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import { degToRadNumeric } from "@carma/units/helpers";
import {
  LabelOverlayProvider,
  usePointLabels,
  type PointLabelData,
} from "@carma-providers/label-overlay";
import {
  CesiumSceneStateProvider,
  useCesiumSceneStateOptional,
  useCesiumSceneStateUpdateDriverOptional,
} from "@carma-mapping/engines/cesium/react/scene-state";
import {
  cartesian3FromGeographicCoordinate,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/api";
import { useCesiumSceneVisibilityIndex } from "@carma-mapping/engines/cesium/react/visibility";
import { setupCesium } from "../../map-framework-switcher/helpers/cesium-setup";

import "cesium/Build/Cesium/Widgets/widgets.css";

if (typeof window !== "undefined") {
  (window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/__cesium__/";
}

type LandmarkLabelStoryArgs = {
  syncLabelPitchToCamera: boolean;
  fixedLabelPitchDeg: number;
  enableOcclusionTesting: boolean;
};

type LandmarkSpec = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
};

type LandmarkPoint = LandmarkSpec & {
  altitude: number;
  altitudeSource: "terrain" | "fallback";
};

const FALLBACK_ALTITUDE_METERS = 200;

const WUPPERTAL_LANDMARKS: readonly LandmarkSpec[] = [
  {
    id: "rathaus-elberfeld",
    name: "Rathaus Elberfeld",
    longitude: 7.14924,
    latitude: 51.25652,
  },
  {
    id: "toelleturm",
    name: "Toelleturm",
    longitude: 7.18786,
    latitude: 51.24722,
  },
  {
    id: "hardt",
    name: "Hardt Park",
    longitude: 7.15369,
    latitude: 51.26077,
  },
  {
    id: "schwebebahn-oberbarmen",
    name: "Schwebebahn Oberbarmen",
    longitude: 7.22198,
    latitude: 51.27195,
  },
] as const;

const sampleLandmarkAltitudes = async (
  provider: CesiumTerrainProvider | null
): Promise<LandmarkPoint[]> => {
  if (!provider) {
    return WUPPERTAL_LANDMARKS.map((landmark) => ({
      ...landmark,
      altitude: FALLBACK_ALTITUDE_METERS,
      altitudeSource: "fallback" as const,
    }));
  }

  const cartographics = WUPPERTAL_LANDMARKS.map((landmark) =>
    Cartographic.fromDegrees(landmark.longitude, landmark.latitude)
  );
  const sampled = await sampleTerrainMostDetailedGuardedAsync(
    provider,
    cartographics,
    false
  );

  return WUPPERTAL_LANDMARKS.map((landmark, index) => {
    const sampledHeight = sampled[index]?.height;
    const hasSampledHeight = Number.isFinite(sampledHeight);
    return {
      ...landmark,
      altitude: hasSampledHeight
        ? Number(sampledHeight)
        : FALLBACK_ALTITUDE_METERS,
      altitudeSource: hasSampledHeight ? "terrain" : "fallback",
    };
  });
};

const isCesiumRequestErrorLike = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeError = value as {
    name?: unknown;
    constructor?: { name?: unknown };
  };
  const name =
    typeof maybeError.name === "string"
      ? maybeError.name
      : typeof maybeError.constructor?.name === "string"
      ? maybeError.constructor.name
      : "";
  return name === "RequestErrorEvent";
};

const configureCesiumStoryErrorHandling = (
  widget: CesiumWidget
): (() => void) => {
  const widgetWithRenderLoopErrors = widget as unknown as {
    showRenderLoopErrors?: boolean;
  };
  if (typeof widgetWithRenderLoopErrors.showRenderLoopErrors === "boolean") {
    widgetWithRenderLoopErrors.showRenderLoopErrors = false;
  }

  const scene = widget.scene as Scene & {
    rethrowRenderErrors?: boolean;
    renderError?: {
      addEventListener?: (
        callback: (...args: unknown[]) => void
      ) => (() => void) | void;
    };
  };
  if (typeof scene.rethrowRenderErrors === "boolean") {
    scene.rethrowRenderErrors = false;
  }

  const removeRenderErrorListener = scene.renderError?.addEventListener?.(
    (...args: unknown[]) => {
      const errorCandidate = args.length > 1 ? args[1] : args[0];
      if (isCesiumRequestErrorLike(errorCandidate)) {
        return;
      }
      if (!(errorCandidate instanceof Error)) {
        return;
      }
      console.error(
        "[STORY][LABEL-OVERLAY] Cesium renderError",
        errorCandidate.message
      );
    }
  );

  return () => {
    if (typeof removeRenderErrorListener === "function") {
      removeRenderErrorListener();
    }
  };
};

const buildLabelData = ({
  scene,
  landmarks,
  cameraPitchRad,
  syncLabelPitchToCamera,
  fixedLabelPitchDeg,
  shouldTestOcclusion,
  visibilityStateById,
}: {
  scene: Scene | null;
  landmarks: readonly LandmarkPoint[];
  cameraPitchRad: number;
  syncLabelPitchToCamera: boolean;
  fixedLabelPitchDeg: number;
  shouldTestOcclusion: boolean;
  visibilityStateById: Record<
    string,
    {
      isHidden: boolean;
      isOccluded: boolean;
    }
  >;
}): readonly PointLabelData[] => {
  const resolvedPitchRad = syncLabelPitchToCamera
    ? cameraPitchRad
    : degToRadNumeric(fixedLabelPitchDeg);

  return landmarks.map((landmark, index) => {
    const labelDistance = [18, 24, 28, 22][index] ?? 20;
    const labelAttach = (["left", "center", "right", "left"] as const)[index];
    const selected = landmark.id === "rathaus-elberfeld";
    const collapse = landmark.id !== "rathaus-elberfeld";
    const isOccluded = shouldTestOcclusion
      ? visibilityStateById[landmark.id]?.isOccluded ?? false
      : false;
    const isHidden = shouldTestOcclusion
      ? visibilityStateById[landmark.id]?.isHidden ?? false
      : false;

    return {
      id: landmark.id,
      content: `${landmark.name} • ${landmark.altitude.toFixed(1)} m`,
      selected,
      collapse,
      forceCollapse: collapse,
      fullBorder: selected,
      labelStyle: "capsule",
      labelAttach,
      labelDistance,
      pitch: resolvedPitchRad,
      markerBackgroundColor: "rgba(15, 23, 42, 0.95)",
      markerTextColor: "#f8fafc",
      textColor: "#0f172a",
      textBackgroundColor: "rgba(255,255,255,0.96)",
      selectedBackgroundColor: "rgba(251, 191, 36, 0.95)",
      hoverBackgroundColor: "rgba(254, 243, 199, 0.98)",
      isOccluded,
      isHidden,
      getCanvasPosition: () =>
        projectGeographicCoordinateToScreen(scene, {
          longitude: landmark.longitude,
          latitude: landmark.latitude,
          altitude: landmark.altitude,
        }),
    };
  });
};

const CesiumLandmarksOverlay = ({
  scene,
  landmarks,
  syncLabelPitchToCamera,
  fixedLabelPitchDeg,
  enableOcclusionTesting,
  occlusionAvailable,
}: {
  scene: Scene | null;
  landmarks: readonly LandmarkPoint[];
  syncLabelPitchToCamera: boolean;
  fixedLabelPitchDeg: number;
  enableOcclusionTesting: boolean;
  occlusionAvailable: boolean;
}) => {
  const sceneState = useCesiumSceneStateOptional();
  const cameraPitchRad = sceneState?.camera.pitchRad ?? -Math.PI / 4;
  const hasCameraMatrix = Boolean(
    sceneState?.camera.cameraModel?.pose.matrixWorldInverse
  );
  const shouldTestOcclusion = enableOcclusionTesting && occlusionAvailable;
  const registeredPointIdSetRef = useRef<Set<string>>(new Set());
  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: true,
      shouldTestOcclusion,
      viewportPaddingHorizontal: 8,
      viewportPaddingVertical: 8,
      occlusionToleranceMeters: 1.0,
    });

  useEffect(() => {
    const indexedPoints = landmarks.map((landmark) => ({
      id: landmark.id,
      positionECEF: cartesian3FromGeographicCoordinate({
        longitude: landmark.longitude,
        latitude: landmark.latitude,
        altitude: landmark.altitude,
      }),
    }));
    registerPoints(indexedPoints);

    const nextIdSet = new Set(indexedPoints.map((point) => point.id));
    const removedIds: string[] = [];
    registeredPointIdSetRef.current.forEach((id) => {
      if (!nextIdSet.has(id)) {
        removedIds.push(id);
      }
    });

    if (removedIds.length > 0) {
      unregisterPointIds(removedIds);
    }
    registeredPointIdSetRef.current = nextIdSet;
  }, [landmarks, registerPoints, unregisterPointIds]);

  useEffect(() => {
    return () => {
      const ids = Array.from(registeredPointIdSetRef.current);
      if (ids.length > 0) {
        unregisterPointIds(ids);
      }
      registeredPointIdSetRef.current = new Set();
    };
  }, [unregisterPointIds]);

  const labels = useMemo(
    () =>
      buildLabelData({
        scene,
        landmarks,
        cameraPitchRad,
        syncLabelPitchToCamera,
        fixedLabelPitchDeg,
        shouldTestOcclusion,
        visibilityStateById,
      }),
    [
      cameraPitchRad,
      fixedLabelPitchDeg,
      landmarks,
      scene,
      shouldTestOcclusion,
      syncLabelPitchToCamera,
      visibilityStateById,
    ]
  );

  const statusValues = useMemo(() => {
    const occludedCount = labels.reduce(
      (count, label) => count + (label.isOccluded ? 1 : 0),
      0
    );
    const hiddenCount = labels.reduce(
      (count, label) => count + (label.isHidden ? 1 : 0),
      0
    );
    const terrainSourceCount = landmarks.filter(
      (landmark) => landmark.altitudeSource === "terrain"
    ).length;

    return [
      `pitch ${((cameraPitchRad * 180) / Math.PI).toFixed(1)} deg`,
      `labelPitch ${
        syncLabelPitchToCamera
          ? "camera"
          : `${fixedLabelPitchDeg.toFixed(1)} deg`
      }`,
      `occlusion ${
        !enableOcclusionTesting
          ? "off"
          : shouldTestOcclusion
          ? "on"
          : "requested (no surface)"
      }`,
      `mesh ${occlusionAvailable ? "loaded" : "unavailable"}`,
      `cameraMatrix ${hasCameraMatrix ? "yes" : "no"}`,
      `occluded ${occludedCount}/${labels.length}`,
      `hidden ${hiddenCount}/${labels.length}`,
      `terrainSampled ${terrainSourceCount}/${landmarks.length}`,
    ];
  }, [
    cameraPitchRad,
    enableOcclusionTesting,
    fixedLabelPitchDeg,
    labels,
    landmarks.length,
    hasCameraMatrix,
    occlusionAvailable,
    shouldTestOcclusion,
    syncLabelPitchToCamera,
  ]);

  usePointLabels([...labels], true, undefined, undefined, {
    transitionDurationMs: 160,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 1800,
        pointerEvents: "none",
      }}
    >
      <ResponsiveStatusBar label="label overlay cesium" values={statusValues} />
    </div>
  );
};

const SceneStateOverlayBridge = ({
  containerRef,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) => {
  const requestUpdateFromSceneState = useCesiumSceneStateUpdateDriverOptional();

  return (
    <LabelOverlayProvider
      containerRef={containerRef}
      requestUpdateCallback={requestUpdateFromSceneState}
    >
      {children}
    </LabelOverlayProvider>
  );
};

const CesiumLandmarksStory = ({
  syncLabelPitchToCamera,
  fixedLabelPitchDeg,
  enableOcclusionTesting,
}: LandmarkLabelStoryArgs) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [landmarks, setLandmarks] = useState<readonly LandmarkPoint[]>([]);
  const [occlusionAvailable, setOcclusionAvailable] = useState<boolean>(false);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (!isCesiumRequestErrorLike(event.error)) {
        return;
      }
      event.preventDefault();
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isCesiumRequestErrorLike(event.reason)) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanupRenderErrorHandling: (() => void) | undefined;
    const initialize = async () => {
      const setup = await setupCesium(container, {
        useBrowserRecommendedResolution: true,
      });
      if (disposed) {
        if (!setup.widget.isDestroyed()) {
          setup.widget.destroy();
        }
        return;
      }

      widgetRef.current = setup.widget;
      cleanupRenderErrorHandling = configureCesiumStoryErrorHandling(
        setup.widget
      );
      setScene(setup.widget.scene);
      setOcclusionAvailable(Boolean(setup.tileset));
      setup.widget.camera.setView({
        destination: Cartesian3.fromDegrees(7.181, 51.259, 6500),
        orientation: {
          heading: degToRadNumeric(0),
          pitch: degToRadNumeric(-62),
          roll: 0,
        },
      });
      setup.widget.scene.requestRender();

      const provider =
        setup.terrainProviders.SURFACE ?? setup.terrainProviders.TERRAIN;
      const sampledLandmarks = await sampleLandmarkAltitudes(provider);
      if (disposed) return;
      setLandmarks(sampledLandmarks);
      setup.widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[STORY][LABEL-OVERLAY] Cesium landmarks init failed",
        error
      );
    });

    return () => {
      disposed = true;
      setScene(null);
      setLandmarks([]);
      setOcclusionAvailable(false);
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
      cleanupRenderErrorHandling?.();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <CesiumSceneStateProvider scene={scene}>
        <SceneStateOverlayBridge containerRef={rootRef}>
          <CesiumLandmarksOverlay
            scene={scene}
            landmarks={landmarks}
            syncLabelPitchToCamera={syncLabelPitchToCamera}
            fixedLabelPitchDeg={fixedLabelPitchDeg}
            enableOcclusionTesting={enableOcclusionTesting}
            occlusionAvailable={occlusionAvailable}
          />
        </SceneStateOverlayBridge>
      </CesiumSceneStateProvider>
    </div>
  );
};

const meta: Meta<LandmarkLabelStoryArgs> = {
  title: "Providers/LabelOverlay",
  component: CesiumLandmarksStory,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    syncLabelPitchToCamera: {
      control: { type: "boolean" },
    },
    fixedLabelPitchDeg: {
      control: { type: "range", min: -85, max: 0, step: 1 },
    },
    enableOcclusionTesting: {
      control: { type: "boolean" },
    },
  },
};

export default meta;

export const CesiumLandmarks: StoryObj<LandmarkLabelStoryArgs> = {
  name: "Cesium Landmarks",
  args: {
    syncLabelPitchToCamera: true,
    fixedLabelPitchDeg: -44,
    enableOcclusionTesting: true,
  },
};
