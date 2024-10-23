import { withDesign } from "storybook-addon-designs";
import Offices from "../../components/overview/Offices";
import design from "../assets/overview/Offices.png";
import { generateStory } from "../_tools/StoryFactory";

export default {
  title: "Overview/Components/OfficesRoles",
  component: Offices,
  decorators: [withDesign],
};

export const Mockup = {
  args: {},
};

Mockup.parameters = {
  design: {
    type: "image",
    url: design,
    scale: 0.5,
  },
};

export const M = generateStory([235, 194]);
export const L = generateStory([224, 194]);
export const XL = generateStory([360, 280]);
export const S = generateStory([235, 193]);
export const TabletLandscape = generateStory([222, 190]);
export const TabletPortrait = generateStory([220, 214]);