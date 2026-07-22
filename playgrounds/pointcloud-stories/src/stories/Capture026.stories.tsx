import type { Meta, StoryObj } from "@storybook/react";

import {
  CAPTURE_026_CAMERA_PROJECTIONS,
  CAPTURE_026_GEORADAR_RENDER_MODES,
  CAPTURE_026_PANORAMA_BLEND_MODES,
  CAPTURE_026_PLANAR3_MODES,
  CAPTURE_026_SURFACE_ELEVATION_SOURCES,
  Capture026CollocatedScene,
  GEORADAR_DEFAULT_RENDER_DISTANCE_METERS,
  GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS,
  GEORADAR_MINIMUM_RENDER_DISTANCE_METERS,
  IMAGE_DISPLAY_DEFAULT_CONTRAST,
  IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
  IMAGE_DISPLAY_DEFAULT_SATURATION,
  IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT,
  MESH_APPEARANCE_MODES,
  MESH_DEFAULT_ELEVATION_COLOR_RAMP,
  MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
  MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
  MESH_ELEVATION_COLOR_RAMPS,
  MESH_ELEVATION_RANGE_MAXIMUM_METERS,
  MESH_ELEVATION_RANGE_MINIMUM_METERS,
  TRAJECTORY_ALIGNMENT_MODES,
} from "../components/Capture026CollocatedScene";

