import { useContext, useLayoutEffect } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { useOverlayTourContext } from "@carma-commons/ui/helper-overlay";
import { registerUi, type UiAdapter } from "@carma-api";

/**
 * Registers the `carma.ui` adapter: menu visibility and the helper overlay.
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
    };
    registerUi(adapter);
    return () => registerUi(null);
  }, [setAppMenuVisible, showOverlayHandler]);
};
