import { withDesign } from "storybook-addon-designs";
import History from "../../components/overview/History";
import designHistory from "../assets/overview/History.png";
import { generateStory } from "../_tools/StoryFactory";

export default {
  title: "Overview/Components/History",
  component: History,
  decorators: [withDesign],
  parameters: {
    design: {
      type: "image",
      url: designHistory,
      scale: 0.5,
    },
  },
};
export const Mockup = {};

export const M = generateStory([235, 194]);
export const L = generateStory([224, 194]);
export const XL = generateStory([330, 242]);
export const S = generateStory([235, 193]);
export const TabletLandscape = generateStory([222, 190]);
export const TabletPortrait = generateStory([220, 214]);