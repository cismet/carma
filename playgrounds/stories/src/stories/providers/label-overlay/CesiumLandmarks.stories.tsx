import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Cartesian3,
  Cartographic,
  sampleTerrainMostDetailedGuardedAsync,
  type CesiumTerrainProvider,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import {
  CarmaResponsiveInfoBox,
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { CssPixelPosition } from "@carma/units/types";
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
  addCssPixelPositions,
  averageCssPixelPositions,
  clusterScreenSpaceLabelPoints,
  assignPointLabelClusterExpansionSlots,
  getVolumeEquivalentPointClusterDiameterPx,
  shouldTestPointLabelOcclusion,
  type PointLabelData,
  type PointLabelAnchorKind,
  type PointLabelOcclusionMode,
  type ClusterableScreenPoint,
  type LayoutPointInput,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/api";
import {
  useCesiumLabelOverlayHost,
  useCesiumOverlayView,
} from "@carma-mapping/engines/cesium/react/interactions";
import { useCesiumSceneVisibilityIndex } from "@carma-mapping/engines/cesium/react/visibility";
import { setupCesium } from "../../map-framework-switcher/helpers/cesium-setup";

import "cesium/Build/Cesium/Widgets/widgets.css";

type LandmarkLabelStoryArgs = {
  syncLabelPitchToCamera: boolean;
  fixedLabelPitchDeg: number;
  enableOcclusionTesting: boolean;
  clusterMode: "off" | "collapse" | "interactive";
  collapseDistancePx: number;
  collapseMinimumSize: number;
  expandedSlotStepPx: number;
  hideChrome: boolean;
  scenePreset: "city" | "stack";
};

type LandmarkSpec = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  icon: IconDefinition | string;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
};

type LandmarkPoint = LandmarkSpec & {
  altitude: number;
  altitudeSource: "terrain" | "fallback";
  positionECEF: Cartesian3;
};

const FALLBACK_ALTITUDE_METERS = 200;

