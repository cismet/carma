import { MutableRefObject, useEffect, useState } from "react";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";

import { useSelection } from "../components/SelectionProvider";
import { useCarmaMapContext } from "../components/CarmaMapContextProvider";

export const useSelectionTopicMap = () => {
  const { selection, setSelection, overlayFeature, setOverlayFeature } =
    useSelection();

  const { topicMapCtx } = useCarmaMapContext();
  const {
    routedMapRef: routedMap,
    realRoutedMapRef: routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
  } = topicMapCtx;

  useEffect(() => {
    if (!routedMapRef.current || !selection) return;
    //const routedMap = routedMapRef.current;

    console.debug(
      "HOOK: useSelectionTopicMap selection",
      selection,
      routedMapRef
    );
    if (selection.type === "bezirke" || selection.type === "quartiere") {
      console.debug("selection is area");
      //setOverlayFeature(selection);
      /*
      routedMap && builtInGazetteerHitTrigger(
        [selection],
        routedMapRef,
        referenceSystem,
        referenceSystemDefinition,
        setSelection,
        setOverlayFeature
      );
      */
    } else {
      builtInGazetteerHitTrigger(
        selection,
        routedMapRef,
        referenceSystem,
        referenceSystemDefinition,
        setSelection,
        setOverlayFeature
      );
    }

    return () => console.info("unmounting useSelectionTopicMap");
  }, [
    selection,
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    setSelection,
    setOverlayFeature,
  ]);
};
