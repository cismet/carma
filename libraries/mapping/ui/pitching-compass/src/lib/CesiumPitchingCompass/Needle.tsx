import { useState, useEffect } from "react";

import type { Radians } from "@carma/units/types";

import { CompassNeedleSVG } from "../CompassNeedleSVG";

// Default to north-up (top-down view) for 2D mode fallback
const DEFAULT_PITCH = (-Math.PI / 2) as Radians; // -90° = straight down
const DEFAULT_HEADING = 0 as Radians; // North

type Props = {
  register: (setOrientation: (p: Radians, h: Radians) => void) => void;
};
export const Needle = ({ register }: Props) => {
  const [pitch, setPitch] = useState<Radians>(DEFAULT_PITCH);
  const [heading, setHeading] = useState<Radians>(DEFAULT_HEADING);

  useEffect(() => {
    register((p, h) => {
      setPitch(p);
      setHeading(h);
    });
  }, [register]);

  return <CompassNeedleSVG pitch={pitch} heading={heading} />;
};

export default Needle;
