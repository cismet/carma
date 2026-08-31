import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { Map as MaplibreMap } from "maplibre-gl";

import {
  CarmaResponsiveInfoBox,
  useHostElementSizeRef,
} from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";
import {
  getSharedThreeSceneRuntimes,
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

const SHADOW_PROJECTION_DEBUG_CUE_OPTIONS = {
  bearing: { label: "Schattenrichtung", color: "#d97706" },
  pitch: { label: "Höhe", color: "#f59e0b" },
  north: { label: "N", color: "#2563eb" },
} as const;

const SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS = {
  orthographic: true,
  fitOrthographicWidth: true,
} as const;

const SHADOW_PROJECTION_DEBUG_VISUALIZED_OPTIONS = {
  useCameraPosition: true,
} as const;

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
  | "terrainTiles";

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
  { key: "terrainTiles", label: "Terrain-Tiles" },
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
  terrainTiles: true,
};

const SHADOW_QUALITIES: ReadonlyArray<{
  label: string;
  value: ShadowQualityMultiplier;
}> = [
  { label: "Mittel", value: 4 },
  { label: "Hoch", value: 16 },
  { label: "Max", value: 64 },
];

const MESH_ERROR_TARGETS: ReadonlyArray<{
  label: string;
  value: MeshErrorTargetPixels;
}> = [
  { label: "0,25 px", value: 0.25 },
  { label: "1 px", value: 1 },
  { label: "4 px", value: 4 },
];

export type ShadowProjectionDebugSettings = Readonly<{
  shadowQuality: ShadowQualityMultiplier;
  meshErrorTarget: MeshErrorTargetPixels;
  terrainColor: string;
  buildingsFullOpacity: boolean;
  buildingColorMix: number;
  buildingColor: string;
  showSunDebugVector: boolean;
  showShadowBuffers: boolean;
  useTransmittanceLut: boolean;
  useSkyIrradianceLut: boolean;
}>;

const ValueRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-[max-content_1fr] gap-2 leading-5">
    <span className="text-neutral-500">{label}</span>
    <span className="text-right tabular-nums text-neutral-800">{value}</span>
  </div>
);

const StatCell = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid min-w-0 gap-0.5">
    <span className="truncate text-neutral-500">{label}</span>
    <span className="whitespace-nowrap tabular-nums text-neutral-800">
      {value}
    </span>
  </div>
);

const formatMeters = (value: number, fractionDigits = 0) =>
  `${value.toFixed(fractionDigits)} m`;

const ShadowBufferStatistics = ({
  model,
}: {
  model: ShadowProjectionDebugModel;
}) => {
  const resolution = `${model.shadowBuffer.shadowMapWidth} × ${model.shadowBuffer.shadowMapHeight}`;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
      <StatCell label="Sonnen-Samples" value={model.shadowSampleCount} />
      <StatCell label="Terrain-Tiles" value={model.terrainTileVolumes.length} />
      <StatCell label="Buffer-Auflösung" value={resolution} />
      <StatCell
        label="Kernabdeckung"
        value={`${formatMeters(
          model.receiverCoverageWidthMeters
        )} × ${formatMeters(model.receiverCoverageHeightMeters)}`}
      />
      <StatCell
        label="Texel"
        value={formatMeters(
          Math.max(model.shadowTexelWidthMeters, model.shadowTexelHeightMeters),
          3
        )}
      />
      <StatCell
        label="Viewport"
        value={`${formatMeters(model.viewportWidthMeters)} × ${formatMeters(
          model.viewportHeightMeters
        )}`}
      />
      <StatCell
        label="Höhenspanne"
        value={formatMeters(model.elevationSpanMeters)}
      />
      <StatCell
        label="Caster-Reichweite"
        value={formatMeters(model.casterReachMeters)}
      />
      <StatCell
        label="Horizontal / Höhe"
        value={`${model.horizontalProjectionPerHeight.toFixed(2)} ×`}
      />
    </div>
  );
};

