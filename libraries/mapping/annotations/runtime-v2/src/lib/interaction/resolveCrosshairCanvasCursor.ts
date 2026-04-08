import { resolveCrosshairCursorCssValue } from "./crosshairCursorAsset";

export const resolveCrosshairCanvasCursor = ({
  queryEnabled,
  showCursor,
  hideNativeCursor,
}: {
  queryEnabled: boolean;
  showCursor: boolean;
  hideNativeCursor: boolean;
}) => {
  if (queryEnabled && showCursor) {
    return resolveCrosshairCursorCssValue({});
  }

  if (queryEnabled && hideNativeCursor) {
    return "none";
  }

  return "";
};
