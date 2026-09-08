import { useContext, useLayoutEffect } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { useOverlayTourContext } from "@carma-commons/ui/helper-overlay";
import { registerUi, type UiAdapter } from "@carma-api";

import { addInfoBoxAction } from "../info-box-actions";
import { addInfoBoxNote } from "../info-box-notes";

/**
 * Registers the `carma.ui` adapter: menu visibility, the helper overlay and
 * the info box stores (actions and notes).
 *
 * To add a ui function: extend `UiAdapter` in `@carma-api`, then add the
 * closure to the adapter object below.
 */
export const useUiAdapter = (): void => {
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { showOverlayHandler } = useOverlayTourContext();

  useLayoutEffect(() => {
    const adapter: UiAdapter = {
      openMenu: () => setAppMenuVisible?.(true),
      openHelperOverlay: () => showOverlayHandler(),
      // the app's info box reads the stores with `useInfoBoxActions` and
      // `useInfoBoxNotes`
      registerInfoBoxAction: addInfoBoxAction,
      registerInfoBoxNote: addInfoBoxNote,
    };
    registerUi(adapter);
    return () => registerUi(null);
  }, [setAppMenuVisible, showOverlayHandler]);
};
