export const getCanvasDimensions = (
  canvas: HTMLCanvasElement
): { height: number; width: number } => {
  return { height: canvas.clientHeight, width: canvas.clientWidth };
};