const WUPPERTAL_LANDMARKS: readonly LandmarkSpec[] = [
  // POI landmarks — coordinates validated against Wikipedia GeoHack
  {
    id: "historische-stadthalle",
    name: "Historische Stadthalle",
    longitude: 7.14306,
    latitude: 51.25306,
    icon: faLandmark,
  },
  {
    id: "elisenturm",
    name: "Elisenturm",
    longitude: 7.16089,
    latitude: 51.26053,
    icon: faTowerObservation,
  },
  {
    id: "toelleturm",
    name: "Toelleturm",
    longitude: 7.20158,
    latitude: 51.25656,
    icon: faTowerObservation,
  },
  {
    id: "von-der-heydt-museum",
    name: "Von der Heydt-Museum",
    longitude: 7.14658,
    latitude: 51.25725,
    icon: faPalette,
  },
  {
    id: "skulpturenpark-waldfrieden",
    name: "Skulpturenpark Waldfrieden",
    longitude: 7.16861,
    latitude: 51.25278,
    icon: faTree,
    anchorKind: "area-centroid",
  },
  {
    id: "adlerbruecke",
    name: "Adlerbrücke",
    longitude: 7.18944,
    latitude: 51.26694,
    icon: faBridge,
  },
  {
    id: "stadion-am-zoo",
    name: "Stadion am Zoo",
    longitude: 7.105,
    latitude: 51.23917,
    icon: faFutbol,
    anchorKind: "area-centroid",
  },
  {
    id: "botanischer-garten",
    name: "Botanischer Garten",
    longitude: 7.16056,
    latitude: 51.26028,
    icon: faSeedling,
    anchorKind: "area-centroid",
  },
  {
    id: "bismarckturm",
    name: "Bismarckturm",
    longitude: 7.16601,
    latitude: 51.26271,
    icon: faTowerObservation,
  },
  {
    id: "buga-haengebruecke",
    name: "BUGA Hängebrücke (Entwurf)",
    longitude: 7.12128,
    latitude: 51.25255,
    icon: faBridge,
  },
  // Schwebebahn stops
  {
    id: "schwebebahn-vohwinkel",
    name: "Vohwinkel",
    longitude: 7.06773,
    latitude: 51.23034,
    icon: "🚟",
  },
  {
    id: "schwebebahn-bruch",
    name: "Bruch",
    longitude: 7.07709,
    latitude: 51.23428,
    icon: "🚟",
  },
  {
    id: "schwebebahn-hammerstein",
    name: "Hammerstein",
    longitude: 7.08831,
    latitude: 51.2364,
    icon: "🚟",
  },
  {
    id: "schwebebahn-sonnborner-str",
    name: "Sonnborner Straße",
    longitude: 7.09673,
    latitude: 51.23811,
    icon: "🚟",
  },
  {
    id: "schwebebahn-zoo-stadion",
    name: "Zoo / Stadion",
    longitude: 7.10329,
    latitude: 51.24094,
    icon: "🚟",
  },
  {
    id: "schwebebahn-varresbecker-str",
    name: "Varresbecker Straße",
    longitude: 7.10708,
    latitude: 51.2466,
    icon: "🚟",
  },
  {
    id: "schwebebahn-westende",
    name: "Westende",
    longitude: 7.11853,
    latitude: 51.24896,
    icon: "🚟",
  },
  {
    id: "schwebebahn-pestalozzistr",
    name: "Pestalozzistraße",
    longitude: 7.12543,
    latitude: 51.24864,
    icon: "🚟",
  },
  {
    id: "schwebebahn-robert-daum-platz",
    name: "Robert-Daum-Platz",
    longitude: 7.13432,
    latitude: 51.25238,
    icon: "🚟",
  },
  {
    id: "schwebebahn-ohligsmuehle",
    name: "Ohligsmühle",
    longitude: 7.14268,
    latitude: 51.25538,
    icon: "🚟",
  },
  {
    id: "schwebebahn-hauptbahnhof",
    name: "Hauptbahnhof",
    longitude: 7.14851,
    latitude: 51.25589,
    icon: "🚟",
  },
  {
    id: "schwebebahn-kluse",
    name: "Kluse",
    longitude: 7.15448,
    latitude: 51.2557,
    icon: "🚟",
  },
  {
    id: "schwebebahn-landgericht",
    name: "Landgericht",
    longitude: 7.16243,
    latitude: 51.25804,
    icon: "🚟",
  },
  {
    id: "schwebebahn-voelklinger-str",
    name: "Völklinger Straße",
    longitude: 7.17402,
    latitude: 51.26248,
    icon: "🚟",
  },
  {
    id: "schwebebahn-loher-bruecke",
    name: "Loher Brücke",
    longitude: 7.18136,
    latitude: 51.26719,
    icon: "🚟",
  },
  {
    id: "schwebebahn-adlerbruecke",
    name: "Adlerbrücke (Hst.)",
    longitude: 7.18906,
    latitude: 51.26709,
    icon: "🚟",
  },
  {
    id: "schwebebahn-alter-markt",
    name: "Alter Markt",
    longitude: 7.19825,
    latitude: 51.26953,
    icon: "🚟",
  },
  {
    id: "schwebebahn-werther-bruecke",
    name: "Werther Brücke",
    longitude: 7.20674,
    latitude: 51.27238,
    icon: "🚟",
  },
  {
    id: "schwebebahn-wupperfeld",
    name: "Wupperfeld",
    longitude: 7.21376,
    latitude: 51.27328,
    icon: "🚟",
  },
  {
    id: "schwebebahn-oberbarmen",
    name: "Oberbarmen Bahnhof",
    longitude: 7.22211,
    latitude: 51.27474,
    icon: "🚟",
  },
] as const;

const WUPPERTAL_STACK_LANDMARKS: readonly LandmarkSpec[] = [
  {
    id: "stack-hauptbahnhof-1",
    name: "Hbf Stack A",
    longitude: 7.14852,
    latitude: 51.25591,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-2",
    name: "Hbf Stack B",
    longitude: 7.14849,
    latitude: 51.25588,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-3",
    name: "Hbf Stack C",
    longitude: 7.14847,
    latitude: 51.25586,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-4",
    name: "Hbf Stack D",
    longitude: 7.14854,
    latitude: 51.25585,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-5",
    name: "Hbf Stack E",
    longitude: 7.14857,
    latitude: 51.25589,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-6",
    name: "Hbf Stack F",
    longitude: 7.14855,
    latitude: 51.25593,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-7",
    name: "Hbf Stack G",
    longitude: 7.1485,
    latitude: 51.25595,
    icon: "🚟",
  },
  {
    id: "stack-hauptbahnhof-8",
    name: "Hbf Stack H",
    longitude: 7.14845,
    latitude: 51.2559,
    icon: "🚟",
  },
] as const;

const LAYOUT_CONFIG = resolvePointLabelLayoutConfig({
  placementOrder: ["left", "right", "center"],
  stemDistance: 20,
  dynamicLabelPlacement: true,
  dynamicLabelPlacementConfig: {
    mode: "always",
  },
  pitchResponsiveAngle: true,
});

const EXPANDED_CLUSTER_LAYOUT_PRIORITY_BASE = 1_000_000;
const EXPANDED_CLUSTER_Z_INDEX_BASE = 20_000;
const EXPANDED_CLUSTER_STEM_DISTANCE_PX = 16;
const DEFAULT_POINT_ANCHOR_MARKER_SIZE_PX = 10;

