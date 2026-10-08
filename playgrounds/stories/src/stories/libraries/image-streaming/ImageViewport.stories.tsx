import type { Meta, StoryObj } from "@storybook/react";
import type { DevicePixels } from "@carma-units";
import {
  ImageStreamCarousel,
  ImageStreamViewer,
  type ImageStreamSource,
} from "@carma-commons/image-streaming";

type Args = {
  sourceUrl: string;
  kind: "avif" | "jpeg";
  nativeWidth: number;
  nativeHeight: number;
  imageIds: string;
  baseUrl: string;
  jpegUrlTemplate: string;
  finestJpegLevel: number;
  poolSize: number;
  visibleCount: number;
  renderer: "canvas" | "three";
  featherPx: number;
  foveation: boolean;
  foveaRadius: number;
  ringTiles: number;
  diagnostics: boolean;
};

const levelsFrom = (finest: number) =>
  [0, 1, 2, 3, 4, 5, 6].filter((level) => level >= finest);
const source = (id: string, url: string, args: Args): ImageStreamSource => ({
  id,
  url: new URL(url, globalThis.window.location.href).href,
  kind: args.kind,
  nativeSize: {
    width: args.nativeWidth as DevicePixels,
    height: args.nativeHeight as DevicePixels,
  },
  jpegLevels:
    args.kind === "jpeg" ? levelsFrom(args.finestJpegLevel) : undefined,
});
const imageSources = (args: Args) =>
  args.imageIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) =>
      source(
        id,
        args.kind === "jpeg"
          ? args.jpegUrlTemplate
              .replace(/\{imageId\}/g, encodeURIComponent(id))
              .replace(/\{level\}/g, String(args.finestJpegLevel))
          : new URL(
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
  diagnostics: args.diagnostics,
});

