import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button,
  Collapse,
  Checkbox,
  ConfigProvider,
  Descriptions,
  Segmented,
  Space,
  Typography,
  Tooltip,
  theme,
} from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  CarmaResponsiveInfoBox,
  useHostElementSizeRef,
} from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";
import {
  acquireSharedThreeScene,
  createSharedThreeSceneCameraPreview,
  getSharedThreeSceneRuntimes,
  MAPLIBRE_EVENT,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";

import type { SolarPosition } from "../core/solar-position";
import { SHADOW_BUFFER_LAYOUT } from "../core/shadow-types";
import {
  buildShadowProjectionDebugModel,
  type ShadowProjectionDebugModel,
} from "../runtime/shadow-projection-debug-model";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "../runtime/shadow-projection-debug-store";

const SHADOW_PROJECTION_DEBUG_CUE_OPTIONS = {
  bearing: { label: "Schattenrichtung", color: "#d97706" },
  pitch: { label: "Höhe", color: "#f59e0b" },
  north: { label: "N", color: "#2563eb" },
} as const;

const SHADOW_DEBUG_VIEWPOINT = {
  OVERVIEW: "overview",
  SUN: "sun",
} as const;

type ShadowDebugViewpoint =
  (typeof SHADOW_DEBUG_VIEWPOINT)[keyof typeof SHADOW_DEBUG_VIEWPOINT];

type VisualizerContentGroup =
  | "worldAxes"
  | "angleCues"
  | "imagePlanes"
  | "cameraAxes"
  | "frustums"
  | "projectionPlanes"
  | "markers"
  | "altitude"
  | "labels"
  | "tileVolumes";

const VISUALIZER_CONTENT_GROUPS: ReadonlyArray<{
  key: VisualizerContentGroup;
  label: string;
}> = [
  { key: "worldAxes", label: "Weltachsen" },
  { key: "angleCues", label: "Winkel" },
  { key: "imagePlanes", label: "Bildflächen" },
  { key: "cameraAxes", label: "Kameraachsen" },
  { key: "frustums", label: "Frusta" },
  { key: "projectionPlanes", label: "Projektionsebenen" },
  { key: "markers", label: "Marker" },
  { key: "altitude", label: "Höhenbezug" },
  { key: "labels", label: "Beschriftung" },
  { key: "tileVolumes", label: "Tile-Volumes" },
];

const DEFAULT_VISUALIZER_CONTENT_VISIBILITY: Record<
  VisualizerContentGroup,
  boolean
> = {
  worldAxes: true,
  angleCues: true,
  imagePlanes: true,
  cameraAxes: true,
  frustums: true,
  projectionPlanes: true,
  markers: true,
  altitude: false,
  labels: true,
  tileVolumes: true,
};

const useShadowProjectionDebugPortalHost = () => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.carmaShadowProjectionDebugHost = "";
    document.body.appendChild(element);
    setHost(element);

    return () => {
      element.remove();
    };
  }, []);

  return host;
};

export const ShadowProjectionDebugPortal = ({
  children,
}: {
  children: ReactNode;
}) => {
  const host = useShadowProjectionDebugPortalHost();
  return host ? createPortal(children, host) : null;
};

export type ShadowProjectionDebugSettings = Readonly<{
  showSunDebugVector: boolean;
  showTileBounds: boolean;
}>;

const formatMeters = (value: number, fractionDigits = 0) =>
  `${value.toFixed(fractionDigits)} m`;

