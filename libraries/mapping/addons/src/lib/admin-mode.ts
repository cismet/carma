import { useFeatureFlags } from "@carma-providers/feature-flag";

/**
 * The flag that turns on tools which are ours rather than the product's.
 *
 * What sits behind it is a parameter panel, a raw readout, a knob whose
 * meaning is the implementation's: things a visitor should never be offered
 * and that carry no German a customer would read as an offer. The host app
 * decides the url alias; the geoportal's is `#/...?ff=admin`.
 */
export const ADMIN_MODE_FLAG = "isAdminMode";

/** Whether this session shows the admin-only tools. */
export const useIsAdminMode = (): boolean =>
  Boolean(useFeatureFlags()[ADMIN_MODE_FLAG]);
