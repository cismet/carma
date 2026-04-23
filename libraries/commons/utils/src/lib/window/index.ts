// collate into a shallow version of window namespace
import { logOnce } from "../console";
import { carmaWindowLocation as location } from "./location";

logOnce(
  "@carma-commons/utils window is deprecated, use @carma-commons/dom/window instead"
);

export const carmaWindow = {
  location,
};

export { cjsGlobalShim } from "./cjsGlobalShim";
