import type { Meta, StoryObj } from "@storybook/react";
import type { DevicePixels } from "@carma-units";
import {
  ImagePyramidCarousel,
  ImagePyramidViewer,
  type ImagePyramidSource,
} from "@carma-commons/image-pyramid";

type Args = {
  sourceUrl: string;
  nativeWidth: number;
  nativeHeight: number;
  imageIds: string;
  baseUrl: string;
  poolSize: number;
  visibleCount: number;
  renderer: "canvas" | "three";
  featherPx: number;
  foveation: boolean;
  foveaRadius: number;
  ringTiles: number;
  minLevelEdge: number;
  diagnostics: boolean;
};

const source = (id: string, url: string, args: Args): ImagePyramidSource => ({
  id,
  url: new URL(url, globalThis.window.location.href).href,
  kind: "avif",
  nativeSize: {
    width: args.nativeWidth as DevicePixels,
    height: args.nativeHeight as DevicePixels,
  },
});
const imageSources = (args: Args) =>
  args.imageIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) =>
      source(
        id,
        new URL(
          `${encodeURIComponent(id)}.avif`,
          new URL(args.baseUrl, globalThis.window.location.href)
        ).href,
        args
      )
    );
const viewerOptions = (args: Args) => ({
  renderer: args.renderer,
  featherPx: args.featherPx,
  foveaRadius: args.foveation ? args.foveaRadius : null,
  ringTiles: args.ringTiles,
  minLevelEdge: args.minLevelEdge as DevicePixels,
  diagnostics: args.diagnostics,
});
const hidden = { table: { disable: true } };
const singleArgs = {
  baseUrl: hidden,
  imageIds: hidden,
  poolSize: hidden,
  visibleCount: hidden,
};
const LEGEND =
  "L4 liegt unten; vorhandene L3/L2/L1-Kacheln verbessern den Ausschnitt sofort. Die Diagnose zeigt Zielstufe, Residency und Poolbelegung.";

const meta = {
  title: "Libraries/Image pyramid",
  id: "libraries-image-pyramid",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "100%",
          height: "100dvh",
          overflow: "hidden",
          background: "#141a23",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    sourceUrl: "https://wupp-oblique.cismet.de/2026/image/LE_28_3585.avif",
    baseUrl: "https://wupp-oblique.cismet.de/2026/image/",
    imageIds: "LE_28_3585,LE_23_4413",
    nativeWidth: 12736,
    nativeHeight: 19136,
    poolSize: 8,
    visibleCount: 1,
    renderer: "three",
    featherPx: 0,
    foveation: false,
    foveaRadius: 0.35,
    ringTiles: 1,
    minLevelEdge: 512,
    diagnostics: true,
  },
  argTypes: {
    sourceUrl: {
      control: "text",
      description: "Native AVIF-Datei mit vier räumlichen Layern.",
    },
    baseUrl: { control: "text", description: "Gemeinsamer image-Ordner." },
    imageIds: {
      control: "text",
      description: "Kommagetrennte Bild-IDs im gemeinsamen Pool.",
    },
    nativeWidth: {
      control: { type: "number", min: 1 },
      description:
        "Sensorbreite als Layout-Hinweis; eingebettete Kalibrierung bleibt maßgeblich.",
    },
    nativeHeight: { control: { type: "number", min: 1 } },
    poolSize: { control: "select", options: [4, 8] },
    visibleCount: { control: "select", options: [1, 2, 4] },
    renderer: {
      control: "inline-radio",
      options: ["canvas", "three"],
      description:
        "three verwendet denselben GPU-Compositor wie der Oblique-Viewer.",
    },
    featherPx: {
      control: { type: "range", min: 0, max: 64, step: 4 },
      description:
        "Kanten ohne gleichwertigen Nachbarn weich ausblenden, in Ausgabepixeln.",
    },
    foveation: {
      control: "boolean",
      description: "Sichtbare zentrale Kacheln der Zielstufe priorisieren.",
    },
    foveaRadius: {
      control: { type: "range", min: 0.1, max: 1, step: 0.05 },
      if: { arg: "foveation" },
    },
    ringTiles: { control: { type: "range", min: 0, max: 2, step: 1 } },
    minLevelEdge: {
      control: { type: "range", min: 0, max: 1024, step: 64 },
      description:
        "Kleinste genutzte Stufe; die gröbste verbleibende deckt das ganze Bild ab.",
    },
    diagnostics: { control: "boolean" },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Native2026: Story = {
  name: "Native AVIF · 2026",
  argTypes: singleArgs,
  parameters: {
    docs: {
      description: {
        story: `Eine native Datei, erster L4-Prefix aus einem GET, weitere Layer und Ausschnitte über Range-Anfragen. Ziehen und Zoomen fragen nur benötigte Bereiche an. ${LEGEND}`,
      },
    },
  },
  render: (args) => (
    <ImagePyramidViewer
      source={source("native-2026", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const Native2024: Story = {
  ...Native2026,
  name: "Native AVIF · 2024",
  args: {
    sourceUrl:
      "https://wupp-oblique.cismet.de/2024/image/040_173_171005076.avif",
    nativeWidth: 10652,
    nativeHeight: 14204,
  },
  parameters: {
    docs: {
      description: {
        story: `Dasselbe native Dateiformat und derselbe Viewer wie2026, mit anderer Sensorgröße. Die alten2024JPEG-Dateien gehören weiterhin dem separaten Cesium-Pfad. ${LEGEND}`,
      },
    },
  },
};

export const SharedPool: Story = {
  name: "Native AVIF · shared pool",
  argTypes: { sourceUrl: hidden },
  parameters: {
    docs: {
      description: {
        story: `Bilder teilen den vorhandenen Range-/Kachelpool; nur Ausgabeziele gehören dem jeweiligen Viewer. Geparkte große Stufen werden vor groben Vorschauen freigegeben. ${LEGEND}`,
      },
    },
  },
  render: (args) => (
    <ImagePyramidCarousel
      sources={imageSources(args)}
      poolSize={args.poolSize}
      visibleCount={args.visibleCount}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const NativeFixture: Story = {
  ...Native2026,
  name: "Native AVIF · local synthetic fixture",
  args: {
    sourceUrl: "/streaming-samples/native-four-two-cells.avif",
    nativeWidth: 1024,
    nativeHeight: 512,
    minLevelEdge: 0,
  },
  parameters: {
    docs: {
      description: {
        story: `Kleine lokale synthetische Datei mit zwei Zellen und vier echten AV1-Layern. Gleicher Parser und Compositor ohne entfernte Bildquelle; keine geographische Kalibrierung. ${LEGEND}`,
      },
    },
  },
};
