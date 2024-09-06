import React, { useState, useContext, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig, Secondary } from "../..";
import { OverlayTourContext } from "../components/OverlayTourProvider";
const useOverlayHelper = (options: OptionsOverlayHelper) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useContext(OverlayTourContext);
  const { containerPos, contentPos, contentWidth, content } = options.primary;
  let secondary: Secondary | undefined = undefined;

  if (options.secondary) {
    secondary = options.secondary;
  }

  useLayoutEffect(() => {
    if (!ref) return;

    let config: OverlayHelperConfig = {
      el: ref,
      content,
      containerPos,
      contentPos,
      contentWidth,
      ...(secondary && { secondary }),
    };

    // if(secondary){
    //   config
    // }
    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref]);

  return setRef;
};

export default useOverlayHelper;
