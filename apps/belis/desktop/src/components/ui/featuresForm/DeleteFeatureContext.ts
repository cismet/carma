import { createContext, useContext } from "react";

/**
 * Deletion controls for the currently open Fachobjekt form. Provided by
 * FeaturesFormsWrapper (which owns the feature identity, jwt and dispatch) and
 * consumed deep down by FeatureFormLayout so the "Gefahrenzone" block can
 * render at the bottom of *every* feature form without threading callbacks
 * through each individual *Form component.
 *
 * The delete is draft-based (no modal confirm): `mark` records the deletion
 * intent as a draft, so the feature shows up as an unsaved change and is
 * committed/cancelled through the form header's existing "Speichern" /
 * "zurücksetzen" buttons like any other draft.
 *
 * `undefined` means deletion is not available for the current form (e.g. a
 * creation draft, or a read-only "Gast" user) — the danger zone stays hidden.
 */
export interface DeleteFeatureControls {
  /** True while the open feature is marked for deletion. */
  pendingDeletion: boolean;
  /** Mark the feature for deletion (creates the deletion draft). */
  mark: () => void;
}

const DeleteFeatureContext = createContext<DeleteFeatureControls | undefined>(
  undefined
);

export const DeleteFeatureProvider = DeleteFeatureContext.Provider;

export const useDeleteFeature = (): DeleteFeatureControls | undefined =>
  useContext(DeleteFeatureContext);
