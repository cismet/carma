import { createContext, useContext } from "react";

/**
 * Rights for the currently open Fachobjekt form, provided by
 * FeaturesFormsWrapper. Forms without a provider (e.g. Arbeitsauftrag) get the
 * defaults and behave as before.
 */
export interface FeatureRights {
  /** May create new Fachobjekte (green "+", "Werte merken"). */
  canCreate: boolean;
  /** Fields stay locked even in edit mode (user may only delete). */
  fieldsReadOnly: boolean;
}

const FeatureRightsContext = createContext<FeatureRights>({
  canCreate: true,
  fieldsReadOnly: false,
});

export const FeatureRightsProvider = FeatureRightsContext.Provider;

export const useFeatureRights = (): FeatureRights =>
  useContext(FeatureRightsContext);
