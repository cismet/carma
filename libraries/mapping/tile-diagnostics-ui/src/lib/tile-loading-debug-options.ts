import type { Map as MapLibreMap } from "maplibre-gl";
import type { MetricRecorder } from "@carma-commons/ui/components";
import type { ThreeTilesRuntime } from "@carma-mapping/engines/maplibre";

export type TileLoadingDebugOptions = {
  showOverviewPanel: boolean;
  showOverviewOptions?: boolean;
  overviewSize?: boolean;
  overviewSteps?: boolean;
  showDiagnosticTools?: boolean;
  overviewUp: "tileset" | "camera-tangent";
  showTileGeometry: boolean;
  showMeshStylePanel?: boolean;
  meshFillOpacity?: number;
  wireframeColor?: string;
  showOverlay: boolean;
  hideAllDebugPanels: boolean;
  telemetryEnabled: boolean;
  /** Capture on each scene render; coalesce while a previous capture is running. */
  updateOnRender?: boolean;
  showLegend: boolean;
  showCharts: boolean;
  showEventLog: boolean;
  /**
   * Overview view: the whole extent; the frustum footprint plus a buffer,
   * centred on the screen-centre ray and following the camera; or a free
   * slippy view with wheel zoom and drag (blocks the map underneath).
   */
  overviewView: "extent" | "frustum" | "free";
  overviewCameraFocus?: string;
  /** 100 fits the viewport; 200 doubles its extent. */
  overviewPaddingPercent?: number;
  overlayOpacity: number;
  showFrustum: boolean;
  showResident: boolean;
  /** Text on the overview rectangles. */
  overlayLabels: "none" | "id" | "id and error" | "id and stats";
  /** Tile ids as DOM billboards at the top-plane centre of displayed tiles. */
  sceneLabels: boolean;
  showQueue: boolean;
  showStats: boolean;
  /** Tile extents in the scene, coloured like the overview: instanced cubes or edges. */
  sceneExtents: "none" | "boxes" | "edges";
  /** 3DTilesRendererJS DebugTilesPlugin: tile colour mode and bounds helpers. */
  debugColorMode: DebugColorModeName;
  debugBoxBounds: boolean;
  debugSphereBounds: boolean;
  debugParentBounds: boolean;
  debugUnlit: boolean;
};

/** Only explicitly supplied loader settings are applied to the host runtime. */
export type TileLoadingDebugLoadingOptions = {
  /** Foveated request order: 0 nearest first, higher favours the view centre. */
  foveation: number;
  /** Residual quality: the extent shown across this many pixels; 0 keeps the hinted floor. */
  tilesetMinResolutionPx: number;
  /** Parse jobs at rest (GLTF scene creation on the renderer thread). */
  parseJobs: number;
  /** Tile cache budget in MB. The diagnostic starts with the shared 6 GiB stress budget. */
  cacheBudgetMB: number;
};

export const DEBUG_COLOR_MODES = [
  "NONE",
  "SCREEN_ERROR",
  "GEOMETRIC_ERROR",
  "DISTANCE",
  "DEPTH",
  "RELATIVE_DEPTH",
  "IS_LEAF",
  "RANDOM_COLOR",
  "RANDOM_NODE_COLOR",
  "LOAD_ORDER",
] as const;
export type DebugColorModeName = (typeof DEBUG_COLOR_MODES)[number];

export const DEFAULT_TILE_LOADING_DEBUG_OPTIONS: TileLoadingDebugOptions = {
  showOverviewPanel: false,
  overviewSize: true,
  overviewSteps: false,
  overviewUp: "camera-tangent",
  showTileGeometry: false,
  showOverlay: true,
  hideAllDebugPanels: false,
  telemetryEnabled: true,
  updateOnRender: false,
  showLegend: true,
  showCharts: false,
  showEventLog: false,
  overviewView: "frustum",
  overviewCameraFocus: "all",
  overviewPaddingPercent: 200,
  overlayOpacity: 0.85,
  showFrustum: true,
  showResident: true,
  overlayLabels: "none",
  sceneLabels: false,
  showQueue: false,
  showStats: false,
  sceneExtents: "none",
  debugColorMode: "NONE",
  debugBoxBounds: false,
  debugSphereBounds: false,
  debugParentBounds: false,
  debugUnlit: false,
};

export type ResolvedDebugOptions = TileLoadingDebugOptions &
  Partial<TileLoadingDebugLoadingOptions>;

export type TileLoadingDebugProps = {
  initialToolbarPosition?: { left: number; top: number };
  initialOverviewPosition?: { left: number; top: number };
  map: MapLibreMap;
  runtimeHandle: ThreeTilesRuntime | null;
  options?: Partial<ResolvedDebugOptions>;
  onOptionsChange?: (patch: Partial<ResolvedDebugOptions>) => void;
  recorder?: MetricRecorder;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};
