import { Slider } from "antd";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
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
