import type { Meta, StoryObj } from "@storybook/react";

import {
  MapLibreThreeReferenceSurfacesDemo,
  type MapLibreThreeReferenceSurfacesOptions,
} from "./MapLibreThreeReferenceSurfacesDemo";
import {
  ELEVATION_COLOR_DATUM,
  REFERENCE_ATMOSPHERE_MODE,
  REFERENCE_CAMERA_PRESET,
  REFERENCE_SURFACE,
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
} from "./maplibre-three-reference-surfaces";
import { REFERENCE_SURFACE_DEFAULTS } from "./reference-surface-defaults";

const REFERENCE_VIEW_PRESET = {
  MODELS_AND_CORRECTIONS: "models-and-corrections",
  MESH_AND_TERRAIN: "mesh-and-terrain",
  LONG_HORIZON: "long-horizon",
  ATMOSPHERIC_DEPTH: "atmospheric-depth",
  REFERENCE_SURFACES: "reference-surfaces",
  NORDHELLE_SUNRISE: "nordhelle-sunrise",
  NORDHELLE_SUNSET: "nordhelle-sunset",
} as const;

type ReferenceViewPreset =
  (typeof REFERENCE_VIEW_PRESET)[keyof typeof REFERENCE_VIEW_PRESET];

type ReferenceComparisonStoryArgs = Omit<
  MapLibreThreeReferenceSurfacesOptions,
  | "embedded"
  | "panelLabel"
  | "showDiagnostics"
  | "terrainErrorTargetPixels"
  | "meshErrorTargetPixels"
> & {
  preset: ReferenceViewPreset;
  pixelErrorTarget: MapLibreThreeReferenceSurfacesOptions["terrainErrorTargetPixels"];
};

type ComparisonPanel = Readonly<{
  label: string;
  options: Partial<MapLibreThreeReferenceSurfacesOptions>;
}>;

type ComparisonPreset = Readonly<{
  title: string;
  note: string;
  panels: readonly ComparisonPanel[];
}>;

const corridorOptions: Partial<MapLibreThreeReferenceSurfacesOptions> = {
  showLocalTangentPlane: false,
  showLocalSphere: false,
  showEllipsoid: false,
  showQuasigeoid: false,
  showTerrain: true,
  showMesh2024: false,
  terrainModel: "dom1",
  terrainAppearance: "viridis",
  elevationIsolines: false,
  elevationColorDatum: ELEVATION_COLOR_DATUM.DHHN2016,
  terrainElevationMinimumMeters: 38.95,
  terrainElevationMaximumMeters: 722.3,
  cameraPreset: REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE,
  longitude: 7.20158,
  latitude: 51.25656,
  zoom: 12,
  pitch: 87,
  bearing: 107.1966,
};

