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
import { buildShadowProjectionDebugModel } from "./shadow-projection-debug-model";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

const formatDistance = (value: number) =>
  value >= 1_000
    ? `${(value / 1_000).toFixed(1)} km`
    : `${Math.max(0, value).toFixed(value < 10 ? 2 : 0)} m`;

const SHADOW_PROJECTION_DEBUG_CUE_OPTIONS = {
  bearing: { label: "Schattenrichtung", color: "#d97706" },
  pitch: { label: "Höhe", color: "#f59e0b" },
  north: { label: "N", color: "#2563eb" },
} as const;

const SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS = {
  orthographic: true,
} as const;

const SHADOW_PROJECTION_DEBUG_DISPLAY_OPTIONS = {
  surface: { show: true, showGraticule: false, sphereOpacity: 0.08 },
  worldAxes: { show: true, lineWidthPx: 1.5 },
  angleCues: { show: true, lineWidthPx: 1.5 },
  cameraView: {
    imagePlane: { show: true, showOffset: true },
    axes: { show: true, showInactive: true },
    frustum: { show: true, showInactive: true },
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

const ValueRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-[max-content_1fr] gap-3">
    <span className="text-neutral-500">{label}</span>
    <span className="text-right tabular-nums text-neutral-800">{value}</span>
  </div>
);

export const ShadowProjectionDebugView = ({
  map,
  solarPosition,
}: {
  map: MaplibreMap;
  solarPosition: SolarPosition;
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

  const content = (
    <div
      className="grid grid-cols-1 items-start gap-4 p-2 sm:grid-cols-[280px_minmax(0,1fr)]"
      data-test-id="shadow-simulation-projection-debug-view"
    >
      <div className="w-full overflow-hidden rounded-lg bg-neutral-100">
        <ViewStateVisualizer
          viewState={model.viewStates}
          activeCameraIndex={1}
          width={280}
          height={220}
          bearingLabel="Schattenrichtung"
          pitchLabel="Höhe"
          northLabel="N"
          cueOptions={SHADOW_PROJECTION_DEBUG_CUE_OPTIONS}
          overviewOptions={SHADOW_PROJECTION_DEBUG_OVERVIEW_OPTIONS}
          displayOptions={SHADOW_PROJECTION_DEBUG_DISPLAY_OPTIONS}
        />
      </div>
      <div className="grid min-w-0 content-start gap-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Sonne
          </div>
          <ValueRow
            label="Azimut"
            value={`${solarPosition.azimuthDegrees.toFixed(1)}°`}
          />
          <ValueRow
            label="Höhe"
            value={`${solarPosition.elevationDegrees.toFixed(1)}°`}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Shadow-Camera
          </div>
          <ValueRow
            label="Viewport"
            value={`${formatDistance(
              model.viewportWidthMeters
            )} × ${formatDistance(model.viewportHeightMeters)}`}
          />
          <ValueRow
            label="Lichtfrustum"
            value={`${formatDistance(
              model.shadowWidthMeters
            )} × ${formatDistance(model.shadowHeightMeters)}`}
          />
          <ValueRow
            label="Texel"
            value={`${formatDistance(
              model.shadowTexelWidthMeters
            )} × ${formatDistance(model.shadowTexelHeightMeters)}`}
          />
          <ValueRow
            label="Reliefspanne"
            value={formatDistance(model.elevationSpanMeters)}
          />
          <ValueRow
            label="Reichweite je 1 m Höhe"
            value={formatDistance(model.horizontalProjectionPerHeight)}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            Kamera
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
            Sonne / orthografisches Frustum
          </span>
        </div>
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
      width={540}
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