type ProjectedLandmarkPoint = ClusterableScreenPoint<{
  landmark: LandmarkPoint;
  orderIndex: number;
  markerBackgroundColor: string;
  markerTextColor: string;
  compactContent: ReactNode;
  distanceToCamera: number;
}>;

type StoryDisplayEntry = {
  id: string;
  layoutPoint: LayoutPointInput;
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
  content: ReactNode;
  compactContent?: ReactNode;
  markerSize?: number;
  stemReferenceMarkerSize?: number;
  markerBackgroundColor: string;
  markerTextColor: string;
  selected: boolean;
  zIndex: number;
  getCanvasPosition: () => CssPixelPosition | null;
  onClick?: () => void;
  isOccluded: boolean;
  isHidden: boolean;
  forceCompact: boolean;
};

type StoryScenePreset = LandmarkLabelStoryArgs["scenePreset"];

const sampleLandmarkAltitudes = async (
  landmarks: readonly LandmarkSpec[],
  provider: CesiumTerrainProvider | null
): Promise<LandmarkPoint[]> => {
  if (!provider) {
    return landmarks.map((landmark) => ({
      ...landmark,
      altitude: FALLBACK_ALTITUDE_METERS,
      altitudeSource: "fallback" as const,
      positionECEF: cartesian3FromGeographicCoordinate({
        longitude: landmark.longitude,
        latitude: landmark.latitude,
        altitude: FALLBACK_ALTITUDE_METERS,
      }),
    }));
  }

  const cartographics = landmarks.map((landmark) =>
    Cartographic.fromDegrees(landmark.longitude, landmark.latitude)
  );
  const sampled = await sampleTerrainMostDetailedGuardedAsync(
    provider,
    cartographics,
    false
  );

  return landmarks.map((landmark, index) => {
    const sampledHeight = sampled[index]?.height;
    const hasSampledHeight = Number.isFinite(sampledHeight);
    const altitude = hasSampledHeight
      ? Number(sampledHeight)
      : FALLBACK_ALTITUDE_METERS;

    return {
      ...landmark,
      altitude,
      altitudeSource: hasSampledHeight ? "terrain" : "fallback",
      positionECEF: cartesian3FromGeographicCoordinate({
        longitude: landmark.longitude,
        latitude: landmark.latitude,
        altitude,
      }),
    };
  });
};

const resolveStoryLandmarks = (
  scenePreset: StoryScenePreset
): readonly LandmarkSpec[] =>
  scenePreset === "stack"
    ? [...WUPPERTAL_LANDMARKS, ...WUPPERTAL_STACK_LANDMARKS]
    : WUPPERTAL_LANDMARKS;

const resolveLandmarkMarkerBackgroundColor = (
  landmark: LandmarkSpec
): string => {
  if (typeof landmark.icon === "string" || landmark.id.startsWith("stack-")) {
    return "rgba(3, 105, 161, 0.95)";
  }
  if (landmark.icon === faTowerObservation) {
    return "rgba(120, 53, 15, 0.95)";
  }
  if (landmark.icon === faBridge) {
    return "rgba(51, 65, 85, 0.95)";
  }
  if (landmark.icon === faTree || landmark.icon === faSeedling) {
    return "rgba(21, 128, 61, 0.95)";
  }
  if (landmark.icon === faPalette) {
    return "rgba(157, 23, 77, 0.95)";
  }
  if (landmark.icon === faFutbol) {
    return "rgba(37, 99, 235, 0.95)";
  }

  return "rgba(15, 23, 42, 0.95)";
};

const resolveLandmarkMarkerTextColor = (): string => "#f8fafc";

const resolveLandmarkIconNode = (
  icon: LandmarkSpec["icon"],
  fontSize: number = 12
): ReactNode =>
  typeof icon === "string" ? (
    <span style={{ fontSize }}>{icon}</span>
  ) : (
    <FontAwesomeIcon icon={icon} style={{ fontSize }} />
  );

const resolveLandmarkCollapseKey = (landmark: LandmarkSpec): string => {
  const markerBackgroundColor = resolveLandmarkMarkerBackgroundColor(landmark);
  const iconKey =
    typeof landmark.icon === "string" ? landmark.icon : landmark.icon.iconName;
  return `${iconKey}:${markerBackgroundColor}`;
};

const isAreaCentroidLandmark = (landmark: LandmarkSpec): boolean =>
  landmark.anchorKind === "area-centroid";

