import {
  FLOW_FIELD_LAYER_ID,
  FLOW_FIELD_STATUS_ID,
  FLOW_FIELD_TUNING_INTERACTION_ID,
  useFlowFieldLayerRow,
  useHasAddonStateProducer,
} from "@carma-mapping/addons";

import { useLauncherCarriedControls } from "./useLauncherCarriedControls";

export { FLOW_FIELD_LAYER_ID };

const FLOW_FIELD_BUTTON_IDS = new Set([
  FLOW_FIELD_STATUS_ID,
  FLOW_FIELD_TUNING_INTERACTION_ID,
]);

export function useFlowFieldLayerButton() {
  // this hook runs on every route, the addon that draws the animation does not;
  // a row that arrives without it is dropped rather than shown dead
  const hasEngine = useHasAddonStateProducer("flowField");

  // A flow field a style launched sits on that style's button; one a workflow
  // card switched in keeps a row of its own.
  const { rowLayer, onLauncher, launcherHidden, show, remove } =
    useLauncherCarriedControls({
      kind: "flowField",
      rowId: FLOW_FIELD_LAYER_ID,
      buttonIds: FLOW_FIELD_BUTTON_IDS,
    });

  useFlowFieldLayerRow({
    hasRow: Boolean(rowLayer) || onLauncher,
    hasEngine,
    hidden: launcherHidden,
    onAdd: show,
    // the readout changes as the map crosses the zoom gate, so the row goes
    // stale without the animation itself changing
    onUpdate: show,
    onRemove: remove,
  });
}
