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

import {
  Checkbox,
  ColorPicker,
  Segmented,
  Slider,
  Space,
  Tag,
  Typography,
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
import type {
  MeshErrorTargetPixels,
  ShadowQualityMultiplier,
} from "../core/shadow-types";
import {
  buildShadowProjectionDebugModel,
  type ShadowProjectionDebugModel,
} from "../runtime/shadow-projection-debug-model";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "../runtime/shadow-projection-debug-store";
import { SHADOW_QUALITY_LEVELS } from "./shadow-control-utils";

const SHADOW_PROJECTION_DEBUG_CUE_OPTIONS = {
  bearing: { label: "Schattenrichtung", color: "#d97706" },
  pitch: { label: "Höhe", color: "#f59e0b" },
  north: { label: "N", color: "#2563eb" },
} as const;

const SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS = {
  orthographic: true,
  fitOrthographicWidth: true,
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

const MESH_ERROR_TARGETS: ReadonlyArray<{
  label: string;
  value: MeshErrorTargetPixels;
}> = [
  { label: "0,25 px", value: 0.25 },
  { label: "1 px", value: 1 },
  { label: "4 px", value: 4 },
];

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
  shadowQuality: ShadowQualityMultiplier;
  meshErrorTarget: MeshErrorTargetPixels;
  terrainColor: string;
  buildingsFullOpacity: boolean;
  buildingColorMix: number;
  meshTextureSaturation: number;
  buildingColor: string;
  showSunDebugVector: boolean;
  showTileBounds: boolean;
  useTransmittanceLut: boolean;
  useSkyIrradianceLut: boolean;
}>;

const formatMeters = (value: number, fractionDigits = 0) =>
  `${value.toFixed(fractionDigits)} m`;

const ShadowBufferStatistics = ({
  model,
}: {
  model: ShadowProjectionDebugModel;
}) => {
  const resolution = `${model.shadowBuffer.shadowMapWidth} × ${model.shadowBuffer.shadowMapHeight}`;
  const values: ReadonlyArray<Readonly<{ label: string; value: ReactNode }>> = [
    { label: "Samples", value: model.shadowSampleCount },
    { label: "Tiles", value: model.tileVolumes.length },
    { label: "Buffer", value: resolution },
    {
      label: "Kernabdeckung",
      value: `${formatMeters(
        model.receiverCoverageWidthMeters
      )} × ${formatMeters(model.receiverCoverageHeightMeters)}`,
    },
    {
      label: "Texel",
      value: formatMeters(
        Math.max(model.shadowTexelWidthMeters, model.shadowTexelHeightMeters),
        3
      ),
    },
    {
      label: "Viewport",
      value: `${formatMeters(model.viewportWidthMeters)} × ${formatMeters(
        model.viewportHeightMeters
      )}`,
    },
    { label: "Höhenspanne", value: formatMeters(model.elevationSpanMeters) },
    { label: "Caster", value: formatMeters(model.casterReachMeters) },
    {
      label: "Horizontal / Höhe",
      value: `${model.horizontalProjectionPerHeight.toFixed(2)} ×`,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 border-t border-neutral-200 pt-1 text-xs">
      {values.map(({ label, value }) => (
        <div key={label} className="flex min-w-0 items-baseline gap-1">
          <Typography.Text
            type="secondary"
            className="min-w-0 truncate !text-[11px]"
          >
            {label}
          </Typography.Text>
          <Typography.Text className="ml-auto whitespace-nowrap !text-xs tabular-nums">
            {value}
          </Typography.Text>
        </div>
      ))}
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
      className="relative overflow-hidden bg-slate-900"
      style={{ width: fittedWidth, height: fittedHeight }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Livebild der orthografischen Schattenkamera"
        className="block h-full w-full"
        style={{ transform: "scaleY(-1)" }}
      />
      {!hasFrame && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
          Sonnenkamera wird vorbereitet …
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-[10px] text-white">
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
  const host = useHostElementSizeRef<HTMLDivElement>();
  const width = Math.max(1, host.size?.width ?? 1);
  const shadowMapAspectRatio =
    model.shadowBuffer.shadowMapWidth /
    Math.max(1, model.shadowBuffer.shadowMapHeight);
  const height =
    viewpoint === SHADOW_DEBUG_VIEWPOINT.SUN
      ? Math.max(190, Math.round(width / Math.max(0.1, shadowMapAspectRatio)))
      : Math.max(190, Math.min(245, Math.round(width * 0.36)));
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
      <div className="absolute right-2 top-2 z-10 rounded-md bg-white/90 shadow-sm">
        <Segmented
          size="small"
          value={viewpoint}
          options={[
            { label: "Übersicht", value: SHADOW_DEBUG_VIEWPOINT.OVERVIEW },
            { label: "Sonnenansicht", value: SHADOW_DEBUG_VIEWPOINT.SUN },
          ]}
          onChange={(value) => onViewpointChange(value as ShadowDebugViewpoint)}
        />
      </div>
      {viewpoint === SHADOW_DEBUG_VIEWPOINT.OVERVIEW &&
        visibility.tileVolumes && (
          <div className="absolute bottom-2 left-2 z-10 flex gap-3 rounded bg-white/90 px-2 py-1 text-[10px] text-neutral-700 shadow-sm">
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
        className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900"
        style={{ height }}
      >
        {host.isReady && viewpoint === SHADOW_DEBUG_VIEWPOINT.OVERVIEW && (
          <div className="bg-neutral-100">
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
              overviewOptions={SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS}
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
  <div className="flex min-w-0 items-start gap-2 text-xs">
    <Typography.Text strong type="secondary" className="shrink-0 !text-xs">
      Visualisierung
    </Typography.Text>
    <Space size={[10, 0]} wrap className="min-w-0">
      {VISUALIZER_CONTENT_GROUPS.map(({ key, label }) => (
        <Checkbox
          key={key}
          checked={visibility[key]}
          onChange={() => onToggle(key)}
          className="!m-0 !text-xs"
        >
          {label}
        </Checkbox>
      ))}
    </Space>
  </div>
);

const ShadowDebugControls = ({
  settings,
  transmittanceReady,
  irradianceReady,
  meshLoaded,
  onChange,
}: {
  settings: ShadowProjectionDebugSettings;
  transmittanceReady: boolean;
  irradianceReady: boolean;
  meshLoaded: boolean;
  onChange: (patch: Partial<ShadowProjectionDebugSettings>) => void;
}) => {
  return (
    <div className="grid content-start gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Typography.Text strong type="secondary" className="!text-xs">
            Qualität
          </Typography.Text>
          <Segmented
            size="small"
            data-test-id="shadow-debug-quality"
            value={settings.shadowQuality}
            options={[...SHADOW_QUALITY_LEVELS]}
            onChange={(value) =>
              onChange({ shadowQuality: value as ShadowQualityMultiplier })
            }
          />
        </div>
        {meshLoaded && (
          <div className="flex items-center gap-2">
            <Typography.Text strong type="secondary" className="!text-xs">
              Mesh-LOD
            </Typography.Text>
            <Segmented
              size="small"
              data-test-id="mesh-debug-quality"
              value={settings.meshErrorTarget}
              options={[...MESH_ERROR_TARGETS]}
              onChange={(value) =>
                onChange({ meshErrorTarget: value as MeshErrorTargetPixels })
              }
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Typography.Text strong type="secondary" className="!text-xs">
            Terrain
          </Typography.Text>
          <ColorPicker
            size="small"
            value={settings.terrainColor}
            showText={(color) => color.toHexString().toUpperCase()}
            onChangeComplete={(color) =>
              onChange({ terrainColor: color.toHexString() })
            }
          />
        </div>
        <Checkbox
          checked={settings.buildingsFullOpacity}
          onChange={(event) =>
            onChange({ buildingsFullOpacity: event.target.checked })
          }
          className="!text-xs"
        >
          Gebäude volle Deckkraft
        </Checkbox>
        <div className="flex items-center gap-2">
          <Typography.Text strong type="secondary" className="!text-xs">
            Mesh
          </Typography.Text>
          <Typography.Text type="secondary" className="!text-xs">
            Textur
          </Typography.Text>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={settings.buildingColorMix}
            onChange={(value) => onChange({ buildingColorMix: value })}
            tooltip={{ formatter: null }}
            className="!m-0 w-24"
            aria-label="Mischung aus Meshtextur und Farbe"
          />
          <Typography.Text type="secondary" className="!text-xs">
            Farbe
          </Typography.Text>
          <Typography.Text
            type="secondary"
            className="w-8 text-right !text-xs tabular-nums"
          >
            {Math.round(settings.buildingColorMix * 100)}%
          </Typography.Text>
        </div>
        <div className="flex items-center gap-2">
          <Typography.Text type="secondary" className="!text-xs">
            Sättigung
          </Typography.Text>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={settings.meshTextureSaturation}
            onChange={(value) => onChange({ meshTextureSaturation: value })}
            tooltip={{ formatter: null }}
            className="!m-0 w-24"
            aria-label="Sättigung der Meshtextur"
          />
          <Typography.Text
            type="secondary"
            className="w-8 text-right !text-xs tabular-nums"
          >
            {Math.round(settings.meshTextureSaturation * 100)}%
          </Typography.Text>
          <ColorPicker
            size="small"
            value={settings.buildingColor}
            showText={(color) => color.toHexString().toUpperCase()}
            onChangeComplete={(color) =>
              onChange({ buildingColor: color.toHexString() })
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Checkbox
          checked={settings.showSunDebugVector}
          onChange={(event) =>
            onChange({ showSunDebugVector: event.target.checked })
          }
          className="!text-xs"
        >
          Sonnenvektor
        </Checkbox>
        <Checkbox
          checked={settings.showTileBounds}
          onChange={(event) =>
            onChange({ showTileBounds: event.target.checked })
          }
          className="!text-xs"
        >
          Tile-Kanten + IDs
        </Checkbox>
        <Checkbox
          checked={settings.useTransmittanceLut}
          onChange={(event) =>
            onChange({ useTransmittanceLut: event.target.checked })
          }
          className="!text-xs"
        >
          Transmittanz-LUT
          <Tag
            bordered={false}
            color={
              settings.useTransmittanceLut && transmittanceReady
                ? "success"
                : "default"
            }
            className="!ml-1 !mr-0 !px-1 !text-[10px] !leading-4"
          >
            {settings.useTransmittanceLut
              ? transmittanceReady
                ? "bereit"
                : "lädt"
              : "aus"}
          </Tag>
        </Checkbox>
        <Checkbox
          checked={settings.useSkyIrradianceLut}
          onChange={(event) =>
            onChange({ useSkyIrradianceLut: event.target.checked })
          }
          className="!text-xs"
        >
          Sky-Irradianz-LUT
          <Tag
            bordered={false}
            color={
              settings.useSkyIrradianceLut && irradianceReady
                ? "success"
                : "default"
            }
            className="!ml-1 !mr-0 !px-1 !text-[10px] !leading-4"
          >
            {settings.useSkyIrradianceLut
              ? irradianceReady
                ? "bereit"
                : "lädt"
              : "aus"}
          </Tag>
        </Checkbox>
      </div>
    </div>
  );
};

export const ShadowProjectionDebugView = ({
  map,
  solarPosition,
  settings,
  onSettingsChange,
}: {
  map: MaplibreMap;
  solarPosition: SolarPosition;
  settings: ShadowProjectionDebugSettings;
  onSettingsChange: (patch: Partial<ShadowProjectionDebugSettings>) => void;
}) => {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeShadowProjectionDebugSnapshot(map, listener),
    [map]
  );
  const getSnapshot = useCallback(
    () => readShadowProjectionDebugSnapshot(map),
    [map]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const subscribeMeshPresence = useCallback(
    (listener: () => void) => subscribeSharedThreeSceneContent(map, listener),
    [map]
  );
  const getMeshPresence = useCallback(
    () =>
      getSharedThreeSceneRuntimes(map).some(
        (runtime) => runtime.providesTerrain === true
      ),
    [map]
  );
  const meshLoaded = useSyncExternalStore(
    subscribeMeshPresence,
    getMeshPresence,
    getMeshPresence
  );
  const [visualizerContentVisibility, setVisualizerContentVisibility] =
    useState(DEFAULT_VISUALIZER_CONTENT_VISIBILITY);
  const [visualizerViewpoint, setVisualizerViewpoint] =
    useState<ShadowDebugViewpoint>(SHADOW_DEBUG_VIEWPOINT.OVERVIEW);
  const model = useMemo(
    () =>
      snapshot
        ? buildShadowProjectionDebugModel(map, solarPosition, snapshot)
        : null,
    [map, snapshot, solarPosition]
  );
  if (!snapshot || !model) return null;
  const displayedAzimuth =
    snapshot.atmosphericSunlight?.azimuthDegrees ??
    solarPosition.azimuthDegrees;
  const displayedElevation =
    snapshot.atmosphericSunlight?.elevationDegrees ??
    solarPosition.elevationDegrees;

  const content = (
    <div
      className="grid max-h-[calc(100vh-140px)] grid-cols-1 items-start gap-1 overflow-y-auto p-1"
      data-test-id="shadow-simulation-projection-debug-view"
    >
      <ShadowDebugVisualizer
        map={map}
        model={model}
        visibility={visualizerContentVisibility}
        viewpoint={visualizerViewpoint}
        onViewpointChange={setVisualizerViewpoint}
      />
      <div className="grid min-w-0 gap-1">
        {visualizerViewpoint === SHADOW_DEBUG_VIEWPOINT.OVERVIEW && (
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <Typography.Text strong type="secondary" className="!text-xs">
            Sonne
          </Typography.Text>
          <Typography.Text type="secondary" className="!text-xs">
            Azimut{" "}
            <span className="tabular-nums text-neutral-800">
              {displayedAzimuth.toFixed(1)}°
            </span>
          </Typography.Text>
          <Typography.Text type="secondary" className="!text-xs">
            Höhe{" "}
            <span className="tabular-nums text-neutral-800">
              {displayedElevation.toFixed(1)}°
            </span>
          </Typography.Text>
          {snapshot.atmosphericSunlight && (
            <>
              <Typography.Text type="secondary" className="!text-xs">
                Radiance{" "}
                <span className="tabular-nums text-neutral-800">
                  {(
                    snapshot.atmosphericSunlight.relativeIntensity * 100
                  ).toFixed(1)}
                  %
                </span>
              </Typography.Text>
              <Typography.Text
                type="secondary"
                className="inline-flex items-center gap-1 !text-xs"
              >
                Licht
                <span
                  className="h-3 w-3 rounded-full border border-neutral-300"
                  style={{
                    backgroundColor: snapshot.atmosphericSunlight.color,
                  }}
                />
                <span className="tabular-nums text-neutral-800">
                  {snapshot.atmosphericSunlight.color.toUpperCase()}
                </span>
              </Typography.Text>
            </>
          )}
          <span className="ml-auto flex flex-wrap gap-x-3 gap-y-0.5 text-neutral-500">
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
              Buffer-Grenzen
            </span>
          </span>
        </div>
      </div>
      <div className="grid gap-1 border-t border-neutral-200 pt-1">
        <ShadowDebugControls
          settings={settings}
          transmittanceReady={
            snapshot.atmosphericSunlight?.transmittanceReady ?? false
          }
          irradianceReady={
            snapshot.atmosphericSunlight?.irradianceReady ?? false
          }
          meshLoaded={meshLoaded}
          onChange={onSettingsChange}
        />
        <ShadowBufferStatistics model={model} />
      </div>
    </div>
  );

  return (
    <ShadowProjectionDebugPortal>
      <CarmaResponsiveInfoBox
        useControlLayout={false}
        draggable
        dragGripPlacement="auto"
        dragHandleTitle="Projektions-Debug verschieben"
        collapsible
        heading={
          <span className="font-semibold text-white">Projektions-Debug</span>
        }
        headingColor="rgba(51, 65, 85, 0.94)"
        width={700}
        content={content}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 5000,
          maxWidth: "calc(100vw - 24px)",
          pointerEvents: "auto",
        }}
      />
    </ShadowProjectionDebugPortal>
  );
};
