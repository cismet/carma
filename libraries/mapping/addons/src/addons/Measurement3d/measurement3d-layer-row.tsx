import { useEffect, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import type { InteractionButton, Layer } from "@carma-mapping/layers";
import { useMeasurement3dActions } from "./measurement3d-state";

export const MEASUREMENT3D_LAYER_ID = "__measurement3d__";
/** the ribbon the row opens, registered by the host */
export const MEASUREMENT3D_TOOLS_INTERACTION_ID = "measurement3d-tools";
/** blue while the ribbon is open, black while it is not */
export const MEASUREMENT3D_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

export const MEASUREMENT3D_TEXT = Object.freeze({
  title: {
    empty: "3D-Messungen",
    singular: "3D-Messung",
    plural: "3D-Messungen",
  },
  tools: "Messwerkzeuge",
  control: { on: "3D-Messen einschalten", off: "3D-Messen ausschalten" },
  row: {
    focusAll: "Alle Messungen anzeigen",
    save: "Alle Messungen speichern",
    deleteAll: "Alle Messungen löschen",
  },
  deleteConfirm: {
    title: "Messungen löschen",
    one: "Diese Messung wirklich löschen?",
    many: (count: number) => `${count} Messungen wirklich löschen?`,
    ok: "Löschen",
    cancel: "Abbrechen",
  },
});

export const MEASUREMENT3D_LAYER: Layer = {
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

const resolveTitle = (count: number) =>
  count > 0
    ? `${count} ${
        count > 1
          ? MEASUREMENT3D_TEXT.title.plural
          : MEASUREMENT3D_TEXT.title.singular
      }`
    : MEASUREMENT3D_TEXT.title.empty;

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
 * Layer-bar row for the 3D measurement mode, the shape of the sketch and
 * time-series rows: the row belongs to the host, the addon only says when it
 * applies and what it carries. Switching the mode off removes the row; closing
 * the row with its ✕ ends the mode.
 */
export const useMeasurement3dLayerRow = ({
  hasRow,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseMeasurement3dLayerRowOptions) => {
  const { isOn, count, endMode, setPanelOpen } = useMeasurement3dActions();
  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);
  const layer = useMemo<Layer>(
    () => ({
      ...MEASUREMENT3D_LAYER,
      title: resolveTitle(count),
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
  const prevRef = useRef({ isOn, hasRow });
  const requestedRef = useRef<"add" | "remove" | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      endMode();
      return;
    }
    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }
    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(MEASUREMENT3D_LAYER_ID);
    }
  }, [endMode, hasRow, isOn]);
};
