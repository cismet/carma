import { lazy, Suspense } from "react";
import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";

import type { QualitySettingsComparisonProps } from "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/QualitySettingsComparison";
import type { BestPracticeTilesProps } from "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/BestPracticeTiles";
import type { FilterDetailMatrixProps } from "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/FilterDetailMatrix";
import type { ObliqueImageQualityComparisonProps } from "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/ObliqueImageQualityComparison";

const BestPracticeTiles = lazy(
  () =>
    import(
      "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/BestPracticeTiles"
    )
);
const FilterDetailMatrix = lazy(
  () =>
    import(
      "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/FilterDetailMatrix"
    )
);
const ObliqueImageQualityComparison = lazy(
  () =>
    import(
      "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/ObliqueImageQualityComparison"
    )
);
const QualitySettingsComparison = lazy(
  () =>
    import(
      "../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/quality-comparison/QualitySettingsComparison"
    )
);
const assetOrigin = `${window.location.protocol}//${window.location.hostname}:4318`;
const motifControl = {
  control: "select" as const,
  options: [
    "water",
    "facade",
    "street-markings",
    "street-junction",
    "street-crossing",
  ],
};

const meta = {
  title: "Oblique/Image fidelity",
  id: "oblique-image-fidelity",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

export const ProductionTiles: StoryObj<BestPracticeTilesProps> = {
  name: "2026 · AVIF L1–L4",
  args: {
    manifestUrl: new URL(
      "/blind-l3-l4/best-practice-tiles.json?attribution=2024-top-left-v2",
      assetOrigin
    ).href,
    motif: "street-junction",
    magnification: 1,
  },
  argTypes: {
    manifestUrl: { control: "text" },
    motif: motifControl,
    magnification: { control: "select", options: [1, 2, 4] },
    onMotifChange: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Freigegebener 2026-Preset: Mitchell B=C⅓, lineares sRGB/HDRI, AVIF 10 Bit 4:4:4. Vier unabhängige Stufen; Beispiele mit eingebrannter Attribution.",
      },
    },
  },
  render: function ProductionTilesStory() {
    const [args, updateArgs] = useArgs<BestPracticeTilesProps>();
    return (
      <Suspense fallback={<p>Beispielkacheln werden geladen …</p>}>
        <BestPracticeTiles
          {...args}
          onMotifChange={(motif) => updateArgs({ motif })}
        />
      </Suspense>
    );
  },
};

export const ChromaAndBitDepth: StoryObj<ObliqueImageQualityComparisonProps> = {
  name: "Chroma und Bit-Tiefe · 2024-Referenzen",
  args: {
    manifestUrl: new URL("/quality-compare/manifest.json", assetOrigin).href,
    qualityTarget: 94,
  },
  argTypes: {
    manifestUrl: { control: "text" },
    qualityTarget: {
      control: { type: "range", min: 70, max: 99, step: 0.5 },
      description:
        "Gemeinsames gemessenes SSIMULACRA2-Ziel in Punkten; jede Zelle wählt ihre kleinste qualifizierte Kodierung.",
    },
    onQualityTargetChange: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Historische 2024-Ausschnitte L0–L4: 8/10 Bit × 4:2:0/4:4:4 bei gleicher gemessener Qualität. Dieser Versuch verwendet nicht den freigegebenen 2026-Verarbeitungspreset.",
      },
    },
  },
  render: function ChromaAndBitDepthStory() {
    const [args, updateArgs] = useArgs<ObliqueImageQualityComparisonProps>();
    return (
      <Suspense fallback={<p>Vergleich wird geladen …</p>}>
        <ObliqueImageQualityComparison
          {...args}
          onQualityTargetChange={(qualityTarget) =>
            updateArgs({ qualityTarget })
          }
        />
      </Suspense>
    );
  },
};

export const ResamplingFilters: StoryObj<FilterDetailMatrixProps> = {
  name: "Filtervergleich · L2–L4",
  args: {
    manifestUrl: new URL(
      "/blind-l3-l4/filter-matrix.json?revision=urban-pure-kernels",
      assetOrigin
    ).href,
    motif: "street-markings",
    level: "L2",
    magnification: 4,
    showContrastMetrics: false,
  },
  argTypes: {
    manifestUrl: { control: "text" },
    motif: motifControl,
    level: { control: "select", options: ["L2", "L3", "L4"] },
    magnification: { control: "select", options: [1, 2, 4, 8] },
    showContrastMetrics: { control: "boolean" },
    onMotifChange: { table: { disable: true } },
    onLevelChange: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Historischer Q16-Filterversuch: Triangle-Mischungen 0–20 % und reine Mitchell/Lanczos-Referenzen. Die Messwerte beschreiben Kontrast/Ringing, keine Ground-Truth-Qualität. Der Produktionspreset bleibt unverändert.",
      },
    },
  },
  render: function ResamplingFiltersStory() {
    const [args, updateArgs] = useArgs<FilterDetailMatrixProps>();
    return (
      <Suspense fallback={<p>Filtermatrix wird geladen …</p>}>
        <FilterDetailMatrix
          {...args}
          onMotifChange={(motif) => updateArgs({ motif })}
          onLevelChange={(level) => updateArgs({ level })}
        />
      </Suspense>
    );
  },
};

export const QualitySettings: StoryObj<QualitySettingsComparisonProps> = {
  name: "2026 · q96 versus neue Qualitätseinstellungen",
  args: {
    manifestUrl: new URL("/blind-l3-l4/quality-exploration.json", assetOrigin)
      .href,
    motif: "facade",
    comparison: "q90",
    magnification: 1,
  },
  argTypes: {
    manifestUrl: { control: "text" },
    motif: {
      control: "select",
      options: ["facade", "road", "ground", "trees", "roof"],
    },
    comparison: { control: "select", options: ["q90", "q80", "q88"] },
    magnification: { control: "select", options: [1, 2, 4, 8] },
    onMotifChange: { table: { disable: true } },
    onComparisonChange: { table: { disable: true } },
    onMagnificationChange: { table: { disable: true } },
  },
  render: function QualitySettingsStory() {
    const [args, updateArgs] = useArgs<QualitySettingsComparisonProps>();
    return (
      <Suspense fallback={<p>Qualitätsvergleich wird geladen …</p>}>
        <QualitySettingsComparison
          {...args}
          onMotifChange={(motif) => updateArgs({ motif })}
          onComparisonChange={(comparison) => updateArgs({ comparison })}
          onMagnificationChange={(magnification) =>
            updateArgs({ magnification })
          }
        />
      </Suspense>
    );
  },
};
