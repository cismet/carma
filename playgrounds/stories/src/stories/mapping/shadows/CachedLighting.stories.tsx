import type { Meta, StoryObj } from "@storybook/react";
import { SunShadowDemo, SUN_SHADOW_STORY_DEFAULTS } from "./SunShadowDemo";

// Retain the dev experiment and URL without presenting it as an addon mode.
const meta = {
  component: SunShadowDemo,
  title: "Shadows/Cached RGB lighting · experiment",
  id: "mapping-shadows-sun-disc",
  render: (args) => <SunShadowDemo {...SUN_SHADOW_STORY_DEFAULTS} {...args} />,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Experimental cached-RGB/scalar-visibility composition retained from dev. Not a production addon mode and not an output-parity claim. The regular Sun Disc stories keep using the current addon stack. Defaults reduce the former 4096-sample workload to 64 samples.",
      },
    },
  },
  args: {
    ...SUN_SHADOW_STORY_DEFAULTS,
    cachedLighting: true,
    bufferFormat: "r32f" as const,
    samples: 64 as const,
    distanceMeters: 25,
    view: "shadow-edge" as const,
  },
  argTypes: {
    bufferFormat: { table: { disable: true } },
    cachedLighting: { table: { disable: true } },
    samples: {
      control: "select",
      options: [32, 64, 128],
      table: { category: "Experiment" },
    },
    benchmark: { control: "boolean", table: { category: "Diagnostics" } },
  },
} satisfies Meta<typeof SunShadowDemo>;

export default meta;
type Story = StoryObj<typeof meta>;
export const CachedLighting: Story = {
  name: "Cached RGB lighting · experiment",
};
