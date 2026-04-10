import { useContext, useEffect, useRef } from "react";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { SelectionItem, useSelection } from "../components/SelectionProvider";
import { builtInGazetteerHitTrigger } from "@carma-mapping/fuzzy-search";
import type { Map } from "leaflet";

const NEW_SELECTION_TIMEOUT = 200;

type SelectionTopicMapOptions = {
  onComplete?: (selection: SelectionItem, map: Map) => void;
  padding?: [number, number];
};

export const useSelectionTopicMap = ({
  onComplete,
  padding,
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
      const isRestored = (selection as { properties?: { restored?: boolean } })
        ?.properties?.restored;
      const { leafletElement } = routedMapRef.current?.leafletMap;
      if (selection && (isNewSelection || isRestored)) {
        console.debug(
          "HOOK: useSelectionTopicMap selection LEAFLET",
          selection,
          isRestored ? "(restored)" : ""
        );

        // TODO replace builtin react-cismap trigger, handle topicMap map move and polygon generation for overlayFeature with CarmaMap
        builtInGazetteerHitTrigger({
          hit: [selection],
          leafletElement,
          referenceSystem,
          referenceSystemDefinition,
          setGazetteerHit: () => {}, //  handleSetSelection with CarmaMap directly
          setOverlayFeature,
          padding,
        });

        if (leafletElement) {
          onComplete?.(selection, leafletElement);
        }
      } else if (selection.selectionTimestamp === null && leafletElement) {
        onComplete?.(selection, leafletElement);
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
