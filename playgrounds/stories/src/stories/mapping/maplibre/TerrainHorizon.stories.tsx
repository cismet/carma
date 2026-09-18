import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { Radio } from "antd";
import {
  LANGENBERG_LANDMARKS,
  NORDHELLE_LANDMARKS,
} from "@carma-commons/resources";
import { MapLibreThreeReferenceSurfacesDemo } from "./MapLibreThreeReferenceSurfacesDemo";
import { REFERENCE_SURFACE_DEFAULTS } from "./reference-surface-defaults";
import {
  REFERENCE_ATMOSPHERE_MODE,
  REFERENCE_CAMERA_PRESET,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
} from "./maplibre-three-reference-surfaces";

type HorizonArgs = {
  view: "planar" | "spherical" | "ellipsoidal";
  sunset: boolean;
  site: "nordhelle" | "langenberg";
  showLandmarks: boolean;
  fieldOfView: number;
  pixelErrorTarget: 2 | 4 | 8;
  colorByPixelError: boolean;
  showGuides: boolean;
  horizonReference: "local-horizontal" | "ellipsoid";
  showDiagnostics: boolean;
};

const TerrainHorizonComparison = (args: HorizonArgs) => {
  const [view, setView] = useState(args.view);
  useEffect(() => setView(args.view), [args.view]);
  const panels = [view];
  const landmarks =
    args.site === "langenberg" ? LANGENBERG_LANDMARKS : NORDHELLE_LANDMARKS;
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#15202b",
        color: "#f0f4f8",
        fontFamily: "system-ui",
      }}
    >
      <header style={{ padding: "10px 16px", fontSize: 12, lineHeight: 1.45 }}>
        <strong style={{ fontSize: 16 }}>
          {args.sunset
            ? "Sunset: Nordhelle → Wuppertal"
            : args.site === "langenberg"
            ? "Toelleturm → Langenberg transmitter masts"
            : "40 km horizon: Toelleturm → Nordhelle"}
        </strong>
        <div>
          One retained scene: same locked eye, optical axis, FOV and height
          datum. Only terrain geometry changes.
          {" Camera and terrain: DHHN2016 H + GCG2016 ζ → ellipsoidal h."}
          {args.sunset
            ? " 23 August 2026, 20:27 CEST; virtual camera 200 m above covered DOM, not a public viewpoint."
            : " Eye: Toelleturm DOM top +3 m; no vertical exaggeration. Optical axis 0.1° below tangent (MapLibre pitch limit), not aimed at a tower tip."}
        </div>
        {args.showLandmarks && !args.sunset && (
          <div>
            Silhouettes:{" "}
            {landmarks
              .map(
                (landmark) => `${landmark.name} (${landmark.heightMeters} m)`
              )
              .join(" · ")}
            . Approximate widths.
            {args.site === "nordhelle" &&
              " WDR height sources conflict (130/150 m)."}
          </div>
        )}
        <div style={{ color: "#ffd98c" }}>
          {args.site === "langenberg"
            ? "Both mast centers are inside the published terrain polygon and outside the mesh extent. DGM terrain omits buildings and vegetation: this is not a complete occluder model."
            : "Published terrain is clipped near Nordhelle. Towers use independent NRW DGM ground samples; absent terrain beyond that edge is NOT a validated viewshed."}
        </div>
        {args.sunset && (
          <div role="note" style={{ color: "#ffd98c" }}>
            REVIEW: planar switching can expose terrain gaps. The addon tracks
            the map-center solar location, not this distant physical eye; the
            reference-eye solar readout is not an exact sky-disc check. High
            memory use: this preset is not accepted as a viewshed reference.
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            size="small"
            aria-label="Terrain geometry comparison"
            value={view}
            onChange={(event) => setView(event.target.value)}
            options={[
              { label: "A · Planar", value: "planar" },
              { label: "B · Spherical", value: "spherical" },
              { label: "C · Ellipsoidal", value: "ellipsoidal" },
            ]}
          />
        </div>
        {args.colorByPixelError && (
          <div style={{ marginTop: 6 }}>
            Source SSE estimate / target {args.pixelErrorTarget} px:
            {[
              ["≤ 0.5×", "#38bdf8"],
              ["≤ 1×", "#22c55e"],
              ["≤ 2×", "#facc15"],
              ["≤ 4×", "#f97316"],
              ["> 4×", "#ef4444"],
            ].map(([label, color]) => (
              <span key={label} style={{ color, marginLeft: 12 }}>
                ■ {label}
              </span>
            ))}
            {
              " · observer camera, conservative tile bounds; not a measured height residual"
            }
          </div>
        )}
      </header>
      <main
        style={{
          display: "grid",
          flex: 1,
          minHeight: 0,
          gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))`,
        }}
      >
        {panels.map((panel) => (
          <section
            key="retained-comparison"
            data-test-id={`horizon-${panel}`}
            style={{
              position: "relative",
              minWidth: 0,
              borderRight: "1px solid #718096",
            }}
          >
            <MapLibreThreeReferenceSurfacesDemo
              {...REFERENCE_SURFACE_DEFAULTS}
              embedded
              lockCamera
              compareGeometryModes
              panelLabel={
                panel === "planar"
                  ? "PLANAR · Mercator height field"
                  : panel === "spherical"
                  ? "SPHERICAL · local sphere / tangent frame"
                  : "ELLIPSOIDAL · WGS84 ECEF / local tangent frame"
              }
              showDiagnostics={args.showDiagnostics}
              terrainGeometryMode={
                panel === "planar"
                  ? TERRAIN_GEOMETRY_MODE.MERCATOR
                  : panel === "spherical"
                  ? TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE
                  : TERRAIN_GEOMETRY_MODE.WGS84_ECEF
              }
              terrainHeightDatum={TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL}
              terrainModel="dgm1"
              terrainAppearance={
                args.colorByPixelError ? "pixel-error" : "viridis"
              }
              terrainElevationMinimumMeters={100}
              terrainElevationMaximumMeters={750}
              terrainErrorTargetPixels={args.pixelErrorTarget}
              cameraPreset={
                args.sunset
                  ? REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM
                  : args.site === "langenberg"
                  ? REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG
                  : REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE
              }
              landmarks={args.showLandmarks ? landmarks : undefined}
              fovDegrees={args.fieldOfView}
              showAngularGuideLines={args.showGuides}
              angularGuideSpacingDegrees={0.5}
              horizonReference={args.horizonReference}
              showShadowSimulation={args.sunset}
              shadowDayOfYear={235}
              shadowMinutes={20 * 60 + 27}
              softSunShadows={false}
              atmosphereMode={REFERENCE_ATMOSPHERE_MODE.OFF}
            />
          </section>
        ))}
      </main>
      <footer style={{ padding: "5px 16px", fontSize: 11 }}>
        Geobasis NRW · © OpenStreetMap contributors · authored schematic
        silhouettes; model data, full provenance and uncertainty in
        @carma-commons/resources (Sauerland / Ruhr).
      </footer>
    </div>
  );
};

const meta = {
  title: "Terrain and Atmosphere/Terrain Horizon",
  id: "terrain-and-atmosphere-terrain-horizon",
  component: TerrainHorizonComparison,
  parameters: { layout: "fullscreen" },
  args: {
    view: "ellipsoidal",
    sunset: false,
    site: "nordhelle",
    showLandmarks: true,
    fieldOfView: 6,
    pixelErrorTarget: 4,
    colorByPixelError: false,
    showGuides: true,
    horizonReference: "ellipsoid",
    showDiagnostics: true,
  },
  argTypes: {
    view: {
      control: "inline-radio",
      options: ["planar", "spherical", "ellipsoidal"],
    },
    fieldOfView: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      table: { category: "Camera" },
    },
    pixelErrorTarget: {
      control: "inline-radio",
      options: [2, 4, 8],
      table: { category: "Terrain" },
    },
    colorByPixelError: {
      control: "boolean",
      table: { category: "Debug" },
      description:
        "Color each terrain surface by estimated projected source error divided by the current target. Emissive shading avoids sun-dependent metric colors.",
    },
    showLandmarks: { table: { category: "Landmarks" } },
    sunset: { table: { disable: true } },
    site: { table: { disable: true } },
    showGuides: { table: { category: "Debug" } },
    horizonReference: {
      control: "inline-radio",
      options: ["local-horizontal", "ellipsoid"],
      table: { category: "Guides" },
    },
    showDiagnostics: { table: { category: "Debug" } },
  },
} satisfies Meta<typeof TerrainHorizonComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = { name: "Reference" };
export const Langenberg: Story = {
  name: "Langenberg · masts beyond the mesh",
  args: { site: "langenberg" },
};
export const Sunset: Story = {
  name: "Sunset · curvature comparison · review",
  args: { sunset: true, fieldOfView: 10 },
};
