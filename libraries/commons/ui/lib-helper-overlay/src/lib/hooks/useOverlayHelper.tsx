import { useState, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig, Secondary } from "../..";
import { useOverlayTourContext } from "../components/OverlayTourProvider";
import { isElementHidden } from "../utils/helper";
import { useWindowSize } from "@uidotdev/usehooks";

export const useOverlayHelper = (options: OptionsOverlayHelper) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useOverlayTourContext();
  const size = useWindowSize();

  if (!options || options.primary === undefined) {
    console.info("No options provided to useOverlayHelper, helper not ready");
    return;
  }

  const {
    containerPos,
    contentPos,
    contentWidth,
    content,
    position,
    key,
    minWindowSize,
  } = options.primary;

  let secondary: Secondary | undefined = undefined;

  if (options.secondary) {
    secondary = options.secondary;
  }

  useLayoutEffect(() => {
    let config: OverlayHelperConfig = {
      key,
      el: ref ? ref : undefined,
      content,
      containerPos,
      contentPos,
      contentWidth,
      position,
      ...(secondary && { secondary }),
    };

    if (
      ((!ref || isElementHidden(ref)) && !options.primary.position) ||
      (size.width && minWindowSize && size.width < minWindowSize)
    ) {
      return;
    }

    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref]);

  return setRef;
};

export default useOverlayHelper;
