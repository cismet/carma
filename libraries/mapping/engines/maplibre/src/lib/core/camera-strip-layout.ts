import { PerspectiveCamera } from "three";
import { type CameraRigView, finitePositive } from "./camera-rig-contract";

export type CameraStripLayout = Readonly<{
  width: number;
  height: number;
  offsets: readonly number[];
  widths: readonly number[];
}>;

export const getCameraStripLayout = (
  views: readonly CameraRigView[],
  requestedHeight: number,
  maxTotalWidth = 16_384
): CameraStripLayout => {
  if (
    views.length === 0 ||
    !finitePositive(requestedHeight) ||
    !finitePositive(maxTotalWidth)
  )
    throw new Error("Invalid camera strip layout options");
  const widthBudget = Math.floor(maxTotalWidth);
  if (widthBudget < views.length)
    throw new Error("Camera strip width cap is smaller than the view count");
  const aspects = views.map(({ camera }) => {
    const aspect =
      camera instanceof PerspectiveCamera
        ? camera.aspect
        : (camera.right - camera.left) / (camera.top - camera.bottom);
    if (!finitePositive(aspect)) throw new Error("Invalid camera aspect");
    return aspect;
  });
  const aspectSum = aspects.reduce((sum, aspect) => sum + aspect, 0);
  const height = Math.max(
    1,
    Math.floor(Math.min(requestedHeight, widthBudget / aspectSum))
  );
  const targetWidth = Math.max(
    views.length,
    Math.min(widthBudget, Math.round(height * aspectSum))
  );
  const exactWidths = aspects.map(
    (aspect) => (targetWidth * aspect) / aspectSum
  );
  const widths = exactWidths.map((width) => Math.max(1, Math.floor(width)));
  let delta = targetWidth - widths.reduce((sum, width) => sum + width, 0);
  const order = exactWidths
    .map((width, index) => ({ index, remainder: width - Math.floor(width) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let cursor = 0; delta > 0; cursor += 1, delta -= 1)
    widths[order[cursor % order.length].index] += 1;
  for (
    let cursor = order.length - 1;
    delta < 0;
    cursor = (cursor + order.length - 1) % order.length
  ) {
    const index = order[(cursor + order.length) % order.length].index;
    if (widths[index] <= 1) continue;
    widths[index] -= 1;
    delta += 1;
  }
  const offsets: number[] = [];
  let width = 0;
  for (const viewWidth of widths) {
    offsets.push(width);
    width += viewWidth;
  }
  return { width, height, offsets, widths };
};
