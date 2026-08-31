import { useAddonState } from "../../lib/AddonStateContext";
import type { ExcalidrawShape } from "./shape-tools";

/** shared by the overlay and its control, so both read one answer */
export const useExcalidrawActions = () => {
  const [state, setState] = useAddonState("excalidrawMode");

  return {
    isOn: state?.isOn ?? false,
    shape: state?.shape ?? "selection",
    undoVersion: state?.undoVersion ?? 0,
    redoVersion: state?.redoVersion ?? 0,
    toggle: () =>
      setState((previous) => ({
        ...(previous ?? {}),
        isOn: !(previous?.isOn ?? false),
      })),
    endMode: () =>
      setState((previous) => ({ ...(previous ?? {}), isOn: false })),
    setShape: (shape: ExcalidrawShape) =>
      setState((previous) => ({ ...(previous ?? { isOn: false }), shape })),
    undo: () =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        undoVersion: (previous?.undoVersion ?? 0) + 1,
      })),
    redo: () =>
      setState((previous) => ({
        ...(previous ?? { isOn: false }),
        redoVersion: (previous?.redoVersion ?? 0) + 1,
      })),
  };
};
