import { useCallback, useEffect, useRef } from "react";

import { CesiumMath } from "@carma/cesium";
import type { Radians } from "@carma/units/types";

import {
  CompassNeedleSVG,
  computeCompassNeedleTransform,
} from "./CompassNeedleSVG";
type Props = {
  register: (setOrientation: (p: Radians, h: Radians) => void) => void;
};
export const Needle = ({ register }: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingOrientationRef = useRef<{
    pitch: Radians;
    heading: Radians;
  }>({
    pitch: CesiumMath.toRadians(-90) as Radians,
    heading: 0 as Radians,
  });

  const applyPendingOrientation = useCallback(() => {
    frameRef.current = null;
    const svg = svgRef.current;
    if (!svg) return;
    const { pitch, heading } = pendingOrientationRef.current;
    svg.style.transform = computeCompassNeedleTransform(pitch, heading);
  }, []);

  const setOrientation = useCallback(
    (pitch: Radians, heading: Radians) => {
      pendingOrientationRef.current = { pitch, heading };
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(applyPendingOrientation);
    },
    [applyPendingOrientation]
  );

  useEffect(() => {
    register(setOrientation);
    applyPendingOrientation();
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [applyPendingOrientation, register, setOrientation]);

  return (
    <CompassNeedleSVG
      ref={svgRef}
      pitch={pendingOrientationRef.current.pitch}
      heading={pendingOrientationRef.current.heading}
    />
  );
};

export default Needle;
