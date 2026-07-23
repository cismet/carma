import { MOUSE, TOUCH, type Camera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const createModelNavigationControls = (
  camera: Camera,
  domElement: HTMLElement,
  target: { x: number; y: number; z: number }
) => {
  const controls = new OrbitControls(camera, domElement);
  controls.target.set(target.x, target.y, target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons.LEFT = MOUSE.PAN;
  controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = MOUSE.ROTATE;
  controls.touches.ONE = TOUCH.PAN;
  controls.touches.TWO = TOUCH.DOLLY_ROTATE;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  return controls;
};
