import React, { useState, useContext, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig } from "../..";
import { OverlayTourContext } from "../components/OverlayTourProvider";
const useOverlayHelper = (
  options: OptionsOverlayHelper = {
    primary: {
      containerPos: "center",
      contentPos: "center",
      contentWidth: "default",
      content: <div></div>,
    },
  },
) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useContext(OverlayTourContext);
  const { containerPos, contentPos, contentWidth, content } = options.primary;
  useLayoutEffect(() => {
    if (!ref) return;

    const config: OverlayHelperConfig = {
      el: ref,
      content,
      containerPos,
      contentPos,
      contentWidth,
    };
    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref]);

  return setRef;
};

export default useOverlayHelper;
