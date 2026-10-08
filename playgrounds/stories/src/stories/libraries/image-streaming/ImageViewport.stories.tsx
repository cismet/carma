import type { Meta, StoryObj } from "@storybook/react";
import type { DevicePixels } from "@carma-units";
import {
  ImageViewportViewer,
  ImageViewportCarousel,
  type ImageViewportSource,
  type JpegPyramidLevel,
} from "@carma-commons/image-streaming";

type Args = {
  sourceUrl: string;
  kind: "avif" | "jpeg";
  nativeWidth: number;
  nativeHeight: number;
  zoom: number;
  imageIds: string;
  baseUrl: string;
  poolSize: number;
  visibleCount: number;
  maxSourceDensity: number;
  minimumQualityLevel: JpegPyramidLevel;
  jpegUrlTemplate: string;
};
const source = (id: string, url: string, args: Args): ImageViewportSource => ({
  id,
  url: new URL(url, globalThis.window.location.href).href,
  kind: args.kind,
  nativeSize: {
    width: args.nativeWidth as DevicePixels,
    height: args.nativeHeight as DevicePixels,
  },
  maxSourceDensity: args.maxSourceDensity,
  minimumQualityLevel: args.minimumQualityLevel,
});
const jpegFamilyUrl = (id: string, args: Args) =>
  args.jpegUrlTemplate
    .replace(/\{imageId\}/g, encodeURIComponent(id))
    .replace(/\{level\}/g, args.minimumQualityLevel);
const imageSources = (args: Args) =>
  args.imageIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) =>
      source(
        id,
        args.kind === "jpeg"
          ? jpegFamilyUrl(id, args)
          : new URL(
              `${encodeURIComponent(id)}.avif`,
              new URL(args.baseUrl, globalThis.window.location.href)
            ).href,
        args
      )
    );
const meta = {
  title: "Libraries/Image streaming",
  id: "libraries-image-streaming",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#141a23" }}>
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
    zoom: 1,
    poolSize: 8,
    visibleCount: 4,
    maxSourceDensity: 0.5,
    minimumQualityLevel: "1",
    jpegUrlTemplate:
      "https://wupp-oblique.cismet.de/2024/{level}/{imageId}.jpg",
  },
  argTypes: {
    kind: { control: "select", options: ["avif", "jpeg"] },
    sourceUrl: { control: "text" },
    baseUrl: { control: "text" },
    imageIds: { control: "text" },
    jpegUrlTemplate: {
      control: "text",
      description:
        "JPEG-Ordnerfamilie mit {level} und {imageId}; IDs bleiben unverändert.",
    },
    minimumQualityLevel: {
      control: "select",
      options: ["0", "1", "2", "3", "4", "5", "6"],
      description:
        "Feinste veröffentlichte Stufe relativ zu den nativen L0-Maßen.",
    },
    nativeWidth: { control: { type: "number", min: 1 } },
    nativeHeight: { control: { type: "number", min: 1 } },
    maxSourceDensity: {
      control: "select",
      options: [0.5, 1],
      description: "Public L1 / full-resolution native image",
    },
    zoom: {
      control: { type: "range", min: 0.25, max: 16, step: 0.25 },
      description: "Vorgabe relativ zu Einpassen; den aktuellen Zoom zeigt der Viewer.",
    },
    poolSize: { control: "select", options: [4, 8] },
    visibleCount: { control: "select", options: [1, 4] },
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const LargeImage: Story = {
  name: "Large image · AVIF / JPEG",
  argTypes: {
    baseUrl: { table: { disable: true } },
    imageIds: { table: { disable: true } },
    poolSize: { table: { disable: true } },
    visibleCount: { table: { disable: true } },
    jpegUrlTemplate: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Echter Produktions-Worker, direkte AVIF-Range-Abfragen und optionaler JPEG-Fallback. Ziehen verschiebt, Mausrad zoomt. Weißer Rahmen: angeforderter Ausschnitt; grün: geladener Ausschnitt. Bei JPEG die Quellmaße passend zur Bildfamilie setzen. Kein Mesh und kein Katalog erforderlich.",
      },
    },
  },
  render: (args) => (
    <ImageViewportViewer
      source={source("large-image", args.sourceUrl, args)}
      zoom={args.zoom}
      fill
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
          "Vier gleichzeitige Bildansichten oder ein Karussell mit einem gemeinsamen Pool. Beim Gruppenwechsel bleiben die letzten Ausschnitte und begrenzte Worker-Caches verfügbar; Leerlauf-Downloads der verlassenen Bilder werden abgebrochen. Die Speicherbilanz zählt verwaltete RGBA-Flächen; zusätzliche Browser-/Decoder-Allokationen sind unbekannt.",
      },
    },
  },
  render: (args) => (
    <ImageViewportCarousel
      sources={imageSources(args)}
      poolSize={args.poolSize}
      visibleCount={args.visibleCount}
      fill
      zoom={args.zoom}
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
    minimumQualityLevel: "0",
    maxSourceDensity: 1,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Synthetische 16384 × 16384 Auflösungskarte als eine gekachelte AVIF-Datei mit L0–L8, 10 Bit und 4:4:4. Feine Raster, Linien und Frequenzmuster zeigen Sampling und Tile-Nähte ohne photogrammetrische oder JPEG-Quellartefakte. Bild und Metadaten liegen im öffentlichen Streaming-Samples-Verzeichnis; der Viewer benötigt keine Mapping-Engine oder Kataloge.",
      },
    },
  },
  render: (args) => (
    <ImageViewportViewer
      source={source("resolution-chart-16k-v1", args.sourceUrl, args)}
      zoom={args.zoom}
      fill
    />
  ),
};