const resolveLandmarkTypeLabel = (landmark: LandmarkSpec): string => {
  if (typeof landmark.icon === "string" || landmark.id.startsWith("stack-")) {
    return "Schwebebahn";
  }
  if (landmark.icon === faTowerObservation) {
    return "tower";
  }
  if (landmark.icon === faBridge) {
    return "bridge";
  }
  if (landmark.icon === faTree || landmark.icon === faSeedling) {
    return "green";
  }
  if (landmark.icon === faPalette) {
    return "museum";
  }
  if (landmark.icon === faFutbol) {
    return "stadium";
  }
  if (landmark.icon === faLandmark) {
    return "landmark";
  }
  return "marker";
};

const resolveClusterSummaryLabel = (
  members: readonly ProjectedLandmarkPoint[]
): string => {
  const representativeLandmark = members[0]?.item.landmark;
  if (!representativeLandmark) {
    return "stack";
  }

  return `${members.length} ${resolveLandmarkTypeLabel(
    representativeLandmark
  )} stack`;
};

const resolveCollapsedClusterAnchorMarkerSizePx = (
  clusteredPointCount: number
): number =>
  getVolumeEquivalentPointClusterDiameterPx(
    DEFAULT_POINT_ANCHOR_MARKER_SIZE_PX,
    clusteredPointCount
  );

const resolveLiveClusterAnchor = (
  projectWorldToScreen: (
    position: CssPixelPosition | Cartesian3
  ) => CssPixelPosition | null,
  members: readonly ProjectedLandmarkPoint[]
): CssPixelPosition | null => {
  const anchors = members
    .map((member) => projectWorldToScreen(member.item.landmark.positionECEF))
    .filter((anchor): anchor is CssPixelPosition => anchor !== null);

  if (anchors.length === 0) {
    return null;
  }

  return averageCssPixelPositions(anchors);
};

