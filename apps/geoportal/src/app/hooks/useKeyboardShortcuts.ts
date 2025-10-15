import { useDispatch, useSelector } from "react-redux";
import {
  getUIAllowChanges,
  setUIShowLayerHideButtons,
} from "../store/slices/ui";
import { useEffect } from "react";
import { WindowEventNames } from "@carma-commons/dom/window";
import { DocumentEventNames } from "@carma-commons/dom/document";

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

    // Separate handler for window blur (FocusEvent, not KeyboardEvent)
    const onWindowBlur = () => {
      if (allowUiChanges) {
        dispatch(setUIShowLayerHideButtons(false));
      }
    };

    document.addEventListener(DocumentEventNames.keydown, onKeyDown);
    document.addEventListener(DocumentEventNames.keyup, onKeyUp);
    window.addEventListener(WindowEventNames.blur, onWindowBlur);

    return () => {
      document.removeEventListener(DocumentEventNames.keydown, onKeyDown);
      document.removeEventListener(DocumentEventNames.keyup, onKeyUp);
      window.removeEventListener(WindowEventNames.blur, onWindowBlur);
    };
  }, [allowUiChanges, dispatch]);
};
