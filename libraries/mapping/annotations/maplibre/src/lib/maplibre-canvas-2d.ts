/** A square 2D canvas with its context; null without a 2D canvas (tests). */
export const createCanvas2d = (
  size: number
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (!context) return null;
  canvas.width = size;
  canvas.height = size;
  return { canvas, context };
};
