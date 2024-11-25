import { useContext, useEffect, useRef } from "react";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useSelection } from "../components/SelectionProvider";

const NEW_SELECTION_TIMEOUT = 500;

export const useSelectionTopicMap = () => {
  const { selection, setSelection, setOverlayFeature } = useSelection();
  const lastSelectionKey = useRef<number | null>(null);

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
      if (lastSelectionKey.current === selection.sorter) {
        console.debug("HOOK: useSelectionTopicMap - same selection, skipping");
        return;
      }
      lastSelectionKey.current = selection.sorter;
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
};
