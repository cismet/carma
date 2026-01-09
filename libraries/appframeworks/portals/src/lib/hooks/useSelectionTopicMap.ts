import { useContext, useEffect, useRef } from "react";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { SelectionItem, useSelection } from "../components/SelectionProvider";
import type { Map } from "leaflet";

const NEW_SELECTION_TIMEOUT = 200;

type SelectionTopicMapOptions = {
  onComplete?: (selection: SelectionItem, map: Map) => void;
};

export const useSelectionTopicMap = ({
  onComplete,
}: SelectionTopicMapOptions = {}) => {
  const { selection, setSelection, setOverlayFeature } = useSelection();
  const lastSelectionKey = useRef<number | null>(null);
  const lastSelectionTimestamp = useRef<number | null>(null);

  const topicMapCtx = useContext<typeof TopicMapContext>(TopicMapContext);

  const {
    //routedMapRef: routedMap,
    realRoutedMapRef: routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
  } = topicMapCtx;
  console.debug("topicMapCtx", topicMapCtx);

  useEffect(() => {
    if (selection === null) {
      console.debug("HOOK: clear overlay on empty selection", selection);
      setOverlayFeature(null);
      lastSelectionKey.current = null;
    }
  }, [selection, setOverlayFeature]);

  useEffect(() => {
    if (selection) {
      if (
        lastSelectionKey.current === selection.sorter &&
        lastSelectionTimestamp.current === selection.selectionTimestamp
      ) {
        console.debug("HOOK: useSelectionTopicMap - same selection, skipping");
        return;
      }
      lastSelectionKey.current = selection.sorter;
      lastSelectionTimestamp.current = selection.selectionTimestamp;
      const isNewSelection =
        selection?.selectionTimestamp &&
        Date.now() - selection.selectionTimestamp < NEW_SELECTION_TIMEOUT;
      if (selection && isNewSelection) {
        console.debug(
          "HOOK: useSelectionTopicMap selection LEAFLET",
          selection
        );
        const { leafletElement } = routedMapRef.current?.leafletMap;

        // TODO replace builtin react-cismap trigger, handle topicMap map move and polygon generation for overlayFeature with CarmaMap
        builtInGazetteerHitTrigger(
          [selection],
          leafletElement,
          referenceSystem,
          referenceSystemDefinition,
          () => {}, //  handleSetSelection with CarmaMap directly
          setOverlayFeature
        );

        if (leafletElement) {
          onComplete?.(selection, leafletElement);
        }
      }
    }
  }, [
    selection,
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    setSelection,
    setOverlayFeature,
  ]);
  return topicMapCtx;
};
