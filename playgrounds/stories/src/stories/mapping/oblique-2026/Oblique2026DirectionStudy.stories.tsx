import type { Meta, StoryObj } from "@storybook/react";

import {
  OBLIQUE_2026_DEFAULTS,
  Oblique2026DirectionStudy,
} from "./Oblique2026DirectionStudy";

const meta: Meta<typeof Oblique2026DirectionStudy> = {
  title: "Mapping/Oblique/2026 direction reference",
  component: Oblique2026DirectionStudy,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Real Wuppertal 2026 native image tiles with the production 3-degree near-orthographic camera, LoD2 and Three.js terrain on MapLibre. Image tiles stack independently; scene draping is optional. The production viewer computes the series/cardinal mean; Controls compare photo heading plus active camera pitch against that mean, with an optional pitch override.",
      },
    },
  },
  argTypes: {
    preferredImageSeriesDirection: {
      control: "boolean",
      name: "Use series + cardinal mean",
      description:
        "Off uses each photo's heading with the active map-camera pitch; on uses the production series/cardinal mean heading and pitch.",
    },
    pitchOverrideEnabled: {
      control: "boolean",
      name: "Override mean pitch",
    },
    preferredImagePitchDeg: {
      control: { type: "range", min: 0, max: 90, step: 0.5 },
      name: "Preferred pitch (degrees from nadir)",
      if: { arg: "pitchOverrideEnabled", truthy: true },
    },
    drapeImages: {
      control: "boolean",
      name: "Drape photos on terrain/buildings",
    },
    tileOrder: {
      control: {
        type: "radio",
        labels: {
          scanline: "Top left to bottom right",
          "center-out": "Viewport centre outward",
        },
      },
      options: ["scanline", "center-out"],
      name: "Image tile stacking order",
      if: { arg: "drapeImages", truthy: false },
    },
    showAxisDebug: {
      control: "boolean",
      name: "Show bounded axis diagnostics",
    },
  },
  args: OBLIQUE_2026_DEFAULTS,
};

export default meta;
type Story = StoryObj<typeof Oblique2026DirectionStudy>;

export const ReferenceVsSeriesMean: Story = {
  name: "Original reference vs series mean",
};
