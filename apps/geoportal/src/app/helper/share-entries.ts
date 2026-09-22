import type { BackgroundLayer, LayerStackEntry } from "@carma-mapping/layers";
import { isWorkflowGroup } from "@carma-mapping/addons";
import { Deployment } from "@carma-commons/utils";

import { currentDeployment } from "../config/availability";
import {
  isRestorableRow,
  stripInteractionButtons,
} from "../store/persisted-layer-stack";

/**
 * Whether the entry gets a share button: only a workflow layer (a group whose
 * tools carry a workflow definition) is passed around as an additive link.
 * Plain layers are not; they are one click away in the catalog. And nothing
 * is shared this way on the live geoportal, where a comparing group has no
 * engine to launch into yet, see `DEFAULT_ADDONS` in `app.config`.
 *
 * The row must also survive the persisted stack (`isRestorableRow`), since a
 * link carries a stack: that rules out the app's permanent rows.
 */
export const isShareableEntry = (
  entry: LayerStackEntry | BackgroundLayer,
  isBackgroundLayer: boolean
): boolean =>
  currentDeployment !== Deployment.LIVE &&
  !isBackgroundLayer &&
  isRestorableRow(entry) &&
  isWorkflowGroup(entry as LayerStackEntry);

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
