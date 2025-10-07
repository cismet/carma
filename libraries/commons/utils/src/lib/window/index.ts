// collate into a shallow version of window namespace
import { carmaWindowLocation as location } from "./location";
import { getWindowDimensions as getDimensions } from "./getWindowDimensions";
export const carmaWindow = {
  location,
  getDimensions,
};

// as individual exports
export { getWindowDimensions } from "./getWindowDimensions";
export {
  handleDelayedRender,
  type DelayedRenderOptions,
} from "./handleDelayedRender";

export { cjsGlobalShim } from "./cjsGlobalShim";
