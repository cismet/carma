import { useMemo, type ReactNode } from "react";
import type { Tile } from "3d-tiles-renderer/core";
import type * as THREE from "three";
import { Button, Slider } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faCrosshairs,
  faHand,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  formatTileResidentBytes,
  type ThreeTilesRuntime,
  type TileDiagnosticSummary,
  TILE_DIAGNOSTIC_CAMERA_FOCUS,
  TILE_DIAGNOSTIC_LABEL_MODE,
  TILE_DIAGNOSTIC_OVERVIEW_UP,
  TILE_DIAGNOSTIC_OVERVIEW_VIEW,
} from "@carma-mapping/engines/maplibre";
import {
  DiagnosticChoice,
  DiagnosticSection,
  DIAGNOSTIC_BOOLEAN_CHOICES,
} from "./DiagnosticControls";
import { readRuntime } from "./use-tile-loading-debug-runtime";
import { SHADOW_CORRIDOR_CAMERA_ID } from "./shadow-corridor-camera";
import type {
  ResolvedDebugOptions,
  TileLoadingDebugOptions,
} from "./tile-loading-debug-options";
import {
  TILE_LOADING_DEBUG_OVERVIEW_MODE,
  type TileLoadingDebugOverviewMode,
} from "./tile-loading-debug-tokens";

export const TileLoadingDebugOverviewOptions = ({
  options,
  onOptionsChange,
  overviewMode,
  setOverviewMode,
  map,
  cameraIds,
  setFreeView,
}: {
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
  overviewMode: TileLoadingDebugOverviewMode;
  setOverviewMode: (mode: TileLoadingDebugOverviewMode) => void;
  map: MapLibreMap;
  cameraIds: readonly string[];
  setFreeView: (view: null) => void;
}) => (
  <div
    className="tile-debug-form"
    data-test-id="mesh-coverage-overview-options"
  >
    <DiagnosticChoice
      label="Overview placement"
      value={overviewMode}
      onChange={setOverviewMode}
      choices={[
        { value: TILE_LOADING_DEBUG_OVERVIEW_MODE.OFF, label: "Off" },
        { value: TILE_LOADING_DEBUG_OVERVIEW_MODE.OVERLAY, label: "Overlay" },
        { value: TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW, label: "Window" },
      ]}
    />
    <DiagnosticChoice
      label="Debug updates"
      value={options.updateOnRender ?? false}
      onChange={(updateOnRender: boolean) => {
        onOptionsChange({ updateOnRender });
        map.triggerRepaint();
      }}
      choices={[
        { value: false, label: "Deferred (10 Hz)" },
        { value: true, label: "Every render frame" },
      ]}
    />
    <div style={{ fontSize: 11, color: "#596773" }}>
      Camera always live. Frame mode refreshes tile diagnostics after each
      render; busy captures coalesce. Statistics remain sampled.
    </div>
    {options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM && (
      <DiagnosticChoice
        label="Frustum crop"
        value={options.overviewCameraFocus ?? TILE_DIAGNOSTIC_CAMERA_FOCUS.ALL}
        onChange={(overviewCameraFocus: string) =>
          onOptionsChange({ overviewCameraFocus })
        }
        choices={[
          { value: TILE_DIAGNOSTIC_CAMERA_FOCUS.LIVE, label: "Main · white" },
          { value: TILE_DIAGNOSTIC_CAMERA_FOCUS.ALL, label: "All frustums" },
          ...cameraIds.map((id, i) => ({
            value: id,
            label: `${
              id === SHADOW_CORRIDOR_CAMERA_ID
                ? "Sun corridor"
                : id.startsWith("coverage-window-")
                ? `Camera ${Number(id.slice("coverage-window-".length)) + 1}`
                : id
            } · ${
              id === SHADOW_CORRIDOR_CAMERA_ID
                ? "lemon"
                : ["orange", "green", "violet"][i % 3]
            }`,
          })),
        ]}
      />
    )}
    {options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM && (
      <label>
        Follow padding: {options.overviewPaddingPercent ?? 200}%
        <Slider
          aria-label="Follow viewport padding"
          min={100}
          max={500}
          step={25}
          value={options.overviewPaddingPercent ?? 200}
          onChange={(overviewPaddingPercent) =>
            onOptionsChange({ overviewPaddingPercent })
          }
        />
        <small>100% fits the viewport; 200% doubles the extent.</small>
      </label>
    )}
    <DiagnosticChoice
      label="Diagnostic up axis"
      value={options.overviewUp}
      onChange={(overviewUp: TileLoadingDebugOptions["overviewUp"]) => {
        setFreeView(null);
        onOptionsChange({ overviewUp });
      }}
      choices={[
        {
          value: TILE_DIAGNOSTIC_OVERVIEW_UP.CAMERA_TANGENT,
          label: "Camera tangent up",
        },
        {
          value: TILE_DIAGNOSTIC_OVERVIEW_UP.TILESET,
          label: "Native tileset Z up",
        },
      ]}
    />
    {(
      [
        ["showFrustum", "Camera intersection"],
        ["showResident", "Retained tiles"],
      ] as const
    ).map(([flag, label]) => (
      <DiagnosticChoice
        key={flag}
        label={label}
        value={options[flag]}
        choices={DIAGNOSTIC_BOOLEAN_CHOICES}
        onChange={(value) => onOptionsChange({ [flag]: value })}
      />
    ))}
    <DiagnosticSection title="Labels and opacity" initiallyOpen={false}>
      <DiagnosticChoice
        label="Overlay labels"
        value={options.overlayLabels}
        onChange={(overlayLabels: TileLoadingDebugOptions["overlayLabels"]) =>
          onOptionsChange({ overlayLabels })
        }
        choices={Object.values(TILE_DIAGNOSTIC_LABEL_MODE).map((value) => ({
          value,
          label:
            value === TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_STATS
              ? "ID + resident cache size"
              : value,
        }))}
      />
      <Slider
        aria-label="Grid opacity"
        min={0}
        max={1}
        step={0.05}
        value={options.overlayOpacity}
        onChange={(overlayOpacity) => onOptionsChange({ overlayOpacity })}
      />
    </DiagnosticSection>
  </div>
);

