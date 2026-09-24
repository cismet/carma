import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { MapLibreThreeReferenceSurfacesDemo } from "./MapLibreThreeReferenceSurfacesDemo";
import { REFERENCE_SURFACE_DEFAULTS } from "./reference-surface-defaults";
import { MESH_LONG_AXIS_ENDPOINTS } from "./mesh-mount-presets";
import { TERRAIN_GEOMETRY_MODE } from "./maplibre-three-reference-surfaces";

const MeshTelelens = (args: {
  eyeHeight: number;
  targetHeight: number;
  fov: number;
  reverse: boolean;
  mesh: boolean;
  curved: boolean;
}) => {
  const physicalCamera = useMemo(
    () => ({
      label: "Mesh root OBB long-axis corridor · virtual raised observer",
      eyeLngLat: MESH_LONG_AXIS_ENDPOINTS[args.reverse ? 1 : 0],
      targetLngLat: MESH_LONG_AXIS_ENDPOINTS[args.reverse ? 0 : 1],
      eyeNormalHeightMeters: args.eyeHeight,
      targetNormalHeightMeters: args.targetHeight,
      bearingDegrees: 0,
      pitchDegrees: 89,
      distanceMeters: 0,
    }),
    [args.reverse, args.eyeHeight, args.targetHeight]
  );
  return (
    <section
      style={{ height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header style={{ padding: 6, font: "12px system-ui" }}>
        Longest root-box axis, endpoints 20% inside each face. Virtual eye{" "}
        {args.eyeHeight} m DHHN2016 → target {args.targetHeight} m.
        <br />
        Raise the eye to inspect the far ridge. OBB extent is not content
        coverage; clearance and far-end coverage require review. No claim of a
        measured unobstructed viewshed.
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapLibreThreeReferenceSurfacesDemo
          {...REFERENCE_SURFACE_DEFAULTS}
          embedded
          lockCamera
          physicalCamera={physicalCamera}
          fovDegrees={args.fov}
          showMesh2024={args.mesh}
          meshAppearance="imagery"
          showTerrain={!args.mesh}
          terrainGeometryMode={
            args.curved
              ? TERRAIN_GEOMETRY_MODE.WGS84_ECEF
              : TERRAIN_GEOMETRY_MODE.MERCATOR
          }
          terrainAppearance="viridis"
          terrainErrorTargetPixels={4}
          meshErrorTargetPixels={4}
        />
      </div>
    </section>
  );
};
const meta = {
  title: "Terrain and Atmosphere/Projections/Long Axis Telelens",
  id: "terrain-and-atmosphere-long-axis-telelens",
  component: MeshTelelens,
  parameters: { layout: "fullscreen" },
  args: {
    eyeHeight: 800,
    targetHeight: 300,
    fov: 12,
    reverse: false,
    mesh: true,
    curved: true,
  },
  argTypes: {
    eyeHeight: {
      control: { type: "range", min: 400, max: 3000, step: 25 },
      table: { category: "Camera" },
    },
    targetHeight: {
      control: { type: "range", min: 100, max: 600, step: 10 },
      table: { category: "Camera" },
    },
    fov: {
      control: { type: "range", min: 2, max: 35, step: 1 },
      table: { category: "Camera" },
    },
    reverse: { table: { category: "Camera" } },
    mesh: { table: { category: "Surface" } },
    curved: { table: { category: "Surface" } },
  },
} satisfies Meta<typeof MeshTelelens>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
