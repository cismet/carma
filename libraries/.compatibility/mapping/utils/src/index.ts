// DEPRECATED: This compatibility module will be removed in a future version.
// Please use: import { ... } from "@carma-mapping/utils" instead
console.warn(
  "⚠️  DEPRECATED: @carma-mapping/utils is deprecated and will be removed in a future version. " +
  "Please use 'import { ... } from \"@carma-mapping\ corresponding new package or @carma\\geo' instead."
);

export * from "./lib/utils";
export { useLeafletZoomControls } from "./lib/hooks/useLeafletZoomControls";