export const TileLoadingDebugOverviewControls = ({
  options,
  onOptionsChange,
  windowed,
  fullControls,
  onToggleOptions,
  cameraControls = true,
  displayControls = true,
}: {
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
  windowed: boolean;
  fullControls: boolean;
  onToggleOptions: () => void;
  cameraControls?: boolean;
  displayControls?: boolean;
}) => (
  <>
    {cameraControls && (
      <>
        <Button
          type="text"
          icon={<FontAwesomeIcon icon={faCrosshairs} />}
          aria-label="Follow viewport"
          aria-pressed={
            options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
          }
          title={
            options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
              ? "Following viewport · drag to pan, Ctrl/right-drag to orbit, wheel to zoom"
              : "Follow viewport"
          }
          onClick={() =>
            onOptionsChange({
              overviewView:
                options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM
                  ? TILE_DIAGNOSTIC_OVERVIEW_VIEW.EXTENT
                  : TILE_DIAGNOSTIC_OVERVIEW_VIEW.FRUSTUM,
            })
          }
        />
        {windowed && (
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faHand} />}
            aria-label="Free pan/zoom"
            aria-pressed={
              options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE
            }
            title="Free pan/zoom · window only"
            onClick={() =>
              onOptionsChange({
                overviewView:
                  options.overviewView === TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE
                    ? TILE_DIAGNOSTIC_OVERVIEW_VIEW.EXTENT
                    : TILE_DIAGNOSTIC_OVERVIEW_VIEW.FREE,
              })
            }
          />
        )}
        {fullControls && (
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faSliders} />}
            aria-label="Overview options"
            aria-pressed={options.showOverviewOptions}
            title="Overview options"
            onClick={onToggleOptions}
          />
        )}
      </>
    )}
    {fullControls && displayControls && (
      <Button
        className="tile-debug-header-toggle"
        type="text"
        aria-label="Resident tile size grid"
        aria-pressed={options.overviewSize !== false}
        title="Square resident cache-size grid and labels"
        onClick={() =>
          onOptionsChange({
            overviewSize: options.overviewSize === false,
            overlayLabels:
              options.overviewSize === false
                ? TILE_DIAGNOSTIC_LABEL_MODE.ID_AND_STATS
                : TILE_DIAGNOSTIC_LABEL_MODE.ID,
          })
        }
      >
        B
      </Button>
    )}
    {fullControls && displayControls && (
      <Button
        className="tile-debug-header-toggle"
        type="text"
        aria-label="Tile processing steps"
        aria-pressed={options.overviewSteps !== false}
        title="Processing time pies"
        onClick={() =>
          onOptionsChange({
            overviewSteps: options.overviewSteps === false,
          })
        }
      >
        ms
      </Button>
    )}
    {!fullControls && displayControls && (
      <Button
        className="tile-debug-header-toggle"
        type="text"
        icon={<FontAwesomeIcon icon={faCircleInfo} />}
        aria-label="Show / hide overview legend"
        aria-pressed={options.showLegend}
        title={options.showLegend ? "Hide legend" : "Show legend"}
        onClick={() => onOptionsChange({ showLegend: !options.showLegend })}
      />
    )}
  </>
);

