import type { BackgroundLayer, LayerStackEntry } from "@carma-mapping/layers";

import {
  isRestorableRow,
  stripInteractionButtons,
} from "../store/persisted-layer-stack";

/**
 * Whether the entry can go into an additive share link: the same question as
 * whether it survives the persisted stack, since a link carries a stack. Rules
 * out the base map (a link never carries one), the app's permanent rows and
 * the rows of generic modes, which have no definition to carry.
 */
export const isShareableEntry = (
  entry: LayerStackEntry | BackgroundLayer,
  isBackgroundLayer: boolean
): boolean => !isBackgroundLayer && isRestorableRow(entry);

/**
 * The entries a share of this one carries: the entry itself. A workflow
 * group is self-contained, its members travel inside it.
 *
 * Stripped the way the persisted stack is: a mode row's `interactionButtons`
 * hold React elements, which do not survive JSON (the `$$typeof` symbol is
 * dropped and the receiver would try to render a plain object). The row's
 * mode hands the host fresh buttons once it runs.
 */
export const collectShareEntries = (
  entry: LayerStackEntry
): LayerStackEntry[] => stripInteractionButtons([entry]);
