// collate into a shallow version of window namespace
import { carmaWindowLocation as location } from "./lib/location";
import { getWindowDimensions as getDimensions } from "./lib/getWindowDimensions";
export const carmaWindow = {
  location,
  getDimensions,
};

// as individual exports
export { getWindowDimensions } from "./lib/getWindowDimensions";
export {
  handleDelayedRender,
  type DelayedRenderOptions,
} from "./lib/handleDelayedRender";

export { cjsGlobalShim } from "./lib/cjsGlobalShim";

export { waitForAnimationFrames } from "./lib/waitForAnimationFrames";

export { preventPinchZoom } from "./lib/prevent-pinch-zoom";

export { WindowEventNames, type WindowEventName } from "./lib/events";
