import { Color, ColorMaterialProperty } from 'cesium';
import { defaultState } from './store.config';

export const APP_DEFAULT_TITLE = '3D Viewer Prototype';
export const APP_DEFAULT_SHORT_TITLE = '3DView';

// STYLING

export const DEFAULT_SELECTION_HIGHLIGHT_MATERIAL = new ColorMaterialProperty(
  Color.YELLOW.withAlpha(0.7)
);

// ANIMATIONS

const fullRotationDuration = 60; // seconds
export const DEFAULT_ROTATION_SPEED =
  (2 * Math.PI) / (fullRotationDuration * 1000); // rad per millisecond

export default defaultState;
