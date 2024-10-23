import { OptionsOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";

export const addCssToOverlayHelperItem = (
  item: OptionsOverlayHelper,
  width: string,
  height: string,
  color = "white",
) => {
  if (item.primary.position) {
    item.primary.position = {
      ...item.primary.position,
      position: "absolute",
      width,
      height,
      color,
    };
  }

  return item;
};
