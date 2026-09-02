import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";

const TOLERANCE = 6;

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

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
  const x = (clientX - rect.left) / zoom.value - scrollX;
  const y = (clientY - rect.top) / zoom.value - scrollY;
  const pad = TOLERANCE / zoom.value;

  return api
    .getSceneElements()
    .some((element) => !element.isDeleted && contains(element, x, y, pad));
};