const ShadowBufferStatistics = ({
  model,
}: {
  model: ShadowProjectionDebugModel;
}) => {
  const { token } = theme.useToken();
  const isTiled = model.bufferLayout === SHADOW_BUFFER_LAYOUT.TILED;
  const stats = model.tiledStats;
  const values: ReadonlyArray<Readonly<{ label: string; value: ReactNode }>> = [
    { label: "Schattenpuffer", value: isTiled ? "Gekachelt" : "Einzelpuffer" },
    { label: "Samples (Ziel)", value: model.sunDiscSamples },
    { label: "Geladene Tiles", value: model.tileVolumes.length },
    {
      label: "Viewport",
      value: `${formatMeters(model.viewportWidthMeters)} × ${formatMeters(
        model.viewportHeightMeters
      )}`,
    },
    ...(isTiled
      ? stats
        ? [
            { label: "Schattenseiten", value: stats.pages },
            {
              label: "Seitenformate",
              value: (
                <div
                  role="region"
                  aria-label="Schattenseitenformate"
                  tabIndex={0}
                  style={{
                    maxHeight: 88,
                    overflowY: "auto",
                    overflowWrap: "anywhere",
                    overscrollBehavior: "contain",
                  }}
                >
                  {stats.dimensions.map((dimension, index) => (
                    <div key={index}>
                      {index + 1}: {dimension}
                    </div>
                  ))}
                </div>
              ),
            },
            { label: "Begrenzte Seiten", value: stats.limitedPages },
            { label: "Cache-Seiten", value: stats.cachedSamplePages },
            {
              label: "Cache",
              value: `${(stats.cacheBytes / 1024 ** 2).toFixed(1)} MiB`,
            },
            {
              label: "Scratch",
              value: `${(stats.scratchBytes / 1024 ** 2).toFixed(1)} MiB`,
            },
            {
              label: "Cache Treffer / Misses",
              value: `${stats.hits} / ${stats.misses}`,
            },
            {
              label: "Depth- / Farb-Pässe",
              value: `${stats.depthRenders} / ${stats.colorPasses}`,
            },
            ...(stats.corridorAccumulation
              ? [
                  {
                    label: "Sonnenscheiben-Mittelung",
                    value: stats.corridorAccumulation.fallbackReason
                      ? `Fallback: ${stats.corridorAccumulation.fallbackReason}`
                      : "Pro Korridor",
                  },
                  {
                    label: "Fertige Korridore",
                    value: `${
                      stats.corridorAccumulation.pageSamples.filter(
                        (page) => page.published
                      ).length
                    } / ${stats.corridorAccumulation.pageSamples.length}`,
                  },
                  {
                    label: "Bereite Korridore",
                    value: stats.corridorAccumulation.pageSamples.filter(
                      (page) => page.ready
                    ).length,
                  },
                  {
                    label: "Laufende Samples (Maximum)",
                    value: Math.max(
                      0,
                      ...stats.corridorAccumulation.pageSamples
                        .filter((page) => !page.published)
                        .map((page) => page.samples)
                    ),
                  },
                  {
                    label: "Integrations-Arbeitsbuffer",
                    value: `${(
                      stats.corridorAccumulation.memoryBytes /
                      1024 ** 2
                    ).toFixed(1)} MiB`,
                  },
                ]
              : []),
          ]
        : [{ label: "Schattenseiten", value: "werden vorbereitet" }]
      : [
          {
            label: "Buffer",
            value: `${model.shadowBuffer.shadowMapWidth} × ${model.shadowBuffer.shadowMapHeight}`,
          },
          {
            label: "Kernabdeckung",
            value: `${formatMeters(
              model.receiverCoverageWidthMeters
            )} × ${formatMeters(model.receiverCoverageHeightMeters)}`,
          },
          {
            label: "Texel",
            value: formatMeters(
              Math.max(
                model.shadowTexelWidthMeters,
                model.shadowTexelHeightMeters
              ),
              3
            ),
          },
          {
            label: "Höhenspanne",
            value: formatMeters(model.elevationSpanMeters),
          },
          { label: "Caster", value: formatMeters(model.casterReachMeters) },
          {
            label: "Horizontal / Höhe",
            value: `${model.horizontalProjectionPerHeight.toFixed(2)} ×`,
          },
        ]),
  ];

  return (
    <div
      role="region"
      aria-label="Schattenstatistik"
      tabIndex={0}
      style={{
        maxHeight: 240,
        minWidth: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          paddingTop: token.paddingSM,
        }}
        items={values.map(({ label, value }) => ({
          key: label,
          label,
          children: value,
        }))}
      />
    </div>
  );
};

const SUN_CAMERA_PREVIEW_INTERVAL_MS = 120;