const resolveCameraView = (scenePreset: StoryScenePreset) =>
  scenePreset === "stack"
    ? {
        destination: Cartesian3.fromDegrees(7.1486, 51.2559, 1300),
        orientation: {
          heading: degToRadNumeric(15),
          pitch: degToRadNumeric(-62),
          roll: 0,
        },
      }
    : {
        destination: Cartesian3.fromDegrees(7.145, 51.235, 7000),
        orientation: {
          heading: degToRadNumeric(10),
          pitch: degToRadNumeric(-55),
          roll: 0,
        },
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

const CesiumLandmarksOverlay = ({
  scene,
  landmarks,
  syncLabelPitchToCamera,
  fixedLabelPitchDeg,
  enableOcclusionTesting,
  occlusionAvailable,
  clusterMode,
  collapseDistancePx,
  collapseMinimumSize,
  expandedSlotStepPx,
  hideChrome,
  scenePreset,
}: {
  scene: Scene | null;
  landmarks: readonly LandmarkPoint[];
  syncLabelPitchToCamera: boolean;
  fixedLabelPitchDeg: number;
  enableOcclusionTesting: boolean;
  occlusionAvailable: boolean;
  clusterMode: LandmarkLabelStoryArgs["clusterMode"];
  collapseDistancePx: number;
  collapseMinimumSize: number;
  expandedSlotStepPx: number;
  hideChrome: boolean;
  scenePreset: StoryScenePreset;
}) => {
  const overlayView = useCesiumOverlayView(scene);
  const cameraPitchRad = overlayView.derivedView?.pitch ?? 0;
  const overlayFrameNumber = overlayView.frameNumber ?? 0;
  const shouldTestOcclusion = enableOcclusionTesting && occlusionAvailable;
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(
    null
  );
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(
    scenePreset === "city" ? "historische-stadthalle" : null
  );
  const registeredPointIdSetRef = useRef<Set<string>>(new Set());
  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: true,
      shouldTestOcclusion,
      occlusionPointIds: landmarks
        .filter((landmark) => shouldTestPointLabelOcclusion(landmark))
        .map((landmark) => landmark.id),
      viewportPaddingHorizontal: 8,
      viewportPaddingVertical: 8,
      occlusionToleranceMeters: 1.0,
    });

  useEffect(() => {
    const indexedPoints = landmarks.map((landmark) => ({
      id: landmark.id,
      positionECEF: landmark.positionECEF,
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
    setExpandedClusterId(null);
    setSelectedLandmarkId(
      scenePreset === "city" ? "historische-stadthalle" : null
    );
  }, [scenePreset]);

  useEffect(() => {
    if (clusterMode !== "interactive") {
      setExpandedClusterId(null);
    }
  }, [clusterMode]);

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

  const projectedLandmarks = useMemo<readonly ProjectedLandmarkPoint[]>(() => {
    if (!scene || scene.isDestroyed()) {
      return [];
    }

    return landmarks
      .map<ProjectedLandmarkPoint | null>((landmark, index) => {
        const anchor = overlayView.projectWorldToScreen(landmark.positionECEF);
        if (!anchor) return null;

        const selected = landmark.id === selectedLandmarkId;
        const markerBackgroundColor =
          resolveLandmarkMarkerBackgroundColor(landmark);
        const distanceToCamera = Cartesian3.distance(
          scene.camera.positionWC,
          landmark.positionECEF
        );

        return {
          id: landmark.id,
          anchor,
          collapseKey: resolveLandmarkCollapseKey(landmark),
          selected,
          layoutPriority: selected
            ? Number.MAX_SAFE_INTEGER
            : -distanceToCamera,
          zIndex: selected
            ? 30_000
            : Math.max(1_000, 12_000 - distanceToCamera),
          item: {
            landmark,
            orderIndex: index,
            markerBackgroundColor,
            markerTextColor: resolveLandmarkMarkerTextColor(),
            compactContent: resolveLandmarkIconNode(landmark.icon),
            distanceToCamera,
          },
        };
      })
      .filter(
        (landmark): landmark is ProjectedLandmarkPoint => landmark !== null
      );
  }, [landmarks, overlayFrameNumber, overlayView, scene, selectedLandmarkId]);

  const clusters = useMemo(
    () =>
      clusterMode === "off"
        ? projectedLandmarks.map((landmark) => ({
            id: landmark.id,
            anchor: landmark.anchor,
            collapseKey: landmark.collapseKey ?? null,
            members: [landmark],
            representative: landmark,
            stackCount: 1,
          }))
        : clusterScreenSpaceLabelPoints(projectedLandmarks, {
            collapseDistancePx,
            minimumClusterSize: collapseMinimumSize,
            selectedPreventsCollapse: false,
            anchorMode: "average",
          }),
    [clusterMode, collapseDistancePx, collapseMinimumSize, projectedLandmarks]
  );

  useEffect(() => {
    if (!expandedClusterId) {
      return;
    }

    const hasExpandedCluster = clusters.some(
      (cluster) => cluster.id === expandedClusterId && cluster.stackCount > 1
    );
    if (clusterMode !== "interactive" || !hasExpandedCluster) {
      setExpandedClusterId(null);
    }
  }, [clusterMode, clusters, expandedClusterId]);

  const displayEntries = useMemo<readonly StoryDisplayEntry[]>(() => {
    if (!scene || scene.isDestroyed()) {
      return [];
    }

    const entries: StoryDisplayEntry[] = [];
    clusters.forEach((cluster) => {
      if (
        cluster.stackCount > 1 &&
        clusterMode === "interactive" &&
        expandedClusterId === cluster.id
      ) {
        const assignedSlots = assignPointLabelClusterExpansionSlots(
          cluster.members,
          {
            stepPx: expandedSlotStepPx,
          }
        );

        assignedSlots.forEach(({ member, slot }, slotIndex) => {
          const selected = member.item.landmark.id === selectedLandmarkId;
          entries.push({
            id: member.id,
            layoutPoint: {
              id: member.id,
              anchor: addCssPixelPositions(cluster.anchor, slot.offset),
              text: member.item.landmark.name,
              compactText: member.item.landmark.name.slice(0, 2),
              index: member.item.orderIndex,
              layoutPriority:
                (selected
                  ? Number.MAX_SAFE_INTEGER
                  : EXPANDED_CLUSTER_LAYOUT_PRIORITY_BASE) - slotIndex,
              lockPreferredPlacement: true,
              preferredAttach: slot.attach,
              preferredStemDistance:
                slot.id === "center" ? 0 : EXPANDED_CLUSTER_STEM_DISTANCE_PX,
            },
            content: member.item.landmark.name,
            compactContent: member.item.compactContent,
            markerBackgroundColor: member.item.markerBackgroundColor,
            markerTextColor: member.item.markerTextColor,
            selected,
            zIndex:
              (selected ? 40_000 : EXPANDED_CLUSTER_Z_INDEX_BASE) - slotIndex,
            getCanvasPosition: () => {
              const liveAnchor = resolveLiveClusterAnchor(
                overlayView.projectWorldToScreen,
                cluster.members
              );
              return liveAnchor
                ? addCssPixelPositions(liveAnchor, slot.offset)
                : null;
            },
            onClick: () => {
              setSelectedLandmarkId(member.item.landmark.id);
              setExpandedClusterId(cluster.id);
            },
            isOccluded:
              visibilityStateById[member.item.landmark.id]?.isOccluded ?? false,
            isHidden:
              visibilityStateById[member.item.landmark.id]?.isHidden ?? false,
            forceCompact: false,
          });
        });
        return;
      }

      if (cluster.stackCount > 1) {
        const representative = cluster.representative;
        const stackIndicator = (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 700,
            }}
          >
            <span>
              {resolveLandmarkIconNode(representative.item.landmark.icon, 11)}
            </span>
            <span>{cluster.stackCount}</span>
          </span>
        );
        entries.push({
          id: cluster.id,
          layoutPoint: {
            id: cluster.id,
            anchor: cluster.anchor,
            text: resolveClusterSummaryLabel(cluster.members),
            compactText: `${cluster.stackCount}`,
            index: representative.item.orderIndex,
            layoutPriority: representative.layoutPriority,
          },
          content: resolveClusterSummaryLabel(cluster.members),
          compactContent: stackIndicator,
          markerSize: resolveCollapsedClusterAnchorMarkerSizePx(
            cluster.stackCount
          ),
          stemReferenceMarkerSize: resolveCollapsedClusterAnchorMarkerSizePx(
            cluster.stackCount
          ),
          markerBackgroundColor: representative.item.markerBackgroundColor,
          markerTextColor: representative.item.markerTextColor,
          selected: false,
          zIndex: (representative.zIndex ?? 0) + 100,
          getCanvasPosition: () =>
            resolveLiveClusterAnchor(
              overlayView.projectWorldToScreen,
              cluster.members
            ),
          onClick:
            clusterMode === "interactive"
              ? () => {
                  setExpandedClusterId(cluster.id);
                }
              : undefined,
          isOccluded: cluster.members.every(
            (member) => visibilityStateById[member.id]?.isOccluded ?? false
          ),
          isHidden: cluster.members.every(
            (member) => visibilityStateById[member.id]?.isHidden ?? false
          ),
          forceCompact: true,
        });
        return;
      }

      const member = cluster.members[0];
      const selected = member.item.landmark.id === selectedLandmarkId;
      const areaCentroidAnchor = isAreaCentroidLandmark(member.item.landmark);
      entries.push({
        id: member.id,
        layoutPoint: {
          id: member.id,
          anchor: member.anchor,
          anchorKind: member.item.landmark.anchorKind,
          text: member.item.landmark.name,
          compactText: member.item.landmark.name.slice(0, 2),
          index: member.item.orderIndex,
          layoutPriority: member.layoutPriority,
          ...(areaCentroidAnchor
            ? {
                lockPreferredPlacement: true,
                preferredAttach: "center" as const,
                preferredStemDistance: 0,
              }
            : {}),
        },
        anchorKind: member.item.landmark.anchorKind,
        occlusionMode: member.item.landmark.occlusionMode,
        content: member.item.landmark.name,
        compactContent: member.item.compactContent,
        markerBackgroundColor: member.item.markerBackgroundColor,
        markerTextColor: member.item.markerTextColor,
        selected,
        zIndex: member.zIndex ?? 20,
        getCanvasPosition: () =>
          overlayView.projectWorldToScreen(member.item.landmark.positionECEF),
        onClick: () => {
          setSelectedLandmarkId(member.item.landmark.id);
        },
        isOccluded:
          visibilityStateById[member.item.landmark.id]?.isOccluded ?? false,
        isHidden:
          visibilityStateById[member.item.landmark.id]?.isHidden ?? false,
        forceCompact: false,
      });
    });

    return entries;
  }, [
    clusterMode,
    clusters,
    expandedClusterId,
    expandedSlotStepPx,
    scene,
    selectedLandmarkId,
    visibilityStateById,
    overlayFrameNumber,
    overlayView,
  ]);

  const layoutResult = useMemo<PointLabelLayoutResult>(() => {
    if (!scene || scene.isDestroyed()) {
      return {
        placements: {},
        hiddenByLayout: new Set<string>(),
        collapsedToCompact: new Set<string>(),
      };
    }

    return computePointLabelLayout({
      points: displayEntries.map((entry) => entry.layoutPoint),
      viewportWidth: scene.canvas.clientWidth,
      viewportHeight: scene.canvas.clientHeight,
      cameraPitch: cameraPitchRad,
      config: LAYOUT_CONFIG,
    });
  }, [cameraPitchRad, displayEntries, scene]);

  const labels = useMemo<readonly PointLabelData[]>(
    () =>
      displayEntries.map((entry) => {
        const placement = layoutResult.placements[entry.id];
        return {
          id: entry.id,
          content: entry.content,
          compactContent: entry.compactContent,
          selected: entry.selected,
          collapse:
            entry.forceCompact || layoutResult.collapsedToCompact.has(entry.id),
          forceCollapse:
            entry.forceCompact || layoutResult.collapsedToCompact.has(entry.id),
          fullBorder: entry.selected,
          labelStyle: "capsule" as const,
          anchorKind: entry.anchorKind,
          occlusionMode: entry.occlusionMode,
          labelAngleRad:
            entry.anchorKind === "area-centroid" ? 0 : placement?.angleRad,
          labelDistance:
            entry.anchorKind === "area-centroid" ? 0 : placement?.distance,
          labelAttach:
            entry.anchorKind === "area-centroid" ? "center" : placement?.attach,
          hideLabelAndStem:
            layoutResult.hiddenByLayout.has(entry.id) || entry.isHidden,
          pitch: resolvedPitchRad,
          hideMarker: entry.anchorKind === "area-centroid",
          markerBackgroundColor: entry.markerBackgroundColor,
          markerTextColor: entry.markerTextColor,
          markerSize: entry.markerSize,
          stemReferenceMarkerSize: entry.stemReferenceMarkerSize,
          textColor: "#0f172a",
          textBackgroundColor: "rgba(255,255,255,0.96)",
          selectedBackgroundColor: "rgba(251, 191, 36, 0.95)",
          hoverBackgroundColor: "rgba(254, 243, 199, 0.98)",
          isOccluded:
            shouldTestOcclusion &&
            shouldTestPointLabelOcclusion({
              anchorKind: entry.anchorKind,
              occlusionMode: entry.occlusionMode,
            })
              ? entry.isOccluded
              : false,
          isHidden: entry.isHidden,
          getCanvasPosition: entry.getCanvasPosition,
          zIndex: entry.zIndex,
          onClick: entry.onClick,
        };
      }),
    [displayEntries, layoutResult, resolvedPitchRad, shouldTestOcclusion]
  );

  const statusValues = useMemo(() => {
    const occludedCount = labels.filter((l) => l.isOccluded).length;
    const hiddenCount = labels.filter((l) => l.isHidden).length;
    const placedCount = Object.keys(layoutResult.placements).length;
    const collapsedClusterCount = displayEntries.filter(
      (entry) => entry.forceCompact
    ).length;
    const terrainSourceCount = landmarks.filter(
      (l) => l.altitudeSource === "terrain"
    ).length;

    return [
      `pitch ${(radToDegNumeric(cameraPitchRad) ?? 0).toFixed(1)} deg`,
      `layout ${placedCount}/${landmarks.length} placed`,
      `${layoutResult.hiddenByLayout.size} layout-hidden`,
      `${layoutResult.collapsedToCompact.size} compact`,
      `${collapsedClusterCount} collapsed stacks`,
      `occlusion ${
        !enableOcclusionTesting
          ? "off"
          : shouldTestOcclusion
          ? "on"
          : "requested (no surface)"
      }`,
      `mesh ${occlusionAvailable ? "loaded" : "unavailable"}`,
      `occluded ${occludedCount}/${labels.length}`,
      `hidden ${hiddenCount}/${labels.length}`,
      `terrainSampled ${terrainSourceCount}/${landmarks.length}`,
      `expanded ${expandedClusterId ?? "none"}`,
      `selected ${selectedLandmarkId ?? "none"}`,
    ];
  }, [
    cameraPitchRad,
    displayEntries,
    enableOcclusionTesting,
    expandedClusterId,
    labels,
    landmarks,
    layoutResult,
    occlusionAvailable,
    selectedLandmarkId,
    shouldTestOcclusion,
  ]);

  usePointLabels([...labels], true, undefined, undefined, {
    transitionDurationMs: 160,
  });

  return (
    <>
      {!hideChrome ? (
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
          <ResponsiveStatusBar
            label={
              clusterMode === "off"
                ? "wuppertal label scene"
                : "wuppertal label stacks"
            }
            values={statusValues}
          />
        </div>
      ) : null}
      {!hideChrome ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 12,
            zIndex: 1900,
          }}
        >
          <CarmaResponsiveInfoBox
            draggable
            useControlLayout={false}
            width={340}
            heading={
              scenePreset === "stack"
                ? "Wuppertal Stack Layout"
                : "Wuppertal Label Scene"
            }
            subtitle="Host-linked overlay, clustered collapse, shared layout core."
            content={
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                <div>
                  <strong>Collapse mode:</strong> {clusterMode}
                </div>
                <div>
                  <strong>Collapse distance:</strong> {collapseDistancePx}px
                </div>
                <div>
                  <strong>Min stack size:</strong> {collapseMinimumSize}
                </div>
                <div>
                  <strong>Expanded slot step:</strong> {expandedSlotStepPx}px
                </div>
                <div>
                  <strong>Selection:</strong>{" "}
                  {selectedLandmarkId ?? "click a label"}
                </div>
                <div>
                  <strong>Expansion:</strong>{" "}
                  {expandedClusterId ?? "click a collapsed stack"}
                </div>
              </div>
            }
          />
        </div>
      ) : null}
    </>
  );
};

