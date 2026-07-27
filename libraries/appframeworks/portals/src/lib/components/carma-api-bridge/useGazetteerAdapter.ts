import { useContext, useLayoutEffect } from "react";

import { registerGazetteer, type GazetteerContribution } from "@carma-api";

import { GazDataContext, type GazDataContribution } from "../GazDataContext";

export const useGazetteerAdapter = (): void => {
  const registerContribution =
    useContext(GazDataContext)?.registerGazDataContribution;

  useLayoutEffect(() => {
    if (!registerContribution) {
      return;
    }
    registerGazetteer({
      registerContribution: (contribution: GazetteerContribution) =>
        registerContribution(contribution as GazDataContribution),
    });
    return () => registerGazetteer(null);
  }, [registerContribution]);
};
