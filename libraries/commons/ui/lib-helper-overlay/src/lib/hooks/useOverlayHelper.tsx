import React, { useState, useContext, useLayoutEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig } from "../..";
import { OverlayTourContext } from "../components/OverlayTourProvider";
const useOverlayHelper = (
  content: string,
  options: OptionsOverlayHelper = {
    containerPos: "center",
    contentPos: "center",
  },
) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const { addConfig, removeConfig } = useContext(OverlayTourContext);
  const { containerPos, contentPos } = options;
  useLayoutEffect(() => {
    if (!ref) return;

    const config: OverlayHelperConfig = {
      el: ref,
      message: content,
      containerPos,
      contentPos,
    };
    addConfig(config);

    return () => {
      removeConfig(config);
    };
  }, [ref, content]);

  return setRef;
};

export default useOverlayHelper;