const CesiumLandmarksStory = ({
  syncLabelPitchToCamera,
  fixedLabelPitchDeg,
  enableOcclusionTesting,
  clusterMode,
  collapseDistancePx,
  collapseMinimumSize,
  expandedSlotStepPx,
  hideChrome,
  scenePreset,
}: LandmarkLabelStoryArgs) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [landmarks, setLandmarks] = useState<readonly LandmarkPoint[]>([]);
  const [occlusionAvailable, setOcclusionAvailable] = useState<boolean>(false);
  const landmarkSpecs = useMemo(
    () => resolveStoryLandmarks(scenePreset),
    [scenePreset]
  );
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });

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
      setup.widget.camera.setView(resolveCameraView(scenePreset));
      setup.widget.scene.requestRender();

      const provider =
        setup.terrainProviders.SURFACE ?? setup.terrainProviders.TERRAIN;
      const sampledLandmarks = await sampleLandmarkAltitudes(
        landmarkSpecs,
        provider
      );
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
  }, [landmarkSpecs, scenePreset]);

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
      <LabelOverlayProvider host={overlayHost}>
        <CesiumLandmarksOverlay
          scene={scene}
          landmarks={landmarks}
          syncLabelPitchToCamera={syncLabelPitchToCamera}
          fixedLabelPitchDeg={fixedLabelPitchDeg}
          enableOcclusionTesting={enableOcclusionTesting}
          occlusionAvailable={occlusionAvailable}
          clusterMode={clusterMode}
          collapseDistancePx={collapseDistancePx}
          collapseMinimumSize={collapseMinimumSize}
          expandedSlotStepPx={expandedSlotStepPx}
          hideChrome={hideChrome}
          scenePreset={scenePreset}
        />
      </LabelOverlayProvider>
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
    clusterMode: {
      control: { type: "inline-radio" },
      options: ["off", "collapse", "interactive"],
    },
    collapseDistancePx: {
      control: { type: "range", min: 1, max: 24, step: 1 },
    },
    collapseMinimumSize: {
      control: { type: "range", min: 2, max: 8, step: 1 },
    },
    expandedSlotStepPx: {
      control: { type: "range", min: 20, max: 72, step: 2 },
    },
    hideChrome: {
      control: { type: "boolean" },
      description: "Hide story-only chrome like the status bar and infobox.",
    },
    scenePreset: {
      control: { type: "inline-radio" },
      options: ["city", "stack"],
    },
  },
};

