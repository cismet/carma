import type { Meta, StoryObj } from '@storybook/react';
import { MapControl } from './map-control';

import { within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';

const meta: Meta<typeof MapControl> = {
  component: MapControl,
  title: 'MapControl',
};
export default meta;
type Story = StoryObj<typeof MapControl>;

export const Primary = {
  args: {},
};

export const Heading: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/Welcome to MapControl!/gi)).toBeTruthy();
  },
};

export const SimleExample = (args) => <div style={{}}>111</div>;
