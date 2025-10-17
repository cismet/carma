import type { Radians, Meters } from "@carma/units/types";
import type { ManagedProjection } from "@carma/geo/proj";
import type { AnimationConfig } from "@carma/types";
import type { ObliquePreviewQuality } from "../constants";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";

export type ObliqueAnimationsConfig = {
  flyToExteriorOrientation?: AnimationConfig;
  // Optional: animation config for navigating to sibling/next image.
  // If omitted, consumers should derive it from flyToExteriorOrientation (e.g., half duration).
  flyToNextImage?: AnimationConfig;
  // Animation used when rotating in preview mode and flying to the nearest image
  flyToRotatedImage?: AnimationConfig;
  outlineFadeOut?: AnimationConfig;
};

export type ObliqueFootprintsStyle = {
  outlineColor?: Color;
  outlineWidth?: number;
  outlineOpacity?: number;
};

export interface ObliqueImagePreviewStyle {
  backdropColor?: string;
  border?: string;
  boxShadow?: string;
}

export interface ObliqueDataProviderConfig {
  exteriorOrientationsURI: string;
  footprintsURI: string;
  crs: ManagedProjection;
  previewPath: string;
  previewQualityLevel?: ObliquePreviewQuality;
  fixedPitch?: Radians;
  fixedHeight?: Meters;
  minFov?: Radians;
  maxFov?: Radians;
  headingOffset?: Radians;
  animations?: ObliqueAnimationsConfig;
  footprintsStyle?: ObliqueFootprintsStyle;
  imagePreviewStyle?: ObliqueImagePreviewStyle;
  /** Camera system configuration: maps camera IDs to cardinal directions by flight line parity (EVEN/ODD) */
  cameraDirectionMapping?: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >;
}