export default meta;

export const WuppertalLabelTestScene: StoryObj<LandmarkLabelStoryArgs> = {
  name: "Wuppertal Label Test Scene",
  args: {
    syncLabelPitchToCamera: true,
    fixedLabelPitchDeg: -44,
    enableOcclusionTesting: true,
    clusterMode: "off",
    collapseDistancePx: 5,
    collapseMinimumSize: 2,
    expandedSlotStepPx: 40,
    hideChrome: true,
    scenePreset: "city",
  },
};

export const CollapsedLabelStacks: StoryObj<LandmarkLabelStoryArgs> = {
  name: "Collapsed Label Stacks",
  args: {
    syncLabelPitchToCamera: true,
    fixedLabelPitchDeg: -50,
    enableOcclusionTesting: true,
    clusterMode: "collapse",
    collapseDistancePx: 5,
    collapseMinimumSize: 2,
    expandedSlotStepPx: 40,
    hideChrome: false,
    scenePreset: "stack",
  },
};

export const InteractiveClusterExpansion: StoryObj<LandmarkLabelStoryArgs> = {
  name: "Interactive Cluster Expansion",
  args: {
    syncLabelPitchToCamera: true,
    fixedLabelPitchDeg: -50,
    enableOcclusionTesting: true,
    clusterMode: "interactive",
    collapseDistancePx: 5,
    collapseMinimumSize: 2,
    expandedSlotStepPx: 40,
    hideChrome: false,
    scenePreset: "stack",
  },
};

export const AveragedCollapsedAnchors: StoryObj<LandmarkLabelStoryArgs> = {
  name: "Averaged Collapsed Anchors",
  args: {
    syncLabelPitchToCamera: true,
    fixedLabelPitchDeg: -50,
    enableOcclusionTesting: true,
    clusterMode: "collapse",
    collapseDistancePx: 5,
    collapseMinimumSize: 2,
    expandedSlotStepPx: 40,
    hideChrome: true,
    scenePreset: "stack",
  },
};