const ShadowDebugVisualizer = ({
  model,
  visibility,
}: {
  model: ShadowProjectionDebugModel;
  visibility: Record<VisualizerContentGroup, boolean>;
}) => {
  const host = useHostElementSizeRef<HTMLDivElement>();
  const width = Math.max(1, host.size?.width ?? 1);
  const height = Math.max(190, Math.min(245, Math.round(width * 0.36)));
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
      boxes: model.terrainTileVolumes,
      visible: visibility.terrainTiles,
      color: "#0f766e",
      opacity: 0.58,
    }),
    [model.terrainTileVolumes, visibility.terrainTiles]
  );

  return (
    <div
      ref={host.ref}
      className="w-full overflow-hidden rounded-lg bg-neutral-100"
      style={{ height }}
    >
      {host.isReady && (
        <ViewStateVisualizer
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
          visualizedOptions={SHADOW_PROJECTION_DEBUG_VISUALIZED_OPTIONS}
          displayOptions={displayOptions}
          volumeBoxes={volumeBoxes}
        />
      )}
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
  <fieldset className="flex content-start flex-wrap gap-x-3 gap-y-1 text-xs">
    <legend className="mb-0.5 font-semibold uppercase tracking-wide text-neutral-500">
      Visualisierung
    </legend>
    {VISUALIZER_CONTENT_GROUPS.map(({ key, label }) => (
      <label key={key} className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={visibility[key]}
          onChange={() => onToggle(key)}
        />
        {label}
      </label>
    ))}
  </fieldset>
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
  const buttonClass = (selected: boolean) =>
    `h-8 border px-3 text-xs transition-colors first:rounded-l-md last:rounded-r-md ${
      selected
        ? "border-amber-600 bg-amber-50 font-semibold text-amber-800"
        : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="grid content-start gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide text-neutral-500">
            Qualität
          </span>
          <div className="inline-flex" data-test-id="shadow-debug-quality">
            {SHADOW_QUALITIES.map(({ label, value }) => (
              <button
                key={label}
                type="button"
                className={buttonClass(settings.shadowQuality === value)}
                aria-pressed={settings.shadowQuality === value}
                onClick={() => onChange({ shadowQuality: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {meshLoaded && (
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wide text-neutral-500">
              Mesh-LOD
            </span>
            <div className="inline-flex" data-test-id="mesh-debug-quality">
              {MESH_ERROR_TARGETS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  className={buttonClass(settings.meshErrorTarget === value)}
                  aria-pressed={settings.meshErrorTarget === value}
                  onClick={() => onChange({ meshErrorTarget: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide text-neutral-500">
            Terrain
          </span>
          <input
            type="color"
            value={settings.terrainColor}
            onChange={(event) =>
              onChange({ terrainColor: event.currentTarget.value })
            }
            className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5"
            aria-label="Terrainfarbe"
          />
          <span className="tabular-nums text-neutral-500">
            {settings.terrainColor.toUpperCase()}
          </span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.buildingsFullOpacity}
            onChange={(event) =>
              onChange({ buildingsFullOpacity: event.currentTarget.checked })
            }
          />
          Gebäude volle Deckkraft
        </label>
        <label className="flex min-w-64 items-center gap-2">
          <span className="font-semibold uppercase tracking-wide text-neutral-500">
            Mesh
          </span>
          <span className="text-neutral-500">Textur</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.buildingColorMix}
            onChange={(event) =>
              onChange({ buildingColorMix: event.currentTarget.valueAsNumber })
            }
            className="min-w-24 flex-1 accent-amber-600"
            aria-label="Mischung aus Meshtextur und Farbe"
          />
          <span className="text-neutral-500">Farbe</span>
          <span className="w-8 text-right tabular-nums text-neutral-500">
            {Math.round(settings.buildingColorMix * 100)}%
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={settings.buildingColor}
            onChange={(event) =>
              onChange({ buildingColor: event.currentTarget.value })
            }
            className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5"
            aria-label="Meshfarbe"
          />
          <span className="tabular-nums text-neutral-500">
            {settings.buildingColor.toUpperCase()}
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.showSunDebugVector}
            onChange={(event) =>
              onChange({ showSunDebugVector: event.currentTarget.checked })
            }
          />
          Sonnenvektor
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.showShadowBuffers}
            onChange={(event) =>
              onChange({ showShadowBuffers: event.currentTarget.checked })
            }
          />
          Buffer in Szene
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.useTransmittanceLut}
            onChange={(event) =>
              onChange({ useTransmittanceLut: event.currentTarget.checked })
            }
          />
          Transmittanz-LUT
          <span className="text-neutral-500">
            (
            {settings.useTransmittanceLut
              ? transmittanceReady
                ? "bereit"
                : "lädt"
              : "aus"}
            )
          </span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.useSkyIrradianceLut}
            onChange={(event) =>
              onChange({ useSkyIrradianceLut: event.currentTarget.checked })
            }
          />
          Sky-Irradianz-LUT
          <span className="text-neutral-500">
            (
            {settings.useSkyIrradianceLut
              ? irradianceReady
                ? "bereit"
                : "lädt"
              : "aus"}
            )
          </span>
        </label>
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
      className="grid max-h-[calc(100vh-140px)] grid-cols-1 items-start gap-2 overflow-y-auto p-1"
      data-test-id="shadow-simulation-projection-debug-view"
    >
      <ShadowDebugVisualizer
        model={model}
        visibility={visualizerContentVisibility}
      />
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <VisualizerContentToggles
          visibility={visualizerContentVisibility}
          onToggle={(group) =>
            setVisualizerContentVisibility((current) => ({
              ...current,
              [group]: !current[group],
            }))
          }
        />
        <div className="grid content-start gap-1.5 text-xs">
          <div>
            <div className="font-semibold uppercase tracking-wide text-neutral-500">
              Sonne
            </div>
            <ValueRow
              label="Azimut"
              value={`${displayedAzimuth.toFixed(1)}°`}
            />
            <ValueRow
              label="Höhe"
              value={`${displayedElevation.toFixed(1)}°`}
            />
            {snapshot.atmosphericSunlight && (
              <>
                <ValueRow
                  label="Takram-Radiance"
                  value={`${(
                    snapshot.atmosphericSunlight.relativeIntensity * 100
                  ).toFixed(1)} %`}
                />
                <ValueRow
                  label="Lichtfarbe"
                  value={
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span
                        className="h-3 w-3 rounded-full border border-neutral-300"
                        style={{
                          backgroundColor: snapshot.atmosphericSunlight.color,
                        }}
                      />
                      {snapshot.atmosphericSunlight.color.toUpperCase()}
                    </span>
                  }
                />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              Kamera
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
              Sonne
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-orange-600" />
              Buffer-Grenzen
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-3 border-t border-neutral-200 pt-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
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

  return createPortal(
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
    />,
    document.body
  );
};
