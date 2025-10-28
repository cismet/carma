import { useEffect, useRef } from "react";
import type { Map } from "leaflet";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";

import { SelectionItem, useSelection } from "../components/SelectionProvider";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";

const NEW_SELECTION_TIMEOUT = 200;
const noop = () => {};

type SelectionTopicMapOptions = {
  onComplete?: (selection: SelectionItem, map: Map) => void;
};

export const useSelectionTopicMap = ({
  onComplete,
}: SelectionTopicMapOptions = {}) => {
  const { selection, setOverlayFeature } = useSelection();
  const lastSelectionKey = useRef<number | null>(null);
  const lastSelectionTimestamp = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep ref updated without causing effect to re-run
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Use CarmaTopicMapContext with stable getters instead of react-cismap context
  const carmaTopicMapCtx = useCarmaTopicMapContext();
  const { getRoutedMapRef, getReferenceSystem, getReferenceSystemDefinition } =
    carmaTopicMapCtx;

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
        const routedMapRef = getRoutedMapRef();
        const { leafletElement } = routedMapRef?.current?.leafletMap;

        // TODO replace builtin react-cismap trigger, handle topicMap map move and polygon generation for overlayFeature with CarmaMap
        builtInGazetteerHitTrigger(
          [selection],
          leafletElement,
          getReferenceSystem(),
          getReferenceSystemDefinition(),
          noop, //  handleSetSelection with CarmaMap directly
          setOverlayFeature
        );

        if (leafletElement) {
          onCompleteRef.current?.(selection, leafletElement);
        }
      }
    }
  }, [
    selection,
    setOverlayFeature,
    getRoutedMapRef,
    getReferenceSystem,
    getReferenceSystemDefinition,
  ]); // Stable getters from CarmaTopicMapContext
};
