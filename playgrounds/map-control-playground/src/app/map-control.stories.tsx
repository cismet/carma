import type { Meta, StoryObj } from '@storybook/react';
import Map from './Map';

const meta: Meta<typeof Map> = {
  component: Map,
  title: 'MapControl',
};
export default meta;
type Story = StoryObj<typeof Map>;

export const SimleExample = () => {
  return <div>Simple story</div>;
};
