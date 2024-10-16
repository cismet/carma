import React, { useState, useContext, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig, Secondary } from "../..";
import { OverlayTourContext } from "../components/OverlayTourProvider";
export const useOverlayHelper = (options: OptionsOverlayHelper) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useContext(OverlayTourContext);
  const { containerPos, contentPos, contentWidth, content, position, key } =
    options.primary;
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

    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref]);

  return setRef;
};

export default useOverlayHelper;
