import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";

/** how far outside an element still counts as a hit, in screen px */
const TOLERANCE = 6;

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

/** elements store an unrotated box plus an angle, so rotate the point back */
const contains = (element: Bounds, x: number, y: number, pad: number) => {
  const centreX = element.x + element.width / 2;
  const centreY = element.y + element.height / 2;
  const sin = Math.sin(-element.angle);
  const cos = Math.cos(-element.angle);
  const dx = x - centreX;
  const dy = y - centreY;
  const turnedX = centreX + dx * cos - dy * sin;
  const turnedY = centreY + dx * sin + dy * cos;
  return (
    turnedX >= element.x - pad &&
    turnedX <= element.x + element.width + pad &&
    turnedY >= element.y - pad &&
    turnedY <= element.y + element.height + pad
  );
};

/**
 * Whether this scene has an element under the given client point.
 *
 * Bounding boxes only: excalidraw does not expose its own hit testing, and for
 * selecting a whole drawing the box is precise enough.
 */
export const sceneHasElementAt = (
  api: ExcalidrawImperativeAPI | null,
  box: HTMLElement | null,
  clientX: number,
  clientY: number
): boolean => {
  if (!api || !box) {
    return false;
  }
  const { scrollX, scrollY, zoom } = api.getAppState();
  const rect = box.getBoundingClientRect();
  // excalidraw's transform: screen = (scene + scroll) * zoom
  const x = (clientX - rect.left) / zoom.value - scrollX;
  const y = (clientY - rect.top) / zoom.value - scrollY;
  const pad = TOLERANCE / zoom.value;

  return api
    .getSceneElements()
    .some((element) => !element.isDeleted && contains(element, x, y, pad));
};