const meta = {
  id: "multimodale-strasseninspektion",
  title: "Multimodale Straßeninspektion",
  component: Capture026CollocatedScene,
  parameters: {
    controls: { sort: "none" },
    docs: {
      description: {
        component:
          "Georeferenzierte Three.js/WebGPU-Szene mit allen 27 Georadar-Läufen, allen 1.271 Panoramen, Mesh 2024, orientierten Planarbildern und den amtlichen Höhenfestpunkten entlang der Befahrung. Die komplette Szene läuft in ETRS89-Ellipsoidhöhen; DHHN2016-Quellen werden räumlich variabel mit GCG2016 umgerechnet und bleiben für Kontrolle und Export erhalten. Ein gemeinsamer räumlicher Graph erhält die Reihenfolge innerhalb jeder Befahrung und ergänzt mögliche Übergänge zwischen verschiedenen Läufen bis maximal 20 m. An Kreuzungen erscheinen dadurch mehrere Panorama-Ziele; beim Wechsel der Straße oder Spur wird der Straßenname angezeigt. Radar- und Bilddaten werden sichtbarkeits- und auflösungsabhängig geladen. Ein Klick auf ein Radarlabel wechselt den aktiven Lauf. Kamera, aktives Panorama und aktiver Radar-Lauf werden in der URL gehalten. Die Oberflächenkorrektur kann zwischen DSM 2024 und DGM 2020 wechseln. Mesh 2024 verfeinert progressiv bis zum gewählten Screenfehler und rendert die Szene nur bei Änderungen.",
      },
    },
  },
  argTypes: {
    radarSegmentCount: {
      control: false,
      table: { disable: true },
    },
    georadarRenderDistance: {
      name: "Renderdistanz · m",
      table: { category: "Georadar" },
      control: {
        type: "range",
        min: GEORADAR_MINIMUM_RENDER_DISTANCE_METERS,
        max: GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS,
        step: 10,
      },
    },
    showGeoradar: {
      name: "Georadar anzeigen",
      table: { category: "Georadar" },
    },
    georadarRenderMode: {
      name: "Georadar-Renderer",
      table: { category: "Georadar" },
      control: {
        type: "select",
        labels: {
          volume: "Volumen · Z-Zellen komponiert",
          cutaway: "Schnittflächen · Diagnose",
        },
      },
      options: CAPTURE_026_GEORADAR_RENDER_MODES,
    },
    georadarDepthInverted: {
      name: "Georadar-Z invertieren",
      table: { category: "Georadar" },
    },
    surfaceElevationSource: {
      name: "Höhenquelle",
      table: { category: "Georadar" },
      control: {
        type: "select",
        labels: {
          "dsm-2024": "DSM 2024 · 1 m (Oberfläche)",
          "dgm-2020": "DGM 2020 (Gelände)",
        },
      },
      options: CAPTURE_026_SURFACE_ELEVATION_SOURCES,
    },
    alignmentMode: {
      name: "Ausrichtung",
      table: { category: "Georadar" },
      control: {
        type: "inline-radio",
        labels: {
          straight: "gerade",
          surface: "Oberfläche",
          "surface-curve": "Oberfläche + Kurve",
        },
      },
      options: TRAJECTORY_ALIGNMENT_MODES,
    },
    trajectoryOffsetForward: {
      name: "Radar-Offset · Vorwärts entlang Spine m",
      control: { type: "range", min: -10, max: 10, step: 0.05 },
      table: { category: "Georadar" },
    },
    trajectoryOffsetDown: {
      name: "Radar-Offset · Abwärts m",
      control: { type: "range", min: -10, max: 10, step: 0.05 },
      table: { category: "Georadar" },
    },
    trajectoryOffsetRight: {
      name: "Radar-Offset · Rechts zur Spine m",
      control: { type: "range", min: -10, max: 10, step: 0.05 },
      table: { category: "Georadar" },
    },
    showMesh2024: {
      name: "Mesh anzeigen",
      table: { category: "Mesh 2024" },
    },
    showNivPoints: {
      name: "Höhenfestpunkte anzeigen",
      table: { category: "Referenz" },
    },
    meshAppearance: {
      name: "Mesh-Darstellung",
      control: {
        type: "inline-radio",
        labels: { textured: "Textur", clay: "Clay", elevation: "Höhe" },
      },
      options: MESH_APPEARANCE_MODES,
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    meshOpacity: {
      name: "Mesh-Deckkraft",
      control: { type: "range", min: 0, max: 1, step: 0.02 },
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    meshSaturation: {
      name: "Mesh-Farbsättigung",
      control: { type: "range", min: 0, max: 1, step: 0.02 },
      if: { arg: "meshAppearance", eq: "textured" },
      table: { category: "Mesh 2024" },
    },
    meshContrast: {
      name: "Mesh-Kontrast",
      control: { type: "range", min: 0, max: 2, step: 0.02 },
      if: { arg: "meshAppearance", eq: "textured" },
      table: { category: "Mesh 2024" },
    },
    meshElevationColorRamp: {
      name: "Höhen-Farbskala",
      control: { type: "select" },
      options: MESH_ELEVATION_COLOR_RAMPS,
      if: { arg: "meshAppearance", eq: "elevation" },
      table: { category: "Mesh 2024" },
    },
    meshElevationMinimum: {
      name: "Höhenbereich · Von m",
      control: {
        type: "range",
        min: MESH_ELEVATION_RANGE_MINIMUM_METERS,
        max: MESH_ELEVATION_RANGE_MAXIMUM_METERS,
        step: 0.1,
      },
      if: { arg: "meshAppearance", eq: "elevation" },
      table: { category: "Mesh 2024" },
    },
    meshElevationMaximum: {
      name: "Höhenbereich · Bis m",
      control: {
        type: "range",
        min: MESH_ELEVATION_RANGE_MINIMUM_METERS,
        max: MESH_ELEVATION_RANGE_MAXIMUM_METERS,
        step: 0.1,
      },
      if: { arg: "meshAppearance", eq: "elevation" },
      table: { category: "Mesh 2024" },
    },
    meshErrorTarget: {
      name: "Mesh-Qualität · Ziel-Screenfehler px",
      control: { type: "range", min: 0.05, max: 16, step: 0.05 },
      if: { arg: "showMesh2024" },
      table: {
        category: "Mesh 2024",
        type: {
          summary: "0,05–16 px",
          detail: "Kleinere Werte laden mehr Detail; Standard ist 0,50 px.",
        },
      },
    },
    meshCenterQualityBoost: {
      name: "Mesh-Qualität · Zentrum maximal verfeinern",
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    meshDebug: {
      name: "Loader-/Performance-Debug",
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    meshWireframe: {
      name: "Wireframe",
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    meshTileBounds: {
      name: "Tile-Bounding-Boxen",
      if: { arg: "showMesh2024" },
      table: { category: "Mesh 2024" },
    },
    cameraProjection: {
      name: "Kameraprojektion",
      table: { category: "Kamera" },
      control: {
        type: "inline-radio",
        labels: {
          perspective: "perspektivisch",
          orthographic: "orthografisch",
        },
      },
      options: CAPTURE_026_CAMERA_PROJECTIONS,
    },
    showPanoramas: {
      name: "Panoramen",
      table: { category: "Panoramen & Bilder" },
    },
    panoramaOpacity: {
      name: "Panorama-Deckkraft",
      control: { type: "range", min: 0, max: 1, step: 0.02 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaSaturation: {
      name: "Panorama-Sättigung · 0 = Grau",
      control: { type: "range", min: 0, max: 1, step: 0.02 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaContrast: {
      name: "Panorama-Kontrast",
      control: { type: "range", min: 0, max: 2, step: 0.02 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    imageEdgeEnhancement: {
      name: "Kantenfilter · Bilder + Mesh",
      control: {
        type: "range",
        min: 0,
        max: IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT,
        step: 0.02,
      },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaBlendMode: {
      name: "Panorama-Überblendung",
      control: {
        type: "select",
        labels: {
          "panorama-only": "nur Panorama",
          alpha: "Normal · Alpha",
          multiply: "Multiplizieren · Mesh sichtbar",
          screen: "Negativ multiplizieren · Mesh sichtbar",
          difference: "Differenz · Mesh − Panorama",
          additive: "Additiv · Mesh sichtbar",
          subtractive: "Subtraktiv · Mesh sichtbar",
        },
      },
      options: CAPTURE_026_PANORAMA_BLEND_MODES,
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaOffsetForward: {
      name: "Panorama-Offset · Vorwärts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaOffsetDown: {
      name: "Panorama-Offset · Abwärts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaOffsetRight: {
      name: "Panorama-Offset · Rechts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaBearingOffset: {
      name: "Panorama-Ausrichtung · Bearing °",
      control: { type: "range", min: -8, max: 8, step: 0.1 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaPitchOffset: {
      name: "Panorama-Ausrichtung · Pitch °",
      control: { type: "range", min: -8, max: 8, step: 0.1 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    panoramaRollOffset: {
      name: "Panorama-Ausrichtung · Roll °",
      control: { type: "range", min: -8, max: 8, step: 0.1 },
      if: { arg: "showPanoramas" },
      table: { category: "Panoramen & Bilder" },
    },
    planar3Mode: {
      name: "Planar 3",
      control: {
        type: "select",
        labels: {
          "mesh-projection": "auf Mesh 2024 projiziert",
          "camera-plane": "gelieferte Kameraebene",
          both: "Projektion + Kameraebene",
          hidden: "aus",
        },
      },
      options: CAPTURE_026_PLANAR3_MODES,
      table: { category: "Panoramen & Bilder" },
    },
    planar3OffsetForward: {
      name: "Planar 3 · Vorwärts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "planar3Mode", neq: "hidden" },
      table: { category: "Panoramen & Bilder" },
    },
    planar3OffsetUp: {
      name: "Planar 3 · Aufwärts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "planar3Mode", neq: "hidden" },
      table: { category: "Panoramen & Bilder" },
    },
    planar3OffsetRight: {
      name: "Planar 3 · Rechts m",
      control: { type: "range", min: -5, max: 5, step: 0.05 },
      if: { arg: "planar3Mode", neq: "hidden" },
      table: { category: "Panoramen & Bilder" },
    },
    showPlanar2: {
      name: "Planar 2",
      table: { category: "Panoramen & Bilder" },
    },
    manifestUrl: { table: { disable: true } },
  },
  args: {
    showGeoradar: true,
    georadarRenderDistance: GEORADAR_DEFAULT_RENDER_DISTANCE_METERS,
    georadarRenderMode: "volume",
    georadarDepthInverted: false,
    surfaceElevationSource: "dgm-2020",
    alignmentMode: "surface-curve",
    trajectoryOffsetForward: 0,
    trajectoryOffsetDown: 0,
    trajectoryOffsetRight: 0,
    showMesh2024: true,
    showNivPoints: true,
    meshAppearance: "textured",
    meshOpacity: 1,
    meshSaturation: 1,
    meshContrast: 1,
    meshElevationColorRamp: MESH_DEFAULT_ELEVATION_COLOR_RAMP,
    meshElevationMinimum: MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
    meshElevationMaximum: MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
    meshErrorTarget: 0.5,
    meshCenterQualityBoost: false,
    meshDebug: false,
    meshWireframe: false,
    meshTileBounds: false,
    cameraProjection: "perspective",
    showPanoramas: true,
    panoramaOpacity: 1,
    panoramaSaturation: IMAGE_DISPLAY_DEFAULT_SATURATION,
    panoramaContrast: IMAGE_DISPLAY_DEFAULT_CONTRAST,
    imageEdgeEnhancement: IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
    panoramaBlendMode: "alpha",
    panoramaOffsetForward: 0,
    panoramaOffsetDown: 0,
    panoramaOffsetRight: 0,
    panoramaBearingOffset: 0,
    panoramaPitchOffset: 0,
    panoramaRollOffset: 0,
    planar3Mode: "hidden",
    planar3OffsetForward: 0,
    planar3OffsetUp: 0,
    planar3OffsetRight: 0,
    showPlanar2: false,
  },
} satisfies Meta<typeof Capture026CollocatedScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GeoradarUndOrientierteBilder: Story = {
  name: "Georadar, Mesh und orientierte Bilder",
};
