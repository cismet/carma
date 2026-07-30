import { useEffect } from "react";

import type { AddonComponentProps } from "../lib/registry";

export const GazetteerMode = ({
  config,
  carma,
}: AddonComponentProps<"gazetteerMode">) => {
  useEffect(() => carma.gazetteer.addMode(config), [config, carma]);
  return null;
};
