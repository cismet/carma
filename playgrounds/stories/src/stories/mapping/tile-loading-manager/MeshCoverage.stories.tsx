import type { Meta, StoryObj } from "@storybook/react";
import meshStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";

import {
  CAMERA_PRESETS,
  DEBUG_COLOR_MODES,
  MeshCoverageDemo,
} from "./MeshCoverageDemo";

const meta = {
  title: "Tile Loading Manager/Reference",
  id: "tile-loading-manager-coverage",
  component: MeshCoverageDemo,
  parameters: {
    layout: "fullscreen",
    controls: {
      include: [
        "debug",
        "camera",
        "projection",
        "fovDegrees",
        "foveation",
        "initialPixelError",
        "idlePixelError",
        "tilesetMinResolutionPx",
        "parseJobs",
        "cacheBudgetMB",
      ],
    },
    docs: {
      description: {
        component:
          "The production tile manager on the common MapLibre story base, with diagnostics enabled by default. Tile overview settings stay together: Off / Overlay / Window, legend visibility, view following, diagnostic up, labels and opacity. Overlay is the default; the legend belongs to the overview rather than a separate global panel. Queue, statistics, charts and event log remain independent movable, resizable and detachable windows. The map overview is unfilled with solid strokes and a narrow 25% grey darken under-stroke; the window overview has state fills. Circles indicate refinement steps, five-square cross outlines excess detail, no symbol the target LOD, and an approximation mark estimated steps. Offscreen baseline tiles omit LOD contours. The camera intersection clips the actual 3D frustum to tileset bounds. Up switching affects only diagnostics; loaded wireframes share source geometry. Unchanged diagnostic snapshots do not rebuild geometry or React/SVG, and hidden queues/charts do no display work. See libraries/mapping/engines/maplibre/TILES_COVERAGE.md.",
      },
    },
  },
  args: {
    debug: true,
    showOverviewPanel: false,
    overviewUp: "camera-tangent",
    showTileGeometry: false,
    camera: "parity zoom 18",
    projection: "perspective",
    fovDegrees: 37,
    showOverlay: true,
    hideAllDebugPanels: false,
    telemetryEnabled: true,
    showLegend: true,
    showCharts: false,
    showEventLog: false,
    overviewView: "frustum",
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
    foveation: 0,
    initialPixelError: meshStyle.metadata.carmaConf["3d"].baseErrorTarget,
    idlePixelError: meshStyle.metadata.carmaConf["3d"].errorTarget,
    tilesetMinResolutionPx:
      meshStyle.metadata.carmaConf["3d"].tilesetMinResolutionPx,
    parseJobs: 2,
    cacheBudgetMB: 6144,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    showPaddingGuide: false,
    viewportWidth: 0,
  },
  argTypes: {
    debug: {
      control: "boolean",
      description:
        "Enable the diagnostic toolbar and telemetry. Individual panels and display switches live in the toolbar; the mesh/runtime is not rebuilt.",
    },
    hideAllDebugPanels: {
      control: "boolean",
      description:
        "Hide all panels, including popouts. Keep telemetry running for recordings.",
      table: { category: "Diagnostics" },
    },
    telemetryEnabled: {
      control: "boolean",
      description:
        "Disable to stop story sampling, observers, charts, scene debug helpers and runtime diagnostic bookkeeping. Panels are hidden while disabled; tile loading continues unchanged.",
      table: { category: "Diagnostics" },
    },
    showLegend: { control: "boolean", table: { category: "Diagnostics" } },
    showCharts: { control: "boolean", table: { category: "Diagnostics" } },
    showEventLog: { control: "boolean", table: { category: "Diagnostics" } },
    camera: {
      control: { type: "radio" },
      options: Object.keys(CAMERA_PRESETS),
      table: { category: "Camera" },
    },
    projection: {
      control: "radio",
      options: ["perspective", "near orthographic"],
      table: { category: "Camera" },
    },
    fovDegrees: {
      control: { type: "range", min: 10, max: 120, step: 1 },
      table: { category: "Camera" },
    },
    showOverlay: { control: "boolean" },
    overviewView: { control: "radio", options: ["extent", "frustum"] },
    overviewPaddingPercent: {
      control: { type: "range", min: 100, max: 500, step: 25 },
    },
    overlayOpacity: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    showFrustum: { control: "boolean" },
    showResident: { control: "boolean" },
    overlayLabels: {
      control: "radio",
      options: ["none", "id", "id and error"],
    },
    sceneLabels: { control: "boolean" },
    showQueue: { control: "boolean" },
    showStats: { control: "boolean" },
    sceneExtents: { control: "radio", options: ["none", "boxes", "edges"] },
    debugColorMode: {
      control: { type: "radio" },
      options: [...DEBUG_COLOR_MODES],
    },
    debugBoxBounds: { control: "boolean" },
    debugSphereBounds: { control: "boolean" },
    debugParentBounds: { control: "boolean" },
    debugUnlit: { control: "boolean" },
    foveation: {
      control: { type: "range", min: 0, max: 8, step: 0.5 },
      table: { category: "Loading" },
    },
    tilesetMinResolutionPx: {
      control: { type: "inline-radio", labels: { 0: "Metadata hint" } },
      options: [0, 256, 512, 1024, 2048, 4096],
      description:
        "Residual surface across the full tileset extent, prepared with tree transitions after initial view quality and before idle refinement. 0 uses the metadata hint; it does not disable coverage. Memory limits still apply.",
      table: { category: "Loading" },
    },
    initialPixelError: {
      control: { type: "range", min: 1, max: 64, step: 1 },
      description:
        "First acceptable viewport error in pixels. Clamped to at least the idle target. Then prepare the residual surface and transitions.",
      table: { category: "Loading" },
    },
    idlePixelError: {
      control: { type: "range", min: 0.5, max: 32, step: 0.5 },
      description:
        "Final viewport error after the initial reserve pass; lower is finer. Memory pressure can relax the effective target.",
      table: { category: "Loading" },
    },
    parseJobs: {
      control: { type: "range", min: 1, max: 6, step: 1 },
      table: { category: "Loading" },
    },
    cacheBudgetMB: {
      control: { type: "inline-radio" },
      options: [256, 512, 1024, 2048, 4096, 6144],
      table: { category: "Memory" },
    },
  },
} satisfies Meta<typeof MeshCoverageDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MeshCoverage: Story = {};

