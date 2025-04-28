import { useDispatch, useSelector } from "react-redux";
import {
  getUIAllowChanges,
  setUIShowLayerHideButtons,
} from "../store/slices/ui";
import { useEffect } from "react";

export const useKeyboardShortcuts = () => {
  const dispatch = useDispatch();
  const allowUiChanges = useSelector(getUIAllowChanges);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        dispatch(setUIShowLayerHideButtons(true));
      }

      // if (e.key === "Escape") {
      //   if (uiMode === "print" && !ifPopupPrintOpened) {
      //     dispatch(setUIMode("default"));
      //   }
      //   dispatch(changeIfPopupOpend(false));
      // }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (allowUiChanges) {
        dispatch(setUIShowLayerHideButtons(false));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onKeyUp);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onKeyUp);
    };
  }, [allowUiChanges, dispatch]);
};