type DrawableTile = Tile & {
  engineData?: {
    scene?: THREE.Object3D;
    boundingVolume?: { intersectsFrustum: (frustum: THREE.Frustum) => boolean };
  };
};

export const TileLoadingDebugOverviewStats = ({
  runtimeHandle,
  summary,
}: {
  runtimeHandle: ThreeTilesRuntime;
  summary: TileDiagnosticSummary | null;
}) => {
  const overviewStatistics = useMemo(() => {
    if (!summary) return null;
    const state = readRuntime(runtimeHandle);
    const tiles = state?.tiles;
    if (!state || !tiles) return null;
    // The native renderer uses loading state 4 for a completed drawable payload.
    const loadedDrawable = (tile: DrawableTile) =>
      tile.internal?.hasRenderableContent === true &&
      tile.internal.loadingState === 4 &&
      !!tile.engineData?.scene;
    const cache = tiles.lruCache as typeof tiles.lruCache & {
      itemSet: ReadonlyMap<Tile, unknown>;
    };
    const receivers = [...state.displayedMeshFrontier] as DrawableTile[];
    const scenes = new Set<DrawableTile>([
      ...receivers,
      ...(state.committedMeshCasterFrontier ?? []),
    ]);
    const viewKnown =
      state.viewFrustumsReady &&
      state.tileViewFrustum &&
      receivers.every(
        (tile) => tile.engineData?.boundingVolume?.intersectsFrustum
      );
    return {
      view: viewKnown
        ? receivers.filter(
            (tile) =>
              loadedDrawable(tile) &&
              tile.engineData!.boundingVolume!.intersectsFrustum(
                state.tileViewFrustum!
              )
          ).length
        : undefined,
      scene: [...scenes].filter(loadedDrawable).length,
      memory: [...cache.itemSet.keys()].filter((tile) =>
        loadedDrawable(tile as DrawableTile)
      ).length,
      bytes: summary.cachedMB * 1e6,
    };
  }, [runtimeHandle, summary]);
  return (
    <dl
      className="tile-debug-overview-statistics"
      data-test-id="mesh-coverage-overview-statistics"
      aria-label="Overview statistics"
    >
      <dt title="Published receiver tiles intersecting the main view">View</dt>
      <dd>{overviewStatistics?.view ?? "–"}</dd>
      <dt title="Published receivers and offscreen shadow casters">Scene</dt>
      <dd>{overviewStatistics?.scene ?? "–"}</dd>
      <dt title="Loaded drawable tile scenes held in memory">Memory</dt>
      <dd>{overviewStatistics?.memory ?? "–"}</dd>
      <dt title="Accounted tile cache bytes, including geometry and materials">
        Tile memory
      </dt>
      <dd>
        {overviewStatistics
          ? formatTileResidentBytes(overviewStatistics.bytes)
          : "–"}
      </dd>
    </dl>
  );
};

export const TileLoadingDebugOverviewLegend = ({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <div
    className="tile-debug-overview-legend"
    style={{ width: open ? "max-content" : undefined }}
  >
    {open && (
      <div className="tile-debug-overview-legend-content">{children}</div>
    )}
    <div className="tile-debug-window-controls">
      <Button
        type="text"
        icon={<FontAwesomeIcon icon={faCircleInfo} />}
        aria-label="Overview legend"
        aria-expanded={open}
        title={open ? "Collapse legend" : "Expand legend"}
        onClick={onToggle}
      >
        <span className="tile-debug-overview-legend-label">Legend</span>
      </Button>
    </div>
  </div>
);
