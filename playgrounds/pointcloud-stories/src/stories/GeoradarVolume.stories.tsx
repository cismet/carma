import type { Meta, StoryObj } from "@storybook/react";

import { GeoradarVolumeExplorer } from "../components/GeoradarVolumeExplorer";

const meta = {
  id: "georadar-volume-explorer",
  title: "Georadar / Volumen-Explorer",
  component: GeoradarVolumeExplorer,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Eigenständige WebGPU-Ansicht des strukturierten Georadar-Volumens. Sie zeigt direkte R16-Quellamplituden ohne RMS-Fenster oder räumliche Kernel. Clamp, Farb- und Transparenzrampen sowie die editierbaren Transferkurven beeinflussen ausschließlich die Darstellung; die Quelldaten bleiben unverändert.",
      },
    },
  },
  argTypes: {
    metadataUrl: {
      name: "Volumen-Metadaten",
      control: "text",
      table: { category: "Quelle" },
    },
  },
  args: {
    metadataUrl: "/georadar-volume/capture-026-10m.json",
  },
} satisfies Meta<typeof GeoradarVolumeExplorer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DirectSourceVolume: Story = {
  name: "Direkte Quelldaten",
};
