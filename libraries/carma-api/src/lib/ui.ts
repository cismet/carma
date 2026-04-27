import { createNamespace } from "./create-namespace";

/**
 * Raw injection point for the `ui` namespace. The bridge provides these
 * closures. Optional methods may be left unimplemented; the facade no-ops.
 */
export interface UiAdapter {
  openMenu?: () => void;
  openHelperOverlay?: () => void;
}

/** Public shape seen by callers of `carma.ui`. */
export interface UiFacade {
  openMenu: () => void;
  openHelperOverlay: () => void;
}

export const { facade: ui, register: registerUi } = createNamespace<
  UiAdapter,
  UiFacade
>((get) => ({
  openMenu: () => get()?.openMenu?.(),
  openHelperOverlay: () => get()?.openHelperOverlay?.(),
}));
