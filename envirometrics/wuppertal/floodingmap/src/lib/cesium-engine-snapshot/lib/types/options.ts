import type { CesiumTerrainProvider, Viewer } from "cesium";
import type { MarkerModelAsset } from "../extensions/markers";

export type CesiumOptions = {
  markerAsset: MarkerModelAsset;
  isPrimaryStyle: boolean;
  markerAnchorHeight?: number;
  pitchAdjustHeight?: number;
  withTerrainProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
  withSurfaceProvider: (
    cb: (provider: CesiumTerrainProvider, viewer: Viewer) => void
  ) => boolean;
};