const ShadowSunCameraView = ({
  map,
  containerWidth,
  containerHeight,
  shadowMapWidth,
  shadowMapHeight,
}: {
  map: MaplibreMap;
  containerWidth: number;
  containerHeight: number;
  shadowMapWidth: number;
  shadowMapHeight: number;
}) => {
  const { token } = theme.useToken();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const aspectRatio = Math.max(
    0.1,
    shadowMapWidth / Math.max(1, shadowMapHeight)
  );
  const fittedWidth = Math.max(
    1,
    Math.min(containerWidth, containerHeight * aspectRatio)
  );
  const fittedHeight = Math.max(1, fittedWidth / aspectRatio);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const frameWidth = Math.max(1, Math.round(fittedWidth * pixelRatio));
  const frameHeight = Math.max(1, Math.round(fittedHeight * pixelRatio));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lease = acquireSharedThreeScene(map);
    const preview = createSharedThreeSceneCameraPreview(lease.layer);
    let lastFrameAt = Number.NEGATIVE_INFINITY;
    let framePresented = false;

    const renderFrame = () => {
      const now = performance.now();
      if (now - lastFrameAt < SUN_CAMERA_PREVIEW_INTERVAL_MS) return;
      const light = lease.layer
        .getScene()
        .getObjectByName("shadow-simulation-sun") as
        | THREE.DirectionalLight
        | undefined;
      if (!light?.isDirectionalLight) return;

      const rendered = preview.render(
        light.shadow.camera,
        frameWidth,
        frameHeight,
        (framePixels, width, height) => {
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) return;
          const image = context.createImageData(width, height);
          image.data.set(framePixels);
          context.putImageData(image, 0, 0);
          if (!framePresented) {
            framePresented = true;
            setHasFrame(true);
          }
        }
      );
      if (rendered) lastFrameAt = now;
    };

    map.on(MAPLIBRE_EVENT.RENDER, renderFrame);
    map.triggerRepaint();
    return () => {
      map.off(MAPLIBRE_EVENT.RENDER, renderFrame);
      preview.dispose();
      lease.release();
    };
  }, [frameHeight, frameWidth, map]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: fittedWidth,
        height: fittedHeight,
        backgroundColor: token.colorBgLayout,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Livebild der orthografischen Schattenkamera"
        className="block h-full w-full"
        style={{ transform: "scaleY(-1)" }}
      />
      {!hasFrame && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: token.colorTextSecondary }}
        >
          Sonnenkamera wird vorbereitet …
        </div>
      )}
      <div
        className="absolute bottom-2 left-2 px-2 py-1"
        style={{
          color: token.colorText,
          backgroundColor: token.colorBgElevated,
          borderRadius: token.borderRadiusSM,
          fontSize: token.fontSizeSM,
        }}
      >
        Live-Szene · orthografische Schattenkamera
      </div>
    </div>
  );
};