const comparisonPresets: Record<ReferenceViewPreset, ComparisonPreset> = {
  [REFERENCE_VIEW_PRESET.MODELS_AND_CORRECTIONS]: {
    title: "Models and geodetic corrections",
    note: "Same overview and fixed colour scale: raw normal heights on the Mercator plane versus H + GCG2016 on WGS84. No atmosphere or mesh obscures this comparison.",
    panels: [
      {
        label: "DOM1 DSM · flat Web Mercator · DHHN2016 · no atmosphere",
        options: {
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.MERCATOR,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.DHHN2016,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
      {
        label: "DOM1 DSM · WGS84 ECEF · ellipsoidal · no atmosphere",
        options: {
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.MESH_AND_TERRAIN]: {
    title: "Raster DSM and 2024 mesh",
    note: "Separate views avoid intersecting surfaces. Mesh imagery makes buildings readable; switch meshAppearance to elevation for the shared height ramp. ECEF coordinates alone do not certify its height datum.",
    panels: [
      { label: "DOM1 · corrected WGS84 · elevation", options: {} },
      {
        label: "MeshX 2024 · local ECEF mount",
        options: {
          showTerrain: false,
          showMesh2024: true,
          meshOpacity: 1,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.LONG_HORIZON]: {
    title: "40.38 km Toelleturm → Nordhelle horizon",
    note: "A 10° vertical field of view exposes the screen-space difference between flat, curved, and datum-corrected terrain.",
    panels: [
      {
        label: "Flat Mercator · DHHN2016",
        options: {
          ...corridorOptions,
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.MERCATOR,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.DHHN2016,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
      {
        label: "WGS84 ECEF · DHHN2016",
        options: {
          ...corridorOptions,
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.DHHN2016,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
      {
        label: "WGS84 ECEF · ellipsoidal · aerial perspective",
        options: {
          ...corridorOptions,
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE,
        },
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.ATMOSPHERIC_DEPTH]: {
    title: "Ellipsoid-referenced atmospheric depth",
    note: "The corrected DOM1 DSM corridor is shown without air, with a 120 km clear-air attenuation length, and as optical depth. This is an analytic single-segment diagnostic, not ray-marched scattering.",
    panels: [
      {
        label: "No atmosphere",
        options: {
          ...corridorOptions,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OFF,
        },
      },
      {
        label: "Aerial perspective",
        options: {
          ...corridorOptions,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE,
        },
      },
      {
        label: "Optical depth · viridis diagnostic",
        options: {
          ...corridorOptions,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.OPTICAL_DEPTH,
        },
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.REFERENCE_SURFACES]: {
    title: "Generated reference surfaces and Nivellement",
    note: "Generated WGS84 ellipsoid and GCG2016 quasigeoid, with Nivellement points. Heights are not exaggerated by default. Controls can isolate a surface; distances are signed same-coordinate separations, not closest-point residuals.",
    panels: [
      {
        label: "Reference surfaces and Nivellement · metres",
        options: {},
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.NORDHELLE_SUNRISE]: {
    title: "Sunrise from Toelleturm toward Nordhelle",
    note: "21 February 2026, 07:40 Europe/Berlin. Corrected DOM1 casts soft shadows along the 40.38 km sightline into the rising sun.",
    panels: [
      {
        label:
          "Toelleturm → Nordhelle · sunrise · corrected DOM1 · soft shadows",
        options: {
          ...corridorOptions,
          terrainAppearance: "basemap",
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE,
          showShadowSimulation: true,
          shadowDayOfYear: 52,
          shadowMinutes: 7 * 60 + 40,
          shadowAreaMeters: 4_000,
        },
      },
    ],
  },
  [REFERENCE_VIEW_PRESET.NORDHELLE_SUNSET]: {
    title: "Wuppertal sunset from covered Nordhelle DOM",
    note: "23 August 2026, 20:27 Europe/Berlin. The camera is 200 m above the covered summit and looks back through the atmosphere into the setting sun.",
    panels: [
      {
        label: "Sunset · corrected DOM1 · soft shadows",
        options: {
          ...corridorOptions,
          terrainAppearance: "basemap",
          terrainGeometryMode: TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
          terrainHeightDatum: TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
          atmosphereMode: REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE,
          cameraPreset: REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM,
          longitude: 7.7545505762,
          latitude: 51.1478994995,
          bearing: 287.6276,
          showShadowSimulation: true,
          shadowDayOfYear: 235,
          shadowMinutes: 20 * 60 + 27,
          shadowAreaMeters: 4_000,
        },
      },
    ],
  },
};

const ReferenceSurfacesComparison = (args: ReferenceComparisonStoryArgs) => {
  const { pixelErrorTarget, preset: _preset, ...sharedOptions } = args;
  const baseOptions: MapLibreThreeReferenceSurfacesOptions = {
    ...sharedOptions,
    terrainErrorTargetPixels: pixelErrorTarget,
    meshErrorTargetPixels: pixelErrorTarget,
  };
  const selected = comparisonPresets[args.preset];

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#101820",
        color: "white",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "7px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.18)",
          background: "#17232e",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{selected.title}</div>
          <div
            style={{
              marginTop: 2,
              color: "#c6d0d8",
              fontSize: 11,
              lineHeight: 1.25,
            }}
          >
            {selected.note} Shared LOD target: {pixelErrorTarget}px.
          </div>
        </div>
      </header>
      <main
        style={{
          display: "grid",
          gridTemplateColumns:
            selected.panels.length === 1
              ? "minmax(0, 1fr)"
              : "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
        }}
      >
        {selected.panels.map((panel) => (
          <div
            key={`${args.preset}:${panel.label}`}
            style={{
              position: "relative",
              minWidth: 0,
              height: "calc(100vh - 68px)",
              minHeight: 480,
              borderRight: "1px solid rgba(255,255,255,0.22)",
            }}
          >
            <MapLibreThreeReferenceSurfacesDemo
              {...baseOptions}
              {...panel.options}
              embedded
              panelLabel={panel.label}
              showDiagnostics
            />
          </div>
        ))}
      </main>
    </div>
  );
};

const meta = {
  title: "Terrain and Atmosphere/Projections/Reference Surfaces",
  id: "maplibre-playground-three-reference-surfaces",
  component: ReferenceSurfacesComparison,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Focused instruments for terrain datums, mesh comparison, generated surfaces, long horizons, atmospheric depth and sun positions. Each sidebar story has its own scope and controls. All use the actual shared terrain/mesh runtimes.",
      },
    },
  },
  args: {
    ...REFERENCE_SURFACE_DEFAULTS,
    preset: REFERENCE_VIEW_PRESET.MODELS_AND_CORRECTIONS,
    pixelErrorTarget: 2,
  },
  argTypes: {
    onMapReady: { control: false, table: { disable: true } },
    meshEncodedHeightDatum: {
      control: "radio",
      options: Object.values(TERRAIN_HEIGHT_DATUM),
      table: { category: "Elevation colour" },
      description:
        "Explicit source-height hypothesis; changes colour interpretation only, not geometry.",
    },
    physicalCamera: { control: false, table: { disable: true } },
    elevationColorDatum: {
      control: "radio",
      options: Object.values(ELEVATION_COLOR_DATUM),
      table: { category: "Elevation colour" },
      description:
        "Independent of geometry. H uses GCG2016; scene-plane intentionally changes when bent.",
    },
    meshAppearance: {
      table: { category: "Mesh and terrain" },
      control: "inline-radio",
      options: ["imagery", "elevation"],
    },
    preset: {
      table: { disable: true },
    },
    pixelErrorTarget: {
      control: "inline-radio",
      options: [0.5, 1, 2, 4, 8, 16],
      description:
        "One screen-space error target shared by the NRW DOM1 DSM and MeshX 2024.",
    },
    longitude: { table: { category: "Camera" } },
    latitude: { table: { category: "Camera" } },
    zoom: { table: { category: "Camera" } },
    pitch: { table: { category: "Camera" } },
    bearing: { table: { category: "Camera" } },
    fovDegrees: { table: { category: "Camera" } },
    cameraPreset: { table: { category: "Camera" } },
    terrainModel: { table: { category: "Mesh and terrain" } },
    terrainAppearance: { table: { category: "Mesh and terrain" } },
    elevationIsolines: {
      control: "boolean",
      description:
        "1 m contours and a continuous 100 m cyclic ramp in elevation-color mode. Subpixel contours fade to avoid aliasing.",
      table: { category: "Elevation colour" },
    },
    terrainGeometryMode: { table: { category: "Mesh and terrain" } },
    terrainHeightDatum: { table: { category: "Mesh and terrain" } },
    showTerrain: { table: { category: "Mesh and terrain" } },
    showMesh2024: { table: { category: "Mesh and terrain" } },
    meshOpacity: { table: { category: "Mesh and terrain" } },
    terrainElevationMinimumMeters: { table: { category: "Elevation colour" } },
    terrainElevationMaximumMeters: { table: { category: "Elevation colour" } },
    showLocalTangentPlane: { table: { category: "Reference surfaces" } },
    showLocalSphere: { table: { category: "Reference surfaces" } },
    showEllipsoid: { table: { category: "Reference surfaces" } },
    showQuasigeoid: { table: { category: "Reference surfaces" } },
    referenceRadiusMeters: { table: { category: "Reference surfaces" } },
    referenceOpacity: { table: { category: "Reference surfaces" } },
    referenceVerticalScale: { table: { category: "Reference surfaces" } },
    referenceVerticalOffsetMeters: {
      table: { category: "Reference surfaces" },
    },
    localSphereRadiusMeters: { table: { category: "Reference surfaces" } },
    showNivellementPoints: { table: { category: "Nivellement validation" } },
    validationSurface: { table: { category: "Nivellement validation" } },
    validationColorLimitMeters: {
      table: { category: "Nivellement validation" },
    },
    nivellementPointSizePixels: {
      table: { category: "Nivellement validation" },
    },
    showShadowSimulation: { table: { category: "Sun and shadows" } },
    shadowDayOfYear: { table: { category: "Sun and shadows" } },
    shadowMinutes: { table: { category: "Sun and shadows" } },
    shadowAreaMeters: { table: { category: "Sun and shadows" } },
    softSunShadows: { table: { category: "Sun and shadows" } },
    autoElevationRange: {
      table: { category: "Elevation colour" },
      control: "boolean",
      description:
        "Clamp the shared viridis ramp to resident source tiles intersecting the current camera frustum.",
    },
    showAngularGuideLines: {
      table: { category: "Debug" },
      control: "boolean",
      description:
        "Overlay an artificial-horizon graticule on every panel, including flat Mercator comparisons.",
    },
    angularGuideSpacingDegrees: {
      table: { category: "Debug" },
      control: "inline-radio",
      options: [1, 2, 5, 10],
      description:
        "Geodetic elevation-angle spacing: 0 degrees is the local tangent horizon, positive above and negative below.",
    },
    atmosphereMode: {
      table: { category: "Atmosphere" },
      control: "select",
      options: Object.values(REFERENCE_ATMOSPHERE_MODE),
    },
    atmosphereVisibilityKilometers: {
      table: { category: "Atmosphere" },
      control: { type: "range", min: 5, max: 200, step: 1 },
      description:
        "Clear-air attenuation length. The 120 km default represents excellent regional viewing conditions, not live weather.",
    },
    atmosphereScaleHeightMeters: {
      table: { category: "Atmosphere" },
      control: { type: "range", min: 4_000, max: 14_000, step: 100 },
    },
    atmosphereObserverEllipsoidalHeightMeters: {
      table: { category: "Atmosphere" },
      control: { type: "range", min: 0, max: 2_000, step: 10 },
      description:
        "Fallback for map-target cameras. Physical corridor presets derive this height from DHHN2016 + GCG2016.",
    },
    atmosphereColor: { table: { category: "Atmosphere" }, control: "color" },
  },
} satisfies Meta<typeof ReferenceSurfacesComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

const viewControls = [
  "pixelErrorTarget",
  "longitude",
  "latitude",
  "zoom",
  "pitch",
  "bearing",
  "fovDegrees",
];
const elevationControls = [
  "autoElevationRange",
  "terrainElevationMinimumMeters",
  "terrainElevationMaximumMeters",
];
const horizonControls = [
  "pixelErrorTarget",
  "fovDegrees",
  "showAngularGuideLines",
  "angularGuideSpacingDegrees",
];
const airControls = [
  "atmosphereVisibilityKilometers",
  "atmosphereScaleHeightMeters",
  "atmosphereColor",
];

export const TerrainDatums: Story = {
  name: "Terrain · datum correction",
  parameters: {
    controls: {
      include: [...viewControls, ...elevationControls, "terrainModel"],
    },
  },
};

export const MeshAndTerrain: Story = {
  name: "Mesh and raster terrain",
  args: {
    preset: REFERENCE_VIEW_PRESET.MESH_AND_TERRAIN,
    zoom: 15.8,
    meshAppearance: "imagery",
  },
  parameters: {
    controls: {
      include: [...viewControls, ...elevationControls, "meshAppearance"],
    },
  },
};

export const ReferenceSurfaces: Story = {
  name: "Reference surfaces and Nivellement",
  args: {
    preset: REFERENCE_VIEW_PRESET.REFERENCE_SURFACES,
    showTerrain: false,
    showEllipsoid: true,
    showQuasigeoid: true,
    showNivellementPoints: true,
    referenceRadiusMeters: 6000,
    zoom: 13.5,
    pitch: 65,
    validationSurface: REFERENCE_SURFACE.QUASIGEOID,
    validationColorLimitMeters: 400,
    nivellementPointSizePixels: 16,
  },
  parameters: {
    controls: {
      include: [
        ...viewControls,
        "showLocalTangentPlane",
        "showLocalSphere",
        "showEllipsoid",
        "showQuasigeoid",
        "referenceRadiusMeters",
        "referenceOpacity",
        "referenceVerticalScale",
        "referenceVerticalOffsetMeters",
        "validationSurface",
        "validationColorLimitMeters",
        "nivellementPointSizePixels",
      ],
    },
  },
};

export const LongHorizon: Story = {
  name: "Horizon · flat versus curved",
  args: {
    preset: REFERENCE_VIEW_PRESET.LONG_HORIZON,
    showAngularGuideLines: true,
    fovDegrees: 10,
  },
  parameters: {
    controls: { include: [...horizonControls, ...elevationControls] },
  },
};

export const AtmosphericDepth: Story = {
  name: "Atmosphere · depth comparison",
  args: {
    preset: REFERENCE_VIEW_PRESET.ATMOSPHERIC_DEPTH,
    showAngularGuideLines: true,
    fovDegrees: 10,
  },
  parameters: { controls: { include: [...horizonControls, ...airControls] } },
};

export const Sunrise: Story = {
  name: "Sunrise · Toelleturm",
  args: {
    preset: REFERENCE_VIEW_PRESET.NORDHELLE_SUNRISE,
    showAngularGuideLines: true,
    fovDegrees: 10,
  },
  parameters: {
    controls: {
      include: [...horizonControls, ...airControls, "softSunShadows"],
    },
  },
};

export const Sunset: Story = {
  name: "Sunset · Nordhelle",
  args: {
    preset: REFERENCE_VIEW_PRESET.NORDHELLE_SUNSET,
    showAngularGuideLines: true,
    fovDegrees: 10,
  },
  parameters: {
    controls: {
      include: [...horizonControls, ...airControls, "softSunShadows"],
    },
  },
};
