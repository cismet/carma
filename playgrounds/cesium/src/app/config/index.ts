import { Color, ColorMaterialProperty, Math as CeMath } from "cesium";
import { defaultViewerState } from "./store.config";

export const APP_DEFAULT_TITLE = "3D Viewer Prototype";
export const APP_DEFAULT_SHORT_TITLE = "3DView";

// STYLING

export const DEFAULT_SELECTION_HIGHLIGHT_MATERIAL = new ColorMaterialProperty(
  Color.YELLOW.withAlpha(0.7)
);

// ANIMATIONS

export const DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION = 1000; // milliseconds

const fullRotationDuration = 60; // seconds
export const DEFAULT_ROTATION_SPEED =
  CeMath.TWO_PI / (fullRotationDuration * 1000); // rad per millisecond

export default defaultViewerState;
