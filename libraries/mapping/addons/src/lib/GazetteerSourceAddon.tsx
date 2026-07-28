import { useEffect } from "react";

import type { AddonComponentProps } from "./registry";

export const GazetteerSourceAddon = ({
  config,
  carma,
}: AddonComponentProps<"gazetteerSource">) => {
  useEffect(() => carma.gazetteer.addSource(config), [config, carma]);
  return null;
};