const ShadowDebugVisualizer = ({
  map,
  model,
  visibility,
  viewpoint,
  onViewpointChange,
}: {
  map: MaplibreMap;
  model: ShadowProjectionDebugModel;
  visibility: Record<VisualizerContentGroup, boolean>;
  viewpoint: ShadowDebugViewpoint;
  onViewpointChange: (viewpoint: ShadowDebugViewpoint) => void;
}) => {
  const { token } = theme.useToken();
  const host = useHostElementSizeRef<HTMLDivElement>();
  const width = Math.max(1, host.size?.width ?? 1);
  const shadowMapAspectRatio =
    model.shadowBuffer.shadowMapWidth /
    Math.max(1, model.shadowBuffer.shadowMapHeight);
  const height =
    viewpoint === SHADOW_DEBUG_VIEWPOINT.SUN
      ? Math.max(190, Math.round(width / Math.max(0.1, shadowMapAspectRatio)))
      : Math.max(190, Math.min(245, Math.round(width * 0.36)));
  const fitOrthographicWidth = width < height;
  const overviewOptions = useMemo(
    () => ({
      orthographic: true,
      // Fit the shorter panel axis so wide debug panels do not crop the
      // loaded-tile extent vertically (or narrow panels horizontally).
      fitOrthographicWidth,
    }),
    [fitOrthographicWidth]
  );
  const visualizedOptions = useMemo(
    () => ({
      useCameraPosition: true,
      worldScaleMeters: model.visualizationWorldScaleMeters,
      imagePlaneDistance: 0.08,
    }),
    [model.visualizationWorldScaleMeters]
  );
  const displayOptions = useMemo(
    () => ({
      surface: { show: false },
      worldAxes: {
        show: visibility.worldAxes,
        showUp: false,
        lineWidthPx: 1.5,
      },
      angleCues: { show: visibility.angleCues, lineWidthPx: 1.5 },
      cameraView: {
        imagePlane: { show: visibility.imagePlanes, showOffset: true },
        axes: { show: visibility.cameraAxes, showInactive: true },
        frustum: {
          show: visibility.frustums,
          showInactive: true,
          lineWidthPx: 1,
        },
        projectionPlane: { show: visibility.projectionPlanes },
        marker: { show: visibility.markers },
      },
      altitude: { show: visibility.altitude },
      labels: {
        showAxes: visibility.labels,
        showAngles: visibility.labels,
        showImagePlane: false,
        fontSizePx: 11,
      },
    }),
    [visibility]
  );
  const volumeBoxes = useMemo(
    () => ({
      boxes: model.tileVolumes,
      visible: visibility.tileVolumes,
      color: "#0f766e",
      opacity: 0.58,
    }),
    [model.tileVolumes, visibility.tileVolumes]
  );

  return (
    <div className="relative w-full">
      <div className="absolute right-2 top-2 z-10">
        <Segmented
          value={viewpoint}
          options={[
            { label: "Übersicht", value: SHADOW_DEBUG_VIEWPOINT.OVERVIEW },
            {
              label: (
                <Tooltip
                  title={
                    model.bufferLayout === SHADOW_BUFFER_LAYOUT.TILED
                      ? "Nur Einzelpuffer; für gekachelte Schatten noch nicht verfügbar"
                      : undefined
                  }
                >
                  <span>Sonnenansicht</span>
                </Tooltip>
              ),
              value: SHADOW_DEBUG_VIEWPOINT.SUN,
              disabled: model.bufferLayout === SHADOW_BUFFER_LAYOUT.TILED,
            },
          ]}
          onChange={(value) => onViewpointChange(value as ShadowDebugViewpoint)}
        />
      </div>
      {viewpoint === SHADOW_DEBUG_VIEWPOINT.OVERVIEW &&
        visibility.tileVolumes && (
          <div
            className="absolute bottom-2 left-2 z-10 flex gap-3 px-2 py-1"
            style={{
              color: token.colorText,
              backgroundColor: token.colorBgElevated,
              borderRadius: token.borderRadiusSM,
              fontSize: token.fontSizeSM,
            }}
          >
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-600" />
              Viewport
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-orange-600" />
              Schattenpfad
            </span>
          </div>
        )}
      <div
        ref={host.ref}
        className="flex w-full items-center justify-center overflow-hidden"
        style={{
          height,
          borderRadius: token.borderRadiusLG,
          backgroundColor: token.colorBgLayout,
        }}
      >
        {host.isReady && viewpoint === SHADOW_DEBUG_VIEWPOINT.OVERVIEW && (
          <div style={{ backgroundColor: token.colorBgLayout }}>
            <ViewStateVisualizer
              interactive
              viewState={model.viewStates}
              activeCameraIndex={1}
              width={width}
              height={height}
              bearingLabel="Schattenrichtung"
              pitchLabel="Höhe"
              northLabel="N"
              upLabel={null}
              cueOptions={SHADOW_PROJECTION_DEBUG_CUE_OPTIONS}
              overviewOptions={overviewOptions}
              visualizedOptions={visualizedOptions}
              displayOptions={displayOptions}
              volumeBoxes={volumeBoxes}
            />
          </div>
        )}
        {host.isReady && viewpoint === SHADOW_DEBUG_VIEWPOINT.SUN && (
          <ShadowSunCameraView
            map={map}
            containerWidth={width}
            containerHeight={height}
            shadowMapWidth={model.shadowBuffer.shadowMapWidth}
            shadowMapHeight={model.shadowBuffer.shadowMapHeight}
          />
        )}
      </div>
    </div>
  );
};

const VisualizerContentToggles = ({
  visibility,
  onToggle,
}: {
  visibility: Record<VisualizerContentGroup, boolean>;
  onToggle: (group: VisualizerContentGroup) => void;
}) => (
  <div className="flex min-w-0 flex-wrap items-start gap-3">
    <Typography.Text strong type="secondary" className="shrink-0">
      Visualisierung
    </Typography.Text>
    <Space size={["middle", "small"]} wrap className="min-w-0">
      {VISUALIZER_CONTENT_GROUPS.map(({ key, label }) => (
        <Checkbox
          key={key}
          checked={visibility[key]}
          onChange={() => onToggle(key)}
          className="!m-0"
        >
          {label}
        </Checkbox>
      ))}
    </Space>
  </div>
);

