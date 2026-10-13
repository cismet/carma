import type { ComponentType } from "react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { Map, MercatorCoordinate } from "maplibre-gl";
import type { CssPixels, Meters } from "@carma-units";
import type { ObliqueSelectionData, ObliqueViewMode } from "../core/types";
import type {
  createPhotoAxisPicker,
  PhotoAxisSurfaceMode,
} from "./utils/photo-axis-picker";

export type ObliqueViewerExtensionController = Readonly<{ reset: () => void }>;
export type ObliqueViewerExtensionProps = {
  map: Map;
  data: ObliqueSelectionData | null;
  resetToken: string;
  heightOffset: Meters;
  suspended: boolean;
  surfacePicker: ReturnType<typeof createPhotoAxisPicker> | null;
  surfaceMode?: PhotoAxisSurfaceMode;
  readViewAnchor: (point: {
    x: CssPixels;
    y: CssPixels;
  }) => MercatorCoordinate | undefined;
  onControllerChange: (
    controller: ObliqueViewerExtensionController | null
  ) => void;
  onReset: () => void;
  onCancel: () => void;
  onOpen: (imageId: string) => void;
};
export type ObliqueViewerExtension = Readonly<{
  mode: Exclude<ObliqueViewMode, "oblique" | "nadir">;
  label: string;
  icon?: IconDefinition;
  Component: ComponentType<ObliqueViewerExtensionProps>;
}>;

export const getObliqueViewerExtension = (
  extensions: readonly ObliqueViewerExtension[],
  nextInterface: boolean,
  mode: ObliqueViewMode
): ObliqueViewerExtension | undefined =>
  nextInterface
    ? extensions.find((extension) => extension.mode === mode)
    : undefined;
