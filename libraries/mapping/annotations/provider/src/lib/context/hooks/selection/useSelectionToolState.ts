import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type SelectionToolState = {
  selectionModeActive: boolean;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  selectModeAdditive: boolean;
  setSelectModeAdditive: Dispatch<SetStateAction<boolean>>;
  selectModeRectangle: boolean;
  setSelectModeRectangle: Dispatch<SetStateAction<boolean>>;
  selectModeShiftHeld: boolean;
  effectiveSelectModeAdditive: boolean;
};

export const useSelectionToolState = (
  initialSelectionModeActive: boolean = false
): SelectionToolState => {
  const [selectionModeActive, setSelectionModeActive] = useState(
    initialSelectionModeActive
  );
  const [selectModeAdditive, setSelectModeAdditive] = useState(false);
  const [selectModeRectangle, setSelectModeRectangle] = useState(false);
  const [selectModeShiftHeld, setSelectModeShiftHeld] = useState(false);

  useEffect(() => {
    if (!selectionModeActive) {
      setSelectModeShiftHeld(false);
      return;
    }

    const handleShiftKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setSelectModeShiftHeld((previous) => (previous ? previous : true));
    };

    const handleShiftKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setSelectModeShiftHeld((previous) => (previous ? false : previous));
    };

    const handleWindowBlur = () => {
      setSelectModeShiftHeld(false);
    };

    window.addEventListener("keydown", handleShiftKeyDown, true);
    window.addEventListener("keyup", handleShiftKeyUp, true);
    window.addEventListener("blur", handleWindowBlur, true);

    return () => {
      window.removeEventListener("keydown", handleShiftKeyDown, true);
      window.removeEventListener("keyup", handleShiftKeyUp, true);
      window.removeEventListener("blur", handleWindowBlur, true);
    };
  }, [selectionModeActive]);

  const effectiveSelectModeAdditive = useMemo(
    () => selectModeAdditive || (selectionModeActive && selectModeShiftHeld),
    [selectModeAdditive, selectionModeActive, selectModeShiftHeld]
  );

  return {
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
    selectModeShiftHeld,
    effectiveSelectModeAdditive,
  };
};
