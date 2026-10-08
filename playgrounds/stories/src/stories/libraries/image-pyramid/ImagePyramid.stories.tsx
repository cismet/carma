import type { Meta, StoryObj } from "@storybook/react";
import type { DevicePixels } from "@carma-units";
import {
  ImagePyramidCarousel,
  ImagePyramidViewer,
  type ImagePyramidSource,
} from "@carma-commons/image-pyramid";

type Args = {
  kind: "avif" | "jpeg";
  sourceUrl: string;
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
  minLevelEdge: number;
  diagnostics: boolean;
};

const levelsFrom = (finest: number) =>
  [0, 1, 2, 3, 4, 5, 6].filter((level) => level >= finest);
const source = (id: string, url: string, args: Args): ImagePyramidSource => ({
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
  minLevelEdge: args.minLevelEdge as DevicePixels,
  diagnostics: args.diagnostics,
});
const hidden = { table: { disable: true } };
const singleImageArgs = {
  baseUrl: hidden,
  imageIds: hidden,
  poolSize: hidden,
  visibleCount: hidden,
  jpegUrlTemplate: hidden,
  finestJpegLevel: hidden,
};
const carouselArgs = { sourceUrl: hidden };
const avifArgs = { jpegUrlTemplate: hidden, finestJpegLevel: hidden };
const LEGEND =
  "Die Leiste zeigt je genutzter Stufe fehlend/angefragt/lokal/decodiert; der weiße Rahmen ist der Ausschnitt.";

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
    kind: "avif",
    sourceUrl: "https://wupp-oblique.cismet.de/2026/avif/RI_31_3112.avif",
    baseUrl: "https://wupp-oblique.cismet.de/2026/avif/",
    imageIds:
      "RI_31_3112,RI_29_3397,LE_28_3586,LE_28_3582,LE_30_3276,RI_29_3398,RI_29_3403,RI_37_2208",
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
    minLevelEdge: 512,
    diagnostics: true,
  },
  argTypes: {
    kind: hidden,
    sourceUrl: { control: "text", description: "URL des Einzelbilds." },
    baseUrl: { control: "text", description: "Ordner der AVIF-Pyramiden." },
    imageIds: {
      control: "text",
      description: "Kommagetrennte Bild-IDs, in Gruppen gezeigt.",
    },
    jpegUrlTemplate: {
      control: "text",
      description: "JPEG-Stufenfamilie mit {level} und {imageId}.",
    },
    finestJpegLevel: {
      control: "select",
      options: [0, 1, 2],
      description: "Feinste veröffentlichte JPEG-Stufe.",
    },
    nativeWidth: {
      control: { type: "number", min: 1 },
      description:
        "Native Größe als Layout-Hinweis, bis der Index geladen ist.",
    },
    nativeHeight: { control: { type: "number", min: 1 } },
    poolSize: {
      control: "select",
      options: [4, 8],
      description: "Bilder im gemeinsamen Pool, geparkte eingeschlossen.",
    },
    visibleCount: {
      control: "select",
      options: [1, 2, 4],
      description: "Gleichzeitig sichtbare Bilder je Gruppe.",
    },
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
      description: "Randkacheln der Zielstufe erst nach den Pan-Ringen laden.",
    },
    foveaRadius: {
      control: { type: "range", min: 0.1, max: 1, step: 0.05 },
      description:
        "Fovea als Anteil der halben Ausschnittsdiagonale um Zeiger bzw. Mitte.",
      if: { arg: "foveation" },
    },
    ringTiles: {
      control: { type: "range", min: 0, max: 2, step: 1 },
      description: "Kachelringe um den Ausschnitt für Pans.",
    },
    minLevelEdge: {
      control: { type: "range", min: 0, max: 1024, step: 64 },
      description:
        "Stufen mit kürzerer Langkante werden weder geladen noch gezeigt; die gröbste verbleibende ist der Boden. 512 = eine Kachel, 0 = alle Stufen.",
    },
    diagnostics: {
      control: "boolean",
      description: "Leiste mit dem Kachelzustand je genutzter Stufe.",
    },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const SingleImage: Story = {
  name: "Single image · 2026 AVIF",
  argTypes: singleImageArgs,
  parameters: {
    docs: {
      description: {
        story: `Transparenter Stapel dünn besetzter Pyramidenstufen: Die Zielstufe wird nie hochskaliert, die Elternstufe liegt darunter, gröbere Stufen decken Zoom-out ab, und die gröbste genutzte Stufe ist als Boden ganz geladen. Ziehen verschiebt, das Mausrad zoomt am Zeiger. ${LEGEND}`,
      },
    },
  },
  render: (args) => (
    <ImagePyramidViewer
      source={source("single-image", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const PoolCarousel: Story = {
  name: "Pool carousel · 2026 AVIF",
  argTypes: { ...carouselArgs, ...avifArgs },
  parameters: {
    docs: {
      description: {
        story: `Gruppenwechsel über einen gemeinsamen Pool. Verlassene Bilder werden auf ein kleines Budget geparkt, der Boden zuerst, und ihre Downloads abgebrochen; Zurückblättern zeigt sie sofort. ${LEGEND}`,
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

export const ResolutionChart16k: Story = {
  ...SingleImage,
  name: "Resolution chart · 16K",
  args: {
    sourceUrl: "/streaming-samples/resolution-chart-16k-v1.avif",
    nativeWidth: 16384,
    nativeHeight: 16384,
  },
  parameters: {
    docs: {
      description: {
        story: `Synthetisches Testbild mit 16384 × 16384 Pixeln und Stufen bis L0. Zeigt Stufenwechsel und Kachelkanten ohne Bildinhalt, der sie verdeckt. ${LEGEND}`,
      },
    },
  },
  render: (args) => (
    <ImagePyramidViewer
      source={source("resolution-chart-16k-v1", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const FullResolution2026: Story = {
  ...SingleImage,
  name: "Full resolution L0 · 2026 AVIF",
  args: {
    sourceUrl:
      "https://wupp-oblique.cismet.de/2026/avif-fullres-samples/BW_34_2712-L0-q90-v1.avif",
    nativeWidth: 19136,
    nativeHeight: 12736,
  },
  parameters: {
    docs: {
      description: {
        story: `2026-Musterbild mit voller Auflösung L0 (19136 × 12736), Wald und Wege. ${LEGEND}`,
      },
    },
  },
  render: (args) => (
    <ImagePyramidViewer
      source={source("BW_34_2712-L0-q90-v1", args.sourceUrl, args)}
      fill
      {...viewerOptions(args)}
    />
  ),
};

export const JpegLevels2024: Story = {
  name: "JPEG level family · 2024",
  args: {
    kind: "jpeg",
    imageIds: "023_144_170001362,050_027_174007398",
    // Published 2024 camera calibrations 170 and 174 both have this sensor size.
    nativeWidth: 14204,
    nativeHeight: 10652,
    finestJpegLevel: 1,
    visibleCount: 1,
  },
  argTypes: { ...carouselArgs, baseUrl: hidden },
  parameters: {
    docs: {
      description: {
        story: `2024-Familie mit einem JPEG je Stufe (Ordner 1–6). Jede Stufe wird einmal decodiert und in virtuelle 512er-Kacheln geschnitten, danach gilt dieselbe Stapel-Logik wie bei AVIF. ${LEGEND}`,
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
