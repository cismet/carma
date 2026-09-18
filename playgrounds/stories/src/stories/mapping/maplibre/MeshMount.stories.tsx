import type { Meta, StoryObj } from "@storybook/react";
import {
  MESH_REPROJECTION_MODE,
  MESH_REPROJECTION_METHODS,
} from "@carma-geo/utils";

import { MeshMountDemo } from "./MeshMountDemo";
import { MeshMountComparison } from "./MeshMountComparison";
import { MeshMountDiagram } from "./MeshMountDiagram";
import { MeshProjectionAccuracy } from "./MeshProjectionAccuracy";
import {
  MESH_MOUNT_ANCHOR,
  MESH_MOUNT_PRESETS,
  MESH_MOUNT_REFERENCE_FOV_DEGREES,
  MESH_MOUNT_VIEW,
} from "./mesh-mount-presets";

const meta = {
  title: "Terrain and Atmosphere/Projections/Mesh Alignment",
  id: "terrain-and-atmosphere-mesh-mount",
  component: MeshMountDemo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Opaque Mesh 2024 or LoD2 with the topo basemap projected through the shared addon path. No aerial basemap or alpha comparison. One selector compares the original root, camera fits, fitted spheres, AEQD and ellipsoid reprojection. Numerical interpolation targets are controls, not separate visual acceptance stories. OBB probes are model diagnostics, not measured alignment errors. Source datum and image acceptance remain open. Panning/resizing preserve the pool; explicit nonlinear method/grid changes replace it.",
      },
    },
  },
  args: {
    dataset: "mesh2024",
    maplibreTerrain: true,
    projectBasemap: true,
    view: MESH_MOUNT_VIEW.ROOT,
    anchor: MESH_MOUNT_ANCHOR.ROOT,
    zoom: 17,
    pitch: 0,
    verticalFovDegrees: MESH_MOUNT_REFERENCE_FOV_DEGREES,
    reprojectionMode: MESH_REPROJECTION_MODE.OFF,
    projectionGridStepMeters: 250,
    projectionAccuracy: "custom",
    projectionBenchmarkProbe: false,
    basemapOpacity: 1,
    pixelError: 2,
    viewportWidth: 100,
    viewportHeight: 100,
    viewportPosition: "center",
    animateViewport: false,
  },
  argTypes: {
    projectionAccuracy: {
      control: "radio",
      options: ["1cm", "10cm", "1m", "custom"],
      table: { category: "Projection" },
      description:
        "Interpolation accuracy profiles validated for the Wuppertal local domain, not source accuracy. Full ellipsoid modes meet the sampled targets; other geometric models may fail regardless of spacing.",
    },
    projectionBenchmarkProbe: {
      control: "boolean",
      table: { category: "Debug" },
      description:
        "Native runtime registry for the repeatable browser benchmark. Off during timing and normal use.",
    },
    maplibreTerrain: {
      control: "boolean",
      table: { category: "Scene" },
      description:
        "Keep the native bare-earth DEM for terrain and camera reference.",
    },
    projectBasemap: {
      control: "boolean",
      table: { category: "Scene" },
      description:
        "Project the topo style onto opaque geometry using the shared addon path. Off shows the original model material, not a transparent mesh.",
    },
    compact: { table: { disable: true } },
    dataset: {
      control: "radio",
      options: ["mesh2024", "lod2"],
      table: { category: "Comparison" },
    },
    reprojectionMode: {
      control: {
        type: "radio",
        labels: Object.fromEntries(
          Object.entries(MESH_REPROJECTION_METHODS).map(([key, entry]) => [
            key,
            entry.label,
          ])
        ),
      },
      options: Object.values(MESH_REPROJECTION_MODE),
      table: { category: "Projection" },
      description:
        "Exclusive method. Fixed root in all cases. Nonlinear conversion occurs once per loaded tile; pans retain geometry. Global fit means the declared 48 km local domain, not worldwide support. No vertical datum conversion.",
    },
    projectionGridStepMeters: {
      control: { type: "range", min: 25, max: 4000, step: 25 },
      if: { arg: "projectionAccuracy", eq: "custom" },
      table: { category: "Projection" },
      description:
        "Interpolation grid, not tile LOD. Direct reference bypasses it. Explicit changes rebuild projected geometry; camera movement does not.",
    },
    onMapReady: { table: { disable: true } },
    pitch: {
      control: { type: "range", min: 0, max: 75, step: 1 },
      description:
        "Camera tilt; the top-down parallax bound only applies at 0°.",
      table: { category: "View" },
    },
    view: {
      control: {
        type: "select",
        labels: Object.fromEntries(
          Object.entries(MESH_MOUNT_PRESETS).map(([key, preset]) => [
            key,
            preset.label,
          ])
        ),
      },
      options: Object.values(MESH_MOUNT_VIEW),
      table: { category: "View" },
    },
    zoom: {
      control: { type: "range", min: 12, max: 21, step: 0.25 },
      table: { category: "View" },
    },
    verticalFovDegrees: {
      control: { type: "range", min: 0.1, max: 36.87, step: 0.1 },
      description:
        "0.1° narrow-perspective reference versus 36.87° standard perspective. Fixed zoom preserves the z=0 footprint, not the projection of elevated mesh vertices. This is not true orthography.",
      table: { category: "View" },
    },
    anchor: { table: { disable: true } },
    basemapOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      table: { category: "Comparison" },
    },
    pixelError: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      table: { category: "Loading" },
    },
    viewportWidth: {
      control: { type: "range", min: 35, max: 100, step: 1 },
      table: { category: "Viewport" },
    },
    viewportHeight: {
      control: { type: "range", min: 35, max: 100, step: 1 },
      table: { category: "Viewport" },
    },
    viewportPosition: {
      control: "radio",
      options: ["top-left", "center", "bottom-right"],
      table: { category: "Viewport" },
    },
    animateViewport: { control: "boolean", table: { category: "Viewport" } },
  },
} satisfies Meta<typeof MeshMountDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {
  render: (args) => <MeshMountComparison {...args} />,
  argTypes: {
    view: { table: { disable: true } },
    compact: { table: { disable: true } },
    viewportWidth: { table: { disable: true } },
    viewportHeight: { table: { disable: true } },
    viewportPosition: { table: { disable: true } },
    animateViewport: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Four independent MapLibre maps, laid out Center/Paul-Flocke-Weg above Stoffelsberg/South. All use the same zoom, FOV and mount controls. These are selected comparison sites, not proven dataset extrema. The root camera remains exactly at the mount origin. Individual diagnostics remain available in the other stories. Each context has its own 1 GiB mesh budget; this is not a shared-GPU-memory demonstration.",
      },
    },
  },
};

export const MethodAccuracy: Story = {
  name: "Method errors · numerical acceptance",
  render: () => <MeshProjectionAccuracy />,
  parameters: { controls: { disable: true } },
};
export const TransformStrategies: Story = {
  name: "Transform strategies · one mesh",
  args: { projectBasemap: false, basemapOpacity: 0 },
};
export const ProjectionDiagram: Story = {
  name: "Why rigid mounts diverge",
  render: () => (
    <>
      <MeshMountDiagram />
    </>
  ),
  parameters: { controls: { disable: true } },
};
