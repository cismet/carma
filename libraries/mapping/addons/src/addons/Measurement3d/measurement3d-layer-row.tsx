import { useEffect, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import type { InteractionButton, Layer } from "@carma-mapping/layers";
import { useMeasurement3dActions } from "./measurement3d-state";
import {
  MEASUREMENT3D_ICON_COLOR,
  MEASUREMENT3D_TEXT,
  resolveMeasurement3dTitle,
} from "./measurement3d-text";

export const MEASUREMENT3D_LAYER_ID = "__measurement3d__";
/** the ribbon the row opens, registered by the host */
export const MEASUREMENT3D_TOOLS_INTERACTION_ID = "measurement3d-tools";
/** the save panel of the row, registered by the host under this interaction id */
export const MEASUREMENT3D_SAVE_INTERACTION_ID = "measurement3d-save";

const MEASUREMENT3D_LAYER: Layer = {
  id: MEASUREMENT3D_LAYER_ID,
  title: MEASUREMENT3D_TEXT.title.empty,
  type: "object",
  icon: "measurement",
  iconColor: MEASUREMENT3D_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: MEASUREMENT3D_TOOLS_INTERACTION_ID,
};

const buildInteractionButtons = (): InteractionButton[] => [
  {
    // same id as `rowClickInteractionId`: lit while the ribbon is open
    id: MEASUREMENT3D_TOOLS_INTERACTION_ID,
    icon: <FontAwesomeIcon icon={faRuler} />,
    tooltip: MEASUREMENT3D_TEXT.tools,
  },
];

export type UseMeasurement3dLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  /** whether the host shows the row's ribbon; mirrored into the channel */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  onUpdate?: (layer: Layer) => void;
};

/**
 * Layer-bar row of the 3D measurement mode: the row belongs to the host, the
 * addon says when it applies and what it carries. The row shows while the
 * mode is on and the map can host it: switching the mode off or losing the
 * surface removes the row, closing the row with its ✕ ends the mode.
 */
export const useMeasurement3dLayerRow = ({
  hasRow,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseMeasurement3dLayerRowOptions) => {
  const { isOn, available, count, endMode, setPanelOpen } =
    useMeasurement3dActions();
  // A mode that is on without a surface (restored, shared, mesh removed,
  // another view on top) waits without a row instead of showing a dead one.
  const wantsRow = isOn && available;
  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);
  const layer = useMemo<Layer>(
    () => ({
      ...MEASUREMENT3D_LAYER,
      title: resolveMeasurement3dTitle(count),
      iconColor: panelOpen
        ? MEASUREMENT3D_ICON_COLOR.open
        : MEASUREMENT3D_ICON_COLOR.closed,
      interactionButtons: buildInteractionButtons(),
    }),
    [count, panelOpen]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  useEffect(() => {
    if (hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasRow, layer]);
  const prevRef = useRef({ wantsRow, hasRow });
  const requestedRef = useRef<"add" | "remove" | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { wantsRow, hasRow };
    // the row went while it applied: the host closed it
    if (wantsRow && !hasRow && prev.wantsRow && prev.hasRow) {
      requestedRef.current = null;
      endMode();
      return;
    }
    if (wantsRow === hasRow) {
      requestedRef.current = null;
      return;
    }
    if (wantsRow && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }
    if (!wantsRow && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(MEASUREMENT3D_LAYER_ID);
    }
  }, [endMode, hasRow, wantsRow]);
};
