import { createContext, useContext } from "react";

/**
 * The destructive "delete this Fachobjekt" action for the currently open
 * feature form. Provided by FeaturesFormsWrapper (which owns the feature
 * identity, jwt and dispatch) and consumed deep down by FeatureFormLayout so
 * the "Gefahrenzone" block can render at the bottom of *every* feature form
 * without threading a callback through each individual *Form component.
 *
 * `undefined` means deletion is not available for the current form (e.g. a
 * creation draft, or a read-only "Gast" user) — the danger zone stays hidden.
 */
export type DeleteFeatureHandler = () => void | Promise<void>;

const DeleteFeatureContext = createContext<DeleteFeatureHandler | undefined>(
  undefined
);

export const DeleteFeatureProvider = DeleteFeatureContext.Provider;

export const useDeleteFeature = (): DeleteFeatureHandler | undefined =>
  useContext(DeleteFeatureContext);
