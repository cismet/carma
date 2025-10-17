// Context & Provider
export * from "./lib/context/ObliqueProvider";
export * from "./lib/hooks/useOblique";

// Components
export * from "./lib/components/ObliqueControls";
export * from "./lib/components/ObliqueImagePreview";
export * from "./lib/components/ObliqueOrientationCube";
export * from "./lib/components/debugUI/ObliqueDebugSvg";
export { default as ObliqueDirectionControls } from "./lib/components/ObliqueDirectionControls";

// TODO: Cesium oblique mode component (experimental)
// @experimental - DO NOT COMMIT without approval
export { CesiumObliqueMode } from "./lib/components/CesiumObliqueMode";
export type { CesiumObliqueModeProps } from "./lib/components/CesiumObliqueMode";

// Hooks
export { useObliqueInitializer } from "./lib/hooks/useObliqueInitializer";
export { useObliqueData } from "./lib/hooks/useObliqueData";
export { useObliqueNearestImage } from "./lib/hooks/useObliqueNearestImage";

// Types
export type {
  ObliqueDataProviderConfig,
  ObliqueAnimationsConfig,
} from "./lib/types";
export type { ObliqueImageRecord } from "./lib/types/oblique-image-record";
export {
  CardinalDirectionEnum,
  InvertedCardinalDirectionEnum,
} from "./lib/utils/orientationUtils";

// Constants & Config
export { CAMERA_ID_TO_DIRECTION } from "./lib/config";

// Debug UI (optional)
export { ObliqueControlPanel } from "./lib/components/debugUI/ObliqueControlPanel";
export { ObliqueDebugSvg } from "./lib/components/debugUI/ObliqueDebugSvg";