export const CameraWindows: Story = {
  name: "Camera Windows · three-camera stress",
  args: { cameraWindows: true, overviewCameraFocus: "all" },
  parameters: {
    docs: {
      description: {
        story:
          "Stress preset of Mesh Coverage: the same Cameras control opens three secondary views. Each window is resizable and can undock without replacing its camera or tile pool. Render resolution follows the image area (DPR up to 2, longest side up to 2048 px). Route and lens options collapse into the header. Main-map loading retains primary priority. All frustums are visible in the overview, which can crop to their union or one camera. The Schwebebahn profile uses an assumed rail height of DGM + 13 m; Wupper bank looks towards HKW Zoo. Popups depend on browser support; Dock all cameras also returns detached views to the main page.",
      },
    },
  },
};

export const ViewportPadding: Story = {
  argTypes: {
    paddingLeft: {
      control: { type: "range", min: 0, max: 600, step: 20 },
      table: { category: "Viewport padding" },
    },
    paddingRight: {
      control: { type: "range", min: 0, max: 600, step: 20 },
      table: { category: "Viewport padding" },
    },
    paddingTop: {
      control: { type: "range", min: 0, max: 300, step: 10 },
      table: { category: "Viewport padding" },
    },
    paddingBottom: {
      control: { type: "range", min: 0, max: 300, step: 10 },
      table: { category: "Viewport padding" },
    },
    showPaddingGuide: {
      control: "boolean",
      table: { category: "Viewport padding" },
    },
    viewportWidth: {
      control: { type: "inline-radio" },
      options: [0, 480, 768, 1024],
      description:
        "CSS pixels; zero follows the available width. Resizes the existing map.",
      table: { category: "Viewport padding" },
    },
  },
  name: "Viewport Request Padding",
  args: {
    paddingPanels: true,
    debug: false,
    showPaddingGuide: true,
    foveation: 4,
  },
  parameters: {
    controls: {
      include: [
        "viewportWidth",
        "showPaddingGuide",
        "camera",
        "projection",
        "fovDegrees",
        "foveation",
        "debug",
      ],
    },
    docs: {
      description: {
        story:
          "Enable translucent Lorem ipsum panels on any side and drag their inner edges (or use arrow keys on the handles). Their measured CSS-pixel extents, including outer spacing, go through map.setPadding only. The cyan guide reads map.getPadding and map.project(map.getCenter); the existing native camera path propagates the asymmetric view to tile selection and foveation, without replacing the map or pool. Coverage still fills the whole canvas. Narrow the host with viewportWidth to test responsive insets.",
      },
    },
  },
};