const ShadowDebugControls = ({
  settings,
  tileBoundsSupported,
  onChange,
}: {
  settings: ShadowProjectionDebugSettings;
  tileBoundsSupported: boolean;
  onChange: (patch: Partial<ShadowProjectionDebugSettings>) => void;
}) => {
  return (
    <div className="grid content-start gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Checkbox
          checked={settings.showSunDebugVector}
          onChange={(event) =>
            onChange({ showSunDebugVector: event.target.checked })
          }
        >
          Sonnenvektor
        </Checkbox>
        {tileBoundsSupported && (
          <Checkbox
            checked={settings.showTileBounds}
            onChange={(event) =>
              onChange({ showTileBounds: event.target.checked })
            }
          >
            Tile-Kanten + IDs
          </Checkbox>
        )}
      </div>
    </div>
  );
};

export const ShadowProjectionDebugView = ({
  map,
  solarPosition,
  settings,
  onSettingsChange,
  onClose,
}: {
  map: MaplibreMap;
  solarPosition: SolarPosition;
  settings: ShadowProjectionDebugSettings;
  onSettingsChange: (patch: Partial<ShadowProjectionDebugSettings>) => void;
  onClose: () => void;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const subscribe = useCallback(
    (listener: () => void) =>
      collapsed
        ? () => {}
        : subscribeShadowProjectionDebugSnapshot(map, listener),
    [map, collapsed]
  );
  const getSnapshot = useCallback(
    () => (collapsed ? null : readShadowProjectionDebugSnapshot(map)),
    [map, collapsed]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const subscribeMeshPresence = useCallback(
    (listener: () => void) =>
      collapsed ? () => {} : subscribeSharedThreeSceneContent(map, listener),
    [map, collapsed]
  );
  const getTileBoundsSupport = useCallback(
    () =>
      !collapsed &&
      getSharedThreeSceneRuntimes(map).some(
        (runtime) => typeof runtime.setTileBoundsVisible === "function"
      ),
    [map, collapsed]
  );
  const tileBoundsSupported = useSyncExternalStore(
    subscribeMeshPresence,
    getTileBoundsSupport,
    getTileBoundsSupport
  );
  const [visualizerContentVisibility, setVisualizerContentVisibility] =
    useState(DEFAULT_VISUALIZER_CONTENT_VISIBILITY);
  const [visualizerViewpoint, setVisualizerViewpoint] =
    useState<ShadowDebugViewpoint>(SHADOW_DEBUG_VIEWPOINT.OVERVIEW);
  const { token } = theme.useToken();
  const model = useMemo(
    () =>
      snapshot
        ? buildShadowProjectionDebugModel(map, solarPosition, snapshot)
        : null,
    [map, snapshot, solarPosition]
  );
  const activeVisualizerViewpoint =
    model?.bufferLayout === SHADOW_BUFFER_LAYOUT.TILED
      ? SHADOW_DEBUG_VIEWPOINT.OVERVIEW
      : visualizerViewpoint;
  const displayedAzimuth =
    snapshot?.atmosphericSunlight?.azimuthDegrees ??
    solarPosition.azimuthDegrees;
  const displayedElevation =
    snapshot?.atmosphericSunlight?.elevationDegrees ??
    solarPosition.elevationDegrees;

  const content =
    snapshot && model ? (
      <div
        className="grid grid-cols-1 items-start"
        style={{ gap: token.marginXS }}
        data-test-id="shadow-simulation-projection-debug-view"
      >
        <ShadowDebugVisualizer
          map={map}
          model={model}
          visibility={visualizerContentVisibility}
          viewpoint={activeVisualizerViewpoint}
          onViewpointChange={setVisualizerViewpoint}
        />
        <ShadowDebugControls
          settings={settings}
          tileBoundsSupported={tileBoundsSupported}
          onChange={onSettingsChange}
        />

        <Collapse
          ghost
          size="middle"
          items={[
            {
              key: "visualizer-options",
              label: "Visualisierungsoptionen",
              children: (
                <div
                  className="grid min-w-0 gap-2"
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                  }}
                >
                  {activeVisualizerViewpoint ===
                    SHADOW_DEBUG_VIEWPOINT.OVERVIEW && (
                    <VisualizerContentToggles
                      visibility={visualizerContentVisibility}
                      onToggle={(group) =>
                        setVisualizerContentVisibility((current) => ({
                          ...current,
                          [group]: !current[group],
                        }))
                      }
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <Typography.Text strong type="secondary">
                      Sonne
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Azimut{" "}
                      <span
                        className="tabular-nums"
                        style={{ color: token.colorText }}
                      >
                        {displayedAzimuth.toFixed(1)}°
                      </span>
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Höhe{" "}
                      <span
                        className="tabular-nums"
                        style={{ color: token.colorText }}
                      >
                        {displayedElevation.toFixed(1)}°
                      </span>
                    </Typography.Text>
                    {snapshot.atmosphericSunlight && (
                      <>
                        <Typography.Text type="secondary">
                          Radiance{" "}
                          <span
                            className="tabular-nums"
                            style={{ color: token.colorText }}
                          >
                            {(
                              snapshot.atmosphericSunlight.relativeIntensity *
                              100
                            ).toFixed(1)}
                            %
                          </span>
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          className="inline-flex items-center gap-1"
                        >
                          Licht
                          <span
                            className="h-3 w-3 rounded-full border border-neutral-300"
                            style={{
                              backgroundColor:
                                snapshot.atmosphericSunlight.color,
                            }}
                          />
                          <span
                            className="tabular-nums"
                            style={{ color: token.colorText }}
                          >
                            {snapshot.atmosphericSunlight.color.toUpperCase()}
                          </span>
                        </Typography.Text>
                      </>
                    )}
                    <span className="ml-auto flex flex-wrap gap-x-3 gap-y-2 text-neutral-500">
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        Kamera
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                        Sonne
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm border-2 border-orange-600" />
                        {model.bufferLayout === SHADOW_BUFFER_LAYOUT.TILED
                          ? "Caster-Hülle"
                          : "Buffer-Grenzen"}
                      </span>
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: "statistics",
              label: "Schattenstatistik",
              children: <ShadowBufferStatistics model={model} />,
            },
          ]}
        />
      </div>
    ) : null;

  return (
    <ShadowProjectionDebugPortal>
      <ConfigProvider
        componentSize="small"
        theme={{
          components: {
            Collapse: { headerPadding: "4px 8px", contentPadding: "4px 8px" },
          },
        }}
        getPopupContainer={(trigger) =>
          (trigger?.closest('[role="dialog"]') as HTMLElement | null) ??
          document.body
        }
      >
        <CarmaResponsiveInfoBox
          role="dialog"
          aria-label="Projektions-Debug"
          useControlLayout={false}
          draggable
          dragGripPlacement="auto"
          dragHandleTitle="Projektions-Debug verschieben"
          collapsible
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          heading={
            <div
              className="flex w-full items-center justify-between"
              style={{ gap: token.marginXS, padding: 0 }}
            >
              <Typography.Text strong>
                Projektions-Debug{" "}
                <Tooltip
                  trigger={["hover", "focus", "click"]}
                  title="Die Übersicht zeigt Viewport und Caster-Hülle, keine einzelnen Schattenpuffer. Die Sonnenansicht ist nur für den Einzelpuffer verfügbar. Visualisierungsoptionen verändern nur diese Vorschau; Sonnenvektor und Tile-Kanten wirken in der Karte."
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="Info zum Projektions-Debug"
                    icon={<FontAwesomeIcon icon={faCircleInfo} />}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  />
                </Tooltip>
              </Typography.Text>
              <Button
                type="text"
                size="small"
                icon={<FontAwesomeIcon icon={faXmark} />}
                aria-label="Projektions-Debug schließen"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
              />
            </div>
          }
          headingColor={token.colorBgContainer}
          headingStyle={{
            color: token.colorText,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 0 0`,
            boxShadow: "none",
          }}
          bodyStyle={{
            maxHeight: "calc(100dvh - 140px)",
            overflowY: "auto",
            padding: token.paddingXS,
            backgroundColor: token.colorBgContainer,
            borderRadius: `0 0 ${token.borderRadiusLG}px ${token.borderRadiusLG}px`,
          }}
          width={700}
          content={content}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 5000,
            maxWidth: "calc(100vw - 24px)",
            minWidth: 0,
            pointerEvents: "auto",
            fontFamily: token.fontFamily,
            fontSize: token.fontSize,
            color: token.colorText,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
          }}
        />
      </ConfigProvider>
    </ShadowProjectionDebugPortal>
  );
};
