import { useAddonState } from "@carma-mapping/addons";

/** The 3D measurement addon is switched on and can measure (a mesh is drawn). */
export const useIsMeasurement3dOn = (): boolean => {
  const [state] = useAddonState("measurement3d");
  return (state?.isOn ?? false) && (state?.available ?? false);
};
