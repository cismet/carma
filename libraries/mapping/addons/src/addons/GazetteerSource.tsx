import { useEffect } from "react";

import type { AddonComponentProps } from "../lib/registry";

export const GazetteerSource = ({
  config,
  carma,
}: AddonComponentProps<"gazetteerSource">) => {
  useEffect(() => carma.gazetteer.addSource(config), [config, carma]);
  return null;
};
