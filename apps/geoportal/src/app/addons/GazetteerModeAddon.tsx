import { useEffect } from "react";

import type { AddonComponentProps } from "./registry";

export const GazetteerModeAddon = ({
  config,
  carma,
}: AddonComponentProps<"gazetteerMode">) => {
  useEffect(() => carma.gazetteer.addMode(config), [config, carma]);
  return null;
};
