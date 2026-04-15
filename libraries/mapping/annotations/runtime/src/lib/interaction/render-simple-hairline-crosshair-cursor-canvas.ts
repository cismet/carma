export const renderSimpleHairlineCrosshairCursorCanvas = ({
  context,
  primaryColor,
  secondaryColor,
  sizePx,
  anchorPx,
}: {
  context: CanvasRenderingContext2D;
  primaryColor: string;
  secondaryColor: string;
  sizePx: number;
  anchorPx: number;
}) => {
  context.save();
  context.imageSmoothingEnabled = false;

  context.fillStyle = secondaryColor;
  context.fillRect(-anchorPx, 0, sizePx, 1);
  context.fillRect(0, -anchorPx, 1, sizePx);

  context.fillStyle = primaryColor;
  context.fillRect(0, 0, 1, 1);

  context.restore();
};
