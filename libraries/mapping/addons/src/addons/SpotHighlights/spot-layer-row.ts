import { useEffect, useRef, type MutableRefObject } from "react";

import type { Layer } from "@carma-mapping/layers";

import { useSpotHighlightsActions } from "./spot-actions";
import {
  EMPTY_SPOT_CONTENT,
  SPOT_HIGHLIGHTS_LAYER,
  SPOT_HIGHLIGHTS_LAYER_ID,
  spotContentSignature,
  spotLayerContent,
  withSpotLayerContent,
  type SpotLayerContent,
} from "./spot-layer";

/** icon colour of the row while its ribbon is open, black otherwise */
const ACTIVE_COLOR = "#1677ff";
const RESTING_COLOR = "#000000";

/**
 * A wheel or a drag changes the spots many times a second. The channel takes
 * every step, the host's row only the one the change comes to rest at.
 */
const WRITE_DELAY_MS = 200;

type Timer = MutableRefObject<ReturnType<typeof setTimeout> | null>;

const clearTimer = (timer: Timer): void => {
  if (timer.current) {
    clearTimeout(timer.current);
    timer.current = null;
  }
};

export type UseSpotHighlightsLayerRowOptions = {
  /** the row as the host has it now, undefined while it has none */
  rowLayer: Layer | undefined;
  /**
   * Whether the route mounts the addon that draws and edits the spots.
   * Without it a row stays as it came, spots and all: it draws nothing, and
   * dropping it would lose them.
   */
  hasEngine: boolean;
  /** whether the host shows the row's ribbon; that is when the spots edit */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over */
  onUpdate: (layer: Layer) => void;
};

/**
 * The row of the spot layer, in two directions.
 *
 * The host's row is what counts: it persists, and it is what a pm-show scene
 * copies. So a row that turns up or changes without this hook's doing (a
 * scene shown, a reload, the ✕) is taken over into the channel. An edit made
 * on the map or in the ribbon goes the other way, into the row, once it
 * rests. The fingerprints of what was handed over are kept until the host
 * gives them back, so the echo of an older write is not taken for a change
 * from outside.
 *
 * The control button asks for the row through the channel's `isOn`.
 */
export const useSpotHighlightsLayerRow = ({
  rowLayer,
  hasEngine,
  panelOpen,
  onAdd,
  onRemove,
  onUpdate,
}: UseSpotHighlightsLayerRowOptions) => {
  const { isOn, spots, dim, change } = useSpotHighlightsActions();
  const hasRow = Boolean(rowLayer);

  const rowLayerRef = useRef(rowLayer);
  rowLayerRef.current = rowLayer;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  /**
   * A changed row to the host. The host takes the whole row, so a second
   * change before it gives the first back builds on the first, not on the
   * copy from before it.
   */
  const updateRef = useRef((next: Layer) => {
    rowLayerRef.current = next;
    onUpdateRef.current(next);
  });

  // the ribbon open is the editing; closing it gives up a placing
  useEffect(() => {
    if (!hasEngine) return;
    change((current) =>
      current.isEditing === panelOpen && (panelOpen || !current.isPlacing)
        ? null
        : { isEditing: panelOpen, ...(panelOpen ? {} : { isPlacing: false }) }
    );
  }, [hasEngine, panelOpen, change]);

  // the row's eye
  const isVisible = rowLayer?.visible !== false;
  useEffect(() => {
    if (!hasEngine) return;
    change((current) =>
      current.visible === isVisible ? null : { visible: isVisible }
    );
  }, [hasEngine, isVisible, change]);

  // blue while the ribbon is up, like the control button; a row that comes
  // back blue from a scene saved with the ribbon up is set right too
  const wantedColor = panelOpen ? ACTIVE_COLOR : RESTING_COLOR;
  const rowColor = rowLayer?.iconColor;
  useEffect(() => {
    const row = rowLayerRef.current;
    if (!hasEngine || !row || row.iconColor === wantedColor) return;
    updateRef.current({ ...row, iconColor: wantedColor });
  }, [hasEngine, hasRow, rowColor, wantedColor]);

  // the row added or removed, by the host or for the control button
  const prevRef = useRef<{ isOn: boolean; hasRow: boolean } | null>(null);
  const requestedRef = useRef<"add" | "remove" | null>(null);
  useEffect(() => {
    if (!hasEngine) return;
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    if (!prev || hasRow !== prev.hasRow) {
      // the host's stack decides: a scene with or without the row, the ✕, a
      // reload, or the row just added on request
      requestedRef.current = null;
      change((current) =>
        current.isOn === hasRow && current.hasRow === hasRow
          ? null
          : {
              isOn: hasRow,
              hasRow,
              ...(hasRow ? {} : { ...EMPTY_SPOT_CONTENT, isPlacing: false }),
            }
      );
      return;
    }

    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }
    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(SPOT_HIGHLIGHTS_LAYER);
      return;
    }
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(SPOT_HIGHLIGHTS_LAYER_ID);
    }
  }, [hasEngine, isOn, hasRow, change]);

  // the spots, between the row and the channel
  const rowSignature = rowLayer
    ? spotContentSignature(spotLayerContent(rowLayer))
    : null;
  const content: SpotLayerContent = { spots, dim };
  const contentRef = useRef(content);
  contentRef.current = content;
  const channelSignature = spotContentSignature(content);

  /** what was handed to the host and has not come back yet, oldest first */
  const pendingRef = useRef<string[]>([]);
  const seenRowSignatureRef = useRef<string | null>(null);
  const timerRef: Timer = useRef(null);

  /** the channel's spots into the row, unless the row has them already */
  const writeRef = useRef(() => {
    timerRef.current = null;
    const row = rowLayerRef.current;
    if (!row) return;
    const signature = spotContentSignature(contentRef.current);
    if (
      signature === spotContentSignature(spotLayerContent(row)) ||
      pendingRef.current.includes(signature)
    ) {
      return;
    }
    pendingRef.current = [...pendingRef.current, signature];
    updateRef.current(withSpotLayerContent(row, contentRef.current));
  });

  useEffect(() => {
    if (!hasEngine) return;
    if (rowSignature === null) {
      seenRowSignatureRef.current = null;
      pendingRef.current = [];
      clearTimer(timerRef);
      return;
    }

    if (rowSignature !== seenRowSignatureRef.current) {
      seenRowSignatureRef.current = rowSignature;
      const echo = pendingRef.current.indexOf(rowSignature);
      if (echo >= 0) {
        pendingRef.current = pendingRef.current.slice(echo + 1);
      } else {
        // not this hook's doing: the row wins over whatever the channel has
        pendingRef.current = [];
        clearTimer(timerRef);
        const fromRow = spotLayerContent(rowLayerRef.current ?? {});
        change((current) =>
          spotContentSignature({ spots: current.spots, dim: current.dim }) ===
          rowSignature
            ? null
            : fromRow
        );
        return;
      }
    }

    if (channelSignature === rowSignature) {
      clearTimer(timerRef);
      return;
    }
    if (pendingRef.current.includes(channelSignature)) return;
    clearTimer(timerRef);
    timerRef.current = setTimeout(() => writeRef.current(), WRITE_DELAY_MS);
  }, [hasEngine, rowSignature, channelSignature, change]);

  // an edit still waiting goes into the row before the ribbon closes or the
  // host goes away, so saving a scene right after finds it there
  useEffect(() => {
    if (panelOpen) return undefined;
    if (timerRef.current) {
      clearTimer(timerRef);
      writeRef.current();
    }
    return undefined;
  }, [panelOpen]);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimer(timerRef);
        writeRef.current();
      }
    },
    []
  );
};