const meta = {
  title: "Libraries/Image streaming",
  id: "libraries-image-streaming",
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
    sourceUrl: "https://wupp-oblique.cismet.de/2026/avif/RI_31_3112.avif",
    baseUrl: "https://wupp-oblique.cismet.de/2026/avif/",
    imageIds:
      "RI_31_3112,RI_29_3397,LE_28_3586,LE_28_3582,LE_30_3276,RI_29_3398,RI_29_3403,RI_37_2208",
    kind: "avif",
    nativeWidth: 12736,
    nativeHeight: 19136,
    jpegUrlTemplate:
      "https://wupp-oblique.cismet.de/2024/{level}/{imageId}.jpg",
    finestJpegLevel: 1,
    poolSize: 8,
    visibleCount: 4,
    renderer: "canvas",
    featherPx: 0,
    foveation: false,
    foveaRadius: 0.35,
    ringTiles: 1,
    diagnostics: true,
  },
  argTypes: {
    kind: { control: "select", options: ["avif", "jpeg"] },
    sourceUrl: { control: "text" },
    baseUrl: { control: "text" },
    imageIds: { control: "text" },
    jpegUrlTemplate: {
      control: "text",
      description: "JPEG-Ordnerfamilie mit {level} und {imageId}.",
    },
    finestJpegLevel: {
      control: "select",
      options: [0, 1, 2],
      description: "Feinste veröffentlichte JPEG-Stufe.",
    },
    nativeWidth: { control: { type: "number", min: 1 } },
    nativeHeight: { control: { type: "number", min: 1 } },
    poolSize: { control: "select", options: [4, 8] },
    visibleCount: { control: "select", options: [1, 4] },
    renderer: {
      control: "inline-radio",
      options: ["canvas", "three"],
      description:
        "three nutzt denselben GPU-Compositor wie die Oblique-Szene.",
    },
    featherPx: {
      control: { type: "range", min: 0, max: 64, step: 4 },
      description:
        "Kachelkanten ohne geladenen Nachbarn derselben Stufe weich ausblenden (CSS-Pixel); 0 = aus.",
    },
    foveation: {
      control: "boolean",
      description: "Randkacheln der Zielstufe erst nach Pan-Ringen laden.",
    },
    foveaRadius: {
      control: { type: "range", min: 0.1, max: 1, step: 0.05 },
      description:
        "Fovea als Anteil der halben Ausschnittsdiagonale um Zeiger bzw. Mitte.",
    },
    ringTiles: {
      control: { type: "range", min: 0, max: 2, step: 1 },
      description: "Kachelringe für Pans.",
    },
    diagnostics: { control: "boolean" },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

const singleArgs = {
  baseUrl: { table: { disable: true } },
  imageIds: { table: { disable: true } },
  poolSize: { table: { disable: true } },
  visibleCount: { table: { disable: true } },
  jpegUrlTemplate: { table: { disable: true } },
};

export const LargeImage: Story = {
  name: "Large image · AVIF / JPEG",
  argTypes: singleArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Transparenter Stapel dünn besetzter Pyramidenstufen: Zielstufe nie hochskaliert, Elternstufe darunter, gröbere Stufen und ein kleiner Boden für Zoom-out. Ziehen verschiebt, Mausrad zoomt am Zeiger. Die Leiste zeigt je Stufe fehlend/angefragt/lokal/decodiert.",
      },
    },
  },
  render: (args) => (
    <ImageStreamViewer
      source={source("large-image", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const PoolCarousel: Story = {
  name: "Pool carousel · 4–8 images",
  argTypes: { sourceUrl: { table: { disable: true } } },
  parameters: {
    docs: {
      description: {
        story:
          "Gruppenwechsel über einen gemeinsamen Pool. Verlassene Bilder werden auf ein kleines Budget geparkt (Boden zuerst) und ihre Ladearbeit abgebrochen.",
      },
    },
  },
  render: (args) => (
    <ImageStreamCarousel
      sources={imageSources(args)}
      poolSize={args.poolSize}
      visibleCount={args.visibleCount}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const Synthetic16k: Story = {
  ...LargeImage,
  name: "16K · Resolution chart",
  args: {
    sourceUrl: "/streaming-samples/resolution-chart-16k-v1.avif",
    kind: "avif",
    nativeWidth: 16384,
    nativeHeight: 16384,
  },
  render: (args) => (
    <ImageStreamViewer
      source={source("resolution-chart-16k-v1", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const FullResolutionPhoto: Story = {
  ...LargeImage,
  name: "2026 · Full L0, forest and paths",
  args: {
    sourceUrl:
      "https://wupp-oblique.cismet.de/2026/avif-fullres-samples/BW_34_2712-L0-q90-v1.avif",
    kind: "avif",
    nativeWidth: 19136,
    nativeHeight: 12736,
  },
  render: (args) => (
    <ImageStreamViewer
      source={source("BW_34_2712-L0-q90-v1", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const LegacyJpeg2024: Story = {
  name: "2024 · JPEG folder pyramid",
  args: {
    kind: "jpeg",
    sourceUrl: "https://wupp-oblique.cismet.de/2024/1/023_144_170001362.jpg",
    imageIds: "023_144_170001362,050_027_174007398",
    // Published 2024 camera calibrations 170 and 174 both have this sensor size.
    nativeWidth: 14204,
    nativeHeight: 10652,
    finestJpegLevel: 1,
    visibleCount: 1,
  },
  argTypes: {
    kind: { table: { disable: true } },
    sourceUrl: { table: { disable: true } },
    baseUrl: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "2024-Familie mit einem JPEG je Stufe (Ordner 1–6). Jede Stufe wird einmal decodiert und in virtuelle 512er-Kacheln geschnitten, danach gilt dieselbe Stapel-Logik wie bei AVIF.",
      },
    },
  },
  render: (args) => (
    <ImageStreamCarousel
      sources={imageSources(args)}
      poolSize={args.poolSize}
      visibleCount={args.visibleCount}
      fill
      {...viewerOptions(args)}
    />
  ),
};
