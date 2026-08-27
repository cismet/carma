import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { Map as MaplibreMap } from "maplibre-gl";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";
import { ViewStateVisualizer } from "@carma-mapping/components";

import type { SolarPosition } from "./solar-position";
import type { ShadowMode, ShadowQualityMultiplier } from "./shadow-scene";
import {
  buildShadowProjectionDebugModel,
  buildShadowTileCoreInsetsPercent,
  type ShadowProjectionDebugModel,
} from "./shadow-projection-debug-model";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

const SHADOW_PROJECTION_DEBUG_CUE_OPTIONS = {
  bearing: { label: "Schattenrichtung", color: "#d97706" },
  pitch: { label: "Höhe", color: "#f59e0b" },
  north: { label: "N", color: "#2563eb" },
} as const;

const SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS = {
  orthographic: true,
} as const;

const SHADOW_PROJECTION_DEBUG_VISUALIZED_OPTIONS = {
  useCameraPosition: true,
} as const;

const SHADOW_PROJECTION_DEBUG_DISPLAY_OPTIONS = {
  surface: { show: true, showGraticule: false, sphereOpacity: 0.08 },
  worldAxes: { show: true, lineWidthPx: 1.5 },
  angleCues: { show: true, lineWidthPx: 1.5 },
  cameraView: {
    imagePlane: { show: true, showOffset: true },
    axes: { show: true, showInactive: true },
    frustum: { show: true, showInactive: true, lineWidthPx: 1 },
    projectionPlane: { show: true },
    marker: { show: true },
  },
  altitude: { show: false },
  labels: {
    showAxes: true,
    showAngles: true,
    showImagePlane: false,
    fontSizePx: 11,
  },
} as const;

const SHADOW_TILE_COLORS = ["#f59e0b", "#ea580c", "#dc2626", "#9333ea"];
const SHADOW_MODES: readonly {
  value: ShadowMode;
  label: string;
}[] = [
  { value: "single", label: "Single Buffer" },
  { value: "advanced", label: "Advanced Tiles" },
];
const SHADOW_QUALITIES: ReadonlyArray<{
  label: string;
  value: ShadowQualityMultiplier;
}> = [
  { label: "Mittel", value: 4 },
  { label: "Hoch", value: 16 },
  { label: "Max", value: 64 },
];

export type ShadowProjectionDebugSettings = Readonly<{
  shadowMode: ShadowMode;
  shadowQuality: ShadowQualityMultiplier;
  terrainColor: string;
  buildingsFullOpacity: boolean;
  useUniformBuildingColor: boolean;
  buildingColor: string;
  showSunDebugVector: boolean;
  showShadowBuffers: boolean;
  useTransmittanceLut: boolean;
  useSkyIrradianceLut: boolean;
}>;

const ValueRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-[max-content_1fr] gap-3">
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

const ShadowTilePlan = ({ model }: { model: ShadowProjectionDebugModel }) => {
  if (model.shadowTiles.length === 0) return null;

  const left = Math.min(...model.shadowTiles.map((tile) => tile.leftMeters));
  const right = Math.max(...model.shadowTiles.map((tile) => tile.rightMeters));
  const bottom = Math.min(
    ...model.shadowTiles.map((tile) => tile.bottomMeters)
  );
  const top = Math.max(...model.shadowTiles.map((tile) => tile.topMeters));
  const width = Math.max(Number.EPSILON, right - left);
  const height = Math.max(Number.EPSILON, top - bottom);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Shadow-Buffer im Lichtkoordinatensystem
        </div>
        <div className="flex gap-3 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-neutral-500 bg-white/80" />
            Guard-Band
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-200/80" />
            Viewport-Kern
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 text-[11px] text-neutral-500">
        <span className="-rotate-90">Licht-Y</span>
        <div
          className="relative h-32 overflow-hidden rounded-md border border-neutral-300 bg-neutral-100"
          data-test-id="shadow-simulation-buffer-plan"
        >
          {model.shadowTiles.map((tile, index) => {
            const insets = buildShadowTileCoreInsetsPercent(tile);
            const color = SHADOW_TILE_COLORS[index % SHADOW_TILE_COLORS.length];
            return (
              <div
                key={tile.id}
                className="absolute bg-white/65"
                style={{
                  border: `2px solid ${color}`,
                  left: `${((tile.leftMeters - left) / width) * 100}%`,
                  top: `${((top - tile.topMeters) / height) * 100}%`,
                  width: `${(tile.widthMeters / width) * 100}%`,
                  height: `${(tile.heightMeters / height) * 100}%`,
                }}
                title={`${tile.id}: ${formatMeters(
                  tile.widthMeters
                )} × ${formatMeters(tile.heightMeters)}`}
              >
                <div
                  className="absolute flex items-center justify-center bg-amber-100/80 text-[10px] font-semibold text-neutral-700"
                  style={{
                    left: `${insets.left}%`,
                    right: `${insets.right}%`,
                    top: `${insets.top}%`,
                    bottom: `${insets.bottom}%`,
                  }}
                >
                  {tile.id}
                </div>
              </div>
            );
          })}
        </div>
        <span />
        <span className="text-center">Licht-X</span>
      </div>
    </div>
  );
};