export const FullResolutionPhoto: Story = {
  ...LargeImage,
  name: "2026 · Full L0, forest and paths",
  args: {
    sourceUrl: "https://wupp-oblique.cismet.de/2026/avif-fullres-samples/BW_34_2712-L0-q90-v1.avif",
    kind: "avif",
    nativeWidth: 19136,
    nativeHeight: 12736,
    minimumQualityLevel: "0",
    maxSourceDensity: 1,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Vollständige 2026-Aufnahme BW_34_2712 mit 19136 × 12736 nativen Pixeln: Wald, Wiesen und befestigte Parkwege. L0 wurde in q90, 10 Bit und 4:4:4 mit 512-Pixel-Zellen ergänzt; die vorhandenen L1–L8-AVIF-Stufen wurden bytegleich übernommen. Eine Datei im separaten avif-fullres-samples-Ordner, vollständig unabhängig von der Produktionsdatei. Vollbild und Details wurden auf Häuser/Gärten und identifizierbare Gesichtsdetails geprüft; einzelne entfernte Spaziergänger sind sichtbar. Keine Farbkorrektur oder L0-Nachschärfung; Wuppertal-Attribution wie bei den unteren Stufen.",
      },
    },
  },
  render: (args) => (
    <ImageViewportViewer
      source={source("BW_34_2712-L0-q90-v1", args.sourceUrl, args)}
      zoom={args.zoom}
      fill
    />
  ),
};

export const LegacyJpeg2024: Story = {
  name: "2024 · JPEG folder pyramid",
  args: {
    kind: "jpeg",
    sourceUrl:
      "https://wupp-oblique.cismet.de/2024/1/023_144_170001362.jpg",
    baseUrl: "https://wupp-oblique.cismet.de/2024/",
    imageIds: "023_144_170001362,050_027_174007398",
    // Published 2024 camera calibrations 170 and 174 both have this sensor size.
    nativeWidth: 14204,
    nativeHeight: 10652,
    minimumQualityLevel: "1",
    maxSourceDensity: 0.5,
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
          "Die veröffentlichte 2024-Familie enthält unabhängig codierte JPGs in den Ordnern 1–6. Der gemeinsame Streaming-Worker beginnt mit einer zur physischen Anzeige passenden Stufe und wechselt beim Zoom automatisch zur nächsten benötigten Stufe, höchstens bis zum öffentlichen L1. Das ist keine progressive JPEG-Codestream-Pyramide. Native L0-Kameramaße: 14204 × 10652; L1: 7102 × 5326. Die rohen Bild-IDs werden als undurchsichtige IDs übernommen. JPEG-URL-Vorlage und IDs können für andere gleich große Kamerafamilien angepasst werden; Hochformatkameras benötigen ihre eigenen Quellmaße. Quelle: veröffentlichte Serienkonfiguration und bestehende 2024-Bildfamilie.",
      },
    },
  },
  render: (args) => (
    <ImageViewportCarousel
      sources={imageSources(args)}
      poolSize={args.poolSize}
      visibleCount={args.visibleCount}
      fill
      zoom={args.zoom}
    />
  ),
};
