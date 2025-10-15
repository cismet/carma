import { useState, useEffect } from "react";

import type { Radians } from "@carma/units/types";

import { CompassNeedleSVG } from "./CompassNeedleSVG";

type Props = {
  register: (setOrientation: (p: Radians, h: Radians) => void) => void;
};
export const Needle = ({ register }: Props) => {
  const [pitch, setPitch] = useState<Radians>(0 as Radians);
  const [heading, setHeading] = useState<Radians>(0 as Radians);

  useEffect(() => {
    register((p, h) => {
      setPitch(p);
      setHeading(h);
    });
  }, [register]);

  return <CompassNeedleSVG pitch={pitch} heading={heading} />;
};

export default Needle;
