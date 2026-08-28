import { useAddonState } from "../../lib/AddonStateContext";

/** shared by the overlay and its control, so both read one answer */
export const useExcalidrawActions = () => {
  const [state, setState] = useAddonState("excalidrawMode");

  return {
    isOn: state?.isOn ?? false,
    toggle: () =>
      setState((previous) => ({ isOn: !(previous?.isOn ?? false) })),
  };
};
