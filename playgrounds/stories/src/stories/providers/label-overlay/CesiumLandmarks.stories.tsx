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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faLandmark,
  faTowerObservation,
  faPalette,
  faTree,
  faBridge,
  faFutbol,
  faSeedling,
} from "@fortawesome/free-solid-svg-icons";
import {
  LabelOverlayProvider,
  usePointLabels,
  computePointLabelLayout,
  resolvePointLabelLayoutConfig,
  type PointLabelData,
  type LayoutPointInput,
  type PointLabelLayoutResult,
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
  icon: IconDefinition | string;
};

type LandmarkPoint = LandmarkSpec & {
  altitude: number;
  altitudeSource: "terrain" | "fallback";
};

const FALLBACK_ALTITUDE_METERS = 200;

const WUPPERTAL_LANDMARKS: readonly LandmarkSpec[] = [
  // POI landmarks — coordinates validated against Wikipedia GeoHack
  { id: "historische-stadthalle", name: "Historische Stadthalle", longitude: 7.14306, latitude: 51.25306, icon: faLandmark },
  { id: "elisenturm", name: "Elisenturm", longitude: 7.16089, latitude: 51.26053, icon: faTowerObservation },
  { id: "toelleturm", name: "Toelleturm", longitude: 7.20158, latitude: 51.25656, icon: faTowerObservation },
  { id: "von-der-heydt-museum", name: "Von der Heydt-Museum", longitude: 7.14658, latitude: 51.25725, icon: faPalette },
  { id: "skulpturenpark-waldfrieden", name: "Skulpturenpark Waldfrieden", longitude: 7.16861, latitude: 51.25278, icon: faTree },
  { id: "adlerbruecke", name: "Adlerbrücke", longitude: 7.18944, latitude: 51.26694, icon: faBridge },
  { id: "stadion-am-zoo", name: "Stadion am Zoo", longitude: 7.105, latitude: 51.23917, icon: faFutbol },
  { id: "botanischer-garten", name: "Botanischer Garten", longitude: 7.16056, latitude: 51.26028, icon: faSeedling },
  { id: "bismarckturm", name: "Bismarckturm", longitude: 7.16601, latitude: 51.26271, icon: faTowerObservation },
  { id: "buga-haengebruecke", name: "BUGA Hängebrücke (Entwurf)", longitude: 7.12128, latitude: 51.25255, icon: faBridge },
  // Schwebebahn stops
  { id: "schwebebahn-vohwinkel", name: "Vohwinkel", longitude: 7.06773, latitude: 51.23034, icon: "🚟" },
  { id: "schwebebahn-bruch", name: "Bruch", longitude: 7.07709, latitude: 51.23428, icon: "🚟" },
  { id: "schwebebahn-hammerstein", name: "Hammerstein", longitude: 7.08831, latitude: 51.2364, icon: "🚟" },
  { id: "schwebebahn-sonnborner-str", name: "Sonnborner Straße", longitude: 7.09673, latitude: 51.23811, icon: "🚟" },
  { id: "schwebebahn-zoo-stadion", name: "Zoo / Stadion", longitude: 7.10329, latitude: 51.24094, icon: "🚟" },
  { id: "schwebebahn-varresbecker-str", name: "Varresbecker Straße", longitude: 7.10708, latitude: 51.2466, icon: "🚟" },
  { id: "schwebebahn-westende", name: "Westende", longitude: 7.11853, latitude: 51.24896, icon: "🚟" },
  { id: "schwebebahn-pestalozzistr", name: "Pestalozzistraße", longitude: 7.12543, latitude: 51.24864, icon: "🚟" },
  { id: "schwebebahn-robert-daum-platz", name: "Robert-Daum-Platz", longitude: 7.13432, latitude: 51.25238, icon: "🚟" },
  { id: "schwebebahn-ohligsmuehle", name: "Ohligsmühle", longitude: 7.14268, latitude: 51.25538, icon: "🚟" },
  { id: "schwebebahn-hauptbahnhof", name: "Hauptbahnhof", longitude: 7.14851, latitude: 51.25589, icon: "🚟" },
  { id: "schwebebahn-kluse", name: "Kluse", longitude: 7.15448, latitude: 51.2557, icon: "🚟" },
  { id: "schwebebahn-landgericht", name: "Landgericht", longitude: 7.16243, latitude: 51.25804, icon: "🚟" },
  { id: "schwebebahn-voelklinger-str", name: "Völklinger Straße", longitude: 7.17402, latitude: 51.26248, icon: "🚟" },
  { id: "schwebebahn-loher-bruecke", name: "Loher Brücke", longitude: 7.18136, latitude: 51.26719, icon: "🚟" },
  { id: "schwebebahn-adlerbruecke", name: "Adlerbrücke (Hst.)", longitude: 7.18906, latitude: 51.26709, icon: "🚟" },
  { id: "schwebebahn-alter-markt", name: "Alter Markt", longitude: 7.19825, latitude: 51.26953, icon: "🚟" },
  { id: "schwebebahn-werther-bruecke", name: "Werther Brücke", longitude: 7.20674, latitude: 51.27238, icon: "🚟" },
  { id: "schwebebahn-wupperfeld", name: "Wupperfeld", longitude: 7.21376, latitude: 51.27328, icon: "🚟" },
  { id: "schwebebahn-oberbarmen", name: "Oberbarmen Bahnhof", longitude: 7.22211, latitude: 51.27474, icon: "🚟" },
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

const LAYOUT_CONFIG = resolvePointLabelLayoutConfig({
  placementOrder: ["left", "right", "center"],
  stemDistance: 20,
  dynamicLabelPlacement: true,
  pitchResponsiveAngle: true,
});

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

  const resolvedPitchRad = syncLabelPitchToCamera
    ? cameraPitchRad
    : degToRadNumeric(fixedLabelPitchDeg);

  const layoutResult = useMemo<PointLabelLayoutResult>(() => {
    if (!scene || scene.isDestroyed()) {
      return {
        placements: {},
        hiddenByLayout: new Set<string>(),
        collapsedToCompact: new Set<string>(),
      };
    }

    const layoutPoints = landmarks
      .map<LayoutPointInput | null>((landmark, index) => {
        const anchor = projectGeographicCoordinateToScreen(scene, {
          longitude: landmark.longitude,
          latitude: landmark.latitude,
          altitude: landmark.altitude,
        });
        if (!anchor) return null;

        const selected = landmark.id === "historische-stadthalle";
        return {
          id: landmark.id,
          anchor,
          text: landmark.name,
          compactText: landmark.name.slice(0, 2),
          index,
          ...(selected
            ? { layoutPriority: Number.MAX_SAFE_INTEGER, lockPreferredPlacement: true }
            : {}),
        };
      })
      .filter((p): p is LayoutPointInput => p !== null);

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: scene.canvas.clientWidth,
      viewportHeight: scene.canvas.clientHeight,
      cameraPitch: cameraPitchRad,
      config: LAYOUT_CONFIG,
    });
  }, [cameraPitchRad, landmarks, scene]);

  const labels = useMemo<readonly PointLabelData[]>(
    () =>
      landmarks.map((landmark) => {
        const selected = landmark.id === "historische-stadthalle";
        const placement = layoutResult.placements[landmark.id];
        const isOccluded = shouldTestOcclusion
          ? visibilityStateById[landmark.id]?.isOccluded ?? false
          : false;
        const isHidden = shouldTestOcclusion
          ? visibilityStateById[landmark.id]?.isHidden ?? false
          : false;

        return {
          id: landmark.id,
          content: landmark.name,
          compactContent:
            typeof landmark.icon === "string" ? (
              <span style={{ fontSize: 12 }}>{landmark.icon}</span>
            ) : (
              <FontAwesomeIcon icon={landmark.icon} style={{ fontSize: 12 }} />
            ),
          selected,
          collapse: !selected,
          forceCollapse: !selected,
          fullBorder: selected,
          labelStyle: "capsule" as const,
          labelAngleRad: placement?.angleRad,
          labelDistance: placement?.distance,
          labelAttach: placement?.attach,
          hideLabelAndStem:
            layoutResult.hiddenByLayout.has(landmark.id) || isHidden,
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
      }),
    [
      landmarks,
      layoutResult,
      resolvedPitchRad,
      scene,
      shouldTestOcclusion,
      visibilityStateById,
    ]
  );

  const statusValues = useMemo(() => {
    const occludedCount = labels.filter((l) => l.isOccluded).length;
    const hiddenCount = labels.filter((l) => l.isHidden).length;
    const placedCount = Object.keys(layoutResult.placements).length;
    const terrainSourceCount = landmarks.filter(
      (l) => l.altitudeSource === "terrain"
    ).length;

    return [
      `pitch ${((cameraPitchRad * 180) / Math.PI).toFixed(1)} deg`,
      `layout ${placedCount}/${landmarks.length} placed`,
      `${layoutResult.hiddenByLayout.size} layout-hidden`,
      `${layoutResult.collapsedToCompact.size} compact`,
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
    labels,
    landmarks,
    layoutResult,
    hasCameraMatrix,
    occlusionAvailable,
    shouldTestOcclusion,
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
        destination: Cartesian3.fromDegrees(7.145, 51.235, 7000),
        orientation: {
          heading: degToRadNumeric(10),
          pitch: degToRadNumeric(-55),
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
