import { useEffect, useRef, useState } from "react";

import type { PointLabelAttach } from "../core/pointLabelAttach";

/** True for `transitionDurationMs` after `labelAttach` changed. */
export const useLabelAttachTransition = (
  labelAttach: PointLabelAttach,
  transitionDurationMs: number
): boolean => {
  const [isActive, setIsActive] = useState(false);
  const previousAttachRef = useRef<PointLabelAttach>(labelAttach);

  useEffect(() => {
    const previousAttach = previousAttachRef.current;
    previousAttachRef.current = labelAttach;

    if (transitionDurationMs <= 0) {
      setIsActive(false);
      return;
    }
    if (previousAttach === labelAttach) {
      return;
    }

    setIsActive(true);
    const timeoutId = window.setTimeout(
      () => setIsActive(false),
      transitionDurationMs
    );
    return () => window.clearTimeout(timeoutId);
  }, [labelAttach, transitionDurationMs]);

  return isActive;
};