const ShadowBufferStatistics = ({
  model,
}: {
  model: ShadowProjectionDebugModel;
}) => {
  const firstTile = model.shadowTiles[0];
  const tileResolution = firstTile
    ? `${firstTile.shadowMapWidth} × ${firstTile.shadowMapHeight}`
    : "–";

  return (
    <div className="grid grid-cols-4 gap-x-5 gap-y-2 text-xs">
      <StatCell
        label="Buffer"
        value={`${model.activeShadowTileCount} / ${model.shadowTilePoolSize}`}
      />
      <StatCell label="Tile-Auflösung" value={tileResolution} />
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

const ShadowDebugControls = ({
  settings,
  transmittanceReady,
  irradianceReady,
  onChange,
}: {
  settings: ShadowProjectionDebugSettings;
  transmittanceReady: boolean;
  irradianceReady: boolean;
  onChange: (patch: Partial<ShadowProjectionDebugSettings>) => void;
}) => {
  const buttonClass = (selected: boolean) =>
    `h-8 border px-3 text-xs transition-colors first:rounded-l-md last:rounded-r-md ${
      selected
        ? "border-amber-600 bg-amber-50 font-semibold text-amber-800"
        : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="grid gap-3 border-t border-neutral-200 pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wide text-neutral-500">
            Modus
          </span>
          <div className="inline-flex" data-test-id="shadow-debug-mode">
            {SHADOW_MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={buttonClass(settings.shadowMode === value)}
                aria-pressed={settings.shadowMode === value}
                onClick={() => onChange({ shadowMode: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={settings.useUniformBuildingColor}
            onChange={(event) =>
              onChange({ useUniformBuildingColor: event.currentTarget.checked })
            }
          />
          einheitliche Gebäudefarbe
        </label>
        {settings.useUniformBuildingColor && (
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={settings.buildingColor}
              onChange={(event) =>
                onChange({ buildingColor: event.currentTarget.value })
              }
              className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5"
              aria-label="Einheitliche Gebäudefarbe"
            />
            <span className="tabular-nums text-neutral-500">
              {settings.buildingColor.toUpperCase()}
            </span>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
  const model = useMemo(
    () =>
      snapshot
        ? buildShadowProjectionDebugModel(map, solarPosition, snapshot)
        : null,
    [map, snapshot, solarPosition]
  );
  if (!model) return null;
  const displayedAzimuth =
    snapshot.atmosphericSunlight?.azimuthDegrees ??
    solarPosition.azimuthDegrees;
  const displayedElevation =
    snapshot.atmosphericSunlight?.elevationDegrees ??
    solarPosition.elevationDegrees;

  const content = (
    <div
      className="grid max-h-[calc(100vh-140px)] grid-cols-1 items-start gap-4 overflow-y-auto p-2 sm:grid-cols-[260px_minmax(0,1fr)]"
      data-test-id="shadow-simulation-projection-debug-view"
    >
      <div className="w-full overflow-hidden rounded-lg bg-neutral-100">
        <ViewStateVisualizer
          viewState={model.viewStates}
          activeCameraIndex={1}
          width={260}
          height={200}
          bearingLabel="Schattenrichtung"
          pitchLabel="Höhe"
          northLabel="N"
          cueOptions={SHADOW_PROJECTION_DEBUG_CUE_OPTIONS}
          overviewOptions={SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS}
          visualizedOptions={SHADOW_PROJECTION_DEBUG_VISUALIZED_OPTIONS}
          displayOptions={SHADOW_PROJECTION_DEBUG_DISPLAY_OPTIONS}
        />
      </div>
      <div className="grid min-w-0 content-start gap-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Sonne
          </div>
          <ValueRow label="Azimut" value={`${displayedAzimuth.toFixed(1)}°`} />
          <ValueRow label="Höhe" value={`${displayedElevation.toFixed(1)}°`} />
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
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
            Shadow-Buffer-Grenzen in der Karte
          </span>
        </div>
      </div>
      <div className="sm:col-span-2">
        <ShadowDebugControls
          settings={settings}
          transmittanceReady={
            snapshot.atmosphericSunlight?.transmittanceReady ?? false
          }
          irradianceReady={
            snapshot.atmosphericSunlight?.irradianceReady ?? false
          }
          onChange={onSettingsChange}
        />
      </div>
      <div className="grid gap-3 border-t border-neutral-200 pt-3 sm:col-span-2">
        <ShadowTilePlan model={model} />
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
