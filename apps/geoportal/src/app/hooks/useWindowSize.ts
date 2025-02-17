import { useState, useEffect, RefObject } from "react";

export const useWindowSize = (ref: RefObject<HTMLElement>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;

    const updateSize = () => {
      if (ref.current) {
        setSize({
          width: ref.current.clientWidth,
          height: ref.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(ref.current);

    window.addEventListener("resize", updateSize);
    updateSize();

    return () => {
      if (ref.current) {
        resizeObserver.unobserve(ref.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [ref]);

  return size;
};
