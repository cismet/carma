import { useState, useLayoutEffect, useEffect } from "react";
import { OptionsOverlayHelper, OverlayHelperConfig, Secondary } from "../..";
import { useOverlayTourContext } from "../components/OverlayTourProvider";
import { isElementHidden } from "../utils/helper";
import { useWindowSize } from "@uidotdev/usehooks";

export const useOverlayHelper = (options: OptionsOverlayHelper) => {
  const [ref, setRef] = useState<HTMLElement | undefined>(undefined);
  const [isVisible, setIsVisible] = useState<boolean>(false);
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

  useEffect(() => {
    if (!ref) return;
    const checkVisibility = () => {
      const isHidden = isElementHidden(ref);
      setIsVisible(!isHidden);
    };

    checkVisibility();

    // Set up a mutation observer to detect changes in the DOM that might affect visibility
    const observer = new MutationObserver(checkVisibility);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    // Also set up a resize observer to detect size changes of the element
    const resizeObserver = new ResizeObserver(checkVisibility);
    resizeObserver.observe(ref);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [ref, size.width, size.height]);

  useLayoutEffect(() => {
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

    const shouldShowOverlay =
      (isVisible || options.primary.position) &&
      (options.primary.position || !isElementHidden(ref)) &&
      !(size.width && minWindowSize && size.width < minWindowSize);

    if (shouldShowOverlay) {
      addConfig(config);
    } else {
      removeConfig(config);
    }

    return () => {
      removeConfig(config);
    };
  }, [ref, isVisible, size.width, size.height]);

  return setRef;
};

export default useOverlayHelper;
