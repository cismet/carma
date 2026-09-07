import { createNamespace } from "./create-namespace";

/**
 * A button in the info box of the selected feature, next to the app's own
 * (zoom, data sheet, ...). Contributed at runtime by whoever has something to
 * offer for the feature on screen, an addon usually, and taken away again by
 * the remover `addInfoBoxAction` returns.
 *
 * `icon` is a FontAwesome icon definition; carma-api is dependency-free, so it
 * is typed `unknown` here, as the gazetteer's mode icon is. `iconname` is the
 * legacy font-awesome class name the app's own links use, for a caller without
 * the svg package.
 */
export type InfoBoxAction = {
  /** one per contributor; adding the same key again replaces the action in place */
  key: string;
  tooltip: string;
  icon?: unknown;
  iconname?: string;
  /** drawn as switched on, for an action that toggles something */
  active?: boolean;
  onClick: () => void;
};

/**
 * Raw injection point for the `ui` namespace. The bridge provides these
 * closures. Optional methods may be left unimplemented; the facade no-ops.
 */
export interface UiAdapter {
  openMenu?: () => void;
  openHelperOverlay?: () => void;
  registerInfoBoxAction?: (action: InfoBoxAction) => () => void;
}

/** Public shape seen by callers of `carma.ui`. */
export interface UiFacade {
  openMenu: () => void;
  openHelperOverlay: () => void;
  /** put a button into the selected feature's info box; returns its remover */
  addInfoBoxAction: (action: InfoBoxAction) => () => void;
}

const noop = () => {};

export const { facade: ui, register: registerUi } = createNamespace<
  UiAdapter,
  UiFacade
>((get) => ({
  openMenu: () => get()?.openMenu?.(),
  openHelperOverlay: () => get()?.openHelperOverlay?.(),
  addInfoBoxAction: (action) => get()?.registerInfoBoxAction?.(action) ?? noop,
}));
