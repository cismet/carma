import React, { useState, useContext, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig, Secondary } from "../..";
import { OverlayTourContext } from "../components/OverlayTourProvider";
export const useOverlayHelper = (options: OptionsOverlayHelper) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const overlayTourContext = useContext(OverlayTourContext);
  if (overlayTourContext === null) {
    return null;
  }
  const { addConfig, removeConfig } = overlayTourContext;
  const { containerPos, contentPos, contentWidth, content, position, key } =
    options.primary;
  let secondary: Secondary | undefined = undefined;

  if (options.secondary) {
    secondary = options.secondary;
  }

  useLayoutEffect(() => {
    if (ref === null) {
      return;
    }
    let config: OverlayHelperConfig = {
      key,
      el: ref,
      content,
      containerPos,
      contentPos,
      contentWidth,
      position,
      ...(secondary && { secondary }),
    };
    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref]);

  return setRef;
};

export default useOverlayHelper;
